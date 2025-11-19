import * as vscode from 'vscode';

export interface StatusBarItemOptions {
    text: string;
    tooltip?: string;
    command?: string;
    alignment?: vscode.StatusBarAlignment;
    priority?: number;
    color?: string | vscode.ThemeColor;
    backgroundColor?: vscode.ThemeColor;
}

export class StatusBarManager {
    private static instance: StatusBarManager;
    private readonly statusBarItems = new Map<string, vscode.StatusBarItem>();
    private readonly defaultPriority = 100;

    private constructor() {}

    public static getInstance(): StatusBarManager {
        if (!StatusBarManager.instance) {
            StatusBarManager.instance = new StatusBarManager();
        }
        return StatusBarManager.instance;
    }

    /**
     * Reset the singleton instance (for testing)
     */
    public static resetInstance(): void {
        if (StatusBarManager.instance) {
            StatusBarManager.instance.dispose();
        }
    }

    /**
     * Initialize the status bar manager
     */
    public initialize(): void {
        // Clear any existing items and reinitialize
        this.clear();
    }

    /**
     * Create or update a status bar item
     */
    public createItem(id: string, options: StatusBarItemOptions): vscode.StatusBarItem {
        // Dispose existing item if it exists
        if (this.statusBarItems.has(id)) {
            this.statusBarItems.get(id)?.dispose();
        }

        const item = vscode.window.createStatusBarItem(
            options.alignment ?? vscode.StatusBarAlignment.Left,
            options.priority ?? this.defaultPriority
        );

        item.text = options.text;
        if (options.tooltip) {
            item.tooltip = options.tooltip;
        }
        if (options.command) {
            item.command = options.command;
        }
        if (options.color) {
            item.color = options.color;
        }
        if (options.backgroundColor) {
            item.backgroundColor = options.backgroundColor;
        }

        this.statusBarItems.set(id, item);
        item.show();

        return item;
    }

    /**
     * Update an existing status bar item
     */
    public updateItem(id: string, options: Partial<StatusBarItemOptions>): void {
        const item = this.statusBarItems.get(id);
        if (!item) {
            return;
        }

        if (options.text !== undefined) {
            item.text = options.text;
        }
        if (options.tooltip !== undefined) {
            item.tooltip = options.tooltip;
        }
        if (options.command !== undefined) {
            item.command = options.command;
        }
        if (options.color !== undefined) {
            item.color = options.color;
        }
        if (options.backgroundColor !== undefined) {
            item.backgroundColor = options.backgroundColor;
        }
    }

    /**
     * Show dependency count indicator
     */
    public showDependencyCount(count: number, type: 'project' | 'class'): void {
        const icon = type === 'project' ? '$(symbol-package)' : '$(symbol-class)';
        this.createItem('dependencyCount', {
            text: `${icon} ${count} ${type === 'project' ? 'projects' : 'classes'}`,
            tooltip: `${count} ${type} dependencies detected`,
            command: 'vscode-csharp-dependency-graph.generate-dependency-graph',
            alignment: vscode.StatusBarAlignment.Left,
            priority: 200
        });
    }

    /**
     * Show cycle detection indicator
     */
    public showCycleIndicator(cycleCount: number): void {
        if (cycleCount > 0) {
            this.createItem('cycleIndicator', {
                text: `$(warning) ${cycleCount} cycles`,
                tooltip: `${cycleCount} dependency cycles detected`,
                command: 'vscode-csharp-dependency-graph.analyze-cycles',
                color: new vscode.ThemeColor('errorForeground'),
                alignment: vscode.StatusBarAlignment.Left,
                priority: 300
            });
        } else {
            this.hideItem('cycleIndicator');
        }
    }

    /**
     * Hide cycle detection indicator
     */
    public hideCycleIndicator(): void {
        this.hideItem('cycleIndicator');
    }

    /**
     * Set contextual information in status bar
     */
    public setContextualInfo(message: string, type?: 'project' | 'class'): void {
        let icon: string;
        if (type === 'project') {
            icon = '$(symbol-package)';
        } else if (type === 'class') {
            icon = '$(symbol-class)';
        } else {
            icon = '$(info)';
        }
        this.createItem('contextualInfo', {
            text: `${icon} ${message}`,
            tooltip: `Context: ${message}`,
            alignment: vscode.StatusBarAlignment.Left,
            priority: 150
        });
    }

    /**
     * Refresh all status bar items
     */
    public refresh(): void {
        // Re-show all existing items to refresh their state
        this.statusBarItems.forEach(item => {
            if (item.text) {
                item.show();
            }
        });
    }

    /**
     * Show progress indicator for long-running operations
     */
    public showProgress(message: string): void {
        this.createItem('progress', {
            text: `$(sync~spin) ${message}`,
            tooltip: 'Graph generation in progress...',
            alignment: vscode.StatusBarAlignment.Left,
            priority: 400
        });
    }

    /**
     * Hide progress indicator
     */
    public hideProgress(): void {
        this.hideItem('progress');
    }

    /**
     * Show graph type indicator
     */
    public showGraphType(type: 'project' | 'class'): void {
        const icon = type === 'project' ? '$(symbol-package)' : '$(symbol-class)';
        this.createItem('graphType', {
            text: `${icon} ${type} graph`,
            tooltip: `Currently viewing ${type} dependency graph`,
            alignment: vscode.StatusBarAlignment.Right,
            priority: 100
        });
    }

    /**
     * Show file size indicator for generated graphs
     */
    public showFileSize(sizeBytes: number): void {
        const sizeKB = Math.round(sizeBytes / 1024);
        this.createItem('fileSize', {
            text: `$(file) ${sizeKB} KB`,
            tooltip: `Graph file size: ${sizeKB} KB`,
            alignment: vscode.StatusBarAlignment.Right,
            priority: 50
        });
    }

    /**
     * Update dependency count indicator (alias for showDependencyCount for compatibility)
     */
    public updateDependencyCount(count: number, type: 'project' | 'class' = 'project'): void {
        this.showDependencyCount(count, type);
    }

    /**
     * Hide a specific status bar item
     */
    public hideItem(id: string): void {
        const item = this.statusBarItems.get(id);
        if (item) {
            item.hide();
        }
    }

    /**
     * Remove a status bar item completely
     */
    public removeItem(id: string): void {
        const item = this.statusBarItems.get(id);
        if (item) {
            item.dispose();
            this.statusBarItems.delete(id);
        }
    }

    /**
     * Clear all status bar items
     */
    public clear(): void {
        this.statusBarItems.forEach(item => item.dispose());
        this.statusBarItems.clear();
    }

    /**
     * Dispose all status bar items (for extension deactivation)
     */
    public dispose(): void {
        this.clear();
    }
}
