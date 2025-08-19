import * as vscode from 'vscode';

export interface KeybindingAction {
    command: string;
    key: string;
    when?: string;
    args?: unknown;
    description: string;
}

export class KeybindingManager {
    private static instance: KeybindingManager;
    private readonly registeredCommands = new Map<string, vscode.Disposable>();
    private readonly contextualCommands = new Map<string, KeybindingAction[]>();

    private constructor() {}

    public static getInstance(): KeybindingManager {
        if (!KeybindingManager.instance) {
            KeybindingManager.instance = new KeybindingManager();
        }
        return KeybindingManager.instance;
    }

    /**
     * Reset the singleton instance for testing purposes
     */
    public static resetInstance(): void {
        KeybindingManager.instance = null!;
    }

    /**
     * Initialize keybindings with a context
     */
    public async initialize(context?: vscode.ExtensionContext): Promise<void> {
        if (context) {
            this.registerDefaultKeybindings(context);
        }
        // Additional initialization logic if needed
    }

    /**
     * Register default keybindings for the extension
     */
    public registerDefaultKeybindings(context: vscode.ExtensionContext): void {
        const keybindings: KeybindingAction[] = [
            {
                command: 'vscode-csharp-dependency-graph.generate-dependency-graph',
                key: 'ctrl+shift+d g',
                description: 'Generate dependency graph',
                when: 'editorTextFocus'
            },
            {
                command: 'vscode-csharp-dependency-graph.previewGraphviz',
                key: 'ctrl+shift+d p',
                description: 'Preview Graphviz file',
                when: 'editorLangId == dot'
            },
            {
                command: 'vscode-csharp-dependency-graph.analyze-cycles',
                key: 'ctrl+shift+d c',
                description: 'Analyze dependency cycles',
                when: 'editorLangId == dot'
            }
        ];

        // Note: Modern graph commands (dependencyGraph.*) are registered
        // in registerModernGraphCommands() to avoid duplicate registration.
        // Only basic extension commands are registered here.

        keybindings.forEach(binding => {
            this.registerCommand(context, binding);
        });
    }

    /**
     * Register a command and its keybinding
     */
    public registerCommand(context: vscode.ExtensionContext, action: KeybindingAction): void {
        // Register the actual command
        const disposable = vscode.commands.registerCommand(action.command, () => {
            console.log(`Command executed: ${action.command}`);
        });
        
        // Store the disposable
        this.registeredCommands.set(action.command, disposable);
        
        // Add to context subscriptions
        context.subscriptions.push(disposable);
        
        // Store contextual commands for dynamic enabling/disabling
        const contextKey = action.when ?? 'default';
        if (!this.contextualCommands.has(contextKey)) {
            this.contextualCommands.set(contextKey, []);
        }
        this.contextualCommands.get(contextKey)!.push(action);
    }

    /**
     * Register a single keybinding (legacy method for compatibility)
     * Note: This only stores keybinding info, doesn't register commands
     */
    public registerKeybinding(_context: vscode.ExtensionContext, action: KeybindingAction): void {
        // Store contextual commands for dynamic enabling/disabling
        const contextKey = action.when ?? 'default';
        if (!this.contextualCommands.has(contextKey)) {
            this.contextualCommands.set(contextKey, []);
        }
        this.contextualCommands.get(contextKey)!.push(action);
    }

    /**
     * Set context for conditional keybindings
     */
    public setContext(key: string, value: boolean): void {
        vscode.commands.executeCommand('setContext', key, value);
    }

    /**
     * Enable graph context (when graph is active)
     */
    public enableGraphContext(hasCycles: boolean = false): void {
        this.setContext('dependencyGraphActive', true);
        this.setContext('dependencyGraphHasCycles', hasCycles);
    }

    /**
     * Disable graph context
     */
    public disableGraphContext(): void {
        this.setContext('dependencyGraphActive', false);
        this.setContext('dependencyGraphHasCycles', false);
    }

    /**
     * Get all registered keybindings for a context
     */
    public getKeybindings(context?: string): KeybindingAction[] {
        const contextKey = context ?? 'default';
        return this.contextualCommands.get(contextKey) ?? [];
    }

    /**
     * Dispose of all registered commands
     */
    public dispose(): void {
        this.registeredCommands.forEach(disposable => {
            disposable.dispose();
        });
        this.registeredCommands.clear();
        this.contextualCommands.clear();
    }
}
