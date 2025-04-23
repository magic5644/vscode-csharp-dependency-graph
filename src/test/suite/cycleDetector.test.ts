import * as assert from 'assert';
import { Project } from '../../csprojParser';
import { ClassDependency } from '../../csharpClassParser';
import * as cycleDetector from '../../cycleDetector';
import { CycleAnalysisResult, Cycle } from '../../cycleDetector';

suite('Cycle Detector Test Suite', () => {
  test('detectProjectCycles should identify simple direct cycles', () => {
    const projects: Project[] = [
      { name: 'ProjectA', path: 'pathA', dependencies: ['ProjectB'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'ProjectB', path: 'pathB', dependencies: ['ProjectA'], packageDependencies: [], targetFramework: 'net6.0' }
    ];
    
    const result = cycleDetector.detectProjectCycles(projects);
    
    assert.strictEqual(result.cycles.length, 1, 'Should detect one cycle');
    // In the implementation, cycles include the first node at the end (for a complete cycle)
    assert.strictEqual(result.cycles[0].nodes.length, 3, 'Cycle should contain three nodes (including repeated first node)');
    assert.strictEqual(result.cycles[0].type, 'project', 'Cycle type should be project');
    assert.deepStrictEqual(result.cycles[0].nodes.slice(0, 2), ['ProjectA', 'ProjectB'], 'Cycle nodes should match');
    assert.strictEqual(result.cycles[0].nodes[2], 'ProjectA', 'First node should repeat at the end of cycle');
  });

  test('detectProjectCycles should identify complex cycles with multiple nodes', () => {
    const projects: Project[] = [
      { name: 'ProjectA', path: 'pathA', dependencies: ['ProjectB'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'ProjectB', path: 'pathB', dependencies: ['ProjectC'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'ProjectC', path: 'pathC', dependencies: ['ProjectD'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'ProjectD', path: 'pathD', dependencies: ['ProjectA'], packageDependencies: [], targetFramework: 'net6.0' }
    ];
    
    const result = cycleDetector.detectProjectCycles(projects);
    
    assert.strictEqual(result.cycles.length, 1, 'Should detect one cycle');
    assert.strictEqual(result.cycles[0].complexity, 5, 'Cycle complexity should be 5 (4 nodes + repeated first node)');
    // Cycle is presented as [A, B, C, D, A] so we check the first 4 nodes
    assert.deepStrictEqual(result.cycles[0].nodes.slice(0, 4), ['ProjectA', 'ProjectB', 'ProjectC', 'ProjectD'], 
      'Cycle nodes should match');
    assert.strictEqual(result.cycles[0].nodes[4], 'ProjectA', 'First node should repeat at the end of cycle');
  });

  test('detectProjectCycles should identify multiple cycles', () => {
    const projects: Project[] = [
      { name: 'ProjectA', path: 'pathA', dependencies: ['ProjectB'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'ProjectB', path: 'pathB', dependencies: ['ProjectA'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'ProjectC', path: 'pathC', dependencies: ['ProjectD'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'ProjectD', path: 'pathD', dependencies: ['ProjectC'], packageDependencies: [], targetFramework: 'net6.0' }
    ];
    
    const result = cycleDetector.detectProjectCycles(projects);
    
    assert.strictEqual(result.cycles.length, 2, 'Should detect two cycles');
    
    // Sort cycles by node names to ensure consistent ordering for test
    const sortedCycles = [...result.cycles].sort((a, b) => 
      a.nodes[0].localeCompare(b.nodes[0]));
    
    // Check first cycle [A, B, A]
    assert.deepStrictEqual(sortedCycles[0].nodes.slice(0, 2), ['ProjectA', 'ProjectB'], 
      'First cycle nodes should match');
    assert.strictEqual(sortedCycles[0].nodes[2], 'ProjectA', 
      'First node should repeat at the end of first cycle');
      
    // Check second cycle [C, D, C]
    assert.deepStrictEqual(sortedCycles[1].nodes.slice(0, 2), ['ProjectC', 'ProjectD'], 
      'Second cycle nodes should match');
    assert.strictEqual(sortedCycles[1].nodes[2], 'ProjectC', 
      'First node should repeat at the end of second cycle');
  });

  test('detectProjectCycles should return empty result when no cycles exist', () => {
    const projects: Project[] = [
      { name: 'ProjectA', path: 'pathA', dependencies: ['ProjectB'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'ProjectB', path: 'pathB', dependencies: ['ProjectC'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'ProjectC', path: 'pathC', dependencies: [], packageDependencies: [], targetFramework: 'net6.0' }
    ];
    
    const result = cycleDetector.detectProjectCycles(projects);
    
    assert.strictEqual(result.cycles.length, 0, 'Should not detect any cycles');
    assert.strictEqual(result.hotspots.length, 0, 'Should not detect any hotspots');
    assert.strictEqual(result.breakPoints.length, 0, 'Should not detect any break points');
  });

  test('detectClassCycles should identify simple direct cycles', () => {
    const classDependencies: ClassDependency[] = [
      { 
        projectName: 'ProjectA',
        className: 'ClassA',
        namespace: 'NamespaceA',
        dependencies: [{ className: 'ClassB', namespace: 'NamespaceB', projectName: 'ProjectA' }],
        filePath: 'pathA/ClassA.cs'
      },
      { 
        projectName: 'ProjectA',
        className: 'ClassB',
        namespace: 'NamespaceB',
        dependencies: [{ className: 'ClassA', namespace: 'NamespaceA', projectName: 'ProjectA' }],
        filePath: 'pathA/ClassB.cs'
      }
    ];
    
    const result = cycleDetector.detectClassCycles(classDependencies);
    
    assert.strictEqual(result.cycles.length, 1, 'Should detect one cycle');
    assert.strictEqual(result.cycles[0].nodes.length, 3, 'Cycle should contain three nodes (including repeated first node)');
    assert.strictEqual(result.cycles[0].type, 'class', 'Cycle type should be class');
    assert.deepStrictEqual(result.cycles[0].nodes.slice(0, 2), ['ProjectA.ClassA', 'ProjectA.ClassB'], 
      'Cycle nodes should match');
    assert.strictEqual(result.cycles[0].nodes[2], 'ProjectA.ClassA',
      'First node should repeat at the end of cycle');
  });

  test('detectClassCycles should identify cross-project cycles', () => {
    const classDependencies: ClassDependency[] = [
      { 
        projectName: 'ProjectA',
        className: 'ClassA',
        namespace: 'NamespaceA',
        dependencies: [{ className: 'ClassB', namespace: 'NamespaceB', projectName: 'ProjectB' }],
        filePath: 'pathA/ClassA.cs'
      },
      { 
        projectName: 'ProjectB',
        className: 'ClassB',
        namespace: 'NamespaceB',
        dependencies: [{ className: 'ClassA', namespace: 'NamespaceA', projectName: 'ProjectA' }],
        filePath: 'pathB/ClassB.cs'
      }
    ];
    
    const result = cycleDetector.detectClassCycles(classDependencies);
    
    assert.strictEqual(result.cycles.length, 1, 'Should detect one cycle');
    assert.deepStrictEqual(result.cycles[0].nodes.slice(0, 2), ['ProjectA.ClassA', 'ProjectB.ClassB'], 
      'Cycle nodes should match and include project names');
    assert.strictEqual(result.cycles[0].nodes[2], 'ProjectA.ClassA',
      'First node should repeat at the end of cycle');
  });

  test('generateDotWithHighlightedCycles should mark edges in cycles', () => {
    const dotContent = `digraph Dependencies {
  node [shape=box, style="filled", fillcolor="lightblue"];
  edge [fontname="Helvetica", fontsize=10];
  "ProjectA" -> "ProjectB";
  "ProjectB" -> "ProjectC";
  "ProjectC" -> "ProjectA";
  "ProjectD" -> "ProjectE";
}`;

    const cycles: Cycle[] = [
      {
        nodes: ['ProjectA', 'ProjectB', 'ProjectC', 'ProjectA'],
        type: 'project',
        complexity: 3
      }
    ];

    const result = cycleDetector.generateDotWithHighlightedCycles(dotContent, cycles);
    
    // Just verify the output has changed from the input
    assert.notStrictEqual(result, dotContent, 'Output should be modified compared to input');
    
    // Verify one of the cycle edges is in the result with edge line formatting
    assert.strictEqual(
      result.includes('"ProjectA" -> "ProjectB"') && 
      result.includes('"ProjectB" -> "ProjectC"') && 
      result.includes('"ProjectC" -> "ProjectA"'),
      true,
      'Result should contain all cycle edges'
    );
    
    // Check that non-cycle edges remain unchanged
    assert.strictEqual(result.includes('"ProjectD" -> "ProjectE";'), true, 
      'Edge ProjectD -> ProjectE should not be highlighted');
  });

  test('generateDotWithHighlightedCycles should not modify dot content when no cycles exist', () => {
    const dotContent = `digraph Dependencies {
  node [shape=box];
  "ProjectA" -> "ProjectB";
  "ProjectB" -> "ProjectC";
}`;

    const result = cycleDetector.generateDotWithHighlightedCycles(dotContent, []);
    
    assert.strictEqual(result, dotContent, 'Dot content should remain unchanged when no cycles exist');
  });

  test('generateCyclesOnlyGraph should create graph showing only cycles', () => {
    const cycles: Cycle[] = [
      {
        nodes: ['ProjectA', 'ProjectB', 'ProjectC', 'ProjectA'],
        type: 'project',
        complexity: 3
      },
      {
        nodes: ['ProjectD', 'ProjectE', 'ProjectD'],
        type: 'project',
        complexity: 2
      }
    ];
    
    const result = cycleDetector.generateCyclesOnlyGraph(cycles);
    
    // Check that the graph includes all cycles in separate subgraphs
    assert.strictEqual(result.includes('subgraph cluster_cycle_0'), true, 
      'Should include subgraph for first cycle');
    assert.strictEqual(result.includes('subgraph cluster_cycle_1'), true, 
      'Should include subgraph for second cycle');
    
    // Check that nodes and edges from cycles are included
    for (const cycle of cycles) {
      for (const node of cycle.nodes) {
        assert.strictEqual(result.includes(`"${node}"`), true, 
          `Node ${node} should be included in the graph`);
      }
    }
  });

  test('generateCyclesOnlyGraph should create a simple message when no cycles exist', () => {
    const result = cycleDetector.generateCyclesOnlyGraph([]);
    
    assert.strictEqual(result.includes('No cycles detected'), true, 
      'Should include "No cycles detected" message');
  });

  test('generateCycleReport should create detailed markdown report', () => {
    const cycleResult: CycleAnalysisResult = {
      cycles: [
        {
          nodes: ['ProjectA', 'ProjectB', 'ProjectC', 'ProjectA'],
          type: 'project',
          complexity: 3
        },
        {
          nodes: ['ProjectD', 'ProjectE', 'ProjectD'],
          type: 'project',
          complexity: 2
        }
      ],
      hotspots: [
        { node: 'ProjectA', cycleCount: 1 },
        { node: 'ProjectB', cycleCount: 1 }
      ],
      breakPoints: [
        { node: 'ProjectA', impact: 1 },
        { node: 'ProjectB', impact: 1 }
      ]
    };
    
    const report = cycleDetector.generateCycleReport(cycleResult);
    
    // Check that the report includes all required sections
    assert.strictEqual(report.includes('# Dependency Cycle Analysis'), true, 
      'Report should have a title');
    assert.strictEqual(report.includes('## Summary'), true, 
      'Report should include a summary section');
    assert.strictEqual(report.includes('## Cycles'), true, 
      'Report should include a cycles section');
    assert.strictEqual(report.includes('## Hotspots'), true, 
      'Report should include a hotspots section');
    assert.strictEqual(report.includes('## Suggested Break Points'), true, 
      'Report should include a break points section');
    
    // Check that cycle details are included
    assert.strictEqual(report.includes('ProjectA → ProjectB → ProjectC → ProjectA'), true, 
      'Report should include first cycle details');
    assert.strictEqual(report.includes('ProjectD → ProjectE → ProjectD'), true, 
      'Report should include second cycle details');
  });

  test('generateCycleReport should create a simple message when no cycles exist', () => {
    const cycleResult: CycleAnalysisResult = {
      cycles: [],
      hotspots: [],
      breakPoints: []
    };
    
    const report = cycleDetector.generateCycleReport(cycleResult);
    
    assert.strictEqual(report.includes('No dependency cycles detected'), true, 
      'Report should indicate no cycles were detected');
    assert.strictEqual(report.includes('Congratulations'), true, 
      'Report should include congratulatory message');
  });
});