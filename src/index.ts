import type { BlockNode, ComponentNode, InlineNode, MarkdownExtension } from '@tanstack/markdown'
import type { MermaidOptions, MermaidTheme } from './types.js'

const MERMAID_COMPONENT_NAME = 'mermaid'
const DEFAULT_MERMAID_TAG_NAME = 'MermaidDiagram'

/**
 * Extracts the accessible title from a mermaid source, in order:
 * 1. frontmatter `---\ntitle: X\n---`,
 * 2. directive `accTitle: X`.
 *
 * Returns `undefined` when no title is present — the caller then provides
 * its own aria label.
 */
export function extractMermaidTitle(source: string): string | undefined {
  const normalized = source.replace(/\r\n/g, '\n')
  const frontmatter = normalized.match(/^---\n([\s\S]*?)\n---/)
  const scopes = frontmatter ? [frontmatter[1], normalized] : [normalized]
  for (const scope of scopes) {
    const match = scope.match(/^[ \t]*(?:title|accTitle)[ \t]*:[ \t]*(.+?)[ \t]*$/m)
    if (match) {
      const value = match[1].trim().replace(/^["']+|["']+$/g, '')
      if (value) return value
    }
  }
  return undefined
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Opens a fence: up to 3 spaces, 3+ backticks or tildes, info string. */
const FENCE_OPEN_RE = /^( {0,3})(`{3,}|~{3,})[ \t]*(.*)$/

/**
 * Strips at most `max` leading spaces (dedenting blocks nested inside
 * lists), like the native fence parser.
 */
function stripUpTo(line: string, max: number): string {
  let n = 0
  while (n < max && line[n] === ' ') n++
  return line.slice(n)
}

function isMermaidInfo(info: string): boolean {
  const token = info.trim().toLowerCase()
  return token === 'mermaid' || token.startsWith('mermaid ')
}

function isMermaidComponentNode(node: BlockNode | InlineNode): node is ComponentNode {
  return node.type === 'component' && node.name === MERMAID_COMPONENT_NAME
}

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
export function mermaidExtension(opts?: MermaidOptions): MarkdownExtension {
  const tagName = opts?.tagName ?? DEFAULT_MERMAID_TAG_NAME

  const emit = (source: string, complete: boolean): BlockNode => {
    const properties: Record<string, string> = { source }
    if (opts?.theme !== undefined) properties.theme = opts.theme
    if (opts?.lazy !== undefined) properties.lazy = String(opts.lazy)
    if (opts?.fallbackMessage !== undefined) {
      properties.fallbackMessage = opts.fallbackMessage
    }
    if (opts?.mermaidConfig !== undefined) {
      properties.mermaidConfig = JSON.stringify(opts.mermaidConfig)
    }
    // Only unclosed (streaming partial) fences are flagged; closed fences
    // carry no `complete` property.
    if (!complete) properties.complete = 'false'
    return {
      type: 'component',
      name: MERMAID_COMPONENT_NAME,
      attributes: {},
      tagName,
      properties,
      children: [],
    }
  }

  return {
    name: 'mermaid',
    parseBlock(context) {
      const line = context.lines[context.index] ?? ''
      const open = line.match(FENCE_OPEN_RE)
      if (!open || !isMermaidInfo(open[3])) return undefined

      const indent = open[1].length
      const fence = open[2]
      const fenceChar = fence[0]
      // CommonMark: the closing fence uses the same character, is at least
      // as long as the opening one, allows up to 3 spaces of indentation,
      // and nothing else on the line.
      const closeRe = new RegExp(`^ {0,3}${fenceChar}{${fence.length},}[ \t]*$`)

      let i = context.index + 1
      const content: string[] = []
      let closed = false
      while (i < context.lines.length) {
        const l = context.lines[i] ?? ''
        if (closeRe.test(l)) {
          i++
          closed = true
          break
        }
        content.push(stripUpTo(l, indent))
        i++
      }
      // Unclosed fence: consumed up to the end (streaming).
      context.consume(i - context.index)
      return emit(content.join('\n'), closed)
    },
    renderHtml(node) {
      if (!isMermaidComponentNode(node)) return undefined
      const source = node.properties?.source ?? ''
      return `<pre class="mermaid-source"><code>${escapeHtml(source)}</code></pre>`
    },
  }
}

export type { MermaidOptions, MermaidTheme }
