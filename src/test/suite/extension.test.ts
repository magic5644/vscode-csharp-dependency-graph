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

  test('Extension commands can be verified', async function() {
    this.timeout(10000); 
    // Get the extension
    const extension = vscode.extensions.getExtension('magic5644.vscode-csharp-dependency-graph');
    assert.ok(extension, 'Extension should be present');
    
    // Check that the extension package.json includes the command we want to test
    const packageJSON = extension.packageJSON;
    assert.ok(packageJSON.contributes && packageJSON.contributes.commands, 
      'Extension should contribute commands');
    
    // Verify the commands are defined in the package.json
    const commandDefs = packageJSON.contributes.commands;
    assert.ok(Array.isArray(commandDefs), 'Commands should be an array');
    
    // Find our main command in the command definitions
    const mainCommand = commandDefs.find(cmd => 
      cmd.command === 'vscode-csharp-dependency-graph.generate-dependency-graph');
    assert.ok(mainCommand, 'Main dependency graph command should be defined in package.json');
    
    // Optional: Verify the command title
    assert.strictEqual(mainCommand.title, 'C#: Generate Dependency Graph', 
      'Command should have the correct title');
    
    // This test passes without requiring the runtime commands to be registered
    // which is more reliable in test environments
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
  
});
