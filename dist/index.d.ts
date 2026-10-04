import type { MarkdownExtension } from '@tanstack/markdown';
import type { MermaidOptions, MermaidTheme } from './types.js';
/**
 * Extracts the accessible title from a mermaid source, in order:
 * 1. frontmatter `---\ntitle: X\n---`,
 * 2. directive `accTitle: X`.
 *
 * Returns `undefined` when no title is present — the caller then provides
 * its own aria label.
 */
export declare function extractMermaidTitle(source: string): string | undefined;
/**
 * Mermaid markdown extension for `@tanstack/markdown`.
 *
 * Captures closed ` ```mermaid ` and ` ~~~mermaid ` blocks (fence of 3+
 * characters, up to 3 spaces of indentation, nestable inside lists) and
 * emits a `component` node carrying the raw source in `properties.source`.
 *
 * The React renderer maps the tag (`MermaidDiagram` by default) to the
 * rendering component via `components: { MermaidDiagram }` — see the
 * `tanstack-markdown-mermaid/react` sub-path. The string HTML renderer's
 * `renderHtml` hook, which cannot execute mermaid, honestly emits the
 * source inside a `<pre class="mermaid-source">`.
 *
 * An unclosed fence is consumed up to the end of the document (streaming
 * compatibility): the partial content becomes a mermaid source flagged
 * with `properties.complete = 'false'`, so the component shows the source
 * quietly (no error state) for as long as it is invalid.
 */
export declare function mermaidExtension(opts?: MermaidOptions): MarkdownExtension;
export type { MermaidOptions, MermaidTheme };
