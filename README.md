# Picture Viewer

Self-hosted web app for browsing the photos and videos on a server's disk from any computer on your LAN. Your files are only ever read; the app writes just to its own SQLite DB and cache.

**Features:** grid + viewer, non-destructive rotation, optional names, multiple flat tags, bulk tagging, favorites, search/filter/sort, iPhone support (HEIC, Live Photos, HEVC video), exact-duplicate finder, slideshows (filtered set or saved/custom).

## Requirements

- Python 3.11+
- Node 20+ and npm
- `ffmpeg` and `ffprobe` on PATH (`sudo apt install ffmpeg`)

## Setup (once)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

cd ../frontend
npm install
```

## Run: development mode (two processes)

```bash
# terminal 1
cd backend && .venv/bin/python run.py          # API on port 5057

# terminal 2
cd frontend && npm run dev -- --port 5180 --strictPort
```

Open `http://localhost:5180`, or from another computer on the LAN `http://<server-ip>:5180` (Vite also prints the "Network" URL). Find the server IP with `hostname -I`.

## Run: single-process mode

Builds the frontend once; Flask then serves everything from one port using a production server (waitress).

```bash
cd frontend && npm run build                   # re-run after frontend changes
cd ../backend && .venv/bin/python run.py --prod
```

Open `http://<server-ip>:5057`.

## First use

1. Open **Settings**, add one or more folders (paths on the server), click **Scan now**.
2. Browse in **Library**. Click a tile to open the viewer; use the checkbox (or shift-click for ranges) to select for bulk tagging, favorites, or adding to a slideshow.
3. Rescan whenever files change on disk. Moved files are relinked automatically (names/tags kept); deleted files are flagged missing (Library > "Missing" filter), never forgotten.

The first view of a photo or video generates a thumbnail/converted copy, so it's slower once and fast afterwards. HEIC photos are shown as JPEG; HEVC video is transcoded to H.264 on first play (the viewer shows "Converting…").

### Viewer / slideshow shortcuts

| Key | Viewer | Slideshow |
|---|---|---|
| ← / → | previous / next | previous / next |
| Space | play Live Photo | pause / resume |
| `f` | toggle favorite | fullscreen |
| `r` / shift+`r` | rotate right / left | – |
| Esc | close | close |

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PV_PORT` | `5057` | Backend port (set the same for `npm run dev` so the proxy matches) |
| `PV_DATA_DIR` | `backend/data` | Where `picviewer.db` and `cache/` live |

## Network and security

There is **no authentication**. Anyone who can reach the port can view everything in your media folders and edit names/tags. Keep it on a trusted LAN and don't port-forward it. If other computers can't connect, check the firewall, e.g. `sudo ufw allow 5057/tcp` (or your Vite port).

## Keeping it running

Both modes stop when the terminal closes. Use `tmux`/`screen`, or a systemd user service, e.g. `~/.config/systemd/user/picture-viewer.service`:

```ini
[Service]
WorkingDirectory=/home/YOU/Documents/Projects/picture-viewer/backend
ExecStart=/home/YOU/Documents/Projects/picture-viewer/backend/.venv/bin/python run.py --prod
Restart=on-failure

[Install]
WantedBy=default.target
```

Then `systemctl --user daemon-reload && systemctl --user enable --now picture-viewer` (and `loginctl enable-linger $USER` to start without logging in). Requires `npm run build` to have been run.

## Backups

Everything the app owns is in `backend/data/`. Back up `picviewer.db` (names, tags, favorites, slideshows). `cache/` can be deleted any time; it regenerates.

## Development

- Type-check/lint: `cd frontend && npx tsc -b && npx oxlint`
- See `CLAUDE.md` for architecture and design decisions.
