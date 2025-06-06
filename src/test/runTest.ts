import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Use path.join with __dirname and go up three levels to reach the root folder
    // This is because __dirname will be something like <workspace>/out/src/test
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

    // The path to the test directory
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Path to a workspace containing C# projects for testing - from root folder
    const testWorkspace = path.resolve(extensionDevelopmentPath, 'test-workspace');

    // Download VS Code, unzip it and run the integration test
    await runTests({ 
      extensionDevelopmentPath, 
      extensionTestsPath,
      launchArgs: [testWorkspace, '--disable-gpu']
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
