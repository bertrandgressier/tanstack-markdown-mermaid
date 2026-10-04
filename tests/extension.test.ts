import { describe, expect, it } from 'vitest'
import { parseMarkdown, renderHtml } from '@tanstack/markdown'
import { extractMermaidTitle, mermaidExtension } from '../src/index.js'
import type { ComponentNode } from '@tanstack/markdown'

function findMermaidNodes(doc: unknown): ComponentNode[] {
  const nodes: ComponentNode[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const node = n as { type?: unknown; name?: unknown }
    if (node.type === 'component' && node.name === 'mermaid') {
      nodes.push(n as ComponentNode)
    }
    for (const key of Object.keys(n as Record<string, unknown>)) {
      const value = (n as Record<string, unknown>)[key]
      if (Array.isArray(value)) value.forEach(walk)
    }
  }
  walk(doc)
  return nodes
}

function findCodeNodes(doc: unknown): string[] {
  const values: string[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const node = n as { type?: unknown; value?: unknown }
    if (node.type === 'code' && typeof node.value === 'string') {
      values.push(node.value)
    }
    for (const key of Object.keys(n as Record<string, unknown>)) {
      const value = (n as Record<string, unknown>)[key]
      if (Array.isArray(value)) value.forEach(walk)
    }
  }
  walk(doc)
  return values
}

const SIMPLE = 'graph TD; A-->B'

describe('mermaidExtension — parsing', () => {
  it('captures a ```mermaid block as a component node carrying the raw source', () => {
    const doc = parseMarkdown(`Before.\n\n\`\`\`mermaid\n${SIMPLE}\n\`\`\`\n\nAfter.`, {
      extensions: [mermaidExtension()],
    })
    const nodes = findMermaidNodes(doc)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].tagName).toBe('MermaidDiagram')
    expect(nodes[0].properties?.source).toBe(SIMPLE)
    expect(nodes[0].children).toEqual([])
  })

  it('captures a ~~~mermaid block', () => {
    const doc = parseMarkdown(`~~~mermaid\n${SIMPLE}\n~~~`, {
      extensions: [mermaidExtension()],
    })
    expect(findMermaidNodes(doc)).toHaveLength(1)
    expect(findMermaidNodes(doc)[0].properties?.source).toBe(SIMPLE)
  })

  it('accepts long fences (4+ characters) and carriage returns', () => {
    const doc = parseMarkdown(`\`\`\`\`mermaid\r\n${SIMPLE}\r\n\`\`\`\``, {
      extensions: [mermaidExtension()],
    })
    expect(findMermaidNodes(doc)).toHaveLength(1)
    expect(findMermaidNodes(doc)[0].properties?.source).toBe(SIMPLE)
  })

  it('handles several mermaid blocks in the same document', () => {
    const md = [
      '```mermaid',
      'graph TD; A-->B',
      '```',
      'text',
      '~~~mermaid',
      'pie',
      '  "x" : 1',
      '~~~',
      '```mermaid',
      'sequenceDiagram',
      '  A->>B: hi',
      '```',
    ].join('\n')
    const doc = parseMarkdown(md, { extensions: [mermaidExtension()] })
    const nodes = findMermaidNodes(doc)
    expect(nodes).toHaveLength(3)
    expect(nodes[1].properties?.source).toBe('pie\n  "x" : 1')
    expect(nodes[2].properties?.source).toBe('sequenceDiagram\n  A->>B: hi')
  })

  it('captures a mermaid block indented inside a list item', () => {
    const md = ['- item\n  ```mermaid\n  graph TD\n    A-->B\n  ```\n- next'].join('\n')
    const doc = parseMarkdown(md, { extensions: [mermaidExtension()] })
    const nodes = findMermaidNodes(doc)
    expect(nodes).toHaveLength(1)
    // the content is dedented by the fence indentation
    expect(nodes[0].properties?.source).toBe('graph TD\n  A-->B')
  })

  it('leaves non-mermaid fences to the native code parser', () => {
    const md = '```js\nconst x = 1\n```\n\n```mermaidinfo\nnot mermaid\n```'
    const doc = parseMarkdown(md, { extensions: [mermaidExtension()] })
    expect(findMermaidNodes(doc)).toHaveLength(0)
    expect(findCodeNodes(doc)[0]).toContain('const x = 1')
  })

  it('ignores an info string containing mermaid without being mermaid', () => {
    const doc = parseMarkdown('```mermaidish\nfoo\n```', {
      extensions: [mermaidExtension()],
    })
    expect(findMermaidNodes(doc)).toHaveLength(0)
  })

  it('consumes an unclosed fence up to the end (streaming)', () => {
    const doc = parseMarkdown(`paragraph\n\n\`\`\`mermaid\n${SIMPLE}`, {
      extensions: [mermaidExtension()],
    })
    const nodes = findMermaidNodes(doc)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].properties?.source).toBe(SIMPLE)
  })

  it('flags an unclosed fence with complete="false", not a closed one', () => {
    const open = findMermaidNodes(
      parseMarkdown(`\`\`\`mermaid\n${SIMPLE}`, { extensions: [mermaidExtension()] }),
    )
    expect(open[0].properties?.complete).toBe('false')
    const closed = findMermaidNodes(
      parseMarkdown(`\`\`\`mermaid\n${SIMPLE}\n\`\`\``, { extensions: [mermaidExtension()] }),
    )
    expect(closed[0].properties?.complete).not.toBe('false')
  })

  it('serializes mermaidConfig into the properties', () => {
    const doc = parseMarkdown('```mermaid\nfoo\n```', {
      extensions: [mermaidExtension({ mermaidConfig: { fontFamily: 'X' } })],
    })
    expect(findMermaidNodes(doc)[0].properties?.mermaidConfig).toBe('{"fontFamily":"X"}')
  })

  it('propagates tagName, theme, lazy and fallbackMessage into the properties', () => {
    const doc = parseMarkdown('```mermaid\nfoo\n```', {
      extensions: [
        mermaidExtension({
          tagName: 'MyDiagram',
          theme: 'dark',
          lazy: false,
          fallbackMessage: 'No diagram',
        }),
      ],
    })
    expect(findMermaidNodes(doc)[0]).toMatchObject({
      tagName: 'MyDiagram',
      properties: { source: 'foo', theme: 'dark', lazy: 'false', fallbackMessage: 'No diagram' },
    })
  })
})

