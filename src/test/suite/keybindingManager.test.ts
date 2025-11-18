import * as assert from 'node:assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { KeybindingManager } from '../../commands/KeybindingManager';

suite('KeybindingManager Test Suite', () => {
    let manager: KeybindingManager;
    let registerCommandStub: sinon.SinonStub;
    let executeCommandStub: sinon.SinonStub;
    let getCommandsStub: sinon.SinonStub;

    setup(() => {
        // Create stubs for VS Code API
        registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
        getCommandsStub = sinon.stub(vscode.commands, 'getCommands');

        // Mock that no commands exist initially (so they can be registered)
        getCommandsStub.resolves([]);

        // Mock disposable
        registerCommandStub.returns({ dispose: sinon.stub() });

        manager = KeybindingManager.getInstance();
    });

    teardown(() => {
        sinon.restore();
        KeybindingManager.resetInstance();
    });

    test('should register only basic keybinding commands', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        await manager.initialize(mockContext);

        // Should register 3 basic commands (modern UI commands are registered elsewhere)
        assert.strictEqual(registerCommandStub.callCount, 3);

        // Verify specific command registrations from actual implementation
        const commandNames = new Set(registerCommandStub.getCalls().map(call => call.args[0]));
        assert.ok(commandNames.has('vscode-csharp-dependency-graph.generate-dependency-graph'));
        assert.ok(commandNames.has('vscode-csharp-dependency-graph.previewGraphviz'));
        assert.ok(commandNames.has('vscode-csharp-dependency-graph.analyze-cycles'));
    });

    test('should add commands to extension subscriptions', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        await manager.initialize(mockContext);

        // Should add 3 disposables to subscriptions
        assert.strictEqual(mockContext.subscriptions.length, 3);
    });

    test('should enable/disable graph context', () => {
        // Test enabling graph context
        manager.enableGraphContext(true);
        
        // Should call setContext twice
        assert.strictEqual(executeCommandStub.callCount, 2);
        assert.ok(executeCommandStub.calledWith('setContext', 'dependencyGraphActive', true));
        assert.ok(executeCommandStub.calledWith('setContext', 'dependencyGraphHasCycles', true));
        
        executeCommandStub.resetHistory();
        
        // Test disabling graph context
        manager.disableGraphContext();
        
        // Should call setContext twice
        assert.strictEqual(executeCommandStub.callCount, 2);
        assert.ok(executeCommandStub.calledWith('setContext', 'dependencyGraphActive', false));
        assert.ok(executeCommandStub.calledWith('setContext', 'dependencyGraphHasCycles', false));
    });

    test('should get keybindings for context', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        await manager.initialize(mockContext);
        
        // Test getKeybindings with specific context
        const editorBindings = manager.getKeybindings('editorTextFocus');
        assert.ok(Array.isArray(editorBindings));
        assert.strictEqual(editorBindings.length, 1); // Only the generate-dependency-graph command has this context
    });

    test('should handle basic command execution', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        await manager.initialize(mockContext);

        // Get one of the registered command handlers
        const generateGraphCall = registerCommandStub.getCalls().find(
            (call: sinon.SinonSpyCall) => call.args[0] === 'vscode-csharp-dependency-graph.generate-dependency-graph'
        );
        assert.ok(generateGraphCall, 'generate-dependency-graph command should be registered');
    });

    test('should dispose of registered commands', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        await manager.initialize(mockContext);

        // Dispose the manager
        manager.dispose();

        // Verify internal maps are cleared
        const privateManager = manager as unknown as {
            registeredCommands: Map<string, vscode.Disposable>;
            contextualCommands: Map<string, unknown>;
        };
        
        assert.strictEqual(privateManager.registeredCommands.size, 0);
        assert.strictEqual(privateManager.contextualCommands.size, 0);
    });
});
