//@ts-check
'use strict';

const path = require('node:path');

/** @type {import('webpack').Configuration} */
const webviewConfig = {
  target: 'web',
  entry: './src/webviewScripts/main.js',
  output: {
    path: path.resolve(__dirname, 'dist', 'webviewScripts'),
    filename: 'graphPreviewBundle.js',
    libraryTarget: 'window',
    clean: false
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

module.exports = webviewConfig;
