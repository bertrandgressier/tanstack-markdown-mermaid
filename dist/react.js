import { createElement, memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { extractMermaidTitle } from './index.js';
import { ensureMermaidInitialized } from './mermaid-init.js';
export const DEFAULT_MERMAID_FALLBACK_MESSAGE = 'Diagram not displayed — source preserved';
const DEFAULT_ARIA_LABEL = 'Mermaid diagram';
/**
 * Re-renders of an already-mounted diagram (streaming chunk updates, theme
 * flips) are debounced by this delay so rapid source changes collapse into
 * a single mermaid render. The first render of a mount stays immediate.
 */
const RE_RENDER_DEBOUNCE_MS = 150;
const SR_ONLY_STYLE = {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
};
function parseConfig(config) {
    if (typeof config !== 'string')
        return config;
    try {
        const parsed = JSON.parse(config);
        return parsed && typeof parsed === 'object' ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
function coerceTheme(theme) {
    return theme === 'dark' ? 'dark' : 'light';
}
function coerceLazy(lazy) {
    if (lazy === undefined)
        return true;
    return lazy !== false && lazy !== 'false';
}
/**
 * Resolves `prefers-color-scheme` and subscribes to its changes. Falls back
 * to `false` (light) when `matchMedia` is unavailable (SSR, test
 * environment without a mock).
 */
function usePrefersDark(enabled) {
    // Lazy initializer: read the current scheme on the very first render so
    // `theme: 'auto'` never renders light-first on dark systems. SSR-safe:
    // returns false on the server; the initial JSX does not depend on the
    // theme (mermaid renders happen in effects only), so there is no
    // hydration mismatch.
    const [dark, setDark] = useState(() => typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    useEffect(() => {
        if (!enabled)
            return;
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
            return;
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        setDark(mql.matches);
        if (typeof mql.addEventListener !== 'function')
            return;
        const onChange = (event) => setDark(event.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [enabled]);
    return dark;
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
export const MermaidDiagram = memo(function MermaidDiagram({ source, title, theme, lazy, fallbackMessage = DEFAULT_MERMAID_FALLBACK_MESSAGE, className, minHeight, srOnlySource = true, onError, complete, mermaidConfig, }) {
    const code = source ?? '';
    const wantsLazy = coerceLazy(lazy);
    const isComplete = complete !== false && complete !== 'false';
    const configKey = typeof mermaidConfig === 'string' ? mermaidConfig : JSON.stringify(mermaidConfig ?? null);
    const parsedConfig = useMemo(() => parseConfig(mermaidConfig), [configKey]);
    const isAuto = theme === 'auto';
    const prefersDark = usePrefersDark(isAuto);
    const resolvedTheme = isAuto
        ? prefersDark
            ? 'dark'
            : 'light'
        : coerceTheme(theme);
    const [status, setStatus] = useState({ state: 'pending' });
    const [visible, setVisible] = useState(!wantsLazy);
    const containerRef = useRef(null);
    // The first productive render of this mount runs immediately; every
    // subsequent effect re-run is debounced (streaming).
    const firstRunRef = useRef(true);
    // Always call the latest onError without adding it to the render-effect
    // deps (an inline callback must not trigger a mermaid re-render).
    const onErrorRef = useRef(onError);
    useEffect(() => {
        onErrorRef.current = onError;
    });
    const rawId = useId();
    const mermaidId = `mmd-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    // Each mermaid.render call gets its own id (`${mermaidId}-${n}`), so
    // cleanup of a failed/superseded attempt never touches another attempt's
    // nodes.
    const attemptRef = useRef(0);
    // On-demand rendering: IntersectionObserver on the root container.
    useEffect(() => {
        if (!wantsLazy || visible)
            return;
        const element = containerRef.current;
        if (!element)
            return;
        if (typeof IntersectionObserver === 'undefined') {
            setVisible(true);
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                observer.disconnect();
                setVisible(true);
            }
        }, { rootMargin: '200px' });
        observer.observe(element);
        return () => observer.disconnect();
    }, [wantsLazy, visible]);
    // Mermaid rendering: single dynamic import, strictly bounded errors.
    useEffect(() => {
        if (!visible)
            return;
        let cancelled = false;
        const startRender = () => {
            const attemptId = `${mermaidId}-${++attemptRef.current}`;
            // Stale-while-revalidate: keep displaying the last good SVG while
            // re-rendering (e.g. after a source/theme change); only fall back to
            // the pending placeholder when no SVG has been rendered yet — no blank
            // flash during updates.
            setStatus((previous) => (previous.state === 'ok' ? previous : { state: 'pending' }));
            import('mermaid')
                .then(async (module) => {
                if (cancelled)
                    return;
                const mermaid = module.default;
                // Memoized per theme/config: no repeated global config resets (see
                // mermaid-init.ts).
                ensureMermaidInitialized(mermaid, resolvedTheme, parsedConfig);
                const { svg } = await mermaid.render(attemptId, code);
                if (cancelled)
                    return;
                setStatus({ state: 'ok', svg });
            })
                .catch((error) => {
                // mermaid may leave an orphan error node in the DOM. The node id is
                // tied to this specific render attempt (`attemptId`), so clean it
                // up even when the render has been superseded (cancelled).
                if (typeof document !== 'undefined') {
                    document.getElementById(`d${attemptId}`)?.remove();
                    document.getElementById(attemptId)?.remove();
                }
                // Unclosed fence (streaming partial): failure is expected — stay
                // quiet, no error state and no onError.
                if (!isComplete) {
                    if (cancelled)
                        return;
                    setStatus((previous) => (previous.state === 'ok' ? previous : { state: 'pending' }));
                    return;
                }
                if (onErrorRef.current) {
                    onErrorRef.current(error);
                }
                else {
                    console.error('mermaid render failed', error);
                }
                if (cancelled)
                    return;
                setStatus({ state: 'error' });
            });
        };
        // First render for this mount: immediate. Subsequent re-runs (streaming
        // chunk updates, theme flips): debounced so a render happens per settled
        // source, not per chunk.
        if (firstRunRef.current) {
            firstRunRef.current = false;
            startRender();
            return () => {
                cancelled = true;
            };
        }
        const timer = setTimeout(startRender, RE_RENDER_DEBOUNCE_MS);
        return () => {
            clearTimeout(timer);
            cancelled = true;
        };
    }, [visible, code, resolvedTheme, mermaidId, isComplete, parsedConfig]);
    const ariaLabel = title ?? extractMermaidTitle(code) ?? DEFAULT_ARIA_LABEL;
    const rootClass = ['mermaid-diagram', className].filter(Boolean).join(' ');
    return createElement('div', {
        className: rootClass,
        ref: containerRef,
        'data-mermaid-theme': resolvedTheme,
        // Present only while pending — screen readers can hint at the
        // upcoming content instead of treating the container as settled.
        'aria-busy': status.state === 'pending' ? true : undefined,
        style: status.state === 'pending' && minHeight !== undefined ? { minHeight } : undefined,
    }, 
    // Source technically present in every state (sr-only), unless the page
    // exposes it elsewhere and opted out via `srOnlySource: false`.
    srOnlySource
        ? createElement('span', { className: 'mermaid-sr-only', style: SR_ONLY_STYLE }, createElement('code', null, code))
        : null, status.state === 'ok'
        ? createElement('div', {
            className: 'mermaid-svg',
            role: 'img',
            'aria-label': ariaLabel,
            dangerouslySetInnerHTML: { __html: status.svg },
        })
        : status.state === 'error'
            ? [
                createElement('p', 
                // Implicit polite live region: the failure gets announced.
                { key: 'message', className: 'mermaid-fallback-message', role: 'status' }, fallbackMessage),
                createElement('pre', { key: 'source', className: 'mermaid-fallback-source' }, code),
            ]
            : !isComplete
                ? createElement('pre', { className: 'mermaid-pending-source' }, code)
                : null);
});
