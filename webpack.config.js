//@ts-check

'use strict';

const path = require('path');  // Use require instead of import

/**@type {import('webpack').Configuration}*/
const config = {
  target: 'node', // VS Code extensions run in a Node.js-context
  
  entry: './src/extension.ts', // the entry point of this extension
  
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  
  devtool: 'source-map',
  
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded
  },
  
  resolve: {
    extensions: ['.ts', '.js'],
    mainFields: ['main', 'module']
  },
  
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                "module": "CommonJS", // Override TS config to ensure proper bundling
              }
            }
          }
        ]
      }
    ]
  },
  
  mode: 'production', // Explicitly set the mode to avoid warnings
  
  stats: {
    warnings: false // Use this instead of warningsFilter which is deprecated
  }
};

module.exports = config;
