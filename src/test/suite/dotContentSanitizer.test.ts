import * as assert from 'assert';
import * as sinon from 'sinon';
import * as sanitizer from '../../dotSanitizer';

suite('DOT Content Sanitizer Test Suite', () => {
  
  // Setup spy on console.warn for validation tests
  let consoleWarnStub: sinon.SinonStub;
  
  setup(() => {
    // Clear module cache to ensure fresh import
    delete require.cache[require.resolve('../../dotSanitizer')];
    consoleWarnStub = sinon.stub(console, 'warn');
  });
  
  teardown(() => {
    consoleWarnStub.restore();
  });
  
  test('isValidDotGraph should correctly validate dot graphs', () => {
    // Valid graphs
    assert.strictEqual(sanitizer.isValidDotGraph('digraph G { A -> B; }'), true);
    assert.strictEqual(sanitizer.isValidDotGraph('graph MyGraph { A -- B; }'), true);
    assert.strictEqual(sanitizer.isValidDotGraph('  digraph "Complex Name" { }'), true);
    
    // Invalid content
    assert.strictEqual(sanitizer.isValidDotGraph('This is not a graph'), false);
    assert.strictEqual(sanitizer.isValidDotGraph('diegraph Invalid { }'), false);
    assert.strictEqual(sanitizer.isValidDotGraph('{ A -> B; }'), false);
  });
  
  test('enhanceGraphWithDefaultAttributes should add style attributes to digraphs', () => {
    // Test with a simple digraph
    const input = 'digraph G { A -> B; }';
    const enhanced = sanitizer.enhanceGraphWithDefaultAttributes(input);
    
    // Check if the style attributes were added
    assert.strictEqual(enhanced.includes('splines=polyline'), true);
    assert.strictEqual(enhanced.includes('overlap=false'), true);
    assert.strictEqual(enhanced.includes('node [shape=box'), true);
    
    // Should not modify if already has splines attribute
    const withSplines = 'digraph G { graph [splines=ortho]; A -> B; }';
    assert.strictEqual(sanitizer.enhanceGraphWithDefaultAttributes(withSplines), withSplines);
    
    // Should not modify if not a digraph
    const undirected = 'graph G { A -- B; }';
    assert.strictEqual(sanitizer.enhanceGraphWithDefaultAttributes(undirected), undirected);
  });
  
  test('sanitizeStringValue should escape special characters', () => {
    // Test apostrophes and quotes
    assert.strictEqual(sanitizer.sanitizeStringValue("O'Reilly"), "O&#39;Reilly");
    assert.strictEqual(sanitizer.sanitizeStringValue('Say "Hello"'), 'Say &quot;Hello&quot;');
    
    // Test diacritics
    assert.strictEqual(sanitizer.sanitizeStringValue('café'), 'caf&#233;');
    assert.strictEqual(sanitizer.sanitizeStringValue('naïve'), 'na&#239;ve');
    assert.strictEqual(sanitizer.sanitizeStringValue('über'), '&#252;ber');
    
    // Test multiple special characters
    const complexInput = "L'hôtel d'été: \"La Côte d'Azur\"";
    const expectedOutput = "L&#39;h&#244;tel d&#39;&#233;t&#233;: &quot;La C&#244;te d&#39;Azur&quot;";
    assert.strictEqual(sanitizer.sanitizeStringValue(complexInput), expectedOutput);
  });
  
  test('sanitizeNodeIds should escape special characters in node IDs', () => {
    // Test with simple node IDs
    const input = 'digraph G { "Node\'s ID" -> "Another\'s ID"; }';
    const sanitized = sanitizer.sanitizeNodeIds(input);
    assert.strictEqual(sanitized, 'digraph G { "Node&#39;s ID" -> "Another&#39;s ID"; }');
    
    // Test with node IDs containing mixed special characters
    const complexInput = 'digraph G { "áéíóú" -> "àèìòù"; }';
    const sanitized2 = sanitizer.sanitizeNodeIds(complexInput);
    assert.strictEqual(sanitized2.includes('"&#225;&#233;&#237;&#243;&#250;"'), true);
    assert.strictEqual(sanitized2.includes('"&#224;&#232;&#236;&#242;&#249;"'), true);
  });
  
  
  test('fixSyntaxIssues should correct common DOT syntax problems', () => {
    // Test spacing in edge definitions
    const edgeDef = 'digraph G { A->B; C->D; }';
    const fixedEdgeDef = sanitizer.fixSyntaxIssues(edgeDef);
    assert.strictEqual(fixedEdgeDef, 'digraph G { A-> B; C-> D; }');
    
    // Test graph identifiers with spaces
    const spacedId = 'digraph My Graph { A -> B; }';
    const fixedSpacedId = sanitizer.fixSyntaxIssues(spacedId);
    assert.strictEqual(fixedSpacedId, 'digraph "My Graph" { A -> B; }');
    
    // Test undirected graph with spaces in name
    const undirectedSpacedId = 'graph Network Diagram { A -- B; }';
    const fixedUndirected = sanitizer.fixSyntaxIssues(undirectedSpacedId);
    assert.strictEqual(fixedUndirected, 'graph "Network Diagram" { A -- B; }');
  });
  
  test('sanitizeDotContent should perform comprehensive sanitization', () => {
    // Test with invalid DOT content
    const invalidContent = 'Not a DOT graph';
    const invalidResult = sanitizer.sanitizeDotContent(invalidContent);
    
    // Verify invalidGraphWarning flag is set for invalid content
    assert.strictEqual(invalidResult.invalidGraphWarning, true, 'invalidGraphWarning should be true for invalid DOT content');
    // For invalid content, no transformations should be applied
    assert.strictEqual(invalidResult.content, invalidContent, 'Content should be unchanged for invalid DOT graph');
    
    // Test with real-world complex DOT graph
    const complexDotGraph = `
      digraph "Project Dependencies" {
        "Project A" -> "Project B";
        "Project C" [label="<h3>Web API</h3>"];
        "User's Service" -> "Data Access";
        node [shape=box, style="filled", fillcolor="lightblue"];
        "Project D" -> "Project E"->F;
      }
    `;
    
    const sanitized = sanitizer.sanitizeDotContent(complexDotGraph);
    
    // Verify valid graph does not trigger warning
    assert.strictEqual(sanitized.invalidGraphWarning, false, 'invalidGraphWarning should be false for valid DOT content');
    
    // Check for expected transformations on valid content
    assert.strictEqual(sanitized.content.includes('splines=polyline'), true);
    assert.strictEqual(sanitized.content.includes('"User&#39;s Service"'), true);
    assert.strictEqual(sanitized.content.includes('Project E"-> F'), true);
  });

  test('sanitizeDotContent should handle edge cases', () => {
    // Test with empty content
    const emptyContent = '';
    const sanitizedEmpty = sanitizer.sanitizeDotContent(emptyContent);
    assert.strictEqual(sanitizedEmpty.content, '');
    assert.strictEqual(sanitizedEmpty.invalidGraphWarning, true, 'Empty content should be considered invalid');
    
    // Test with minimal valid content
    const minimalContent = 'digraph G {}';
    const sanitizedMinimal = sanitizer.sanitizeDotContent(minimalContent);
    assert.strictEqual(sanitizedMinimal.invalidGraphWarning, false);
    assert.strictEqual(sanitizedMinimal.content.includes('splines=polyline'), true);
    
    // Test with special characters in graph name
    const specialNameGraph = 'digraph "é-ß-ç" {}';
    const sanitizedSpecialName = sanitizer.sanitizeDotContent(specialNameGraph);
    assert.strictEqual(sanitizedSpecialName.invalidGraphWarning, false);
    assert.strictEqual(sanitizedSpecialName.content.includes('"&#233;-ß-&#231;"'), true);
  });
});