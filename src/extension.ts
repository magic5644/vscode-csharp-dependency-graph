import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findCsprojFiles } from './csprojFinder';
import { parseCsprojFiles } from './csprojParser';
import { generateDotFile } from './graphGenerator';
import { findCSharpSourceFiles } from './csharpSourceFinder';
import { parseClassDependencies } from './csharpClassParser';
import { findSolutionFiles, parseSolutionFile } from './slnParser';
import { minimatch } from 'minimatch';
import { GraphPreviewProvider } from './graphPreview';
import { prepareVizJs } from './vizInitializer';

/**
 * Checks if a file path matches a given pattern
 */
function isPathMatchingPattern(filePath: string, pattern: string): boolean {
  const fileName = path.basename(filePath);
  return pattern.includes('/') ? 
    minimatch(filePath, pattern) : 
    minimatch(fileName, pattern);
}

/**
 * Checks if a file path matches any of the provided patterns
 */
function isPathMatchingAnyPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some(pattern => isPathMatchingPattern(filePath, pattern));
}

export async function activate(context: vscode.ExtensionContext) {
  // Prepare Viz.js for preview
  try {
    await prepareVizJs(context.extensionUri);
  } catch (error) {
    console.error('Error initializing Viz.js:', error);
    vscode.window.showWarningMessage('C# Dependency Graph: Error initializing visualization. Preview may not work correctly.');
  }

  const graphPreviewProvider = new GraphPreviewProvider(context.extensionUri);
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
        const includePackageDependencies = config.get<boolean>('includePackageDependenciesInProjectGraph', true);
        const excludeTestProjects = config.get<boolean>('excludeTestProjects', true);
        const testProjectPatterns = config.get<string[]>('testProjectPatterns', ["*Test*", "*Tests*", "*TestProject*"]);
        const useSolutionFile = config.get<boolean>('useSolutionFile', true);
        const classDependencyColor = config.get<string>('classDependencyColor', 'lightgray');
        const packageNodeColor = config.get<string>('packageDependencyColor', '#ffcccc');

        // Find solution files if enabled
        let slnFiles: string[] = [];
        if (useSolutionFile) {
          slnFiles = await findSolutionFiles(workspaceFolder.uri.fsPath);
        }

        // Ask user to choose a solution file if multiple are found
        let selectedSolutionFile: string | undefined;
        if (slnFiles.length > 1) {
          const slnOptions = slnFiles.map(file => ({
            label: path.basename(file),
            description: file,
            file: file
          }));
          
          const selection = await vscode.window.showQuickPick([
            { label: 'Scan for all .csproj files', description: 'Find all projects by scanning directories', file: '' },
            ...slnOptions
          ], {
            placeHolder: 'Select a solution file or scan for all projects'
          });
          
          if (!selection) {
            return; // User cancelled
          }
          
          selectedSolutionFile = selection.file || undefined;
        } else if (slnFiles.length === 1) {
          // If only one solution file is found, ask if the user wants to use it
          const useSlnFile = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: `Use solution file: ${path.basename(slnFiles[0])}?`
          });
          
          if (useSlnFile === 'Yes') {
            selectedSolutionFile = slnFiles[0];
          }
        }

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
            progress.report({ message: 'Finding project files...' });
            
            let csprojFiles: string[];
            if (selectedSolutionFile) {
              // If a solution file is selected, use that

              csprojFiles = await parseSolutionFile(selectedSolutionFile);
              
              // Filter out test projects if needed
              if (excludeTestProjects) {
                csprojFiles = csprojFiles.filter(filePath => 
                  !isPathMatchingAnyPattern(filePath, testProjectPatterns)
                );
              }
            } else {
              // Otherwise search for all .csproj files
              csprojFiles = await findCsprojFiles(
                workspaceFolder.uri.fsPath,
                excludeTestProjects,
                testProjectPatterns,
                false // Don't use solution file since we already checked
              );
            }
            
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
                  classDependencyColor,
                  includePackageDependencies,
                  packageNodeColor
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
                  classDependencyColor,
                  includePackageDependencies,
                  packageNodeColor
                });
              }
            } else {
              // Generate the DOT file with project dependencies only
              progress.report({ message: 'Generating .dot file with project dependencies...' });
              dotContent = generateDotFile(projects, {
                includeNetVersion,
                includeClassDependencies: false,
                classDependencyColor,
                includePackageDependencies,
                packageNodeColor
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
              'Open File', 'Preview'
            ).then(selection => {
              if (selection === 'Open File') {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
              }else if (selection === 'Preview') {
                const dotContent = fs.readFileSync(filePath, 'utf8');
                const title = path.basename(filePath);
                graphPreviewProvider.showPreview(dotContent, title);
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

  // Register command to preview Graphviz files
  context.subscriptions.push(
    vscode.commands.registerCommand('csharp-dependency-graph.previewGraphviz', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && (editor.document.languageId === 'dot' || 
                    editor.document.fileName.endsWith('.dot') || 
                    editor.document.fileName.endsWith('.gv'))) {
          const dotContent = editor.document.getText();
          const title = path.basename(editor.document.fileName);
          graphPreviewProvider.showPreview(dotContent, title);
      } else {
          vscode.window.showErrorMessage('No Graphviz file is currently open.');
      }
    })
  );

  // Automatically preview Graphviz files when they are opened (optional)
  const config = vscode.workspace.getConfiguration('csharpDependencyGraph');
  const openPreviewOnGraphvizFileOpen = config.get<boolean>('openPreviewOnGraphvizFileOpen', true);
  if (openPreviewOnGraphvizFileOpen) {
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === 'dot' || 
          document.fileName.endsWith('.dot') || 
          document.fileName.endsWith('.gv')) {
          const dotContent = document.getText();
          const title = path.basename(document.fileName);
          graphPreviewProvider.showPreview(dotContent, title);
      }
    });
  }
}

export function deactivate() {}
