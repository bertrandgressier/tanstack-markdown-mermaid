import type { MermaidTheme } from './types.js';
export declare const DEFAULT_MERMAID_FALLBACK_MESSAGE = "Diagram not displayed \u2014 source preserved";
export interface MermaidDiagramProps {
    /**
     * Raw mermaid source carried by the `component` node
     * (`properties.source`). An empty or invalid source degrades gracefully:
     * never an empty panel, never an unbounded exception.
     */
    source?: string;
    /**
     * Accessible label (`aria-label`). Default: title extracted from the source
     * (frontmatter `title:` / `accTitle:` directive), otherwise `'Mermaid diagram'`.
     */
    title?: string;
    /**
     * Render theme: `'light'` | `'dark'` | `'auto'` (follows
     * `prefers-color-scheme`). Default `'light'`. Also accepts the string
     * forms `'true'`/`'false'` coming from the properties → props pass-through.
     */
    theme?: MermaidTheme | string;
    /**
     * On-demand rendering via IntersectionObserver. Default `true`. Tolerates
     * the string form (`'false'`) when the prop arrives from the node properties.
     */
    lazy?: boolean | string;
    /**
     * Short message displayed as fallback. Default `'Diagram not displayed — source preserved'`.
     */
    fallbackMessage?: string;
    /** Additional classes on the root container. */
    className?: string;
    /**
     * Minimum height applied as an inline style on the root container while
     * the diagram is pending (number = px, per React style semantics).
     * Reserves space for the lazy reveal to prevent layout shift (CLS);
     * removed once the diagram has rendered.
     */
    minHeight?: number | string;
    /**
     * Keep the raw source in the DOM as a screen-reader-only span
     * (default `true`). Set to `false` explicitly on pages that already
     * expose the source elsewhere, to avoid duplicating it for screen
     * readers.
     */
    srOnlySource?: boolean;
    /**
     * Optional callback invoked whenever a render fails (invalid source,
     * mermaid error, or dynamic import failure) — including renders
     * superseded by a newer source during streaming. When omitted, failures
     * are reported via `console.error('mermaid render failed', error)`.
     * Degradation behavior is identical either way.
     */
    onError?: (error: unknown) => void;
    /**
     * `false` / `'false'` marks the source as an unclosed (still streaming)
     * fence: while it cannot be rendered, the raw source is shown quietly —
     * no error state, no `onError`. Default `true`.
     */
    complete?: boolean | string;
    /**
     * Extra config for `mermaid.initialize`, merged over the defaults. Either
     * an object or its JSON string (as carried by the node properties).
     */
    mermaidConfig?: Record<string, unknown> | string;
}
/**
 * Mermaid rendering component for `mermaidExtension()`.
 *
 * - mermaid.js is loaded via **dynamic import only** (never static): zero
 *   bundle cost as long as no diagram is visible.
 * - `lazy` (default `true`): rendering starts only when the diagram enters
 *   the viewport (IntersectionObserver, 200 px margin; immediate render
 *   when the API is missing).
 * - Honest degradation: invalid source, render error or load failure →
 *   short message + raw source in a `<pre>`. No exception ever leaks into
 *   the React render.
 * - Streaming-friendly: the first render of a mount is immediate;
 *   subsequent re-renders (source/theme changes) are debounced (~150 ms)
 *   so chunked updates collapse into a single mermaid render, keeping the
 *   last good SVG visible meanwhile.
 * - Accessibility: `role="img"` container + `aria-label` (extracted title
 *   or prop), `aria-busy` while pending, fallback announced through a
 *   `role="status"` live region, source technically present as `sr-only`
 *   in every state (opt-out via `srOnlySource: false`).
 *
 * Map via the renderer:
 *
 * ```tsx
 * import { Markdown } from '@tanstack/markdown/react'
 * import { mermaidExtension } from 'tanstack-markdown-mermaid'
 * import { MermaidDiagram } from 'tanstack-markdown-mermaid/react'
 *
 * <Markdown
 *   extensions={[mermaidExtension()]}
 *   components={{ MermaidDiagram }}
 * >
 *   {'```mermaid\ngraph TD; A-->B\n```'}
 * </Markdown>
 * ```
 */
export declare const MermaidDiagram: import("react").MemoExoticComponent<({ source, title, theme, lazy, fallbackMessage, className, minHeight, srOnlySource, onError, complete, mermaidConfig, }: MermaidDiagramProps) => import("react").DetailedReactHTMLElement<{
    className: string;
    ref: import("react").RefObject<HTMLDivElement | null>;
    'data-mermaid-theme': "dark" | "light";
    'aria-busy': true | undefined;
    style: {
        minHeight: string | number;
    } | undefined;
}, HTMLDivElement>>;
export type { MermaidTheme };
