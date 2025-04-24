import * as assert from 'assert';
import { DotParser } from '../../dotParser';

suite('DOT Parser Test Suite', () => {
  
  test('extractNodes should correctly extract node definitions', () => {
    // Simple DOT graph with nodes
    const dotContent = `
      digraph G {
        "Node1" [label="First Node"];
        "Node2" [shape=box];
        "Node3" [style=filled, fillcolor=lightblue];
      }
    `;
    
    const nodes = DotParser.extractNodes(dotContent);
    
    // Check that all nodes were extracted
    assert.strictEqual(nodes.size, 3, 'Should extract exactly 3 nodes');
    assert.strictEqual(nodes.has('Node1'), true, 'Should extract Node1');
    assert.strictEqual(nodes.has('Node2'), true, 'Should extract Node2');
    assert.strictEqual(nodes.has('Node3'), true, 'Should extract Node3');
  });
  
  test('extractNodes should handle complex dot content', () => {
    // DOT content with various node definitions and attributes
    const dotContent = `
      digraph Dependencies {
        // Comment line
        "Project.Class1" [shape=box, style="filled", fillcolor="lightblue"];
        "Project.Class2" [shape=box, /*inline comment*/ style="filled", fillcolor="lightblue"];
        subgraph cluster_0 {
          "Nested.Node" [shape=ellipse];
        }
      }
    `;
    
    const nodes = DotParser.extractNodes(dotContent);
    
    // Check that all nodes were extracted, even within subgraphs
    assert.strictEqual(nodes.size, 3, 'Should extract all nodes including nested ones');
    assert.strictEqual(nodes.has('Project.Class1'), true, 'Should extract node with project prefix');
    assert.strictEqual(nodes.has('Project.Class2'), true, 'Should extract node with inline comment');
    assert.strictEqual(nodes.has('Nested.Node'), true, 'Should extract nested node');
  });
  
  test('extractEdges should correctly extract edge definitions', () => {
    // Simple DOT graph with edges
    const dotContent = `
      digraph G {
        "Node1" -> "Node2";
        "Node2" -> "Node3";
        "Node1" -> "Node3";
      }
    `;
    
    const edges = DotParser.extractEdges(dotContent);
    
    // Check that all edges were extracted and mapped correctly
    assert.strictEqual(edges.size, 2, 'Should have 2 source nodes with edges');
    assert.deepStrictEqual(edges.get('Node1'), ['Node2', 'Node3'], 'Node1 should have edges to Node2 and Node3');
    assert.deepStrictEqual(edges.get('Node2'), ['Node3'], 'Node2 should have edge to Node3');
  });
  
  test('extractEdges should handle complex edge definitions', () => {
    // DOT content with complex edge definitions and attributes
    const dotContent = `
      digraph Dependencies {
        "Project.Class1" -> "Project.Class2" [penwidth=1.5, color=red];
        "Project.Class1" -> "Project.Class3" [style=dashed];
        "Project.Class2" -> "Project.Class3" [label="uses"];
        "Project.Class2" -> "Project.Class4";
      }
    `;
    
    const edges = DotParser.extractEdges(dotContent);
    
    // Check edges with their attributes
    assert.strictEqual(edges.size, 2, 'Should have 2 source nodes with edges');
    assert.deepStrictEqual(
      edges.get('Project.Class1'), 
      ['Project.Class2', 'Project.Class3'], 
      'Class1 should have edges to Class2 and Class3'
    );
    assert.deepStrictEqual(
      edges.get('Project.Class2'), 
      ['Project.Class3', 'Project.Class4'], 
      'Class2 should have edges to Class3 and Class4'
    );
  });
  
  test('isClassDependencyGraph should correctly identify class graphs', () => {
    // Test with a class dependency graph (contains cluster_)
    const classDotContent = `
      digraph Dependencies {
        subgraph cluster_ProjectA {
          label = "ProjectA";
          "ProjectA.Class1";
          "ProjectA.Class2";
        }
        subgraph cluster_ProjectB {
          label = "ProjectB";
          "ProjectB.Class1";
        }
      }
    `;
    
    // Test with a project dependency graph (no clusters)
    const projectDotContent = `
      digraph Dependencies {
        "ProjectA" -> "ProjectB";
        "ProjectA" -> "ProjectC";
        "ProjectB" -> "ProjectC";
      }
    `;
    
    assert.strictEqual(
      DotParser.isClassDependencyGraph(classDotContent), 
      true, 
      'Should identify graph with clusters as a class dependency graph'
    );
    assert.strictEqual(
      DotParser.isClassDependencyGraph(projectDotContent), 
      false, 
      'Should identify graph without clusters as a project dependency graph'
    );
  });
  
  test('parse should return a complete analysis of the DOT content', () => {
    const dotContent = `
      digraph Dependencies {
        subgraph cluster_ProjectA {
          "ProjectA.Class1" [shape=box];
          "ProjectA.Class2" [shape=box];
        }
        "ProjectA.Class1" -> "ProjectA.Class2";
        "ProjectA.Class2" -> "ProjectB.Class1";
      }
    `;
    
    const result = DotParser.parse(dotContent);
    
    // Check the complete analysis
    assert.strictEqual(result.isClassGraph, true, 'Should identify as class graph');
    assert.strictEqual(result.nodes.size, 3, 'Should extract 3 nodes');
    assert.strictEqual(result.edges.size, 2, 'Should extract 2 source nodes with edges');
    assert.strictEqual(result.nodes.has('ProjectA.Class1'), true);
    assert.strictEqual(result.nodes.has('ProjectA.Class2'), true);
    assert.strictEqual(result.nodes.has('ProjectB.Class1'), true);
    assert.deepStrictEqual(result.edges.get('ProjectA.Class1'), ['ProjectA.Class2']);
    assert.deepStrictEqual(result.edges.get('ProjectA.Class2'), ['ProjectB.Class1']);
  });
  
  test('parse should handle empty or invalid DOT content', () => {
    // Test with empty content
    const emptyContent = '';
    const emptyResult = DotParser.parse(emptyContent);
    
    assert.strictEqual(emptyResult.nodes.size, 0, 'Should have no nodes for empty content');
    assert.strictEqual(emptyResult.edges.size, 0, 'Should have no edges for empty content');
    assert.strictEqual(emptyResult.isClassGraph, false, 'Should not identify as class graph');
    
    // Test with invalid content
    const invalidContent = 'This is not a DOT graph';
    const invalidResult = DotParser.parse(invalidContent);
    
    assert.strictEqual(invalidResult.nodes.size, 0, 'Should have no nodes for invalid content');
    assert.strictEqual(invalidResult.edges.size, 0, 'Should have no edges for invalid content');
    assert.strictEqual(invalidResult.isClassGraph, false, 'Should not identify as class graph');
  });
});