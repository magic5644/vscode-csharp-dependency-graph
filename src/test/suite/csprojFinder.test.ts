import * as assert from 'assert';
import * as path from 'path';
import { findCsprojFiles } from '../../csprojFinder';

suite('CSProj Finder Tests', () => {
  // Path to the test workspace folder with sample files
  // Go up four levels from __dirname: out/src/test/suite -> project root
  const testWorkspacePath = path.resolve(__dirname, '../../../../test-workspace');

  test('findCsprojFiles should find projects with and without solution file', async function() {
    this.timeout(15000);
    
    // Find projects using solution file
    const projectsWithSln = await findCsprojFiles(
      testWorkspacePath,
      false, // Don't exclude test projects
      ["*Test*", "*Tests*", "*TestProject*"],
      true // Use solution file
    );
    
    assert.ok(projectsWithSln.length >= 2, 'Should find at least two projects when using solution file');

    // Find projects without using solution file
    const projectsWithoutSln = await findCsprojFiles(
      testWorkspacePath,
      false, // Don't exclude test projects
      ["*Test*", "*Tests*", "*TestProject*"],
      false // Don't use solution file
    );
    
    assert.ok(projectsWithoutSln.length >= 2, 'Should find at least two projects when directory scanning');
    
    // Make sure all projects found without solution are also found with solution
    for (const project of projectsWithoutSln) {
      const projectName = path.basename(project);
      // We can have more projects in the directory scan than in the solution
      // But the core projects should be in both
      if (projectName === 'ProjectA.csproj' || projectName === 'ProjectB.csproj') {
        assert.ok(
          projectsWithSln.some(p => path.basename(p) === projectName),
          `Core project ${projectName} should be found with solution scanning`
        );
      }
    }
  });

  test('findCsprojFiles should exclude test projects when specified', async function() {
    this.timeout(10000);
    
    // Create a test project file pattern
    const testPatterns = ["ProjectB.csproj"]; // Treat ProjectB as a test project for this test
    
    // Find projects excluding "test projects"
    const projectsExcludingTests = await findCsprojFiles(
      testWorkspacePath,
      true, // Exclude test projects
      testPatterns,
      true // Use solution file
    );
    
    // Make sure ProjectB is excluded (treated as test project)
    assert.ok(
      !projectsExcludingTests.some(p => path.basename(p) === 'ProjectB.csproj'),
      'Test projects should be excluded'
    );
    
    // But ProjectA should be included
    assert.ok(
      projectsExcludingTests.some(p => path.basename(p) === 'ProjectA.csproj'),
      'Non-test projects should be included'
    );
  });
});
