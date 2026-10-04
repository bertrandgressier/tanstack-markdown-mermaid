/**
 * Internal mermaid initialization memo. Not exposed through the package
 * `exports` map — do not import from application code.
 */

/** Minimal structural type for the mermaid default export (mock-friendly). */
interface MermaidInitializer {
  initialize: (config: {
    startOnLoad: boolean
    securityLevel: 'strict'
    theme: 'default' | 'dark'
  }) => void
}

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
let lastAppliedTheme: 'light' | 'dark' | undefined

export function ensureMermaidInitialized(
  mermaid: MermaidInitializer,
  theme: 'light' | 'dark',
): void {
  if (lastAppliedTheme === theme) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'default',
  })
  lastAppliedTheme = theme
}

/** Test-only: reset the applied-theme memo between tests. */
export function __resetInitializedThemesForTests(): void {
  lastAppliedTheme = undefined
}
