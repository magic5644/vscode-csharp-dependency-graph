//@ts-check
/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// Main extension configuration
/** @type {import('webpack').Configuration} */
const extensionConfig = {
  target: 'node',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode'
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
                module: 'CommonJS'
              }
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { 
          from: 'resources', 
          to: 'resources',
          globOptions: {
            ignore: ['**/.DS_Store']
          }
        },
        {
          from: 'resources/js',
          to: 'resources/js',
          force: true,
          globOptions: {
            ignore: ['**/.DS_Store']
          }
        }
      ]
    })
  ],
  mode: 'production',
  stats: {
    warnings: false
  },
  infrastructureLogging: {
    level: 'log'
  },
  optimization: {
    minimize: true
  }
};

// Webview scripts configuration
/** @type {import('webpack').Configuration} */
const webviewConfig = {
  target: 'web',
  entry: './src/webviewScripts/main.js',
  output: {
    path: path.resolve(__dirname, 'dist', 'webviewScripts'),
    filename: 'graphPreviewBundle.js',
    libraryTarget: 'window'
  },
  resolve: {
    extensions: ['.js'],
    mainFields: ['browser', 'module', 'main']
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/
      }
    ]
  },
  mode: 'production',
  optimization: {
    minimize: true
  }
};

// Modern webview configuration
/** @type {import('webpack').Configuration} */
const modernWebviewConfig = {
  target: 'web',
  entry: {
    'simple-graph': './src/webview/simple-graph.ts',
    'modern-graph': './src/webview/modern-graph.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist', 'webview'),
    filename: '[name].bundle.js',
    libraryTarget: 'window'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    mainFields: ['browser', 'module', 'main']
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
              configFile: path.resolve(__dirname, 'src/webview/tsconfig.webview.json')
            }
          }
        ]
      },
      {
        test: /\.js$/,
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/webview/modern-graph.css',
          to: 'modern-graph.css'
        }
      ]
    })
  ],
  mode: 'production',
  optimization: {
    minimize: true
  }
};

module.exports = [extensionConfig, webviewConfig, modernWebviewConfig];
