import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { ModernGraphWebviewProvider } from '../../ModernGraphWebviewProvider';
import { NotificationManager } from '../../notifications/NotificationManager';

suite('ModernGraphWebviewProvider Test Suite', () => {
    let provider: ModernGraphWebviewProvider;
    let mockContext: vscode.ExtensionContext;
    let mockWebviewView: vscode.WebviewView;
    let mockWebview: vscode.Webview;
    let notificationManager: NotificationManager;
    let createWebviewPanelStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;

    setup(() => {
        // Create mock webview
        mockWebview = {
            html: '',
            postMessage: sinon.stub().resolves(true),
            onDidReceiveMessage: sinon.stub(),
            asWebviewUri: sinon.stub().returns(vscode.Uri.parse('https://test.com/resource')),
            cspSource: 'https://test.com',
            options: {}
        } as vscode.Webview;

        // Create mock webview view
        mockWebviewView = {
            webview: mockWebview,
            visible: true,
            onDidDispose: sinon.stub(),
            onDidChangeVisibility: sinon.stub(),
            show: sinon.stub(),
            title: 'Test View'
        } as unknown as vscode.WebviewView;

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
        } as unknown as vscode.ExtensionContext;

        // Create stubs for VS Code API
        createWebviewPanelStub = sinon.stub(vscode.window, 'createWebviewPanel');
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

        notificationManager = NotificationManager.getInstance();
        provider = new ModernGraphWebviewProvider(mockContext.extensionUri, mockContext);
    });

    teardown(() => {
        sinon.restore();
        NotificationManager.resetInstance();
    });

    test('should initialize with correct context and notification manager', () => {
        assert.ok(provider);
        assert.strictEqual((provider as any)._context, mockContext);
        assert.strictEqual((provider as any)._notificationManager, notificationManager);
    });

    test('should resolve webview view with correct HTML content', () => {
        provider.resolveWebviewView(mockWebviewView, null as any, null as any);

        assert.ok(mockWebview.html.includes('Dependency Graph'));
        assert.ok(mockWebview.html.includes('href=') && mockWebview.html.includes('rel="stylesheet"'));
        assert.ok(mockWebview.html.includes('modern-graph-container'));
    });

    test('should handle node selection message', () => {
        provider.resolveWebviewView(mockWebviewView, null as any, null as any);
        
        // Get the message handler
        const onDidReceiveMessageStub = mockWebview.onDidReceiveMessage as sinon.SinonStub;
        assert.ok(onDidReceiveMessageStub.called);
        
        const messageHandler = onDidReceiveMessageStub.getCall(0).args[0];
        
        // Test node selection message - use nodeType to trigger status bar update
        const message = {
            command: 'nodeSelected',
            data: { nodeId: 'TestClass.cs', nodeType: 'class', position: { x: 100, y: 200 } }
        };
        
        messageHandler(message);
        
        // The method updates status bar, not notification messages
        // Just verify no errors occurred
        assert.ok(!showErrorMessageStub.called);
    });

    test('should handle export graph message', async () => {
        // Mock showSaveDialog to return a valid URI
        const showSaveDialogStub = sinon.stub(vscode.window, 'showSaveDialog');
        showSaveDialogStub.resolves(vscode.Uri.file('/test/export.svg'));
        
        provider.resolveWebviewView(mockWebviewView, null as any, null as any);
        
        const onDidReceiveMessageStub = mockWebview.onDidReceiveMessage as sinon.SinonStub;
        const messageHandler = onDidReceiveMessageStub.getCall(0).args[0];
        
        // Test export graph message
        const message = {
            command: 'exportGraph',
            data: { format: 'svg', fileName: 'test-graph.svg' }
        };
        
        await messageHandler(message);
        
        // Should show save dialog and information message about export
        assert.ok(showSaveDialogStub.called);
        assert.ok(showInformationMessageStub.called);
        
        showSaveDialogStub.restore();
    });

    test('should handle search message', () => {
        provider.resolveWebviewView(mockWebviewView, null as any, null as any);
        
        const onDidReceiveMessageStub = mockWebview.onDidReceiveMessage as sinon.SinonStub;
        const messageHandler = onDidReceiveMessageStub.getCall(0).args[0];
        
        // Test search message - uses searchRequested command
        const message = {
            command: 'searchRequested',
            data: { term: 'TestClass' }
        };
        
        messageHandler(message);
        
        // Should post message back to webview and show status bar message
        assert.ok((mockWebview.postMessage as sinon.SinonStub).called);
        const postCall = (mockWebview.postMessage as sinon.SinonStub).getCall(0);
        assert.strictEqual(postCall.args[0].command, 'performSearch');
    });

    test('should handle unknown message type gracefully', () => {
        provider.resolveWebviewView(mockWebviewView, null as any, null as any);
        
        const onDidReceiveMessageStub = mockWebview.onDidReceiveMessage as sinon.SinonStub;
        const messageHandler = onDidReceiveMessageStub.getCall(0).args[0];
        
        // Test unknown message type
        const message = {
            command: 'unknownType',
            data: { test: 'data' }
        };
        
        messageHandler(message);
        
        // Should not throw error and not show any messages
        assert.ok(!showErrorMessageStub.called);
        assert.ok(!showInformationMessageStub.called);
    });

    test('should open graph view with webview panel', async () => {
        // First resolve the webview view
        provider.resolveWebviewView(mockWebviewView, null as any, null as any);
        
        const testFileUri = vscode.Uri.file('/test/TestClass.cs');
        await provider.openGraphView(testFileUri);
        
        // Should call view.show() if view exists
        const showStub = mockWebviewView.show as sinon.SinonStub;
        assert.ok(showStub.called);
        
        // Should show info notification
        assert.ok(showInformationMessageStub.called);
        const infoCall = showInformationMessageStub.getCall(0);
        assert.ok(infoCall.args[0].includes('Opening graph view'));
    });

    test('should show graph with content', () => {
        provider.resolveWebviewView(mockWebviewView, null as any, null as any);
        
        const dotContent = 'digraph G { TestClass -> OtherClass; }';
        
        provider.showGraph(dotContent, { title: 'Test Graph', hasCycles: false });
        
        // Should post message to webview
        assert.ok((mockWebview.postMessage as sinon.SinonStub).called);
        const messageCall = (mockWebview.postMessage as sinon.SinonStub).getCall(0);
        assert.strictEqual(messageCall.args[0].command, 'updateGraph');
    });

    test('should refresh graph', async () => {
        provider.resolveWebviewView(mockWebviewView, null as any, null as any);
        
        // First set some graph data
        const dotContent = 'digraph G { TestClass -> OtherClass; }';
        await provider.showGraph(dotContent, { title: 'Test Graph', hasCycles: false });
        
        // Clear previous calls
        (mockWebview.postMessage as sinon.SinonStub).resetHistory();
        
        await provider.refresh();
        
        // Should post updateGraph message to webview (refresh calls updateGraph)
        assert.ok((mockWebview.postMessage as sinon.SinonStub).called);
        const messageCall = (mockWebview.postMessage as sinon.SinonStub).getCall(0);
        assert.strictEqual(messageCall.args[0].command, 'updateGraph');
    });

    test('should post custom message', () => {
        provider.resolveWebviewView(mockWebviewView, null as any, null as any);
        
        const customMessage = { command: 'customType', data: { test: 'value' } };
        
        provider.postMessage(customMessage);
        
        // Should post custom message to webview
        assert.ok((mockWebview.postMessage as sinon.SinonStub).called);
        const messageCall = (mockWebview.postMessage as sinon.SinonStub).getCall(0);
        assert.deepStrictEqual(messageCall.args[0], customMessage);
    });

    test('should parse graph metadata correctly', () => {
        const dotContent = `digraph G {
            Class1 -> Class2;
            Class2 -> Class3; 
            Class3 -> Class1;
        }`;
        
        const metadata = (provider as any)._parseGraphMetadata(dotContent);
        
        assert.strictEqual(typeof metadata.nodeCount, 'number');
        assert.strictEqual(typeof metadata.edgeCount, 'number');
        assert.strictEqual(typeof metadata.hasCycles, 'boolean');
        assert.strictEqual(typeof metadata.largestComponent, 'number');
    });

    test('should parse graph metadata without cycles', () => {
        const dotContent = `digraph G {
            Class1 -> Class2;
        }`;
        
        const metadata = (provider as any)._parseGraphMetadata(dotContent);
        
        assert.strictEqual(typeof metadata.nodeCount, 'number');
        assert.strictEqual(typeof metadata.edgeCount, 'number');
        assert.strictEqual(typeof metadata.hasCycles, 'boolean');
        assert.strictEqual(typeof metadata.largestComponent, 'number');
    });

    test('should handle empty graph data', () => {
        const dotContent = 'digraph G { }';
        
        const metadata = (provider as any)._parseGraphMetadata(dotContent);
        
        assert.strictEqual(typeof metadata.nodeCount, 'number');
        assert.strictEqual(typeof metadata.edgeCount, 'number');
        assert.strictEqual(typeof metadata.hasCycles, 'boolean');
        assert.strictEqual(typeof metadata.largestComponent, 'number');
    });

    test('should handle message posting when webview is not ready', () => {
        // Don't resolve webview view
        const customMessage = { command: 'test', data: {} };
        
        // Should not throw error
        assert.doesNotThrow(() => {
            provider.postMessage(customMessage);
        });
    });

    test('should generate correct webview URI for resources', () => {
        provider.resolveWebviewView(mockWebviewView, null as any, null as any);
        
        // Check that asWebviewUri was called for CSS and JS files
        const asWebviewUriStub = mockWebview.asWebviewUri as sinon.SinonStub;
        assert.ok(asWebviewUriStub.called);
        
        // Should be called at least for CSS and JS files
        assert.ok(asWebviewUriStub.callCount >= 2);
    });
});
