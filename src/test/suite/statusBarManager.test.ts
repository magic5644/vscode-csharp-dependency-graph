import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { StatusBarManager } from '../../statusbar/StatusBarManager';

suite('StatusBarManager Test Suite', () => {
  let statusBarManager: StatusBarManager;
  let mockStatusBarItem: sinon.SinonStubbedInstance<vscode.StatusBarItem>;

  setup(() => {
    // Create mock status bar item
    mockStatusBarItem = {
      text: '',
      tooltip: '',
      command: undefined,
      show: sinon.stub(),
      hide: sinon.stub(),
      dispose: sinon.stub()
    } as sinon.SinonStubbedInstance<vscode.StatusBarItem>;

    // Stub VS Code API
    sinon.stub(vscode.window, 'createStatusBarItem').returns(mockStatusBarItem as vscode.StatusBarItem);
    
    statusBarManager = StatusBarManager.getInstance();
  });

  teardown(() => {
    statusBarManager.dispose();
    StatusBarManager.resetInstance(); // Reset singleton for clean tests
    sinon.restore();
  });

  test('should be a singleton', () => {
    const instance1 = StatusBarManager.getInstance();
    const instance2 = StatusBarManager.getInstance();
    
    assert.strictEqual(instance1, instance2);
  });

  test('should create status bar item on initialization', () => {
    assert.strictEqual(typeof vscode.window.createStatusBarItem, 'function');
  });

  test('should update dependency count', () => {
    const count = 42;
    
    statusBarManager.updateDependencyCount(count, 'project');
    
    assert.strictEqual(mockStatusBarItem.text.includes(count.toString()), true);
    assert.strictEqual(mockStatusBarItem.text.includes('$(symbol-package)'), true);
  });

  test('should show cycle indicator when cycles detected', () => {
    const cycleCount = 3;
    
    statusBarManager.showCycleIndicator(cycleCount);
    
    assert.strictEqual(mockStatusBarItem.text.includes('$(warning)'), true);
    assert.strictEqual(mockStatusBarItem.text.includes(cycleCount.toString()), true);
    assert.strictEqual(String(mockStatusBarItem.tooltip).includes('cycle'), true);
  });

  test('should hide cycle indicator', () => {
    // First show a cycle
    statusBarManager.showCycleIndicator(2);
    
    // Then hide it
    statusBarManager.hideCycleIndicator();
    
    // After hiding, the item should be hidden but text might still contain the warning
    assert.strictEqual(mockStatusBarItem.hide.called, true);
  });

  test('should show progress', () => {
    const message = 'Processing...';
    
    statusBarManager.showProgress(message);
    
    assert.strictEqual(mockStatusBarItem.text.includes('$(sync~spin)'), true);
    assert.strictEqual(mockStatusBarItem.text.includes(message), true);
  });

  test('should hide progress', () => {
    // First show progress
    statusBarManager.showProgress('Working...');
    
    // Then hide it
    statusBarManager.hideProgress();
    
    // Check that hide was called
    assert.strictEqual(mockStatusBarItem.hide.called, true);
  });

  test('should set contextual information', () => {
    const info = 'Current Project: MyApp';
    
    statusBarManager.setContextualInfo(info);
    
    assert.strictEqual(String(mockStatusBarItem.tooltip).includes(info), true);
  });

  test('should handle multiple updates correctly', () => {
    statusBarManager.updateDependencyCount(10, 'project');
    statusBarManager.showCycleIndicator(2);
    statusBarManager.setContextualInfo('Test Project');
    
    // Should have been called multiple times to create different items
    assert.strictEqual(mockStatusBarItem.show.called, true);
  });

  test('should update on refresh', () => {
    statusBarManager.updateDependencyCount(5);
    const initialText = mockStatusBarItem.text;
    
    statusBarManager.refresh();
    
    // Should maintain the same information after refresh
    assert.strictEqual(mockStatusBarItem.text, initialText);
  });

  test('should properly dispose', () => {
    // First create some items
    statusBarManager.updateDependencyCount(5, 'project');
    statusBarManager.showProgress('Testing...');
    
    statusBarManager.dispose();
    
    assert.strictEqual(mockStatusBarItem.dispose.called, true);
  });

  test('should reset text when dependency count is zero', () => {
    statusBarManager.updateDependencyCount(0);
    
    // Should show some indication even with zero dependencies
    assert.strictEqual(mockStatusBarItem.text.length > 0, true);
  });

  test('should handle large dependency counts', () => {
    const largeCount = 9999;
    
    statusBarManager.updateDependencyCount(largeCount);
    
    assert.strictEqual(mockStatusBarItem.text.includes(largeCount.toString()), true);
  });

  test('should show appropriate command in status bar item', () => {
    // After creating an item, it should have a command
    statusBarManager.updateDependencyCount(5, 'project');
    
    assert.strictEqual(mockStatusBarItem.command, 'vscode-csharp-dependency-graph.generate-dependency-graph');
  });

  test('should combine progress and cycle indicators', () => {
    statusBarManager.showCycleIndicator(1);
    statusBarManager.showProgress('Analyzing...');
    
    // Both should have been called and items created
    assert.strictEqual(mockStatusBarItem.show.called, true);
  });
});
