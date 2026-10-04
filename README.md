# tanstack-markdown-mermaid

[Mermaid](https://mermaid.js.org) diagram rendering for [`@tanstack/markdown`](https://tanstack.com/markdown): captures fenced ` ```mermaid ` / ` ~~~mermaid ` blocks and renders them through an accessible, lazily-loaded React component that degrades honestly.

## Why this package

`@tanstack/markdown` has no native mermaid support. This package provides a `parseBlock` extension that emits a `component` node carrying the raw source, plus a React component (`MermaidDiagram`) that loads **mermaid.js via dynamic import only** — zero bundle cost until a diagram is actually visible.

Built for dense corpora (course pages, tutor responses) where an invalid diagram must **never** break the page: no empty panel, no unbounded exception.

## Installation

```bash
pnpm add tanstack-markdown-mermaid @tanstack/markdown mermaid react
# npm i @tanstack/markdown mermaid tanstack-markdown-mermaid
# yarn add tanstack-markdown-mermaid @tanstack/markdown mermaid react
```

- `@tanstack/markdown` is a peer dependency — install it yourself.
- `react` (>= 18) is an optional peer, only required for the `tanstack-markdown-mermaid/react` subpath.
- `mermaid` (`^12`) is a peer dependency — install it yourself. The host app shares its own mermaid copy and singleton; the package loads it dynamically (`import('mermaid')`).
- The package is ESM-only (no CommonJS entry).

### Git dependency (alternative)

`dist/` is committed to the repository, so the package can also be consumed as a git dependency with no build step:

```bash
pnpm add github:bertrandgressier/tanstack-markdown-mermaid
```

## Demo

A small Vite playground lives in [`demo/`](./demo):

```bash
cd demo
pnpm install
pnpm dev
```

> `pnpm build` in `demo/` also typechecks the library source, so keep the root dependencies installed (`pnpm install` at the repository root) when building the demo.

It renders an editable markdown document — a valid flowchart (with `accTitle:`), a sequence diagram, a pie chart, and one deliberately invalid block — through the real integration: `@tanstack/markdown/react` + `mermaidExtension` + `MermaidDiagram`, imported from the library source. Use it to try:

- **Light / Dark / Auto** theming (drives both the page and the diagrams),
- **streaming simulation** (chunked document reveals, debounced re-renders, no blank flash),
- the **honest fallback** for invalid diagrams and the `onError` counter.

## Quick start

### With the React component (`@tanstack/markdown/react`)

```tsx
import { Markdown } from '@tanstack/markdown/react'
import { mermaidExtension } from 'tanstack-markdown-mermaid'
import { MermaidDiagram } from 'tanstack-markdown-mermaid/react'

export function Page() {
  return (
    <Markdown
      extensions={[mermaidExtension()]}
      components={{ MermaidDiagram }}
    >
      {`Here is the pathway:

\`\`\`mermaid
graph TD; Glycolysis-->Pyruvate-->Krebs
\`\`\``}
    </Markdown>
  )
}
```

The extension emits a `component` node (tag `MermaidDiagram`, raw source in `properties.source`); the React renderer maps it through `components`. No `allowHtml` is needed for the diagram itself.

### With `parseMarkdown()`

```ts
import { parseMarkdown } from '@tanstack/markdown'
import { mermaidExtension } from 'tanstack-markdown-mermaid'

