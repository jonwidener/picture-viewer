"""Walks media roots and syncs the DB. Never writes to the media folders."""
import hashlib
import os
import threading
from collections import defaultdict
from pathlib import PurePosixPath

from . import db, media

_status = {"running": False, "phase": "idle", "processed": 0, "total": 0,
           "added": 0, "relinked": 0, "updated": 0, "missing": 0, "paired": 0, "error": None}
_lock = threading.Lock()
LIVE_MAX_SECONDS = 5


def get_status():
    with _lock:
        return dict(_status)


def _set(**kw):
    with _lock:
        _status.update(kw)


def start_scan(db_path):
    with _lock:
        if _status["running"]:
            return False
        _status.update(running=True, phase="listing", processed=0, total=0, added=0,
                       relinked=0, updated=0, missing=0, paired=0, error=None)
    threading.Thread(target=_run, args=(db_path,), daemon=True).start()
    return True


def fingerprint(path, size):
    h = hashlib.sha1(str(size).encode())
    with open(path, "rb") as f:
        h.update(f.read(1 << 20))
        if size > 2 << 20:
            f.seek(-(1 << 20), os.SEEK_END)
            h.update(f.read(1 << 20))
    return h.hexdigest()


def _run(db_path):
    conn = db.connect(db_path)
    try:
        roots = conn.execute("SELECT id, path FROM roots WHERE enabled=1").fetchall()
        entries, scanned_roots = [], []
        for r in roots:
            if not os.path.isdir(r["path"]):
                continue  # unmounted/missing root: leave its files untouched
            scanned_roots.append(r["id"])
            for dirpath, _dirs, names in os.walk(r["path"]):
                for n in names:
                    if n.startswith("."):
                        continue
                    ext = os.path.splitext(n)[1].lower()
                    if media.kind_for(ext):
                        entries.append((r["id"], r["path"], os.path.join(dirpath, n)))
        _set(phase="indexing", total=len(entries))

        seen = set()
        for i, (root_id, root_path, full) in enumerate(entries):
            rel = os.path.relpath(full, root_path)
            try:
                _index_file(conn, root_id, rel, full)
            except OSError:
                pass
            seen.add((root_id, rel))
            if i % 100 == 0:
                conn.commit()
                _set(processed=i)
        conn.commit()
        _set(processed=len(entries), phase="finalizing")

        missing = 0
        for row in conn.execute(
            f"SELECT id, root_id, rel_path FROM files WHERE missing=0 AND root_id IN ({','.join('?' * len(scanned_roots))})",
            scanned_roots,
        ).fetchall():
            if (row["root_id"], row["rel_path"]) not in seen:
                conn.execute("UPDATE files SET missing=1 WHERE id=?", (row["id"],))
                missing += 1
        _set(missing=missing)
        _set(paired=_pair_live_photos(conn))
        conn.commit()
        _set(phase="done")
    except Exception as e:
        _set(error=str(e), phase="error")
    finally:
        conn.close()
        _set(running=False)


def _meta_for(full, ext):
    if media.kind_for(ext) == "image":
        return media.image_meta(full)
    return media.video_meta(full)


def _index_file(conn, root_id, rel, full):
    st = os.stat(full)
    size, mtime = st.st_size, st.st_mtime_ns
    row = conn.execute("SELECT id, size, mtime, missing FROM files WHERE root_id=? AND rel_path=?",
                       (root_id, rel)).fetchone()
    if row and row["size"] == size and row["mtime"] == mtime:
        if row["missing"]:
            conn.execute("UPDATE files SET missing=0 WHERE id=?", (row["id"],))
        return

    ext = os.path.splitext(full)[1].lower()
    fp = fingerprint(full, size)

    if not row:
        # candidates: same content whose old path is gone (flagged missing now, or not yet flagged this scan)
        for c in conn.execute("SELECT f.id, f.rel_path, r.path AS root_path FROM files f JOIN roots r ON r.id=f.root_id "
                              "WHERE f.fingerprint=? AND f.size=?", (fp, size)).fetchall():
            if not os.path.exists(os.path.join(c["root_path"], c["rel_path"])):
                conn.execute("UPDATE files SET root_id=?, rel_path=?, mtime=?, missing=0 WHERE id=?",
                             (root_id, rel, mtime, c["id"]))
                _bump("relinked")
                return

    m = _meta_for(full, ext)
    kind = media.kind_for(ext)
    if row:
        conn.execute(
            "UPDATE files SET fingerprint=?, size=?, mtime=?, width=?, height=?, duration=?, codec=?, missing=0 WHERE id=?",
            (fp, size, mtime, m.get("width"), m.get("height"), m.get("duration"), m.get("codec"), row["id"]))
        _bump("updated")
        return

    taken = m.get("taken_at") or int(st.st_mtime)
    item_id = conn.execute("INSERT INTO items (taken_at) VALUES (?)", (taken,)).lastrowid
    conn.execute(
        "INSERT INTO files (item_id, root_id, rel_path, fingerprint, size, mtime, kind, width, height, duration, codec)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (item_id, root_id, rel, fp, size, mtime, kind, m.get("width"), m.get("height"), m.get("duration"), m.get("codec")))
    _bump("added")


def _bump(key):
    with _lock:
        _status[key] += 1


def _pair_live_photos(conn):
    """Merge single-file items sharing dir+stem (still image + short video) into one item."""
    rows = conn.execute(
        "SELECT id, item_id, root_id, rel_path, kind, duration FROM files WHERE missing=0 AND item_id IN "
        "(SELECT item_id FROM files GROUP BY item_id HAVING COUNT(*)=1)"
    ).fetchall()
    groups = defaultdict(list)
    for r in rows:
        p = PurePosixPath(r["rel_path"].replace(os.sep, "/"))
        groups[(r["root_id"], str(p.parent), p.stem.lower())].append(r)
    paired = 0
    for g in groups.values():
        imgs = [r for r in g if r["kind"] == "image"]
        vids = [r for r in g if r["kind"] == "video"]
        if len(imgs) != 1 or len(vids) != 1 or (vids[0]["duration"] or 0) > LIVE_MAX_SECONDS:
            continue
        img, vid = imgs[0], vids[0]
        keep, drop = img["item_id"], vid["item_id"]
        conn.execute("INSERT OR IGNORE INTO item_tags (item_id, tag_id) SELECT ?, tag_id FROM item_tags WHERE item_id=?",
                     (keep, drop))
        conn.execute("UPDATE items SET favorite = favorite OR (SELECT favorite FROM items WHERE id=?), "
                     "name = COALESCE(name, (SELECT name FROM items WHERE id=?)) WHERE id=?", (drop, drop, keep))
        conn.execute("UPDATE files SET item_id=?, role='motion' WHERE id=?", (keep, vid["id"]))
        conn.execute("UPDATE files SET role='still' WHERE id=?", (img["id"],))
        conn.execute("DELETE FROM items WHERE id=?", (drop,))
        paired += 1
    return paired
