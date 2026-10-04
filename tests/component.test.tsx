// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'

const mermaidInitialize = vi.fn()
const mermaidRender = vi.fn()

vi.mock('mermaid', () => ({
  default: {
    initialize: mermaidInitialize,
    render: mermaidRender,
  },
}))

import { MermaidDiagram } from '../src/react.js'
import { __resetInitializedThemesForTests } from '../src/mermaid-init.js'

const SVG = '<svg viewBox="0 0 100 100"><circle r="40"/></svg>'
const SVG_ALT = '<svg viewBox="0 0 100 100"><rect width="10" height="10"/></svg>'
const SIMPLE = 'graph TD; A-->B'

// Must mirror RE_RENDER_DEBOUNCE_MS in src/react.tsx (module-private there).
const RE_RENDER_DEBOUNCE_MS = 150

/** Advances fake timers past the streaming debounce, inside act(). */
async function advanceDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(RE_RENDER_DEBOUNCE_MS)
  })
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  static reset() {
    MockIntersectionObserver.instances = []
  }
  private callback: IntersectionObserverCallback
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }
  simulateIntersecting() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetInitializedThemesForTests()
  MockIntersectionObserver.reset()
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

function diagram(props: Record<string, unknown> = {}) {
  return render(createElement(MermaidDiagram, { source: SIMPLE, lazy: false, ...props }))
}

describe('MermaidDiagram — nominal rendering', () => {
  it('renders the SVG via mermaid (dynamic import) with role="img"', async () => {
    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram()
    const svgBox = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('.mermaid-svg')
      expect(el).not.toBeNull()
      return el
    })
    expect(svgBox.getAttribute('role')).toBe('img')
    expect(svgBox.innerHTML).toContain('<svg')
    expect(mermaidInitialize).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false, securityLevel: 'strict', theme: 'default' }),
    )
    expect(mermaidRender).toHaveBeenCalledWith(expect.any(String), SIMPLE)
    expect(container.querySelector('.mermaid-fallback-message')).toBeNull()
  })

  it('keeps the source technically present (sr-only) in the success state', async () => {
    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram()
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
    expect(container.querySelector('.mermaid-sr-only code')?.textContent).toBe(SIMPLE)
  })
})

