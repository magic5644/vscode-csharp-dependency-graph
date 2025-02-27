import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findCsprojFiles } from './csprojFinder';
import { parseCsprojFiles } from './csprojParser';
import { generateDotFile } from './graphGenerator';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'vscode-csharp-dependency-graph.generate-dependency-graph',
    async () => {
      try {
        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }

        // Ask the user for a file path to save the graph
        const defaultPath = path.join(workspaceFolder.uri.fsPath, 'dependency-graph.dot');
        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(defaultPath),
          filters: {
            'Dot files': ['dot'],
            'All files': ['*']
          },
          title: 'Save Dependency Graph'
        });

        if (!saveUri) {
          return; // User cancelled
        }

        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Generating dependency graph...',
            cancellable: false
          },
          async (progress) => {
            // Get configuration settings
            const config = vscode.workspace.getConfiguration('csharpDependencyGraph');
            const includeNetVersion = config.get<boolean>('includeNetVersion', true);
            const excludeTestProjects = config.get<boolean>('excludeTestProjects', true);
            const testProjectPatterns = config.get<string[]>('testProjectPatterns', ["*Test*", "*Tests*", "*TestProject*"]);

            // Find all .csproj files
            progress.report({ message: 'Finding .csproj files...' });
            const csprojFiles = await findCsprojFiles(
              workspaceFolder.uri.fsPath,
              excludeTestProjects,
              testProjectPatterns
            );
            
            if (csprojFiles.length === 0) {
              throw new Error('No .csproj files found in the workspace');
            }

            // Parse .csproj files to extract dependencies
            progress.report({ message: 'Parsing .csproj files...' });
            const projects = await parseCsprojFiles(csprojFiles);

            // Generate the DOT file
            progress.report({ message: 'Generating .dot file...' });
            const dotContent = generateDotFile(projects, includeNetVersion);

            // Write the file
            fs.writeFileSync(saveUri.fsPath, dotContent);

            return saveUri.fsPath;
          }
        ).then(
          (filePath) => {
            vscode.window.showInformationMessage(
              `Dependency graph saved to ${filePath}`,
              'Open File'
            ).then(selection => {
              if (selection === 'Open File') {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
              }
            });
          },
          (error) => {
            vscode.window.showErrorMessage(`Failed to generate dependency graph: ${error.message}`);
          }
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Error: ${errorMessage}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
