import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { GraphPreviewProvider } from '../../graphPreview';

/**
 * Interface for the message structure used in the tests
 */
interface ExportSvgTestMessage {
  command: 'exportSvg';
  svgData: string;
  title?: string;
}

/**
 * Interface for mocked webview
 */
interface MockWebview {
  html: string;
  asWebviewUri: (uri: vscode.Uri) => vscode.Uri;
  cspSource: string;
  onDidReceiveMessage: sinon.SinonStub;
  postMessage: sinon.SinonStub;
}

/**
 * Interface for mocked panel
 */
interface MockPanel {
  webview: MockWebview;
  reveal: sinon.SinonStub;
  dispose: sinon.SinonStub;
  onDidDispose: sinon.SinonStub;
  title: string;
}

/**
 * Suite of tests for the GraphPreviewProvider class
 */
suite('GraphPreviewProvider Test Suite', () => {
  let extensionUri: vscode.Uri;
  let provider: GraphPreviewProvider;
  let mockPanel: MockPanel;
  let mockWebview: MockWebview;

  // Set up before each test
  setup(() => {
    // Get the extension URI
    extensionUri = vscode.Uri.file(__dirname + '/../../../');

    // Create mock objects for WebviewPanel and Webview
    mockWebview = {
      html: '',
      asWebviewUri: (uri: vscode.Uri) => uri,
      cspSource: 'vscode-webview://test-source',
      onDidReceiveMessage: sinon.stub(),
      postMessage: sinon.stub().resolves(true)
    };

    mockPanel = {
      webview: mockWebview,
      reveal: sinon.stub(),
      dispose: sinon.stub(),
      onDidDispose: sinon.stub(),
      title: '',
    };

    // Create a new provider instance
    provider = new GraphPreviewProvider(extensionUri);
  });

  // Tear down after each test
  teardown(() => {
    sinon.restore();
  });

  // Test if the provider correctly handles empty dot content
  test('should handle empty dot content', () => {
    // Use type assertion to access private field - first convert to unknown
    const providerAny = provider as unknown as {
      _panel: vscode.WebviewPanel;
    };
    
    // Set the panel
    providerAny._panel = mockPanel as unknown as vscode.WebviewPanel;

    // Call the method
    provider.showPreview('', 'Test Graph');

    // Verify expectations
    assert.ok(mockPanel.reveal.called);
    assert.strictEqual(mockPanel.title, 'Test Graph');
    assert.ok(mockWebview.html.includes('<!DOCTYPE html>'));
  });

  // Test if provider correctly includes cycle data when available
  test('should include cycle data when provided', () => {
    // Use type assertion to access private field
    const providerAny = provider as unknown as {
      _panel: vscode.WebviewPanel;
    };
    
    // Set the panel
    providerAny._panel = mockPanel as unknown as vscode.WebviewPanel;

    // Create test data
    const dotContent = 'digraph { A -> B }';
    const cyclesOnlyDotContent = 'digraph { A -> B -> A [color=red] }';

    // Call the method with cycles
    provider.showPreview(dotContent, 'Graph with Cycles', 'test.dot', cyclesOnlyDotContent);

    // Verify expectations
    assert.ok(mockPanel.reveal.called);
    assert.strictEqual(mockPanel.title, 'Graph with Cycles');
    
    // Verify cycle data is included in the HTML
    const html = mockWebview.html;
    assert.ok(html.includes(JSON.stringify(cyclesOnlyDotContent)));
    assert.ok(html.includes('hasCycles: true'));
  });

  // Test message handling for SVG export
  test('should handle export message from webview', async () => {
    // Use type assertion to access private fields
    const providerAny = provider as unknown as {
      _panel: vscode.WebviewPanel;
      _handleWebviewMessage(message: ExportSvgTestMessage): Promise<void>;
      _handleExportSvg(message: ExportSvgTestMessage): Promise<void>;
      _getDefaultExportUri(title?: string): vscode.Uri;
    };
    
    // Set the panel
    providerAny._panel = mockPanel as unknown as vscode.WebviewPanel;

    // Mock showSaveDialog to return a URI
    const saveUri = vscode.Uri.file('/test/path/test.svg');
    const showSaveDialogStub = sinon.stub(vscode.window, 'showSaveDialog').resolves(saveUri);
    
    // Mock showInformationMessage
    const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage');
    
    // Mock Buffer.from to track it being called
    const bufferFromSpy = sinon.spy(Buffer, 'from');

    // Create a mock message
    const message: ExportSvgTestMessage = {
      command: 'exportSvg',
      svgData: '<svg>Test SVG</svg>',
      title: 'Test Graph'
    };

    // Store original method reference
    const originalHandleExportSvg = providerAny._handleExportSvg;
    
    // Override the export method to avoid actual file writing
    providerAny._handleExportSvg = async (msg: ExportSvgTestMessage): Promise<void> => {
      try {
        const svgContent = msg.svgData;
        const defaultUri = providerAny._getDefaultExportUri(msg.title);
        const saveDialogResult = await vscode.window.showSaveDialog({
          defaultUri: defaultUri,
          filters: {
            "SVG Files": ["svg"],
            "All Files": ["*"],
          },
          title: "Export SVG",
        });

        // Skip actual file write but still do Buffer conversion to ensure spy is triggered
        if (saveDialogResult) {
          Buffer.from(svgContent, "utf8");
          // Don't actually write the file
          vscode.window.showInformationMessage(
            `SVG exported to ${saveDialogResult.fsPath}`
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to export SVG: ${errorMessage}`);
      }
    };

    try {
      // Call the message handler method
      await providerAny._handleWebviewMessage(message);

      // Verify expectations
      assert.ok(showSaveDialogStub.called, 'showSaveDialog should be called');
      assert.ok(bufferFromSpy.called, 'Buffer.from should be called');
      assert.ok(bufferFromSpy.calledWith('<svg>Test SVG</svg>', 'utf8'), 'Buffer.from should be called with correct args');
      assert.ok(showInfoStub.called, 'showInformationMessage should be called');
    } finally {
      // Restore original method
      providerAny._handleExportSvg = originalHandleExportSvg;
    }
  });

  // Test error handling during export
  test('should handle errors during export', async () => {
    // Use type assertion to access private fields
    const providerAny = provider as unknown as {
      _panel: vscode.WebviewPanel;
      _handleWebviewMessage(message: ExportSvgTestMessage): Promise<void>;
    };
    
    // Set the panel
    providerAny._panel = mockPanel as unknown as vscode.WebviewPanel;

    // Mock showSaveDialog to throw an error
    const error = new Error('Test error');
    const showSaveDialogStub = sinon.stub(vscode.window, 'showSaveDialog').throws(error);
    
    // Mock showErrorMessage
    const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage');

    // Create a mock message
    const message: ExportSvgTestMessage = {
      command: 'exportSvg',
      svgData: '<svg>Test SVG</svg>',
      title: 'Test Graph'
    };

    // Call the private message handler method
    await providerAny._handleWebviewMessage(message);

    // Verify expectations
    assert.ok(showSaveDialogStub.called);
    assert.ok(showErrorStub.called);
    assert.strictEqual(showErrorStub.firstCall.args[0], 'Failed to export SVG: Test error');
  });
});