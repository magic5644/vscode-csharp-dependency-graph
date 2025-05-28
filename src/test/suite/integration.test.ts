import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { NotificationManager } from '../../notifications/NotificationManager';
import { StatusBarManager } from '../../statusbar/StatusBarManager';
import { KeybindingManager } from '../../commands/KeybindingManager';
import { ModernGraphWebviewProvider } from '../../ModernGraphWebviewProvider';

suite('Modern UI Integration Test Suite', () => {
    let notificationManager: NotificationManager;
    let statusBarManager: StatusBarManager;
    let keybindingManager: KeybindingManager;
    let webviewProvider: ModernGraphWebviewProvider;
    let mockContext: vscode.ExtensionContext;
    let createStatusBarItemStub: sinon.SinonStub;
    let registerCommandStub: sinon.SinonStub;
    let mockStatusBarItems: Array<{ text: string; tooltip: string; show: sinon.SinonStub; hide: sinon.SinonStub; dispose: sinon.SinonStub }>;

    setup(() => {
        // Create mock extension context
        mockContext = {
            extensionUri: vscode.Uri.parse('file:///test/extension'),
            subscriptions: [],
            workspaceState: {
                get: sinon.stub(),
                update: sinon.stub()
            },
            globalState: {
                get: sinon.stub(),
                update: sinon.stub()
            }
        } as any;

        // Create stubs for VS Code API
        mockStatusBarItems = [];
        
        createStatusBarItemStub = sinon.stub(vscode.window, 'createStatusBarItem').callsFake(() => {
            const mockItem = {
                text: '',
                tooltip: '',
                command: '',
                color: '',
                backgroundColor: '',
                show: sinon.stub(),
                hide: sinon.stub(),
                dispose: sinon.stub()
            };
            mockStatusBarItems.push(mockItem);
            return mockItem as any;
        });
        registerCommandStub = sinon.stub(vscode.commands, 'registerCommand').returns({ dispose: sinon.stub() });

        // Initialize components
        notificationManager = NotificationManager.getInstance();
        statusBarManager = StatusBarManager.getInstance();
        keybindingManager = KeybindingManager.getInstance();
        webviewProvider = new ModernGraphWebviewProvider(mockContext.extensionUri, mockContext);
    });

    teardown(() => {
        sinon.restore();
        NotificationManager.resetInstance();
        StatusBarManager.resetInstance();
        KeybindingManager.resetInstance();
    });

    test('should initialize all modern UI components without errors', () => {
        assert.doesNotThrow(() => {
            statusBarManager.initialize();
            keybindingManager.initialize(mockContext);
        });

        assert.ok(notificationManager);
        assert.ok(statusBarManager);
        assert.ok(keybindingManager);
        assert.ok(webviewProvider);
    });    test('should register all commands and status bar items', () => {
        statusBarManager.initialize();
        
        // Update dependency count to trigger status bar creation
        statusBarManager.updateDependencyCount(42, 'project');
        
        keybindingManager.initialize(mockContext);
        
        // Should create status bar item when updateDependencyCount is called
        assert.ok(createStatusBarItemStub.called);
        
        // Should register all keybinding commands (9 original + 6 modern = 15 total)
        assert.strictEqual(registerCommandStub.callCount, 15);
        
        // Verify command names
        const commandNames = registerCommandStub.getCalls().map(call => call.args[0]);
        assert.ok(commandNames.includes('csharp-dependency-graph.modern.openGraph'));
        assert.ok(commandNames.includes('csharp-dependency-graph.modern.refreshGraph'));
        assert.ok(commandNames.includes('csharp-dependency-graph.modern.exportGraph'));
        assert.ok(commandNames.includes('csharp-dependency-graph.modern.searchNodes'));
        assert.ok(commandNames.includes('csharp-dependency-graph.modern.zoomToFit'));
        assert.ok(commandNames.includes('csharp-dependency-graph.modern.showCycles'));
    });

    test('should handle notification and status bar integration', () => {
        statusBarManager.initialize();
        
        // Update dependency count
        statusBarManager.updateDependencyCount(42, 'project');
        
        // Show cycle indicator
        statusBarManager.showCycleIndicator(2);
        
        // Show notification
        notificationManager.showInfo('Test notification');
        
        // Both should work without interference
        assert.ok(createStatusBarItemStub.called);
        const dependencyItem = mockStatusBarItems[0];
        assert.ok(dependencyItem.text.includes('42'));
        
        // Check if cycle indicator was created (it's a separate status bar item)
        assert.ok(createStatusBarItemStub.callCount >= 2);
        const cycleItem = mockStatusBarItems[1];
        assert.ok(cycleItem.text.includes('cycles'));
    });

    test('should coordinate webview and notification manager', () => {
        const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').rejects(new Error('File not found'));
        
        const mockWebviewView = {
            webview: {
                html: '',
                postMessage: sinon.stub().resolves(true),
                onDidReceiveMessage: sinon.stub(),
                asWebviewUri: sinon.stub().returns(vscode.Uri.parse('https://test.com/resource')),
                cspSource: 'https://test.com',
                options: {}
            },
            visible: true,
            onDidDispose: sinon.stub(),
            onDidChangeVisibility: sinon.stub(),
            show: sinon.stub(),
            title: 'Test View'
        } as any;

        webviewProvider.resolveWebviewView(mockWebviewView, null as any, null as any);
        
        // Test that webview can trigger notifications
        const onDidReceiveMessageStub = mockWebviewView.webview.onDidReceiveMessage as sinon.SinonStub;
        const messageHandler = onDidReceiveMessageStub.getCall(0).args[0];
        
        // Simulate node selection message that will fail to open file
        messageHandler({
            command: 'nodeSelected',
            data: { nodeId: 'TestClass.cs', nodeType: 'class', position: { x: 100, y: 200 } }
        });
        
        // Should try to execute command to open file
        assert.ok(executeCommandStub.called);
        
        executeCommandStub.restore();
        showWarningStub.restore();
    });

    test('should handle graph data flow through all components', () => {
        statusBarManager.initialize();
        
        const mockWebviewView = {
            webview: {
                html: '',
                postMessage: sinon.stub().resolves(true),
                onDidReceiveMessage: sinon.stub(),
                asWebviewUri: sinon.stub().returns(vscode.Uri.parse('https://test.com/resource')),
                cspSource: 'https://test.com',
                options: {}
            },
            visible: true,
            onDidDispose: sinon.stub(),
            onDidChangeVisibility: sinon.stub(),
            show: sinon.stub(),
            title: 'Test View'
        } as any;

        webviewProvider.resolveWebviewView(mockWebviewView, null as any, null as any);
        
        // Show graph in webview - this will trigger updateGraph which updates the status bar
        const dotContent = 'digraph G { "Class1" [label="Class1"]; "Class2" [label="Class2"]; "Class3" [label="Class3"]; "Class1" -> "Class2"; "Class2" -> "Class3"; }';
        webviewProvider.showGraph(dotContent, { title: 'Test Graph', hasCycles: false });
        
        // Verify status bar was created and has correct content
        assert.ok(createStatusBarItemStub.called);
        
        // The most recent status bar item should contain the dependency count
        const mostRecentItem = mockStatusBarItems[mockStatusBarItems.length - 1];
        assert.ok(mostRecentItem.text.includes('3')); // Should show 3 nodes from parsed DOT
        
        // Verify webview received graph data
        const postMessageStub = mockWebviewView.webview.postMessage as sinon.SinonStub;
        assert.ok(postMessageStub.called);
        const messageCall = postMessageStub.getCall(0);
        assert.strictEqual(messageCall.args[0].command, 'updateGraph');
        assert.ok(messageCall.args[0].data.dotContent);
    });

    test('should handle errors gracefully across components', () => {
        statusBarManager.initialize();
        keybindingManager.initialize(mockContext);
        
        // Test error in notification manager
        assert.doesNotThrow(() => {
            notificationManager.showError('Test error');
        });
        
        // Test error in status bar manager
        assert.doesNotThrow(() => {
            statusBarManager.updateDependencyCount(-1, 'project'); // Invalid count
        });
        
        // Test error in webview provider
        assert.doesNotThrow(() => {
            webviewProvider.postMessage({ command: 'test', data: {} }); // No webview resolved
        });
    });

    test('should dispose all components properly', () => {
        statusBarManager.initialize();
        
        // Create a status bar item first
        statusBarManager.updateDependencyCount(10, 'project');
        
        keybindingManager.initialize(mockContext);
        
        // Ensure status bar item was created
        assert.ok(createStatusBarItemStub.called);
        const statusBarItem = createStatusBarItemStub.returnValues[0];
        
        // Dispose components
        notificationManager.dispose();
        statusBarManager.dispose();
        
        // Verify status bar item was disposed
        assert.ok(statusBarItem.dispose.called);
        
        // Verify subscriptions were added to context
        assert.ok(mockContext.subscriptions.length > 0);
    });

    test('should maintain singleton patterns correctly', () => {
        const notificationManager1 = NotificationManager.getInstance();
        const notificationManager2 = NotificationManager.getInstance();
        const statusBarManager1 = StatusBarManager.getInstance();
        const statusBarManager2 = StatusBarManager.getInstance();
        
        assert.strictEqual(notificationManager1, notificationManager2);
        assert.strictEqual(statusBarManager1, statusBarManager2);
    });

    test('should handle concurrent operations', () => {
        statusBarManager.initialize();
        
        const mockWebviewView = {
            webview: {
                html: '',
                postMessage: sinon.stub().resolves(true),
                onDidReceiveMessage: sinon.stub(),
                asWebviewUri: sinon.stub().returns(vscode.Uri.parse('https://test.com/resource')),
                cspSource: 'https://test.com',
                options: {}
            },
            visible: true,
            onDidDispose: sinon.stub(),
            onDidChangeVisibility: sinon.stub(),
            show: sinon.stub(),
            title: 'Test View'
        } as any;

        webviewProvider.resolveWebviewView(mockWebviewView, null as any, null as any);
        
        // Simulate concurrent operations
        const operations = [
            () => statusBarManager.updateDependencyCount(10, 'project'),
            () => notificationManager.showInfo('Info 1'),
            () => webviewProvider.postMessage({ command: 'test1', data: {} }),
            () => statusBarManager.updateDependencyCount(20, 'class'),
            () => statusBarManager.showCycleIndicator(3), // Show cycle indicator
            () => notificationManager.showWarning('Warning 1'),
            () => webviewProvider.postMessage({ command: 'test2', data: {} })
        ];
        
        // Execute all operations
        assert.doesNotThrow(() => {
            operations.forEach(op => op());
        });
        
        // Verify final state - check multiple status bar items were created
        assert.ok(createStatusBarItemStub.callCount >= 2);
        
        // Check dependency count status bar item (should be the last one created since it was updated last)
        const dependencyItem = mockStatusBarItems[mockStatusBarItems.length - 2]; // Second to last (cycle indicator is last)
        assert.ok(dependencyItem.text.includes('20'));
        
        // Check cycle indicator status bar item (should be the last one created)
        const cycleItem = mockStatusBarItems[mockStatusBarItems.length - 1];
        assert.ok(cycleItem.text.includes('cycles'));
    });
});
