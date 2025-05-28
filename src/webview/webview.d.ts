/**
 * Type declarations for VS Code webview environment
 */

declare global {
    const acquireVsCodeApi: () => {
        postMessage: (message: any) => void;
        getState: () => any;
        setState: (state: any) => void;
    };

    interface Window {
        addEventListener: (type: string, listener: (event: any) => void) => void;
    }

    interface Document {
        readyState: string;
        getElementById: (id: string) => any;
        addEventListener: (type: string, listener: (event: any) => void) => void;
    }

    const document: Document;
    const window: Window;
    const console: {
        log: (...args: any[]) => void;
    };
}

export {};
