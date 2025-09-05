import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { NotificationManager } from './notifications/NotificationManager';
import { StatusBarManager } from './statusbar/StatusBarManager';
import { KeybindingManager } from './commands/KeybindingManager';

interface WebviewMessage {
    command: string;
    data?: unknown;
}

interface NodeSelectionData {
    nodeId: string;
    nodeType: string;
}

interface ExportGraphData {
    format: string;
    fileName?: string;
}

interface SearchData {
    term: string;
}

interface ThemeData {
    theme: string;
}

interface ErrorData {
    message: string;
    detail?: string;
}

interface GraphStatsData {
    nodes: number;
    edges: number;
    cycles: number;
}

interface ZoomData {
    level: number;
}

interface GraphData {
    dotContent: string;
    title: string;
    cyclesOnlyContent?: string;
    hasCycles: boolean;
    metadata?: {
        nodeCount: number;
        edgeCount: number;
        cycleCount: number;
        hasCycles: boolean;
        largestComponent: number;
    };
}

export class ModernGraphWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'csharp-dependency-graph.modernGraphView';
    
    private _view?: vscode.WebviewView;
    private _currentGraphData?: GraphData;
    private readonly _notificationManager = NotificationManager.getInstance();
    private readonly _statusBarManager = StatusBarManager.getInstance();
    private readonly _keybindingManager = KeybindingManager.getInstance();

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri,
                vscode.Uri.joinPath(this._extensionUri, 'resources'),
                vscode.Uri.joinPath(this._extensionUri, 'dist')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(
            (message: WebviewMessage) => this._handleWebviewMessage(message),
            undefined,
            this._context.subscriptions
        );

        // Listen for theme changes
        vscode.window.onDidChangeActiveColorTheme(() => {
            this._updateTheme();
        });

        // Enable graph context for keybindings
        this._keybindingManager.enableGraphContext(this._currentGraphData?.hasCycles);
    }

    public updateGraph(graphData: GraphData): void {
        this._currentGraphData = graphData;
        
        // Update status bar
        if (graphData.metadata) {
            this._statusBarManager.showDependencyCount(
                graphData.metadata.nodeCount, 
                graphData.title.includes('class') ? 'class' : 'project'
            );
            this._statusBarManager.showCycleIndicator(graphData.metadata.cycleCount);
        }

        // Update keybinding context
        this._keybindingManager.enableGraphContext(graphData.hasCycles);

        // Send to webview
        this._view?.webview.postMessage({
            command: 'updateGraph',
            data: graphData
        });

        // Show success notification
        this._notificationManager.showInfo(
            `Graph updated: ${graphData.metadata?.nodeCount ?? 0} nodes, ${graphData.metadata?.edgeCount ?? 0} edges`
        );
    }

    /**
     * Opens the graph view for a specific file
     */
    public async openGraphView(fileUri: vscode.Uri): Promise<void> {
        // Show notification that graph view is opening
        this._notificationManager.showInfo(`Opening graph view for: ${path.basename(fileUri.fsPath)}`);
        
        // If view is not yet visible, focus on it
        if (this._view) {
            this._view.show(true);
        }
        
        // Set context for keybindings
        await vscode.commands.executeCommand('setContext', 'vscode-csharp-dependency-graph.graphViewActive', true);
    }

    /**
     * Shows a graph with the provided DOT content and options
     */
    public async showGraph(dotContent: string, options: { title: string; hasCycles?: boolean }): Promise<void> {
        const metadata = this._parseGraphMetadata(dotContent);
        
        const graphData: GraphData = {
            dotContent,
            title: options.title,
            hasCycles: options.hasCycles || false,
            metadata
        };
        
        this.updateGraph(graphData);
    }

    /**
     * Refreshes the current graph
     */
    public async refresh(): Promise<void> {
        if (this._currentGraphData) {
            this._notificationManager.showInfo('Refreshing dependency graph...');
            this.updateGraph(this._currentGraphData);
        } else {
            this._notificationManager.showWarning('No graph data to refresh');
        }
    }

    /**
     * Posts a message to the webview
     */
    public postMessage(message: WebviewMessage): void {
        this._view?.webview.postMessage(message);
    }

    /**
     * Parses metadata from DOT content
     */
    private _parseGraphMetadata(dotContent: string): GraphData['metadata'] {
        // Simple parser to count nodes and edges in DOT content
        const nodeMatches = dotContent.match(/"\w+(?:\.\w+)*"\s*\[/g) || [];
        const edgeMatches = dotContent.match(/"\w+(?:\.\w+)*"\s*->\s*"\w+(?:\.\w+)*"/g) || [];
        const cycleMatches = dotContent.match(/color="#?[Ff][Ff][0-9A-Fa-f]{4}"|penwidth="?[2-9]\.?\d*"?/g) || [];
        
        const nodeCount = nodeMatches.length;
        const edgeCount = edgeMatches.length;
        const cycleCount = Math.floor(cycleMatches.length / 2); // Rough estimate
        const hasCycles = cycleCount > 0;
        
        // For largest component, we'll use a simple heuristic - 
        // assume it's the total node count if there are edges, or 1 if no edges
        let largestComponent = 0;
        if (edgeCount > 0) {
            largestComponent = nodeCount;
        } else if (nodeCount > 0) {
            largestComponent = 1;
        }
        
        return {
            nodeCount,
            edgeCount,
            cycleCount,
            hasCycles,
            largestComponent
        };
    }

    private async _handleWebviewMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'webviewReady':
                await this._onWebviewReady();
                break;
                
            case 'nodeSelected':
                await this._handleNodeSelection(message.data as NodeSelectionData);
                break;
                
            case 'exportGraph':
                await this._handleExportGraph(message.data as ExportGraphData);
                break;
                
            case 'searchRequested':
                await this._handleSearch(message.data as SearchData);
                break;
                
            case 'themeChanged':
                this._handleThemeChange(message.data as ThemeData);
                break;
                
            case 'error': {
                const errorData = message.data as ErrorData;
                this._notificationManager.showError(errorData.message, errorData.detail);
                break;
            }
                
            case 'graphStats':
                this._updateGraphStats(message.data as GraphStatsData);
                break;
                
            case 'zoomChanged':
                this._handleZoomChange(message.data as ZoomData);
                break;
                
            default:
                console.warn('Unknown webview message:', message.command);
        }
    }

    private async _onWebviewReady(): Promise<void> {
        // Send initial theme
        this._updateTheme();
        
        // Send current graph data if available
        if (this._currentGraphData) {
            this.updateGraph(this._currentGraphData);
        }
        
        // Show ready notification
        this._notificationManager.showStatusBarMessage('Graph view ready', 2000);
    }

    private async _handleNodeSelection(data: NodeSelectionData): Promise<void> {
        // Open corresponding file if it's a class dependency
        if (data.nodeType === 'class') {
            try {
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(data.nodeId));
            } catch (error) {
                console.warn('Could not open file:', data.nodeId, error);
                this._notificationManager.showWarning(`Could not open file: ${data.nodeId}`);
            }
        }
        
        // Update status bar with selection info
        this._statusBarManager.createItem('selectedNode', {
            text: `$(symbol-class) ${path.basename(data.nodeId)}`,
            tooltip: `Selected: ${data.nodeId}`,
            alignment: vscode.StatusBarAlignment.Right,
            priority: 200
        });
    }

    private async _handleExportGraph(data: ExportGraphData): Promise<void> {
        try {
            const defaultFileName = this._currentGraphData?.title ?? 'dependency-graph';
            const fileName = data.fileName ?? `${defaultFileName}.${data.format}`;
            
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(fileName),
                filters: {
                    'SVG files': ['svg'],
                    'PNG files': ['png'],
                    'PDF files': ['pdf']
                }
            });

            if (saveUri) {
                // Request export from webview
                this._view?.webview.postMessage({
                    command: 'requestExport',
                    data: { format: data.format, saveUri: saveUri.fsPath }
                });
                
                this._notificationManager.showInfo(`Exporting graph as ${data.format.toUpperCase()}...`);
            } else {
                // Show info message even if dialog was canceled
                this._notificationManager.showInfo('Export canceled by user');
            }
        } catch (error) {
            this._notificationManager.showError(
                'Export failed',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    private async _handleSearch(data: SearchData): Promise<void> {
        // Send search request to webview
        this._view?.webview.postMessage({
            command: 'performSearch',
            data: { term: data.term }
        });
        
        this._notificationManager.showStatusBarMessage(`Searching for: ${data.term}`, 2000);
    }

    private _updateTheme(): void {
        const theme = vscode.window.activeColorTheme;
        const isDark = theme.kind === vscode.ColorThemeKind.Dark || 
                      theme.kind === vscode.ColorThemeKind.HighContrast;
        
        this._view?.webview.postMessage({
            command: 'updateTheme',
            data: {
                isDark,
                kind: theme.kind,
                colors: {
                    background: 'var(--vscode-panel-background)',
                    foreground: 'var(--vscode-panel-foreground)',
                    border: 'var(--vscode-panel-border)',
                    accent: 'var(--vscode-focusBorder)'
                }
            }
        });
    }

    private _handleThemeChange(data: ThemeData): void {
        // Theme change handled by VS Code automatically
        console.log('Theme changed to:', data.theme);
    }

    private _updateGraphStats(data: GraphStatsData): void {
        // Update status bar with live stats
        this._statusBarManager.showDependencyCount(data.nodes, 'project');
        this._statusBarManager.showCycleIndicator(data.cycles);
        
        // Update graph metadata
        if (this._currentGraphData) {
            let largestComponent = 0;
            if (data.edges > 0) {
                largestComponent = data.nodes;
            } else if (data.nodes > 0) {
                largestComponent = 1;
            }
            
            this._currentGraphData.metadata = {
                nodeCount: data.nodes,
                edgeCount: data.edges,
                cycleCount: data.cycles,
                hasCycles: data.cycles > 0,
                largestComponent
            };
        }
    }

    private _handleZoomChange(data: ZoomData): void {
        // Update status bar with zoom level
        this._statusBarManager.createItem('zoomLevel', {
            text: `$(zoom-in) ${Math.round(data.level * 100)}%`,
            tooltip: `Zoom level: ${Math.round(data.level * 100)}%`,
            alignment: vscode.StatusBarAlignment.Right,
            priority: 150
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get URIs for resources
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'modern-graph.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'modern-graph.css')
        );
        
        // Get VS Code theme CSS variables
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
        );

        const nonce = this._getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
    <link href="${codiconsUri}" rel="stylesheet">
    <link href="${styleUri}" rel="stylesheet">
    <title>Dependency Graph</title>
</head>
<body>
    <div id="app" class="modern-graph-container">
        <!-- Header Toolbar -->
        <div class="toolbar">
            <div class="toolbar-group">
                <button id="refreshBtn" class="toolbar-btn" title="Refresh Graph (Ctrl+Shift+D R)">
                    <i class="codicon codicon-refresh"></i>
                </button>
                <button id="searchBtn" class="toolbar-btn" title="Search (Ctrl+Shift+D S)">
                    <i class="codicon codicon-search"></i>
                </button>
                <div class="toolbar-separator"></div>
                <button id="zoomInBtn" class="toolbar-btn" title="Zoom In (Ctrl+Shift+D +)">
                    <i class="codicon codicon-zoom-in"></i>
                </button>
                <button id="zoomOutBtn" class="toolbar-btn" title="Zoom Out (Ctrl+Shift+D -)">
                    <i class="codicon codicon-zoom-out"></i>
                </button>
                <button id="resetViewBtn" class="toolbar-btn" title="Reset View (Ctrl+Shift+D 0)">
                    <i class="codicon codicon-target"></i>
                </button>
            </div>
            <div class="toolbar-group">
                <button id="toggleCyclesBtn" class="toolbar-btn toggle-btn" title="Toggle Cycles View (Ctrl+Shift+D T)">
                    <i class="codicon codicon-warning"></i>
                    <span>Cycles</span>
                    <span id="cycleBadge" class="badge hidden">0</span>
                </button>
                <div class="toolbar-separator"></div>
                <button id="exportBtn" class="toolbar-btn" title="Export Graph (Ctrl+Shift+D E)">
                    <i class="codicon codicon-export"></i>
                </button>
                <button id="settingsBtn" class="toolbar-btn" title="Settings">
                    <i class="codicon codicon-settings-gear"></i>
                </button>
            </div>
        </div>

        <!-- Main Content Area -->
        <div class="content-area">
            <!-- Graph Container -->
            <div id="graphContainer" class="graph-container">
                <div id="loadingOverlay" class="loading-overlay">
                    <div class="loading-spinner">
                        <i class="codicon codicon-loading codicon-modifier-spin"></i>
                    </div>
                    <span>Loading dependency graph...</span>
                </div>
                <div id="graphCanvas" class="graph-canvas"></div>
            </div>

            <!-- Side Panel -->
            <div id="sidePanel" class="side-panel collapsed">
                <div class="panel-header">
                    <h3>Node Details</h3>
                    <button id="closePanelBtn" class="close-btn">
                        <i class="codicon codicon-close"></i>
                    </button>
                </div>
                <div id="nodeDetails" class="node-details">
                    <div class="empty-state">
                        <i class="codicon codicon-info"></i>
                        <span>Select a node to view details</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Status Bar -->
        <div class="status-bar">
            <div class="status-group">
                <span id="nodeCount" class="status-item">
                    <i class="codicon codicon-symbol-class"></i>
                    <span>0 nodes</span>
                </span>
                <span id="edgeCount" class="status-item">
                    <i class="codicon codicon-arrow-right"></i>
                    <span>0 edges</span>
                </span>
            </div>
            <div class="status-group">
                <span id="zoomLevel" class="status-item">
                    <i class="codicon codicon-zoom-in"></i>
                    <span>100%</span>
                </span>
                <span id="selectedNode" class="status-item hidden">
                    <i class="codicon codicon-selection"></i>
                    <span>None selected</span>
                </span>
            </div>
        </div>

        <!-- Search Modal -->
        <div id="searchModal" class="modal hidden">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Search Graph</h3>
                    <button id="closeSearchBtn" class="close-btn">
                        <i class="codicon codicon-close"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <input type="text" id="searchInput" placeholder="Enter class or project name..." autocomplete="off">
                    <div id="searchResults" class="search-results"></div>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
    private _getNonce(): string {
        return crypto.randomBytes(16).toString('base64');
    }
    

    public dispose(): void {
        this._keybindingManager.disableGraphContext();
        this._statusBarManager.clear();
    }
}
