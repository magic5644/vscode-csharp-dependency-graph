import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

// You can use test suites to group tests
suite('Extension Test Suite', () => {
  // Wait for the extension to be activated
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', async function() {
    this.timeout(10000); 
    assert.ok(vscode.extensions.getExtension('vscode-csharp-dependency-graph'));
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
