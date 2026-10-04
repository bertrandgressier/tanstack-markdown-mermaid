/**
 * Internal mermaid initialization memo. Not exposed through the package
 * `exports` map — do not import from application code.
 */
/**
 * `mermaid.initialize` mutates a global singleton: calling it on every render
 * would repeatedly stomp any configuration the host app set for its own
 * mermaid usage (fonts, theme variables, security level, …). Only
 * re-initialize when the requested theme differs from the one last applied,
 * so flipping back to a previously used theme (light → dark → light) still
 * updates the global config.
 *
 * Mixing different themes across simultaneously rendering diagrams can still
 * race on the singleton — prefer a uniform theme per page when in doubt.
 */
let lastAppliedTheme;
export function ensureMermaidInitialized(mermaid, theme) {
    if (lastAppliedTheme === theme)
        return;
    mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: theme === 'dark' ? 'dark' : 'default',
    });
    lastAppliedTheme = theme;
}
/** Test-only: reset the applied-theme memo between tests. */
export function __resetInitializedThemesForTests() {
    lastAppliedTheme = undefined;
}
