# Video Utils

## Commands

- `npm run dev` — Start dev server (Vite, with `--host` for network access)
- `npm run build` — Production build
- `npm run preview` — Preview production build

No test runner or linter is configured.

## Architecture

Browser-based video/audio toolkit — React 19 SPA where all media processing runs client-side via FFmpeg WASM. No backend.

**Routing** (React Router DOM, defined in `src/App.jsx`):
- `/` → Landing (tool grid)
- `/tools/video-chunker` → VideoChunker
- `/tools/media-converter` → MediaConverter

**Layer separation**:
- `src/pages/` — Route-level components (JSX). Own their state and orchestrate tool calls.
- `src/components/` — Shared UI (JSX): Layout, DropZone, Button, FileInfo, ProgressBar.
- `src/tools/` — Business logic (TypeScript). Each tool file exports async functions that operate on an FFmpeg instance. `ffmpeg.ts` is the shared loader/mount layer; `media-converter.ts` and `video-chunker.ts` build on it.
- `src/utils/` — Pure helpers (theme, formatSize).

**FFmpeg pattern**: `ffmpeg.ts` maintains a singleton FFmpeg instance loaded from unpkg CDN. Files are mounted via WORKERFS (not copied into WASM memory) to handle multi-GB files. The instance is preloaded in `App.jsx` on mount. Tool functions (`convertMedia`, `splitVideo`) accept a loaded FFmpeg instance, mount the file, run commands, then unmount.

**Styling**: Styled Components with ThemeProvider. Dark theme only, defined in `src/utils/theme.js`. Radix UI primitives (Select, Slider, Progress) for accessible controls.

## Vite Config

CORS headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) are required for FFmpeg's SharedArrayBuffer usage. `@ffmpeg/ffmpeg` and `@ffmpeg/util` are excluded from Vite's dep optimization due to WASM.

## Conventions

- TypeScript for tool/logic files in `src/tools/`, JSX for React components.
- Progress callbacks follow the shape `{ percent: number, message: string }`.
- New tools should follow the existing pattern: export a function that takes an FFmpeg instance + input path, add a route in App.jsx, create a page in `src/pages/`.
