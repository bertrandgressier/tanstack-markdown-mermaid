# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1](https://github.com/bertrandgressier/tanstack-markdown-mermaid/compare/v0.2.0...v0.2.1) (2026-10-04)


### Bug Fixes

* support @tanstack/markdown 1.x and mermaid theme re-init ([#1](https://github.com/bertrandgressier/tanstack-markdown-mermaid/issues/1)) ([7d68662](https://github.com/bertrandgressier/tanstack-markdown-mermaid/commit/7d6866237163fd983259daa08877ad6c9b69dac9))

## [0.2.0] - 2026-09-24
### Added
- `onError` prop: called when diagram rendering fails (falls back to `console.error`).
- `minHeight` prop: placeholder min-height while a diagram is pending, to avoid layout shift on lazy reveal.
- `srOnlySource` prop (default `true`): opt out of the screen-reader-only source duplicate.
- `aria-busy` on pending diagrams; fallback message is a `role="status"` live region.
- Streaming re-renders of a mounted diagram are debounced (~150 ms).
- CI workflow: typecheck, test, build, and committed-dist sync check.
- Vite demo playground (`demo/`): live editor, light/dark/auto theming, streaming simulation, honest-fallback showcase.
### Changed
- Repository content and git history fully translated to English.
- `mermaid.initialize` is now memoized per theme (at most once per theme per page load).
### Fixed
- Orphan DOM nodes left behind when a render fails.
- Blank flash between source updates (stale SVG kept while re-rendering).
- Light-theme flash on systems preferring dark (SSR-safe media query read).
### Removed
- Source maps from the published `dist` (they referenced `../src`, which is not shipped).

## [0.1.0] - 2026-09-24
- Initial release: lazy `IntersectionObserver`-based rendering, accessible output (sr-only source, `aria-label`), graceful degradation fallback, streaming-safe re-renders, automatic light/dark theme detection.
