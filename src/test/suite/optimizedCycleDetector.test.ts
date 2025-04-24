import * as assert from 'assert';
import { Project } from '../../csprojParser';
// Only importing what's actually used in the tests
import * as cycleDetector from '../../cycleDetector';

suite('Optimized Cycle Detector Test Suite', () => {
  // Test for memoization - calling twice should use cached result the second time
  test('findAllCycles should use memoization for the same graph structure', () => {
    const projects: Project[] = [
      { name: 'ProjectA', path: 'pathA', dependencies: ['ProjectB'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'ProjectB', path: 'pathB', dependencies: ['ProjectA'], packageDependencies: [], targetFramework: 'net6.0' }
    ];
    
    // First call should compute the result
    const result1 = cycleDetector.detectProjectCycles(projects);
    assert.strictEqual(result1.cycles.length, 1, 'Should detect one cycle');
    
    // Second call with the same structure should use memoized result
    // This is hard to test directly, but we can verify it produces the same result
    const result2 = cycleDetector.detectProjectCycles(projects);
    assert.strictEqual(result2.cycles.length, 1, 'Should detect one cycle');
    assert.deepStrictEqual(result2, result1, 'Results should be identical');
  });

  // Test the iterative DFS implementation with a large graph
  test('findAllCycles should handle large graphs without stack overflow', () => {
    // Create a large cyclic graph
    const projects: Project[] = [];
    const projectCount = 500; // Large enough to potentially cause stack overflow with recursive approach
    
    for (let i = 0; i < projectCount; i++) {
      projects.push({
        name: `Project${i}`,
        path: `path${i}`,
        dependencies: i < projectCount - 1 ? [`Project${i + 1}`] : ['Project0'],
        packageDependencies: [],
        targetFramework: 'net6.0'
      });
    }
    
    // This would cause stack overflow with recursive implementation
    const result = cycleDetector.detectProjectCycles(projects);
    
    // Verify that a cycle was detected
    assert.strictEqual(result.cycles.length, 1, 'Should detect one cycle in large graph');
    assert.strictEqual(result.cycles[0].complexity, projectCount + 1, 
      'Cycle should include all projects plus the repeated first node');
  });

  // Test handling of complex graphs with multiple paths and cycles
  test('findAllCycles should detect all unique cycles in complex graphs', () => {
    const projects: Project[] = [
      { name: 'A', path: 'pathA', dependencies: ['B', 'C'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'B', path: 'pathB', dependencies: ['D'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'C', path: 'pathC', dependencies: ['D', 'E'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'D', path: 'pathD', dependencies: ['F'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'E', path: 'pathE', dependencies: ['F', 'G'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'F', path: 'pathF', dependencies: ['A'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'G', path: 'pathG', dependencies: ['F'], packageDependencies: [], targetFramework: 'net6.0' }
    ];
    
    const result = cycleDetector.detectProjectCycles(projects);
    
    // This graph has multiple cycles with shared nodes
    assert.ok(result.cycles.length > 0, 'Should detect cycles');
    
    // Check if common cycle hotspots are identified
    const hotspotNodes = result.hotspots.map(h => h.node);
    assert.ok(hotspotNodes.includes('A') && hotspotNodes.includes('F'), 
      'A and F should be identified as hotspots');
  });

  // Test that the same cycle with different rotation is detected only once
  test('findAllCycles should detect rotated cycles only once', () => {
    const projects1: Project[] = [
      { name: 'A', path: 'pathA', dependencies: ['B'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'B', path: 'pathB', dependencies: ['C'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'C', path: 'pathC', dependencies: ['A'], packageDependencies: [], targetFramework: 'net6.0' }
    ];
    
    const projects2: Project[] = [
      { name: 'A', path: 'pathA', dependencies: ['C'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'B', path: 'pathB', dependencies: ['A'], packageDependencies: [], targetFramework: 'net6.0' },
      { name: 'C', path: 'pathC', dependencies: ['B'], packageDependencies: [], targetFramework: 'net6.0' }
    ];
    
    const result1 = cycleDetector.detectProjectCycles(projects1);
    const result2 = cycleDetector.detectProjectCycles(projects2);
    
    // Both cases have the same cycle (A -> B -> C -> A) but with different starting points
    assert.strictEqual(result1.cycles.length, 1, 'Should detect one cycle');
    assert.strictEqual(result2.cycles.length, 1, 'Should detect one cycle');
    
    // Compare the normalized cycles (sort nodes alphabetically)
    const sortedNodes1 = [...result1.cycles[0].nodes].sort((a, b) => a.localeCompare(b));
    const sortedNodes2 = [...result2.cycles[0].nodes].sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(sortedNodes1, sortedNodes2, 'Detected cycles should be the same after normalization');
  });
});