describe('MermaidDiagram — honest degradation', () => {
  it('shows a short message + raw source in a pre when mermaid throws', async () => {
    mermaidRender.mockRejectedValue(new Error('Parse error'))
    const { container } = diagram()
    await waitFor(() => {
      expect(container.querySelector('.mermaid-fallback-message')).not.toBeNull()
    })
    expect(container.querySelector('.mermaid-fallback-message')?.textContent).toBe(
      'Diagram not displayed — source preserved',
    )
    expect(container.querySelector('.mermaid-fallback-source')?.textContent).toBe(SIMPLE)
    expect(container.querySelector('.mermaid-svg')).toBeNull()
  })

  it('cleans up the orphan error node mermaid leaves in the DOM', async () => {
    mermaidRender.mockImplementation((_id: string) => {
      const orphan = document.createElement('div')
      orphan.id = `d${_id}`
      document.body.appendChild(orphan)
      return Promise.reject(new Error('boom'))
    })
    const { container } = diagram()
    await waitFor(() => {
      expect(container.querySelector('.mermaid-fallback-message')).not.toBeNull()
    })
    expect(document.querySelector('[id^="dmmd-"]')).toBeNull()
  })

  it('also degrades when the dynamic import of mermaid fails', async () => {
    mermaidRender.mockRejectedValue(new Error('network'))
    const { container } = diagram({ source: 'flowchart TD; A-->B' })
    await waitFor(() => {
      expect(container.querySelector('.mermaid-fallback-source')?.textContent).toBe(
        'flowchart TD; A-->B',
      )
    })
  })

  it('fallback message configurable via prop', async () => {
    mermaidRender.mockRejectedValue(new Error('x'))
    const { container } = diagram({ fallbackMessage: 'Diagram unavailable' })
    await waitFor(() => {
      expect(container.querySelector('.mermaid-fallback-message')?.textContent).toBe(
        'Diagram unavailable',
      )
    })
  })

  it('removes the orphan error node and keeps the last SVG when a render is superseded', async () => {
    const onError = vi.fn()
    let rejectSecond!: (error: Error) => void
    let resolveThird!: (value: { svg: string }) => void
    mermaidRender
      .mockImplementationOnce(() => Promise.resolve({ svg: SVG }))
      .mockImplementationOnce((_id: string) => {
        // mermaid leaves an orphan error node behind when render fails.
        const orphan = document.createElement('div')
        orphan.id = `d${_id}`
        document.body.appendChild(orphan)
        return new Promise<{ svg: string }>((_resolve, reject) => {
          rejectSecond = reject
        })
      })
      .mockImplementationOnce(
        () =>
          new Promise<{ svg: string }>((resolve) => {
            resolveThird = resolve
          }),
      )

    const { container, rerender } = diagram({ source: SIMPLE, onError })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())

    // A deferred (doomed) render is superseded by a newer source before
    // settling. Re-renders are debounced → fake timers.
    vi.useFakeTimers()
    try {
      rerender(createElement(MermaidDiagram, { source: 'graph TD; B-->C', lazy: false, onError }))
      await advanceDebounce()
      expect(mermaidRender).toHaveBeenCalledTimes(2)
      rerender(createElement(MermaidDiagram, { source: 'graph TD; C-->D', lazy: false, onError }))
      await advanceDebounce()
      expect(mermaidRender).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
    expect(document.querySelector('[id^="dmmd-"]')).not.toBeNull()

    await act(async () => {
      rejectSecond(new Error('superseded failure'))
    })

    // The orphan error node is removed even though the render was cancelled…
    expect(document.querySelector('[id^="dmmd-"]')).toBeNull()
    // …the failure is still reported to onError…
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    // …and the last good SVG is not clobbered by the cancelled failure.
    expect(container.querySelector('.mermaid-svg')?.innerHTML).toContain('<circle')
    expect(container.querySelector('.mermaid-fallback-message')).toBeNull()

    // The superseding render eventually resolves and swaps the SVG.
    await act(async () => {
      resolveThird({ svg: SVG_ALT })
    })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')?.innerHTML).toContain('<rect'))
  })
})

describe('MermaidDiagram — stale-while-revalidate', () => {
  it('keeps displaying the previous SVG while re-rendering after a source change (no blank flash)', async () => {
    let resolveSecond!: (value: { svg: string }) => void
    mermaidRender
      .mockImplementationOnce(() => Promise.resolve({ svg: SVG }))
      .mockImplementationOnce(
        () =>
          new Promise<{ svg: string }>((resolve) => {
            resolveSecond = resolve
          }),
      )

    const { container, rerender } = diagram({ source: SIMPLE })
    await waitFor(() => {
      expect(container.querySelector('.mermaid-svg')?.innerHTML).toContain('<circle')
    })

    // Re-render after a source change is debounced (streaming) → fake timers.
    vi.useFakeTimers()
    try {
      rerender(createElement(MermaidDiagram, { source: 'graph TD; B-->C', lazy: false }))
      await advanceDebounce()
    } finally {
      vi.useRealTimers()
    }
    expect(mermaidRender).toHaveBeenCalledTimes(2)

    // While the new render is in flight, the old SVG stays visible —
    // no pending placeholder, no fallback, no blank flash.
    const svgBox = container.querySelector<HTMLElement>('.mermaid-svg')
    expect(svgBox).not.toBeNull()
    expect(svgBox?.innerHTML).toContain('<circle')
    expect(container.querySelector('.mermaid-fallback-message')).toBeNull()

    await act(async () => {
      resolveSecond({ svg: SVG_ALT })
    })
    await waitFor(() => {
      expect(container.querySelector('.mermaid-svg')?.innerHTML).toContain('<rect')
    })
  })
})

