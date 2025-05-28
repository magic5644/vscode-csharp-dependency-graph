import * as vscode from 'vscode';

export type NotificationType = 'info' | 'warning' | 'error' | 'progress';
export type NotificationPriority = 'low' | 'normal' | 'high';

export interface NotificationOptions {
    message: string;
    type: NotificationType;
    duration?: number;
    actions?: string[];
    modal?: boolean;
    detail?: string;
    priority?: NotificationPriority;
}

export interface ProgressNotificationOptions extends NotificationOptions {
    type: 'progress';
    cancellable?: boolean;
    total?: number;
}

export class NotificationManager {
    private static instance: NotificationManager;
    private notificationQueue: NotificationOptions[] = [];
    private isProcessing = false;
    private readonly maxQueueSize = 10;
    private readonly cooldownPeriod = 1000; // 1 second between notifications
    private lastNotificationTime = 0;

    private constructor() {}

    public static getInstance(): NotificationManager {
        if (!NotificationManager.instance) {
            NotificationManager.instance = new NotificationManager();
        }
        return NotificationManager.instance;
    }

    /**
     * Reset the singleton instance (for testing)
     */
    public static resetInstance(): void {
        if (NotificationManager.instance) {
            NotificationManager.instance.dispose();
            // @ts-expect-error - Reset for testing purposes
            NotificationManager.instance = undefined;
        }
    }

    /**
     * Show a notification with intelligent queuing and priority handling
     */
    public async showNotification(options: NotificationOptions): Promise<string | undefined> {
        // Prevent spam by limiting queue size
        if (this.notificationQueue.length >= this.maxQueueSize) {
            // Remove low priority notifications if queue is full
            this.notificationQueue = this.notificationQueue.filter(n => n.priority !== 'low');
        }

        // Insert based on priority
        this.insertByPriority(options);
        
        if (!this.isProcessing) {
            return this.processQueue();
        }
        
        return undefined;
    }

    /**
     * Show a quick info notification (non-intrusive)
     */
    public async showInfo(message: string, options?: { timeout?: number; actions?: Array<{ text: string; callback: () => void }> } | string): Promise<string | undefined> {
        const actions: string[] = [];
        let timeout: number | undefined;
        
        if (typeof options === 'string') {
            actions.push(options);
        } else if (options) {
            timeout = options.timeout;
            if (options.actions) {
                actions.push(...options.actions.map(a => a.text));
                // Note: callback handling would need additional implementation
            }
        }
        
        return this.showNotification({
            message,
            type: 'info',
            actions,
            duration: timeout,
            priority: 'normal'
        });
    }

    /**
     * Show a warning notification
     */
    public async showWarning(message: string, options?: { timeout?: number; actions?: Array<{ text: string; callback: () => void }> } | string): Promise<string | undefined> {
        const actions: string[] = [];
        let timeout: number | undefined;
        
        if (typeof options === 'string') {
            actions.push(options);
        } else if (options) {
            timeout = options.timeout;
            if (options.actions) {
                actions.push(...options.actions.map(a => a.text));
                // Note: callback handling would need additional implementation
            }
        }
        
        return this.showNotification({
            message,
            type: 'warning',
            actions,
            duration: timeout,
            priority: 'normal'
        });
    }

    /**
     * Show an error notification (high priority)
     */
    public async showError(message: string, options?: { detail?: string } | string, ...actions: string[]): Promise<string | undefined> {
        let detail: string | undefined;
        let finalActions = actions;
        
        if (typeof options === 'string') {
            finalActions = [options, ...actions];
        } else if (options) {
            detail = options.detail;
        }
        
        return this.showNotification({
            message,
            type: 'error',
            actions: finalActions,
            detail,
            priority: 'high'
        });
    }

    /**
     * Show a progress notification
     */
    public async showProgress(
        title: string, 
        task: (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => Promise<void>,
        options?: Partial<ProgressNotificationOptions>
    ): Promise<void> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: options?.cancellable || false
        }, task);
    }

    /**
     * Show a status bar message that automatically disappears
     */
    public showStatusBarMessage(message: string, duration: number = 3000): vscode.Disposable {
        return vscode.window.setStatusBarMessage(message, duration);
    }

    private insertByPriority(notification: NotificationOptions): void {
        const priority = notification.priority ?? 'normal';
        const priorityOrder = { 'high': 3, 'normal': 2, 'low': 1 };
        
        let insertIndex = this.notificationQueue.length;
        for (let i = 0; i < this.notificationQueue.length; i++) {
            const queuePriority = this.notificationQueue[i].priority ?? 'normal';
            if (priorityOrder[priority] > priorityOrder[queuePriority]) {
                insertIndex = i;
                break;
            }
        }
        
        this.notificationQueue.splice(insertIndex, 0, notification);
    }

    private async processQueue(): Promise<string | undefined> {
        this.isProcessing = true;
        let result: string | undefined;

        while (this.notificationQueue.length > 0) {
            const notification = this.notificationQueue.shift()!;
            
            // Respect cooldown period for non-critical notifications
            if (notification.priority !== 'high') {
                const timeSinceLastNotification = Date.now() - this.lastNotificationTime;
                if (timeSinceLastNotification < this.cooldownPeriod) {
                    await this.delay(this.cooldownPeriod - timeSinceLastNotification);
                }
            }
            
            result = await this.displayNotification(notification);
            this.lastNotificationTime = Date.now();
        }

        this.isProcessing = false;
        return result;
    }

    private async displayNotification(options: NotificationOptions): Promise<string | undefined> {
        const { message, type, actions, modal, detail } = options;

        switch (type) {
            case 'info':
                return modal 
                    ? vscode.window.showInformationMessage(message, { modal, detail }, ...(actions || []))
                    : vscode.window.showInformationMessage(message, ...(actions || []));

            case 'warning':
                return modal
                    ? vscode.window.showWarningMessage(message, { modal, detail }, ...(actions || []))
                    : vscode.window.showWarningMessage(message, ...(actions || []));

            case 'error':
                return modal
                    ? vscode.window.showErrorMessage(message, { modal, detail }, ...(actions || []))
                    : vscode.window.showErrorMessage(message, ...(actions || []));

            case 'progress':
                // Progress notifications are handled separately
                return undefined;

            default:
                return vscode.window.showInformationMessage(message, ...(actions || []));
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clear all pending notifications
     */
    public clearQueue(): void {
        this.notificationQueue = [];
    }

    /**
     * Get the current queue size
     */
    public getQueueSize(): number {
        return this.notificationQueue.length;
    }

    /**
     * Dispose and clean up resources
     */
    public dispose(): void {
        this.clearQueue();
        this.isProcessing = false;
    }
}
