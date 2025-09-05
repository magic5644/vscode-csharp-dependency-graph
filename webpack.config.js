//@ts-check
'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

/**
 * Main extension configuration
 * Bundles the TypeScript extension code for Node.js environment
 */
/** @type {import('webpack').Configuration} */
const extensionConfig = {
  target: 'node',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
    clean: false // Don't clean - let each config manage its own output
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
                module: 'CommonJS',
                sourceMap: true
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
            ignore: ['**/.DS_Store', '**/Thumbs.db']
          },
          noErrorOnMissing: true
        },
        {
          from: 'resources/js',
          to: 'resources/js',
          force: true,
          globOptions: {
            ignore: ['**/.DS_Store', '**/Thumbs.db']
          },
          noErrorOnMissing: true
        }
      ]
    })
  ],
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  stats: {
    warnings: false
  },
  infrastructureLogging: {
    level: 'log'
  },
  optimization: {
    minimize: process.env.NODE_ENV !== 'development'
  }
};

/**
 * Webview scripts configuration for legacy support
 * Bundles TypeScript for webview consumption with proper TypeScript support
 */
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
    mainFields: ['browser', 'module', 'main'],
    fallback: {
      "path": false,
      "fs": false,
      "crypto": false,
      "vscode": false
    }
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
                module: 'ES2015',
                target: 'ES2015',
                sourceMap: true,
                lib: ['DOM', 'ES2015'],
                moduleResolution: 'node'
              }
            }
          }
        ]
      },
      {
        test: /\.js$/,
        exclude: /node_modules/
      }
    ]
  },
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  optimization: {
    minimize: process.env.NODE_ENV !== 'development'
  }
};

/**
 * Modern webview configuration
 * Bundles TypeScript webview components with CSS support
 */
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
    mainFields: ['browser', 'module', 'main'],
    fallback: {
      "path": false,
      "fs": false,
      "crypto": false,
      "vscode": false
    }
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
              configFile: path.resolve(__dirname, 'src/webview/tsconfig.webview.json'),
              compilerOptions: {
                module: 'ES2015',
                target: 'ES2015',
                sourceMap: true,
                lib: ['DOM', 'ES2015'],
                moduleResolution: 'node'
              }
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
          to: 'modern-graph.css',
          noErrorOnMissing: true
        }
      ]
    })
  ],
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  optimization: {
    minimize: process.env.NODE_ENV !== 'development'
  }
};

module.exports = [extensionConfig, webviewConfig, modernWebviewConfig];