describe('MermaidDiagram — streaming debounce', () => {
  it('first render of a mount is immediate — no debounce, no timer advance', async () => {
    vi.useFakeTimers()
    try {
      mermaidRender.mockResolvedValue({ svg: SVG })
      const { container } = diagram()
      // Flush microtasks only: the debounce delay is never advanced. If the
      // first render were debounced, the SVG could not be there yet.
      await act(async () => {
        await Promise.resolve()
      })
      expect(mermaidRender).toHaveBeenCalledTimes(1)
      expect(container.querySelector('.mermaid-svg')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('collapses rapid source updates into a single render with the final source', async () => {
    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container, rerender } = diagram({ source: SIMPLE })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
    expect(mermaidRender).toHaveBeenCalledTimes(1)

    vi.useFakeTimers()
    try {
      // Three rapid streaming chunks — none triggers a render on its own.
      rerender(createElement(MermaidDiagram, { source: 'graph TD; A-->B1', lazy: false }))
      rerender(createElement(MermaidDiagram, { source: 'graph TD; A-->B2', lazy: false }))
      rerender(createElement(MermaidDiagram, { source: 'graph TD; A-->B3', lazy: false }))
      expect(mermaidRender).toHaveBeenCalledTimes(1)

      // One single advance past the debounce → exactly one re-render,
      // with the FINAL source.
      await advanceDebounce()
      expect(mermaidRender).toHaveBeenCalledTimes(2)
      expect(mermaidRender).toHaveBeenLastCalledWith(expect.any(String), 'graph TD; A-->B3')

      // Advancing again does not produce extra renders.
      await advanceDebounce()
      expect(mermaidRender).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
  })
})

describe('MermaidDiagram — error reporting', () => {
  it('calls onError with the error when a render fails', async () => {
    const onError = vi.fn()
    mermaidRender.mockRejectedValue(new Error('Parse error'))
    const { container } = diagram({ onError })
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    // Degradation behavior stays identical.
    expect(container.querySelector('.mermaid-fallback-message')).not.toBeNull()
    expect(container.querySelector('.mermaid-fallback-source')?.textContent).toBe(SIMPLE)
    expect(container.querySelector('.mermaid-svg')).toBeNull()
  })

  it('logs via console.error when onError is not provided', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mermaidRender.mockRejectedValue(new Error('Parse error'))
      const { container } = diagram()
      await waitFor(() => {
        expect(container.querySelector('.mermaid-fallback-message')).not.toBeNull()
      })
      expect(consoleError).toHaveBeenCalledWith('mermaid render failed', expect.any(Error))
    } finally {
      consoleError.mockRestore()
    }
  })

  it('still fires onError when a debounced (streaming) re-render fails', async () => {
    const onError = vi.fn()
    mermaidRender.mockResolvedValueOnce({ svg: SVG }).mockRejectedValueOnce(new Error('stream'))
    const { container, rerender } = diagram({ onError })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
    expect(onError).not.toHaveBeenCalled()

    vi.useFakeTimers()
    try {
      rerender(createElement(MermaidDiagram, { source: 'graph TD; B-->C', lazy: false, onError }))
      await advanceDebounce()
    } finally {
      vi.useRealTimers()
    }

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    // Degradation identical to a direct-render failure.
    expect(container.querySelector('.mermaid-fallback-message')).not.toBeNull()
    expect(container.querySelector('.mermaid-fallback-source')?.textContent).toBe('graph TD; B-->C')
  })
})

describe('MermaidDiagram — accessibility', () => {
  it('default aria-label: Mermaid diagram', async () => {
    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram()
    await waitFor(() => {
      expect(container.querySelector('.mermaid-svg')?.getAttribute('aria-label')).toBe(
        'Mermaid diagram',
      )
    })
  })

  it('aria-label from the diagram title (frontmatter title)', async () => {
    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram({ source: '---\ntitle: Krebs cycle\n---\ngraph TD; A-->B' })
    await waitFor(() => {
      expect(container.querySelector('.mermaid-svg')?.getAttribute('aria-label')).toBe(
        'Krebs cycle',
      )
    })
  })

  it('explicit aria-label via the title prop takes precedence', async () => {
    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram({
      source: '---\ntitle: Ignored\n---\ngraph TD',
      title: 'Metabolic pathway',
    })
    await waitFor(() => {
      expect(container.querySelector('.mermaid-svg')?.getAttribute('aria-label')).toBe(
        'Metabolic pathway',
      )
    })
  })

  it('marks the root aria-busy while pending and removes it once rendered', async () => {
    let resolveRender!: (value: { svg: string }) => void
    mermaidRender.mockImplementation(
      () =>
        new Promise<{ svg: string }>((resolve) => {
          resolveRender = resolve
        }),
    )
    const { container } = diagram()
    const root = container.querySelector<HTMLElement>('.mermaid-diagram')
    expect(root).not.toBeNull()
    expect(root?.getAttribute('aria-busy')).toBe('true')
    await waitFor(() => expect(mermaidRender).toHaveBeenCalledTimes(1))

    await act(async () => {
      resolveRender({ svg: SVG })
    })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
    expect(root?.getAttribute('aria-busy')).toBeNull()
  })

  it('announces the fallback message through a polite live region (role="status")', async () => {
    mermaidRender.mockRejectedValue(new Error('x'))
    const { container } = diagram()
    await waitFor(() => {
      expect(container.querySelector('.mermaid-fallback-message')).not.toBeNull()
    })
    expect(container.querySelector('.mermaid-fallback-message')?.getAttribute('role')).toBe('status')
  })

  it('applies minHeight while pending and removes it once rendered', async () => {
    let resolveRender!: (value: { svg: string }) => void
    mermaidRender.mockImplementation(
      () =>
        new Promise<{ svg: string }>((resolve) => {
          resolveRender = resolve
        }),
    )
    const { container } = diagram({ minHeight: 200 })
    const root = container.querySelector<HTMLElement>('.mermaid-diagram')
    // React style semantics: a number is treated as px.
    expect(root?.style.minHeight).toBe('200px')
    await waitFor(() => expect(mermaidRender).toHaveBeenCalledTimes(1))

    await act(async () => {
      resolveRender({ svg: SVG })
    })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
    expect(root?.style.minHeight).toBe('')
  })

  it('applies a string minHeight as-is while pending', async () => {
    let resolveRender!: (value: { svg: string }) => void
    mermaidRender.mockImplementation(
      () =>
        new Promise<{ svg: string }>((resolve) => {
          resolveRender = resolve
        }),
    )
    const { container } = diagram({ minHeight: '10em' })
    expect(container.querySelector<HTMLElement>('.mermaid-diagram')?.style.minHeight).toBe('10em')
    await waitFor(() => expect(mermaidRender).toHaveBeenCalledTimes(1))
    await act(async () => {
      resolveRender({ svg: SVG })
    })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
    expect(container.querySelector<HTMLElement>('.mermaid-diagram')?.style.minHeight).toBe('')
  })

  it('srOnlySource={false} omits the sr-only span (source stays visible in the error fallback)', async () => {
    mermaidRender.mockRejectedValue(new Error('x'))
    const { container } = diagram({ srOnlySource: false })
    await waitFor(() => {
      expect(container.querySelector('.mermaid-fallback-message')).not.toBeNull()
    })
    expect(container.querySelector('.mermaid-sr-only')).toBeNull()
    expect(container.querySelector('.mermaid-fallback-source')?.textContent).toBe(SIMPLE)
  })
})

describe('MermaidDiagram — lazy (on-demand) rendering', () => {
  it('renders nothing outside the viewport when lazy, renders on intersection', async () => {
    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram({ lazy: true })
    // Outside the viewport: observer in place, no render.
    expect(MockIntersectionObserver.instances).toHaveLength(1)
    expect(mermaidRender).not.toHaveBeenCalled()
    expect(container.querySelector('.mermaid-svg')).toBeNull()
    // The sr-only source stays present even while waiting.
    expect(container.querySelector('.mermaid-sr-only code')?.textContent).toBe(SIMPLE)

    await act(async () => {
      MockIntersectionObserver.instances[0].simulateIntersecting()
    })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
    expect(mermaidRender).toHaveBeenCalledTimes(1)
  })

  it('lazy={false} renders immediately without an observer', async () => {
    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram({ lazy: false })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
    expect(MockIntersectionObserver.instances).toHaveLength(0)
  })

  it("lazy='false' (string from properties) also renders immediately", async () => {
    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram({ lazy: 'false' })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
  })

  it('renders immediately when IntersectionObserver is unavailable', async () => {
    vi.unstubAllGlobals()
    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram()
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
    expect(mermaidRender).toHaveBeenCalledTimes(1)
  })
})

describe('MermaidDiagram — theme', () => {
  it('theme dark → initializes with the mermaid dark theme', async () => {
    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram({ theme: 'dark' })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
    expect(mermaidInitialize).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }))
  })

  it('theme auto follows prefers-color-scheme and re-renders on change', async () => {
    const listeners: Array<(event: MediaQueryListEvent) => void> = []
    const mql = {
      matches: false,
      addEventListener: (_t: string, cb: (event: MediaQueryListEvent) => void) => {
        listeners.push(cb)
      },
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('matchMedia', vi.fn(() => mql))

    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram({ theme: 'auto' })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
    expect(mermaidInitialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'default' }),
    )
    expect(container.querySelector('.mermaid-diagram')?.getAttribute('data-mermaid-theme')).toBe(
      'light',
    )

    // System switches to dark → re-render with the dark theme (debounced).
    vi.useFakeTimers()
    try {
      await act(async () => {
        listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent))
      })
      await advanceDebounce()
    } finally {
      vi.useRealTimers()
    }
    await waitFor(() =>
      expect(mermaidInitialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' })),
    )
    expect(container.querySelector('.mermaid-diagram')?.getAttribute('data-mermaid-theme')).toBe(
      'dark',
    )
  })

  it('theme auto re-initializes when flipping back light → dark → light', async () => {
    const listeners: Array<(event: MediaQueryListEvent) => void> = []
    const mql = {
      matches: false,
      addEventListener: (_t: string, cb: (event: MediaQueryListEvent) => void) => {
        listeners.push(cb)
      },
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('matchMedia', vi.fn(() => mql))

    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram({ theme: 'auto' })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())

    const flip = async (matches: boolean) => {
      vi.useFakeTimers()
      try {
        await act(async () => {
          listeners.forEach((cb) => cb({ matches } as MediaQueryListEvent))
        })
        await advanceDebounce()
      } finally {
        vi.useRealTimers()
      }
    }
    await flip(true)
    await waitFor(() =>
      expect(mermaidInitialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' })),
    )
    await flip(false)
    await waitFor(() =>
      expect(mermaidInitialize).toHaveBeenLastCalledWith(
        expect.objectContaining({ theme: 'default' }),
      ),
    )
    expect(mermaidInitialize).toHaveBeenCalledTimes(3)
    expect(container.querySelector('.mermaid-diagram')?.getAttribute('data-mermaid-theme')).toBe(
      'light',
    )
  })

  it('theme auto renders dark-first when the system initially prefers dark', async () => {
    const mql = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('matchMedia', vi.fn(() => mql))

    mermaidRender.mockResolvedValue({ svg: SVG })
    const { container } = diagram({ theme: 'auto' })
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())
    // The very first render already uses the dark theme — no light-first flash.
    expect(mermaidInitialize).toHaveBeenCalledTimes(1)
    expect(mermaidInitialize).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }))
    expect(container.querySelector('.mermaid-diagram')?.getAttribute('data-mermaid-theme')).toBe(
      'dark',
    )
  })

  it('initializes mermaid once while the theme is unchanged, not on every render', async () => {
    mermaidRender.mockResolvedValueOnce({ svg: SVG }).mockResolvedValueOnce({ svg: SVG_ALT })
    const { container, rerender } = diagram()
    await waitFor(() => expect(container.querySelector('.mermaid-svg')).not.toBeNull())

    // Source change (streaming update) re-runs the render effect — debounced,
    // hence the fake timers.
    vi.useFakeTimers()
    try {
      rerender(createElement(MermaidDiagram, { source: 'graph TD; A-->C', lazy: false }))
      await advanceDebounce()
    } finally {
      vi.useRealTimers()
    }
    await waitFor(() =>
      expect(container.querySelector('.mermaid-svg')?.innerHTML).toContain('rect'),
    )
    expect(mermaidRender).toHaveBeenCalledTimes(2)
    // …but the global mermaid config is not re-initialized for the same theme.
    expect(mermaidInitialize).toHaveBeenCalledTimes(1)
  })
})
