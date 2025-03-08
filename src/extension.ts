import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findCsprojFiles } from './csprojFinder';
import { parseCsprojFiles } from './csprojParser';
import { generateDotFile } from './graphGenerator';
import { findCSharpSourceFiles } from './csharpSourceFinder';
import { parseClassDependencies } from './csharpClassParser';

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

        // Get configuration settings
        const config = vscode.workspace.getConfiguration('csharpDependencyGraph');
        const includeNetVersion = config.get<boolean>('includeNetVersion', true);
        const excludeTestProjects = config.get<boolean>('excludeTestProjects', true);
        const testProjectPatterns = config.get<string[]>('testProjectPatterns', ["*Test*", "*Tests*", "*TestProject*"]);

        // Ask the user for the type of graph to generate
        const graphType = await vscode.window.showQuickPick(
          [
            { label: 'Project Dependencies', description: 'Generate graph with project-level dependencies' },
            { label: 'Class Dependencies', description: 'Generate detailed graph with class-level dependencies' }
          ],
          { placeHolder: 'Select the type of dependency graph to generate' }
        );

        
        if (!graphType) {
          return; // User cancelled
        }

        const generateClassGraph = graphType.label === 'Class Dependencies';
        let baseFilename = 'project-dependency-graph';
        if (generateClassGraph) {
          baseFilename = 'class-dependency-graph';
        } 

        // Ask the user for a file path to save the graph
        const defaultPath = path.join(workspaceFolder.uri.fsPath, `${baseFilename}.dot`);
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

            let dotContent: string;
            
            if (generateClassGraph) {
              try {
                // Get source file exclusion patterns
                const excludeSourcePatterns = config.get<string[]>(
                  'excludeSourcePatterns', 
                  ["**/obj/**", "**/bin/**", "**/Generated/**", "**/node_modules/**"]
                );
                
                // Find C# source files and parse class dependencies
                progress.report({ message: 'Finding C# source files...' });
                const projectSourceFiles = await findCSharpSourceFiles(csprojFiles, excludeSourcePatterns);
                
                // Verify that source files were found
                const totalSourceFiles = Array.from(projectSourceFiles.values())
                  .reduce((sum, files) => sum + files.length, 0);
                  
                if (totalSourceFiles === 0) {
                  throw new Error('No C# source files found in the projects');
                }
                
                progress.report({ message: `Analyzing class dependencies in ${totalSourceFiles} files...` });
                const classDependencies = await parseClassDependencies(projectSourceFiles);
                
                if (classDependencies.length === 0) {
                  throw new Error('No classes found in the source files');
                }
                
                // Generate the DOT file with class dependencies
                progress.report({ message: `Generating .dot file with ${classDependencies.length} classes...` });
                dotContent = generateDotFile(projects, {
                  includeNetVersion,
                  includeClassDependencies: true,
                  classDependencyColor: vscode.workspace.getConfiguration('csharpDependencyGraph').get('classDependencyColor') as string
                }, classDependencies);
                
                // Log for debugging
                console.log(`Generated graph with ${classDependencies.length} classes and their dependencies`);
              } catch (error) {
                console.error('Error during class analysis:', error);
                // Fallback to project-level graph if class analysis fails
                progress.report({ message: 'Class analysis failed, generating project-level graph instead...' });
                dotContent = generateDotFile(projects, {
                  includeNetVersion, 
                  includeClassDependencies: false,
                  classDependencyColor: vscode.workspace.getConfiguration('csharpDependencyGraph').get('classDependencyColor') as string
                });
              }
            } else {
              // Generate the DOT file with project dependencies only
              progress.report({ message: 'Generating .dot file with project dependencies...' });
              dotContent = generateDotFile(projects, {
                includeNetVersion,
                includeClassDependencies: false,
                classDependencyColor: vscode.workspace.getConfiguration('csharpDependencyGraph').get('classDependencyColor') as string
              });
            }

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