const doc = parseMarkdown('```mermaid\ngraph TD; A-->B\n```', {
  extensions: [mermaidExtension()],
})
// → a component node { name: 'mermaid', tagName: 'MermaidDiagram', properties: { source } }
```

### With the string HTML renderer (`renderHtml`)

The extension's `renderHtml` hook honestly emits the escaped source inside `<pre class="mermaid-source"><code>…</code></pre>` — a string renderer cannot execute mermaid, so the source is preserved as-is.

## API

```ts
import { mermaidExtension, extractMermaidTitle } from 'tanstack-markdown-mermaid'
import type { MermaidOptions, MermaidTheme } from 'tanstack-markdown-mermaid'
import { MermaidDiagram } from 'tanstack-markdown-mermaid/react'
```

### `mermaidExtension(opts?): MarkdownExtension`

Captures `mermaid` fences (3+ backticks or tildes, up to 3 spaces of indentation, info string `mermaid` or `mermaid …`), including fences nested inside list items (dedented). An unterminated fence is consumed to the end of the document — streaming-friendly: the partial content becomes a mermaid source flagged `properties.complete = 'false'`; while it is invalid, the component shows the raw source quietly (no error state, no `onError`).

### `MermaidOptions`

| Option            | Type          | Default                                         | Description                                                                                 |
| ----------------- | ------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `tagName`         | `string`      | `'MermaidDiagram'`                              | Tag of the `component` node, to map via `components`.                                       |
| `theme`           | `MermaidTheme`| `'light'`                                       | `'light'` → mermaid `default` theme, `'dark'` → `dark`, `'auto'` follows `prefers-color-scheme`. |
| `lazy`            | `boolean`     | `true`                                          | Render on demand via IntersectionObserver (200 px margin).                                  |
| `fallbackMessage` | `string`      | `'Diagram not displayed — source preserved'`    | Short message shown on fallback.                                                            |
| `mermaidConfig`   | `Record<string, unknown>` | —                                   | Extra config merged over the `mermaid.initialize` defaults (see below).                      |

Each option is propagated into the node's `properties` — the mapped component receives them as defaults (overridable in direct JSX usage).

#### `mermaidConfig`

Merged over the defaults `{ startOnLoad: false, securityLevel: 'strict', theme }` and passed to `mermaid.initialize`. `securityLevel` stays `'strict'` unless you override it. The value must be JSON-serializable (it travels in the node properties as a JSON string).

```ts
mermaidExtension({
  mermaidConfig: { fontFamily: 'Inter, sans-serif', themeVariables: { primaryColor: '#e0f2fe' } },
})
```

### `MermaidDiagram` (React)

| Prop              | Type                          | Default                                      | Description                                                                                                                        |
| ----------------- | ----------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `source`          | `string`                      | —                                            | Raw mermaid source (`properties.source`).                                                                                          |
| `title`           | `string`                      | title extracted from the source              | Explicit `aria-label`.                                                                                                             |
| `theme`           | `'light' \| 'dark' \| 'auto'` | `'light'`                                    | Render theme; `'auto'` respects an initially-dark system from the first render and re-renders on scheme change.                    |
| `lazy`            | `boolean`                     | `true`                                       | Render when entering the viewport.                                                                                                 |
| `fallbackMessage` | `string`                      | `'Diagram not displayed — source preserved'` | Fallback message.                                                                                                                  |
| `onError`         | `(error: unknown) => void`    | —                                            | Called when rendering fails (invalid source, render error, or mermaid load failure). When not provided, failures are logged via `console.error`. |
| `className`       | `string`                      | —                                            | Additional classes on the root container.                                                                                          |
| `minHeight`       | `number \| string`            | —                                            | Inline `min-height` on the root container while the diagram is pending (number = px, per React style semantics). Reserves space to prevent layout shift on lazy reveal; removed once rendered. |
| `complete`        | `boolean \| string`           | `true`                                       | `false`/`'false'` = unclosed streaming fence: failures are quiet and the raw source is shown in `<pre class="mermaid-pending-source">`. |
| `mermaidConfig`   | `object \| string`            | —                                            | Config merged over the `mermaid.initialize` defaults (object, or JSON string from node properties).                                |
| `srOnlySource`    | `boolean`                     | `true`                                       | Keep the raw source in the DOM as a screen-reader-only span. Set to `false` when the page already exposes the source elsewhere.     |

Rendering is flicker-free: when `source` or `theme` changes, the last rendered SVG stays visible until the new one is ready — no blank flash. Re-renders of an already-mounted diagram are debounced (~150 ms), so streaming chunk updates collapse into a single render (see [Streaming](#streaming)).

### `extractMermaidTitle(source): string | undefined`

Extracts the accessible title of a mermaid source: `title:` frontmatter first, then the `accTitle:` directive. Used by default for the `aria-label`.

## Upgrading to 0.3.0

- `mermaid` is now a peer dependency: run `npm i mermaid@^12` (or the pnpm/yarn equivalent) next to `tanstack-markdown-mermaid` and keep a single mermaid copy in your app.
- New `mermaidConfig` option to customise `mermaid.initialize`.
- Unclosed fences (streaming partials) now render their source quietly instead of raising an error state.

## Honest degradation

Invalid diagram, render error, or mermaid load failure — including a rejecting `import('mermaid')`:

- **never** an empty panel: a short message (`fallbackMessage`) is shown;
- **never** an unbounded exception: everything is caught inside the component;
- the **raw source is preserved** in a visible `<pre class="mermaid-fallback-source">`;
- orphan error nodes mermaid may have left in the DOM are cleaned up;
- failures are reported through the optional `onError` prop, or logged via `console.error` when it is not provided.

## Streaming

Partial content is expected while markdown streams in: an unterminated fence is consumed to the end of the document and flagged `complete = 'false'`. While such a partial diagram is invalid it shows its raw source quietly — no error message, no `onError`, no `console.error` — and renders as soon as it becomes valid. A closed fence that fails keeps the regular error path.

Re-renders of an already-mounted diagram are debounced (~150 ms): the first render of a mount is immediate, but subsequent `source` or `theme` changes collapse into a single mermaid render with the final settled source — chunk-by-chunk updates do not trigger a render per chunk. The last rendered SVG (or the pending placeholder) stays visible until the debounced render settles, and `onError` still fires for failures on this debounced path.

## Accessibility

- SVG container: `role="img"` + `aria-label` (`title` prop, else title extracted from the source, else `'Mermaid diagram'`).
- While a diagram is pending, the root carries `aria-busy="true"` (the attribute is removed once rendered), so assistive tech can hint at the upcoming content.
- The fallback message is a `role="status"` live region (implicit polite announcement): screen readers announce the failure without stealing focus.
- The source is **technically present in every state**: `<span class="mermaid-sr-only"><code>…</code></span>` (success, loading, lazy wait) or a visible `<pre>` (fallback).
- Opt out of the sr-only source span with `srOnlySource={false}` when the page already exposes the diagram source elsewhere (e.g. a collapsible source view): this avoids reading the source twice. On opt-out the source remains available in the visible error-fallback `<pre>`.
- The visually-hidden styles are applied inline on `.mermaid-sr-only`: no consumer CSS is required. The class is kept, so you can still override it from your stylesheet (use `!important` to beat the inline styles).

## Lazy rendering

`lazy` (default `true`): an `IntersectionObserver` (200 px margin) triggers mermaid loading and rendering when the container enters the viewport. Without the API (old browsers), rendering is immediate.

To prevent layout shift when the diagram is revealed, pass `minHeight` (px number or any CSS length): it is applied as an inline `min-height` on the root while the diagram is pending, then removed once rendered.

## Known limitations

- mermaid is a global singleton. `mermaid.initialize` is memoized per theme/config and no longer called on every render, but diagrams rendering simultaneously with different themes can still race on that singleton — the last `initialize` wins. Use a uniform theme per page when in doubt.
- Rendering is strictly client-side: during SSR the component renders the container + sr-only source, and the SVG appears on hydration (no hydration mismatch).
- `securityLevel: 'strict'` (mermaid default): HTML labels inside diagrams are escaped — intentional for untrusted content.

## License

MIT © 2026 Bertrand Gressier