describe('mermaidExtension — renderHtml (string degradation)', () => {
  it('emits the escaped source in a pre.mermaid-source for the HTML renderer', () => {
    const html = renderHtml('```mermaid\ngraph TD; A-->B\n```', {
      extensions: [mermaidExtension()],
    })
    expect(html).toContain('<pre class="mermaid-source">')
    expect(html).toContain('graph TD; A--&gt;B')
    expect(html).not.toContain('<svg')
  })
})

describe('extractMermaidTitle', () => {
  it('extracts the title from frontmatter', () => {
    expect(extractMermaidTitle('---\ntitle: Krebs cycle\n---\ngraph TD; A-->B')).toBe('Krebs cycle')
  })

  it('extracts the accTitle directive', () => {
    expect(extractMermaidTitle('flowchart TD\naccTitle: Glycolytic pathway\nA-->B')).toBe(
      'Glycolytic pathway',
    )
  })

  it('strips surrounding quotes and ignores empty titles', () => {
    expect(extractMermaidTitle('---\ntitle: "Pupillary reflex"\n---\ngraph TD')).toBe(
      'Pupillary reflex',
    )
    expect(extractMermaidTitle('---\ntitle:\n---\ngraph TD')).toBeUndefined()
  })

  it('returns undefined when no title is present', () => {
    expect(extractMermaidTitle('graph TD; A-->B')).toBeUndefined()
  })
})
