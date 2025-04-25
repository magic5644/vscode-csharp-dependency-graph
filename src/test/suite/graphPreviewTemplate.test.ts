import * as assert from 'assert';
import * as vscode from 'vscode';
import { generateHtmlTemplate, GraphPreviewTemplateParams } from '../../templates/graphPreviewTemplate';

/**
 * Suite of tests for the GraphPreviewTemplate
 */
suite('Graph Preview Template Test Suite', () => {
	// Test if the template generates valid HTML
	test('should generate valid HTML with required elements', () => {
		// Create test URI and parameters
		const testUri = vscode.Uri.file('/test/path');
		const params: GraphPreviewTemplateParams = {
			cspSource: 'vscode-webview://test-source',
			d3Uri: testUri,
			graphvizUri: testUri,
			d3GraphvizUri: testUri,
			wasmFolderUri: testUri,
			webviewScriptUri: testUri, // Added webviewScriptUri
			dotContent: 'digraph { A -> B }',
			hasCycles: false
		};

		// Generate the HTML
		const html = generateHtmlTemplate(params);

		// Verify expected elements are present
		assert.ok(html.includes('<!DOCTYPE html>'), 'HTML should include doctype');
		assert.ok(html.includes('<html lang="en">'), 'HTML should include html tag with lang attribute');
		assert.ok(html.includes('<meta charset="UTF-8">'), 'HTML should include charset meta tag');
		
		// For script tags, just check if the HTML has any script tag
		assert.ok(html.includes('<script'), 'HTML should include script tags');
		
		assert.ok(html.includes('<div class="toolbar">'), 'HTML should include toolbar div');
		assert.ok(html.includes('<div id="graph">'), 'HTML should include graph div');
		assert.ok(html.includes('<div id="status" class="status">'), 'HTML should include status div');
		assert.ok(html.includes('window.graphPreviewState'), 'HTML should include graphPreviewState');
		assert.ok(html.includes(JSON.stringify(params.dotContent)), 'HTML should include dot content');
	});

	// Test if the template handles cycles correctly
	test('should include cycle-specific elements when cycles are present', () => {
		// Create test URI and parameters with cycles
		const testUri = vscode.Uri.file('/test/path');
		const params: GraphPreviewTemplateParams = {
			cspSource: 'vscode-webview://test-source',
			d3Uri: testUri,
			graphvizUri: testUri,
			d3GraphvizUri: testUri,
			wasmFolderUri: testUri,
			webviewScriptUri: testUri, // Added webviewScriptUri
			dotContent: 'digraph { A -> B }',
			cyclesOnlyDotContent: 'digraph { A -> B -> A [color=red] }',
			hasCycles: true
		};

		// Generate the HTML
		const html = generateHtmlTemplate(params);

		// Verify cycle-specific elements
		assert.ok(html.includes('id="toggleCyclesBtn"'), 'HTML should include toggle cycles button');
		assert.ok(html.includes('class="cycle-badge"'), 'HTML should include cycle badge');
		assert.ok(html.includes('cyclesOnlyDotSource'), 'HTML should include cycles only dot source');
		assert.ok(html.includes(JSON.stringify(params.cyclesOnlyDotContent)), 'HTML should include cycles only dot content');
		assert.ok(html.includes('hasCycles: true'), 'HTML should indicate cycles are present');
	});

	// Test if the template disables cycle button when no cycles
	test('should disable cycles button when no cycles are present', () => {
		// Create test URI and parameters without cycles
		const testUri = vscode.Uri.file('/test/path');
		const params: GraphPreviewTemplateParams = {
			cspSource: 'vscode-webview://test-source',
			d3Uri: testUri,
			graphvizUri: testUri,
			d3GraphvizUri: testUri,
			wasmFolderUri: testUri,
			webviewScriptUri: testUri, // Added webviewScriptUri
			dotContent: 'digraph { A -> B }',
			hasCycles: false
		};

		// Generate the HTML
		const html = generateHtmlTemplate(params);

		// Verify button is disabled and no badge is present
		assert.ok(html.includes('id="toggleCyclesBtn" disabled'), 'HTML should include disabled cycles button');
		assert.ok(!html.includes('class="cycle-badge"'), 'HTML should not include cycle badge');
		assert.ok(html.includes('hasCycles: false'), 'HTML should indicate no cycles are present');
	});

	// Test if the template correctly includes the CSP sources
	test('should include proper Content-Security-Policy', () => {
		// Create test URI and parameters
		const testUri = vscode.Uri.file('/test/path');
		const cspSource = 'vscode-webview://test-csp-source';
		const params: GraphPreviewTemplateParams = {
			cspSource: cspSource,
			d3Uri: testUri,
			graphvizUri: testUri,
			d3GraphvizUri: testUri,
			wasmFolderUri: testUri,
			webviewScriptUri: testUri, // Added webviewScriptUri
			dotContent: 'digraph { A -> B }',
			hasCycles: false
		};

		// Generate the HTML
		const html = generateHtmlTemplate(params);

		// Verify CSP sources
		assert.ok(html.includes(`img-src ${cspSource} data:`), 'HTML should include img-src in CSP');
		assert.ok(html.includes(`script-src ${cspSource}`), 'HTML should include script-src in CSP');
		assert.ok(html.includes(`style-src ${cspSource}`), 'HTML should include style-src in CSP');
		assert.ok(html.includes(`connect-src ${cspSource}`), 'HTML should include connect-src in CSP');
		assert.ok(html.includes(`font-src ${cspSource}`), 'HTML should include font-src in CSP');
	});
});