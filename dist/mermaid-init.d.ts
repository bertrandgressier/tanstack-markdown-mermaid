/**
 * Internal mermaid initialization memo. Not exposed through the package
 * `exports` map — do not import from application code.
 */
/** Minimal structural type for the mermaid default export (mock-friendly). */
interface MermaidInitializer {
    initialize: (config: {
        startOnLoad: boolean;
        securityLevel: 'strict';
        theme: 'default' | 'dark';
    }) => void;
}
export declare function ensureMermaidInitialized(mermaid: MermaidInitializer, theme: 'light' | 'dark'): void;
/** Test-only: reset the applied-theme memo between tests. */
export declare function __resetInitializedThemesForTests(): void;
export {};
