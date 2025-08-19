/**
 * Type declarations for VS Code webview environment
 */

interface WebviewMessage {
    command: string;
    data?: unknown;
}

declare global {
    const acquireVsCodeApi: () => {
        postMessage: (message: WebviewMessage) => void;
        getState: () => unknown;
        setState: (state: unknown) => void;
    };

    interface Window {
        addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
        addEventListener(type: 'resize', listener: (event: Event) => void): void;
        addEventListener(type: string, listener: (event: Event) => void): void;
        modernGraphViewer?: ModernGraphViewer;
    }

    interface Document {
        readyState: string;
        getElementById: (id: string) => HTMLElement | null;
        addEventListener(type: 'DOMContentLoaded', listener: (event: Event) => void): void;
        addEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void;
        addEventListener(type: string, listener: (event: Event) => void): void;
        querySelector: (selector: string) => Element | null;
        querySelectorAll: (selector: string) => NodeListOf<Element>;
        createElementNS: (namespace: string, qualifiedName: string) => Element;
        documentElement: HTMLElement;
    }

    interface Element extends Node {
        setAttribute: (name: string, value: string) => void;
        getAttribute: (name: string) => string | null;
        appendChild: (child: Node) => Node;
        addEventListener(type: 'click', listener: (event: Event) => void): void;
        addEventListener(type: string, listener: (event: Event) => void): void;
        classList: DOMTokenList;
        innerHTML: string;
        textContent: string | null;
        style: CSSStyleDeclaration;
    }

    interface HTMLElement extends Element {
        focus: () => void;
        value?: string;
        target?: EventTarget | null;
        querySelector: (selector: string) => Element | null;
        querySelectorAll: (selector: string) => NodeListOf<Element>;
        addEventListener(type: 'input', listener: (event: Event) => void): void;
        addEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void;
        addEventListener(type: 'click', listener: (event: Event) => void): void;
        addEventListener(type: string, listener: (event: Event) => void): void;
    }

    interface HTMLInputElement extends HTMLElement {
        value: string;
    }

    interface DOMTokenList {
        add: (...tokens: string[]) => void;
        remove: (...tokens: string[]) => void;
        toggle: (token: string, force?: boolean) => boolean;
    }

    interface CSSStyleDeclaration {
        setProperty: (property: string, value: string, priority?: string) => void;
        transform: string;
    }

    interface Event {
        target: EventTarget | null;
        key?: string;
        ctrlKey?: boolean;
        shiftKey?: boolean;
        preventDefault?: () => void;
    }

    interface KeyboardEvent extends Event {
        key: string;
        ctrlKey: boolean;
        shiftKey: boolean;
        preventDefault: () => void;
    }

    interface MessageEvent extends Event {
        data: unknown;
    }

    interface EventTarget {
        value?: string;
    }

    interface Node {
    }

    interface NodeListOf<TNode extends Node> {
        forEach: (callback: (value: TNode, index: number) => void) => void;
    }

    interface ModernGraphViewer {
        // Interface definition for the ModernGraphViewer class
    }

    const document: Document;
    const window: Window;
    const console: {
        log: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
        error: (...args: unknown[]) => void;
    };
}

export {};
