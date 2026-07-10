# Legacy Static Runtime

The Electron desktop app no longer serves `history/static/` at runtime.

## Current behavior

- **Development**: Vite dev server (`frontend/`, port 5173) proxies API calls to the FastAPI backend (`backend/`, port 3000).
- **Production**: Electron loads the built React SPA from `frontend/dist/`. The backend serves API routes only; there is no `StaticFiles` mount for legacy HTML/JS.

## Archive location

Legacy pages and scripts remain in `history/static/` for reference during migration. They are **not** bundled into the desktop build (`package.json` `extraResources` excludes `history/`).

## Migration status (waves 5–8)

| Area | React route | Legacy source |
|------|-------------|---------------|
| Chat | `/chat` | `history/static/gpt-chat.html` |
| Tools | `/tools`, `/enhance`, `/klein`, `/zimage`, `/angle`, `/online` | `history/static/*.html` |
| i18n | `frontend/src/shared/i18n/` | `history/static/js/i18n/` |

When a feature is fully migrated and covered by tests, its legacy HTML/JS counterpart can be deleted from `history/static/` without affecting the desktop app.
