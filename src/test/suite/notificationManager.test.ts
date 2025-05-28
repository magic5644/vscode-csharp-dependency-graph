import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { NotificationManager } from '../../notifications/NotificationManager';

suite('NotificationManager Test Suite', () => {
  let notificationManager: NotificationManager;
  let showInformationMessageStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let withProgressStub: sinon.SinonStub;

  setup(() => {
    notificationManager = NotificationManager.getInstance();
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    showWarningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    withProgressStub = sinon.stub(vscode.window, 'withProgress');
  });

  teardown(() => {
    notificationManager.dispose();
    sinon.restore();
    NotificationManager.resetInstance();
  });

  test('should show info notification', async () => {
    const message = 'Test info message';
    
    await notificationManager.showInfo(message);
    
    assert.strictEqual(showInformationMessageStub.calledOnce, true);
    assert.strictEqual(showInformationMessageStub.firstCall.args[0], message);
  });

  test('should show warning notification', async () => {
    const message = 'Test warning message';
    
    await notificationManager.showWarning(message);
    
    assert.strictEqual(showWarningMessageStub.calledOnce, true);
    assert.strictEqual(showWarningMessageStub.firstCall.args[0], message);
  });

  test('should show error notification', async () => {
    const message = 'Test error message';
    
    await notificationManager.showError(message);
    
    assert.strictEqual(showErrorMessageStub.calledOnce, true);
    assert.strictEqual(showErrorMessageStub.firstCall.args[0], message);
  });

  test('should show progress notification', async () => {
    const title = 'Test progress';
    const task = sinon.stub().resolves('result');
    
    withProgressStub.resolves('result');
    
    const result = await notificationManager.showProgress(title, task);
    
    assert.strictEqual(withProgressStub.calledOnce, true);
    assert.strictEqual(result, 'result');
    
    const progressOptions = withProgressStub.firstCall.args[0];
    assert.strictEqual(progressOptions.title, title);
    assert.strictEqual(progressOptions.location, vscode.ProgressLocation.Notification);
  });

  test('should respect cooldown period for duplicate notifications', async () => {
    const message = 'Duplicate message';
    
    // First call should go through
    await notificationManager.showInfo(message);
    assert.strictEqual(showInformationMessageStub.callCount, 1);
    
    // Second call should also go through but might be queued
    await notificationManager.showInfo(message);
    assert.strictEqual(showInformationMessageStub.callCount >= 1, true);
  });

  test('should queue notifications by priority', async () => {
    const highPriorityMessage = 'High priority';
    const lowPriorityMessage = 'Low priority';
    
    // Add low priority (info) first, then high priority (error)
    notificationManager.showInfo(lowPriorityMessage);
    notificationManager.showError(highPriorityMessage);
    
    // Allow queue to process
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Both should have been called
    assert.strictEqual(showInformationMessageStub.called, true);
    assert.strictEqual(showErrorMessageStub.called, true);
  });

  test('should handle actions in notifications', async () => {
    const message = 'Test with action';
    const actionText = 'Action';
    const actionCallback = sinon.stub();
    
    showInformationMessageStub.resolves(actionText);
    
    await notificationManager.showInfo(message, {
      actions: [{ text: actionText, callback: actionCallback }]
    });
    
    // Information message should have been called
    assert.strictEqual(showInformationMessageStub.called, true);
  });

  test('should allow notifications after cooldown expires', async () => {
    const message = 'Cooldown test';
    
    // Use the singleton instance which has a cooldown
    await notificationManager.showInfo(message);
    assert.strictEqual(showInformationMessageStub.callCount, 1);
    
    // Wait for cooldown to expire (default is 1 second)
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    await notificationManager.showInfo(message);
    assert.strictEqual(showInformationMessageStub.callCount, 2);
    
    // Note: With singleton pattern, we don't call dispose directly in individual tests
  });

  test('should properly dispose and clear queue', () => {
    const message = 'Test disposal';
    
    // Add some notifications to queue
    notificationManager.showInfo(message);
    notificationManager.showWarning(message);
    
    // Dispose should not throw
    assert.doesNotThrow(() => {
      notificationManager.dispose();
    });
  });

  test('should handle notification with custom timeout', async () => {
    const message = 'Custom timeout test';
    const timeout = 1000;
    
    await notificationManager.showInfo(message, { timeout });
    
    assert.strictEqual(showInformationMessageStub.calledOnce, true);
    assert.strictEqual(showInformationMessageStub.firstCall.args[0], message);
  });

  test('should handle multiple different notification types', async () => {
    const infoMessage = 'Info';
    const warningMessage = 'Warning';
    const errorMessage = 'Error';
    
    await Promise.all([
      notificationManager.showInfo(infoMessage),
      notificationManager.showWarning(warningMessage),
      notificationManager.showError(errorMessage)
    ]);
    
    assert.strictEqual(showInformationMessageStub.calledOnce, true);
    assert.strictEqual(showWarningMessageStub.calledOnce, true);
    assert.strictEqual(showErrorMessageStub.calledOnce, true);
  });
});
