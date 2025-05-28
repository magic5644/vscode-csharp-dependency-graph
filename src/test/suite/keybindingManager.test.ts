import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { KeybindingManager } from '../../commands/KeybindingManager';

suite('KeybindingManager Test Suite', () => {
    let manager: KeybindingManager;
    let registerCommandStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let executeCommandStub: sinon.SinonStub;

    setup(() => {
        // Create stubs for VS Code API
        registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');

        // Mock disposable
        registerCommandStub.returns({ dispose: sinon.stub() });

        manager = KeybindingManager.getInstance();
    });

    teardown(() => {
        sinon.restore();
        KeybindingManager.resetInstance();
    });

    test('should register all keybinding commands', () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        manager.initialize(mockContext);

        // Should register 3 basic commands (modern UI commands are registered elsewhere)
        assert.strictEqual(registerCommandStub.callCount, 3);

        // Verify specific command registrations from actual implementation
        const commandNames = registerCommandStub.getCalls().map(call => call.args[0]);
        assert.ok(commandNames.includes('vscode-csharp-dependency-graph.generate-dependency-graph'));
        assert.ok(commandNames.includes('vscode-csharp-dependency-graph.previewGraphviz'));
        assert.ok(commandNames.includes('vscode-csharp-dependency-graph.analyze-cycles'));
        // Modern UI commands are registered in registerModernGraphCommands() in extension.ts
    });

    test('should add commands to extension subscriptions', () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        manager.initialize(mockContext);

        // Should add 3 disposables to subscriptions (modern UI commands are registered elsewhere)
        assert.strictEqual(mockContext.subscriptions.length, 3);
    });

    test('should execute openGraph command', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        manager.initialize(mockContext);

        // Get the openGraph command handler
        const openGraphCall = registerCommandStub.getCalls().find(
            call => call.args[0] === 'csharp-dependency-graph.modern.openGraph'
        );
        assert.ok(openGraphCall, 'openGraph command should be registered');

        const handler = openGraphCall.args[1];
        
        // Execute the handler
        await handler();

        // Should execute the original command
        assert.ok(executeCommandStub.calledWith('csharp-dependency-graph.showGraph'));
    });

    test('should execute refreshGraph command', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        manager.initialize(mockContext);

        // Get the refreshGraph command handler
        const refreshCall = registerCommandStub.getCalls().find(
            call => call.args[0] === 'csharp-dependency-graph.modern.refreshGraph'
        );
        assert.ok(refreshCall, 'refreshGraph command should be registered');

        const handler = refreshCall.args[1];
        
        // Execute the handler
        await handler();

        // Should execute the original command
        assert.ok(executeCommandStub.calledWith('csharp-dependency-graph.refresh'));
    });

    test('should execute exportGraph command', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        manager.initialize(mockContext);

        // Get the exportGraph command handler
        const exportCall = registerCommandStub.getCalls().find(
            call => call.args[0] === 'csharp-dependency-graph.modern.exportGraph'
        );
        assert.ok(exportCall, 'exportGraph command should be registered');

        const handler = exportCall.args[1];
        
        // Execute the handler
        await handler();

        // Should execute the original command
        assert.ok(executeCommandStub.calledWith('csharp-dependency-graph.exportSvg'));
    });

    test('should handle searchNodes command', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        manager.initialize(mockContext);

        // Get the searchNodes command handler
        const searchCall = registerCommandStub.getCalls().find(
            call => call.args[0] === 'csharp-dependency-graph.modern.searchNodes'
        );
        assert.ok(searchCall, 'searchNodes command should be registered');

        const handler = searchCall.args[1];
        
        // Mock showInputBox
        const showInputBoxStub = sinon.stub(vscode.window, 'showInputBox').resolves('TestNode');
        
        // Execute the handler
        await handler();

        // Should show input box for search
        assert.ok(showInputBoxStub.called);
        
        showInputBoxStub.restore();
    });

    test('should handle zoomToFit command', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        manager.initialize(mockContext);

        // Get the zoomToFit command handler
        const zoomCall = registerCommandStub.getCalls().find(
            call => call.args[0] === 'csharp-dependency-graph.modern.zoomToFit'
        );
        assert.ok(zoomCall, 'zoomToFit command should be registered');

        const handler = zoomCall.args[1];
        
        // Execute the handler
        await handler();

        // Should show information message
        assert.ok(showInformationMessageStub.calledWith('Zoom to fit activated'));
    });

    test('should handle showCycles command', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        manager.initialize(mockContext);

        // Get the showCycles command handler
        const cyclesCall = registerCommandStub.getCalls().find(
            call => call.args[0] === 'csharp-dependency-graph.modern.showCycles'
        );
        assert.ok(cyclesCall, 'showCycles command should be registered');

        const handler = cyclesCall.args[1];
        
        // Execute the handler
        await handler();

        // Should execute the original command
        assert.ok(executeCommandStub.calledWith('csharp-dependency-graph.analyzeCycles'));
    });

    test('should handle command execution errors gracefully', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        // Make executeCommand throw an error
        executeCommandStub.rejects(new Error('Command failed'));

        manager.initialize(mockContext);

        // Get the openGraph command handler
        const openGraphCall = registerCommandStub.getCalls().find(
            call => call.args[0] === 'csharp-dependency-graph.modern.openGraph'
        );
        assert.ok(openGraphCall, 'openGraph command should be registered');

        const handler = openGraphCall.args[1];
        
        try {
            // Execute the handler - it should handle the error gracefully
            await handler();
        } catch (error) {
            // Handler should not throw errors but handle them internally
            assert.fail('Handler should not throw errors');
        }

        // Should show error message
        assert.ok(showErrorMessageStub.called);
        const errorCall = showErrorMessageStub.getCall(0);
        assert.ok(errorCall.args[0].includes('Failed to open graph'));
    });

    test('should handle search cancellation', async () => {
        const mockContext: vscode.ExtensionContext = {
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        manager.initialize(mockContext);

        // Get the searchNodes command handler
        const searchCall = registerCommandStub.getCalls().find(
            call => call.args[0] === 'csharp-dependency-graph.modern.searchNodes'
        );
        assert.ok(searchCall, 'searchNodes command should be registered');

        const handler = searchCall.args[1];
        
        // Mock showInputBox to return undefined (cancelled)
        const showInputBoxStub = sinon.stub(vscode.window, 'showInputBox').resolves(undefined);
        
        // Execute the handler
        await handler();

        // Should not show error or information message
        assert.ok(!showErrorMessageStub.called);
        assert.ok(!showInformationMessageStub.called);
        
        showInputBoxStub.restore();
    });
});
