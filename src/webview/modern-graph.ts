/**
 * Modern Graph Webview Client
 * Handles interactive graph visualization with modern UI components
 */

interface VSCodeAPI {
    postMessage(message: WebviewMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
}

interface SearchData {
    term: string;
}

interface ExportData {
    format: string;
}

interface ThemeData {
    colors?: {
        background?: string;
        foreground?: string;
    };
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
    };
}

class ModernGraphViewer {
    private readonly vscode: VSCodeAPI;
    private currentGraphData?: GraphData;
    private currentZoom = 1.0;
    private showingCyclesOnly = false;
    private searchTerm = '';

    constructor() {
        this.vscode = acquireVsCodeApi();
        this.initializeEventListeners();
        this.setupMessageHandling();
        
        // Notify extension that webview is ready
        this.postMessage({ command: 'webviewReady' });
    }

    private initializeEventListeners(): void {
        // Toolbar buttons
        this.getElementById('refreshBtn')?.addEventListener('click', () => this.refresh());
        this.getElementById('searchBtn')?.addEventListener('click', () => this.showSearchModal());
        this.getElementById('zoomInBtn')?.addEventListener('click', () => this.zoomIn());
        this.getElementById('zoomOutBtn')?.addEventListener('click', () => this.zoomOut());
        this.getElementById('resetViewBtn')?.addEventListener('click', () => this.resetView());
        this.getElementById('toggleCyclesBtn')?.addEventListener('click', () => this.toggleCyclesView());
        this.getElementById('exportBtn')?.addEventListener('click', () => this.showExportOptions());
        this.getElementById('settingsBtn')?.addEventListener('click', () => this.showSettings());

        // Search modal
        this.getElementById('closeSearchBtn')?.addEventListener('click', () => this.hideSearchModal());
        this.getElementById('searchInput')?.addEventListener('input', (e: Event) => this.handleSearchInput(e));
        this.getElementById('searchInput')?.addEventListener('keydown', (e: KeyboardEvent) => this.handleSearchKeydown(e));

        // Side panel
        this.getElementById('closePanelBtn')?.addEventListener('click', () => this.hideSidePanel());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e: KeyboardEvent) => this.handleKeyboardShortcuts(e));

        // Window events
        window.addEventListener('resize', () => this.handleResize());
    }

    private setupMessageHandling(): void {
        window.addEventListener('message', (event: MessageEvent) => {
            // In VS Code webview context, messages come from the extension host
            // and don't need origin validation as they're already secure
            const message = event.data as WebviewMessage;
            this.handleMessage(message);
        });
    }

    private handleMessage(message: WebviewMessage): void {
        switch (message.command) {
            case 'updateGraph':
                this.updateGraph(message.data as GraphData);
                break;
            case 'updateTheme':
                this.updateTheme(message.data as ThemeData);
                break;
            case 'performSearch':
                this.performSearch((message.data as SearchData).term);
                break;
            case 'requestExport':
                this.handleExport(message.data as ExportData);
                break;
            default:
                console.warn('Unknown command:', message.command);
        }
    }

    private updateGraph(graphData: GraphData): void {
        this.currentGraphData = graphData;
        this.showingCyclesOnly = false;
        
        // Update UI elements
        this.updateGraphDisplay(graphData.dotContent);
        this.updateStats(graphData.metadata);
        this.updateCycleBadge(graphData.metadata?.cycleCount || 0);
        
        // Hide loading overlay
        this.hideLoading();
        
        // Show success message
        this.showStatusMessage(`Graph loaded: ${graphData.title}`);
    }

    private updateGraphDisplay(dotContent: string): void {
        const graphCanvas = this.getElementById('graphCanvas');
        if (!graphCanvas) return;

        // Clear existing content
        graphCanvas.innerHTML = '';
        
        try {
            // Parse and render DOT content
            this.renderDotGraph(dotContent, graphCanvas as Element);
        } catch (error) {
            this.showError('Failed to render graph', error as Error);
        }
    }

    private renderDotGraph(dotContent: string, container: Element): void {
        // This is a simplified renderer - in a real implementation,
        // you would use a library like d3-graphviz or vis.js
        
        // Create a simple SVG representation
        const svg = document.createElementNS('https://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', '0 0 800 600');
        
        // Parse nodes and edges from DOT content (simplified)
        const nodes = this.parseDotNodes(dotContent);
        const edges = this.parseDotEdges(dotContent);
        
        // Render nodes
        nodes.forEach((node, index) => {
            const circle = document.createElementNS('https://www.w3.org/2000/svg', 'circle');
            const x = 100 + (index % 10) * 70;
            const y = 100 + Math.floor(index / 10) * 70;
            
            circle.setAttribute('cx', x.toString());
            circle.setAttribute('cy', y.toString());
            circle.setAttribute('r', '20');
            circle.setAttribute('fill', 'var(--vscode-button-background)');
            circle.setAttribute('stroke', 'var(--vscode-button-border)');
            circle.setAttribute('cursor', 'pointer');
            
            circle.addEventListener('click', () => {
                this.selectNode(node, { x, y });
            });
            
            svg.appendChild(circle as Node);
            
            // Add label
            const text = document.createElementNS('https://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x.toString());
            text.setAttribute('y', (y + 35).toString());
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', 'var(--vscode-foreground)');
            text.setAttribute('font-size', '12');
            text.textContent = node.split('.').pop() || node;
            
            svg.appendChild(text as Node);
        });
        
        container.appendChild(svg as Node);
        
        // Post stats to extension
        this.postMessage({
            command: 'graphStats',
            data: {
                nodes: nodes.length,
                edges: edges.length,
                cycles: this.countCycles(dotContent)
            }
        });
    }

    private parseDotNodes(dotContent: string): string[] {
        const nodeRegex = /"([^"]+)"\s*\[/g;
        const nodes: string[] = [];
        let match;
        
        while ((match = nodeRegex.exec(dotContent)) !== null) {
            nodes.push(match[1]);
        }
        
        return [...new Set(nodes)]; // Remove duplicates
    }

    private parseDotEdges(dotContent: string): Array<{ from: string; to: string }> {
        const edgeRegex = /"([^"]+)"\s*->\s*"([^"]+)"/g;
        const edges: Array<{ from: string; to: string }> = [];
        let match;
        
        while ((match = edgeRegex.exec(dotContent)) !== null) {
            edges.push({ from: match[1], to: match[2] });
        }
        
        return edges;
    }

    private countCycles(dotContent: string): number {
        // Simple cycle detection based on styling
        const cycleRegex = /color="#?[Ff][Ff][0-9A-Fa-f]{4}"|penwidth="?[2-9]\.?\d*"?/g;
        const matches = dotContent.match(cycleRegex);
        return matches ? Math.floor(matches.length / 2) : 0;
    }

    private selectNode(nodeId: string, _position: { x: number; y: number }): void {
        // Update side panel
        this.showSidePanel();
        this.updateNodeDetails(nodeId);
        
        // Notify extension
        this.postMessage({
            command: 'nodeSelected',
            data: {
                nodeId,
                nodeType: nodeId.includes('.cs') ? 'class' : 'project'
            }
        });
        
        // Update status
        this.updateSelectedNodeStatus(nodeId);
    }

    private showSidePanel(): void {
        const sidePanel = this.getElementById('sidePanel');
        sidePanel?.classList.remove('collapsed');
    }

    private hideSidePanel(): void {
        const sidePanel = this.getElementById('sidePanel');
        sidePanel?.classList.add('collapsed');
    }

    private updateNodeDetails(nodeId: string): void {
        const nodeDetails = this.getElementById('nodeDetails');
        if (!nodeDetails) return;

        const fileName = nodeId.split('/').pop() || nodeId;
        const fileType = nodeId.includes('.cs') ? 'C# Class' : 'Project';
        
        nodeDetails.innerHTML = `
            <div class="node-info">
                <h4>${fileName}</h4>
                <p class="node-type">${fileType}</p>
                <p class="node-path">${nodeId}</p>
                <div class="node-actions">
                    <button class="action-btn" onclick="this.openFile('${nodeId}')">
                        <i class="codicon codicon-go-to-file"></i>
                        Open File
                    </button>
                </div>
            </div>
        `;
    }

    // Event handlers
    private refresh(): void {
        this.showLoading();
        this.postMessage({ command: 'refreshRequested' });
    }

    private showSearchModal(): void {
        const modal = this.getElementById('searchModal');
        modal?.classList.remove('hidden');
        
        const searchInput = this.getElementById('searchInput') as HTMLInputElement;
        if (searchInput) {
            searchInput.focus();
        }
    }

    private hideSearchModal(): void {
        const modal = this.getElementById('searchModal');
        modal?.classList.add('hidden');
    }

    private handleSearchInput(event: Event): void {
        const input = event.target as unknown as HTMLInputElement;
        if (input && input.value !== undefined) {
            this.searchTerm = input.value;
            
            if (this.searchTerm.length > 2) {
                this.performSearch(this.searchTerm);
            }
        }
    }

    private handleSearchKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            this.performSearch(this.searchTerm);
            this.hideSearchModal();
        } else if (event.key === 'Escape') {
            this.hideSearchModal();
        }
    }

    private performSearch(term: string): void {
        // Highlight matching nodes
        const graphCanvas = this.getElementById('graphCanvas');
        const circles = graphCanvas?.querySelectorAll('circle');
        
        circles?.forEach((circle: Element, index: number) => {
            const isMatch = this.currentGraphData && 
                           this.parseDotNodes(this.currentGraphData.dotContent)[index]
                               ?.toLowerCase().includes(term.toLowerCase());
            
            if (isMatch) {
                circle.setAttribute('stroke-width', '3');
                circle.setAttribute('stroke', 'var(--vscode-focusBorder)');
            } else {
                circle.setAttribute('stroke-width', '1');
                circle.setAttribute('stroke', 'var(--vscode-button-border)');
            }
        });
        
        // Notify extension
        this.postMessage({
            command: 'searchRequested',
            data: { term }
        });
    }

    private zoomIn(): void {
        this.currentZoom = Math.min(this.currentZoom * 1.2, 3.0);
        this.applyZoom();
    }

    private zoomOut(): void {
        this.currentZoom = Math.max(this.currentZoom / 1.2, 0.1);
        this.applyZoom();
    }

    private resetView(): void {
        this.currentZoom = 1.0;
        this.applyZoom();
    }

    private applyZoom(): void {
        const graphCanvas = this.getElementById('graphCanvas');
        const svg = graphCanvas?.querySelector('svg') as Element;
        
        if (svg?.style) {
            svg.style.transform = `scale(${this.currentZoom})`;
        }
        
        // Update zoom display
        this.updateZoomLevel();
        
        // Notify extension
        this.postMessage({
            command: 'zoomChanged',
            data: { level: this.currentZoom }
        });
    }

    private toggleCyclesView(): void {
        if (!this.currentGraphData?.cyclesOnlyContent) {
            this.showStatusMessage('No cycle data available');
            return;
        }
        
        this.showingCyclesOnly = !this.showingCyclesOnly;
        
        const content = this.showingCyclesOnly 
            ? this.currentGraphData.cyclesOnlyContent 
            : this.currentGraphData.dotContent;
            
        this.updateGraphDisplay(content);
        
        // Update button state
        const toggleBtn = this.getElementById('toggleCyclesBtn');
        toggleBtn?.classList.toggle('active', this.showingCyclesOnly);
        
        this.showStatusMessage(
            this.showingCyclesOnly ? 'Showing cycles only' : 'Showing full graph'
        );
    }

    private showExportOptions(): void {
        // Show export format selection
        this.postMessage({
            command: 'exportGraph',
            data: { format: 'svg' } // Default format
        });
    }

    private showSettings(): void {
        // Open VS Code settings for this extension
        this.postMessage({ command: 'openSettings' });
    }

    private handleKeyboardShortcuts(event: KeyboardEvent): void {
        if (event.ctrlKey && event.shiftKey) {
            switch (event.key) {
                case 'R':
                    event.preventDefault();
                    this.refresh();
                    break;
                case 'S':
                    event.preventDefault();
                    this.showSearchModal();
                    break;
                case 'T':
                    event.preventDefault();
                    this.toggleCyclesView();
                    break;
                case 'E':
                    event.preventDefault();
                    this.showExportOptions();
                    break;
                case '=':
                case '+':
                    event.preventDefault();
                    this.zoomIn();
                    break;
                case '-':
                    event.preventDefault();
                    this.zoomOut();
                    break;
                case '0':
                    event.preventDefault();
                    this.resetView();
                    break;
            }
        }
    }

    private handleResize(): void {
        // Adjust graph layout on window resize
        const graphCanvas = this.getElementById('graphCanvas');
        if (graphCanvas) {
            // Trigger a re-layout if needed
            this.applyZoom();
        }
    }

    private handleExport(data: ExportData): void {
        // Handle export functionality
        console.log('Export requested:', data);
    }

    // UI Update helpers
    private updateStats(metadata?: GraphData['metadata']): void {
        if (!metadata) return;
        
        this.updateElement('nodeCount span', `${metadata.nodeCount} nodes`);
        this.updateElement('edgeCount span', `${metadata.edgeCount} edges`);
    }

    private updateCycleBadge(cycleCount: number): void {
        const badge = this.getElementById('cycleBadge');
        if (badge) {
            badge.textContent = cycleCount.toString();
            badge.classList.toggle('hidden', cycleCount === 0);
        }
        
        const toggleBtn = this.getElementById('toggleCyclesBtn');
        toggleBtn?.classList.toggle('has-cycles', cycleCount > 0);
    }

    private updateZoomLevel(): void {
        this.updateElement('zoomLevel span', `${Math.round(this.currentZoom * 100)}%`);
    }

    private updateSelectedNodeStatus(nodeId: string): void {
        const selectedNode = this.getElementById('selectedNode');
        if (selectedNode) {
            selectedNode.classList.remove('hidden');
            this.updateElement('selectedNode span', nodeId.split('/').pop() || nodeId);
        }
    }

    private updateTheme(themeData: ThemeData): void {
        // Update CSS custom properties based on theme
        document.documentElement.style.setProperty('--graph-background', themeData.colors?.background || 'transparent');
        document.documentElement.style.setProperty('--graph-foreground', themeData.colors?.foreground || 'currentColor');
        
        // Update graph colors
        const svg = document.querySelector('svg');
        if (svg) {
            // Re-render with new theme colors
            // This would be handled by the graph library in a real implementation
        }
    }

    // Utility methods
    private getElementById(id: string): HTMLElement | null {
        return document.getElementById(id);
    }

    private updateElement(selector: string, content: string): void {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = content;
        }
    }

    private showLoading(): void {
        const loading = this.getElementById('loadingOverlay');
        loading?.classList.remove('hidden');
    }

    private hideLoading(): void {
        const loading = this.getElementById('loadingOverlay');
        loading?.classList.add('hidden');
    }

    private showStatusMessage(message: string): void {
        // Show temporary status message
        console.log('Status:', message);
    }

    private showError(message: string, error?: Error): void {
        console.error(message, error);
        this.postMessage({
            command: 'error',
            data: {
                message,
                detail: error?.message || String(error)
            }
        });
    }

    private postMessage(message: WebviewMessage): void {
        this.vscode.postMessage(message);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const viewer = new ModernGraphViewer();
        // Store reference to prevent garbage collection
        window.modernGraphViewer = viewer;
    });
} else {
    const viewer = new ModernGraphViewer();
    // Store reference to prevent garbage collection
    window.modernGraphViewer = viewer;
}
