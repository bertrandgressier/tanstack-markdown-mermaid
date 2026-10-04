/**
 * Theme applied to the mermaid rendering.
 *
 * - `'light'`: mermaid `default` theme.
 * - `'dark'`: mermaid `dark` theme.
 * - `'auto'`: follows `prefers-color-scheme` (re-renders on scheme change),
 *   falls back to `light` when the API is unavailable (SSR, old browsers).
 */
export type MermaidTheme = 'light' | 'dark' | 'auto'

/**
 * Options for the mermaid extension. Each option is propagated into the
 * `properties` of the produced `component` node, so that the mapped React
 * component (`components: { MermaidDiagram }`) receives them as default
 * values — still overridable in direct JSX usage.
 */
export interface MermaidOptions {
  /**
   * Tag name of the `component` node, to be mapped via the renderer's
   * `components` option. Default `'MermaidDiagram'`.
   */
  tagName?: string
  /**
   * Rendering theme. Default `'light'`.
   */
  theme?: MermaidTheme
  /**
   * On-demand rendering via IntersectionObserver. Default `true`.
   */
  lazy?: boolean
  /**
   * Short message displayed as a fallback when the diagram cannot be
   * rendered. Default `'Diagram not displayed — source preserved'`.
   */
  fallbackMessage?: string
  /**
   * Extra mermaid configuration passed to `mermaid.initialize`, merged OVER
   * the defaults (`{ startOnLoad: false, securityLevel: 'strict', theme }`).
   * Must be JSON-serializable: it travels in the node's `properties` as a
   * JSON string. `securityLevel` stays `'strict'` unless overridden here.
   */
  mermaidConfig?: Record<string, unknown>
}
