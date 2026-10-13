# Picture Viewer

Local-network web app to browse photos/videos on the server's disk, with names, multi-tags and favorites. Media files are **read-only**; the app only writes to its SQLite DB and cache.

## Layout
- `backend/` Flask + SQLite (`pv/` package). Venv at `backend/.venv` (always use it; never pip install globally).
- `frontend/` Vite + React + TypeScript + Tailwind v4. Own virtualized grid (no grid lib).
- `backend/data/` (gitignored): `picviewer.db`, `cache/{thumbs,display,video}`. Override with `PV_DATA_DIR`.

## Run
- Backend: `cd backend && .venv/bin/python run.py` (0.0.0.0:5057; `PV_PORT` to change). Needs `ffmpeg`/`ffprobe` on PATH.
- Frontend: `cd frontend && npm run dev` (proxies `/api` to the backend; host exposed on LAN).
- Backend setup: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
- Single-process: `cd frontend && npm run build`, then `cd backend && .venv/bin/python run.py --prod` (waitress serves API + `frontend/dist`).
- Check: `cd frontend && npx tsc -b && npx oxlint`

## Design decisions
- **Item** = unit in the grid/tags/favorites/name. A **Live Photo** is one item with two files (still `role='still'` + video `role='motion'`), paired by same dir+stem and video <=5s, done at scan end. Tags/favorite/name live on the item.
- On-disk filenames are never shown in the UI; items have an optional `name` (searchable/sortable).
- Files are identified by a fast fingerprint (size + first/last 1MB sha1). Moved files are relinked on rescan (tags survive); vanished files are flagged `missing`, never deleted. Unreachable roots are skipped (not marked missing).
- Flat tags (many-to-many, case-insensitive unique). Tag names, not ids, are used in write APIs.
- Pagination is limit/offset (grid addresses items by index). Search = LIKE over name + tag names.
- Media served by file id only (path checked to stay within root). Thumbnails/HEIC->JPEG display copies generated lazily and cached by `id-mtime`.
- Video: H.264 in mp4/mov plays as-is; anything else (e.g. HEVC) is transcoded lazily to H.264 mp4 in the cache. UI polls `/files/<id>/playback`.
- `taken_at` = EXIF/QuickTime capture wall-clock time stored as if UTC (displayed with UTC), falling back to mtime.
- Scan is manual (Settings page), runs in a background thread; status via `/api/scan/status`.
- Port 5000 is commonly taken on this machine by other projects, hence 5057.

- **Duplicates**: exact copies only. Scan end fully hashes (`files.full_hash`, sha1) only files sharing a quick fingerprint+size; `/api/duplicates` groups by full hash. The Duplicates page is the one place on-disk paths are shown (needed to clean up manually). The app never deletes; users bulk-tag extras instead.
- **Slideshows**: player (`Slideshow.tsx`) takes a `Source {total,get,ensure}` — the library's `useItems` handle for filtered playback, or an array adapter for saved slideshows. Saved slideshows are ordered item lists (`slideshows`, `slideshow_items`), reordered by drag-and-drop. Player prefs (interval, shuffle) in localStorage.
- Schema changes after first release are done via guarded `ALTER`s in `db.init_db`.

## Not done / deferred
Map view (EXIF GPS not extracted), near-duplicate detection.
