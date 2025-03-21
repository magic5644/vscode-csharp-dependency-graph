import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Prepares d3-graphviz to be used in the WebView
 * @param extensionUri Extension URI
 * @returns true if initialization was successful
 */
export async function prepareVizJs(extensionUri: vscode.Uri): Promise<boolean> {
  try {
    // Creating resources/js directory if it doesn't exist
    const resourcesJsDir = path.join(extensionUri.fsPath, 'resources', 'js');
    console.log(`Checking resources directory: ${resourcesJsDir}`);
    
    if (!fs.existsSync(resourcesJsDir)) {
      console.log('Creating resources/js directory...');
      fs.mkdirSync(resourcesJsDir, { recursive: true });
    }

    // Copy required files from node_modules to resources/js - exclude the WASM file
    const filesToCopy = [
      {
        source: path.join(extensionUri.fsPath, 'node_modules', 'd3', 'dist', 'd3.min.js'),
        target: path.join(resourcesJsDir, 'd3.min.js')
      },
      {
        source: path.join(extensionUri.fsPath, 'node_modules', 'd3-graphviz', 'build', 'd3-graphviz.min.js'),
        target: path.join(resourcesJsDir, 'd3-graphviz.min.js')
      },
      {
        source: path.join(extensionUri.fsPath, 'node_modules', '@hpcc-js', 'wasm', 'dist', 'graphviz.umd.js'),
        target: path.join(resourcesJsDir, 'graphviz.umd.js')
      }
    ];
    
    for (const file of filesToCopy) {
      console.log(`Checking source path: ${file.source}`);
      
      if (!fs.existsSync(file.source)) {
        console.error(`Source file not found at: ${file.source}`);
        throw new Error(`The file ${path.basename(file.source)} was not found in node_modules. Please run 'npm install' to install dependencies.`);
      }
      
      // Copy the file
      console.log(`Copying ${path.basename(file.source)}...`);
      fs.copyFileSync(file.source, file.target);
      
      // Verify the file was copied successfully
      if (!fs.existsSync(file.target)) {
        console.error(`Failed to copy ${path.basename(file.source)}`);
        return false;
      }
    }
    
    console.log('All required files successfully copied to resources/js');
    return true;
  } catch (error) {
    console.error('Error while preparing d3-graphviz:', error);
    return false;
  }
}