/**
 * Simple webview client for graph visualization
 */

// Message types
type WebviewMessage = {
    command: string;
    data?: unknown;
};

class SimpleGraphViewer {
    private vscode: ReturnType<typeof acquireVsCodeApi>;
    
    constructor() {
        this.vscode = acquireVsCodeApi();
        this.init();
    }
    
    private init(): void {
        this.setupEventListeners();
        this.postMessage({ command: 'webviewReady' });
    }
    
    private setupEventListeners(): void {
        // Setup toolbar button listeners
        const addListener = (id: string, event: string, handler: () => void) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener(event, handler);
            }
        };
        
        // Toolbar buttons
        addListener('refreshBtn', 'click', () => this.refresh());
        addListener('zoomInBtn', 'click', () => this.zoomIn());
        addListener('zoomOutBtn', 'click', () => this.zoomOut());
        addListener('resetViewBtn', 'click', () => this.resetView());
        addListener('exportBtn', 'click', () => this.exportGraph());
        
        // Message handling
        window.addEventListener('message', (event: MessageEvent) => {
            this.handleMessage(event.data as WebviewMessage);
        });
    }
    
    private handleMessage(message: WebviewMessage): void {
        switch (message.command) {
            case 'updateGraph':
                this.updateGraph(message.data);
                break;
            case 'updateTheme':
                this.updateTheme(message.data);
                break;
            default:
                console.log('Unknown command:', message.command);
        }
    }
    
    private updateGraph(_data: unknown): void {
        // Simple graph update
        const container = document.getElementById('graphCanvas');
        if (container) {
            container.innerHTML = '<p>Graph updated with new data</p>';
        }
        this.postMessage({ command: 'graphUpdated' });
    }
    
    private updateTheme(_data: unknown): void {
        // Theme update logic
        console.log('Theme updated');
    }
    
    private refresh(): void {
        this.postMessage({ command: 'refreshRequested' });
    }
    
    private zoomIn(): void {
        this.postMessage({ command: 'zoomIn' });
    }
    
    private zoomOut(): void {
        this.postMessage({ command: 'zoomOut' });
    }
    
    private resetView(): void {
        this.postMessage({ command: 'resetView' });
    }
    
    private exportGraph(): void {
        this.postMessage({ command: 'exportGraph' });
    }
    
    private postMessage(message: WebviewMessage): void {
        this.vscode.postMessage(message);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new SimpleGraphViewer());
} else {
    new SimpleGraphViewer();
}
