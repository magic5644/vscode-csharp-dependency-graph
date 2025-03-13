import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { parseSolutionFile } from '../../slnParser';
import { findCsprojFiles } from '../../csprojFinder';

// You can use test suites to group tests
suite('Extension Test Suite', () => {
  // Wait for the extension to be activated
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', async function() {
    this.timeout(10000);
    console.log('Available extensions:', vscode.extensions.all.map(ext => ext.id));
    assert.ok(vscode.extensions.getExtension('magic5644.vscode-csharp-dependency-graph'));
  });

  test('Command should be registered', async function() {
    this.timeout(10000); 
    const commands = await vscode.commands.getCommands(true);
    // Log all commands to find the correct ID
    console.log('Available commands:', commands.filter(cmd => cmd.includes('dependency') || cmd.includes('graph')));
    // Check for the actual command ID used in extension.ts
    assert.ok(commands.includes('vscode-csharp-dependency-graph.generate-dependency-graph') || 
              commands.includes('magic5644.csharp-dependency-graph.generate') || 
              commands.includes('csharpDependencyGraph.generate') ||
              commands.includes('vscode-csharp-dependency-graph') ||
              commands.includes('extension.generateCSharpDependencyGraph'));
  });

  test('Solution file parser should integrate with csproj finder', async function() {
    this.timeout(10000);
    
    // Path to the test workspace
    const testWorkspace = path.resolve(__dirname, '../../../test-workspace');
    
    // Find the solution file directly
    const slnPath = path.join(testWorkspace, 'TestSolution.sln');
    const projectPathsFromSln = await parseSolutionFile(slnPath);
    
    assert.ok(projectPathsFromSln.length >= 2, 'Solution should have at least 2 projects');
    
    // Now use the findCsprojFiles with solution file support
    const projectPathsFromFinder = await findCsprojFiles(
      testWorkspace,
      false, // Don't exclude test projects
      ["*Test*", "*Tests*", "*TestProject*"],
      true // Use solution file
    );
    
    assert.ok(
      projectPathsFromFinder.length >= projectPathsFromSln.length,
      'Project finder with solution support should find at least the same number of projects'
    );

    // Make sure all solution projects are found by the finder
    for (const slnProject of projectPathsFromSln) {
      assert.ok(
        projectPathsFromFinder.some(p => path.normalize(p) === path.normalize(slnProject)),
        `Project ${slnProject} from solution should be found by project finder`
      );
    }
  });
  
  // // Basic test to check if the command can execute
  // test('Command execution should not throw an error', async function() {
  //   this.timeout(10000); // Increase timeout because the command can take time
    
  //   // Create a temporary file for the test
  //   const tmpDir = os.tmpdir();
  //   const outputPath = path.join(tmpDir, 'test-dependency-graph.dot');
    
  //   try {
  //     // The command may need a workspace opened with C# projects
  //     // This test may fail if there are no C# projects in the workspace
  //     await vscode.commands.executeCommand('vscode-csharp-dependency-graph.generate-dependency-graph');
      
  //     // Ideally, you should verify that the file was created
  //     // But since the save dialog opens, it's difficult to automate
  //   } catch (error) {
  //     // The command may fail if no workspace is open, which is normal in testing
  //     console.log('Command execution failed, but test continues:', error);
  //   }
  // });
});
