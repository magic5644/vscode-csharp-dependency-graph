import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

import { findSolutionFiles, parseSolutionFile } from '../../slnParser';

suite('SLN Parser Tests', () => {
  // Path to the test workspace folder with sample files
  const testWorkspacePath = path.resolve(__dirname, '../../../test-workspace');

  test('findSolutionFiles should find solution files', async function() {
    this.timeout(10000);
    
    // Find all solution files in the test workspace
    const slnFiles = await findSolutionFiles(testWorkspacePath);
    
    // Verify we found at least the TestSolution.sln file
    assert.ok(slnFiles.length >= 1, 'Should find at least one solution file');
    assert.ok(
      slnFiles.some(file => file.endsWith('TestSolution.sln')),
      'Should find TestSolution.sln'
    );
  });

  test('parseSolutionFile should extract project references', async function() {
    this.timeout(10000);
    
    // Path to the test solution file
    const testSolutionPath = path.join(testWorkspacePath, 'TestSolution.sln');
    
    // Make sure the solution file exists
    assert.ok(fs.existsSync(testSolutionPath), 'Test solution file exists');
    
    // Parse the solution file
    const projectPaths = await parseSolutionFile(testSolutionPath);
    
    // Verify we found the expected project references
    assert.ok(projectPaths.length >= 2, 'Should find at least two projects');
    
    // Check for specific project files
    const projectNames = projectPaths.map(p => path.basename(p));
    assert.ok(
      projectNames.includes('ProjectA.csproj'), 
      'Should include ProjectA.csproj'
    );
    assert.ok(
      projectNames.includes('ProjectB.csproj'), 
      'Should include ProjectB.csproj'
    );
    
    // Check that paths are resolved correctly
    assert.ok(
      projectPaths.every(p => path.isAbsolute(p)),
      'All project paths should be absolute'
    );
    
    // Verify the paths exist
    assert.ok(
      projectPaths.every(p => fs.existsSync(p)),
      'All project paths should exist'
    );
  });
});
