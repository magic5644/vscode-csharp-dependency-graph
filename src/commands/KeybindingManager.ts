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
            await this.registerDefaultKeybindings(context);
        }
        // Additional initialization logic if needed
    }

    /**
     * Register default keybindings for the extension
     */
    public async registerDefaultKeybindings(context: vscode.ExtensionContext): Promise<void> {
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

        for (const binding of keybindings) {
            await this.registerCommand(context, binding);
        }
    }

    /**
     * Register a command and its keybinding
     */
    public async registerCommand(context: vscode.ExtensionContext, action: KeybindingAction): Promise<void> {
        // Check if command already exists to avoid duplicate registration
        const existingCommands = await vscode.commands.getCommands(true);
        if (existingCommands.includes(action.command)) {
            console.log(`Command ${action.command} already exists, skipping registration in KeybindingManager`);
            // Command already exists - just store the keybinding info for context management
            this.storeKeybindingInfo(action);
            return;
        }

        try {
            // Register the actual command
            const disposable = vscode.commands.registerCommand(action.command, () => {
                console.log(`Command executed via keybinding: ${action.command}`);
                // Don't call the command recursively - this should not happen for existing commands
                console.warn(`Command ${action.command} was called but should have been registered elsewhere`);
            });
            
            // Store the disposable
            this.registeredCommands.set(action.command, disposable);
            
            // Add to context subscriptions
            context.subscriptions.push(disposable);
        } catch (error) {
            console.warn(`Failed to register command ${action.command} in KeybindingManager:`, error);
        }
        
        this.storeKeybindingInfo(action);
    }

    /**
     * Store keybinding info for context management without registering commands
     */
    private storeKeybindingInfo(action: KeybindingAction): void {
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
        this.storeKeybindingInfo(action);
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
    public getKeybindings(context: string = 'default'): KeybindingAction[] {
        return this.contextualCommands.get(context) ?? [];
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
