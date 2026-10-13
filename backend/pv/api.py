import os
from pathlib import Path

from flask import Blueprint, abort, current_app, jsonify, request, send_file

from . import media, scanner
from .db import get_db

bp = Blueprint("api", __name__)

AVAILABLE = ("EXISTS (SELECT 1 FROM files f JOIN roots r ON r.id=f.root_id "
             "WHERE f.item_id=i.id AND f.missing=0 AND r.enabled=1)")


def err(msg, code=400):
    return jsonify(error=msg), code


# ---------- roots ----------

def _root_json(row):
    return {"id": row["id"], "path": row["path"], "enabled": bool(row["enabled"]),
            "exists": os.path.isdir(row["path"]), "files": row["files"]}


ROOT_SQL = ("SELECT r.*, (SELECT COUNT(*) FROM files f WHERE f.root_id=r.id AND f.missing=0) AS files "
            "FROM roots r")


@bp.get("/roots")
def list_roots():
    return jsonify([_root_json(r) for r in get_db().execute(ROOT_SQL + " ORDER BY r.path")])


@bp.post("/roots")
def add_root():
    path = os.path.abspath(os.path.expanduser((request.get_json(silent=True) or {}).get("path", "").strip()))
    if not os.path.isdir(path):
        return err("Not a directory on the server")
    db = get_db()
    if db.execute("SELECT 1 FROM roots WHERE path=?", (path,)).fetchone():
        return err("Already added", 409)
    cur = db.execute("INSERT INTO roots (path) VALUES (?)", (path,))
    db.commit()
    return jsonify(_root_json(db.execute(ROOT_SQL + " WHERE r.id=?", (cur.lastrowid,)).fetchone())), 201


@bp.patch("/roots/<int:rid>")
def patch_root(rid):
    db = get_db()
    enabled = (request.get_json(silent=True) or {}).get("enabled")
    if enabled is not None:
        db.execute("UPDATE roots SET enabled=? WHERE id=?", (int(bool(enabled)), rid))
        db.commit()
    row = db.execute(ROOT_SQL + " WHERE r.id=?", (rid,)).fetchone()
    return jsonify(_root_json(row)) if row else err("Not found", 404)


@bp.delete("/roots/<int:rid>")
def delete_root(rid):
    db = get_db()
    db.execute("DELETE FROM roots WHERE id=?", (rid,))
    db.execute("DELETE FROM items WHERE id NOT IN (SELECT item_id FROM files)")
    db.commit()
    return "", 204


@bp.post("/scan")
def scan():
    if not scanner.start_scan(current_app.config["DB_PATH"]):
        return err("Scan already running", 409)
    return jsonify(scanner.get_status()), 202


@bp.get("/scan/status")
def scan_status():
    return jsonify(scanner.get_status())


# ---------- tags ----------

def clean_tag(name):
    name = " ".join(str(name).split())
    return name[:64] if name else None


def ensure_tag(db, name):
    row = db.execute("SELECT id FROM tags WHERE name=?", (name,)).fetchone()
    return row["id"] if row else db.execute("INSERT INTO tags (name) VALUES (?)", (name,)).lastrowid


@bp.get("/tags")
def list_tags():
    rows = get_db().execute(
        "SELECT t.id, t.name, (SELECT COUNT(*) FROM item_tags it JOIN items i ON i.id=it.item_id "
        f"WHERE it.tag_id=t.id AND {AVAILABLE}) AS count FROM tags t ORDER BY t.name")
    return jsonify([dict(r) for r in rows])


@bp.patch("/tags/<int:tid>")
def rename_tag(tid):
    name = clean_tag((request.get_json(silent=True) or {}).get("name", ""))
    if not name:
        return err("Name required")
    db = get_db()
    clash = db.execute("SELECT id FROM tags WHERE name=? AND id<>?", (name, tid)).fetchone()
    if clash:
        return err("A tag with that name exists", 409)
    db.execute("UPDATE tags SET name=? WHERE id=?", (name, tid))
    db.commit()
    return "", 204


@bp.delete("/tags/<int:tid>")
def delete_tag(tid):
    db = get_db()
    db.execute("DELETE FROM tags WHERE id=?", (tid,))
    db.commit()
    return "", 204


# ---------- items ----------

def _like(w):
    return "%" + w.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def build_filters(args):
    where, params = [], []
    if args.get("missing") == "1":
        where.append("NOT " + AVAILABLE)
    else:
        where.append(AVAILABLE)

    tag_ids = [int(t) for t in args.get("tags", "").split(",") if t.strip().isdigit()]
    if tag_ids:
        marks = ",".join("?" * len(tag_ids))
        if args.get("tag_mode") == "any":
            where.append(f"EXISTS (SELECT 1 FROM item_tags WHERE item_id=i.id AND tag_id IN ({marks}))")
            params += tag_ids
        else:
            where.append(f"(SELECT COUNT(DISTINCT tag_id) FROM item_tags WHERE item_id=i.id AND tag_id IN ({marks})) = ?")
            params += tag_ids + [len(tag_ids)]
    if args.get("untagged") == "1":
        where.append("NOT EXISTS (SELECT 1 FROM item_tags WHERE item_id=i.id)")
    if args.get("unnamed") == "1":
        where.append("i.name IS NULL")
    if args.get("favorite") == "1":
        where.append("i.favorite=1")

    t = args.get("type")
    if t == "live":
        where.append("EXISTS (SELECT 1 FROM files WHERE item_id=i.id AND role='motion')")
    elif t == "video":
        where.append("NOT EXISTS (SELECT 1 FROM files WHERE item_id=i.id AND kind='image')")
    elif t == "image":
        where.append("EXISTS (SELECT 1 FROM files WHERE item_id=i.id AND kind='image') "
                     "AND NOT EXISTS (SELECT 1 FROM files WHERE item_id=i.id AND role='motion')")

    for key, op in (("from", ">="), ("to", "<")):
        if args.get(key, "").lstrip("-").isdigit():
            where.append(f"i.taken_at {op} ?")
            params.append(int(args[key]))

    for w in args.get("q", "").split():
        where.append("(i.name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id=it.tag_id "
                     "WHERE it.item_id=i.id AND t.name LIKE ? ESCAPE '\\'))")
        params += [_like(w), _like(w)]
    return " AND ".join(where), params


SORTS = {
    "taken": "i.taken_at {d}, i.id {d}",
    "added": "i.id {d}",
    "name": "(i.name IS NULL), LOWER(i.name) {d}, i.taken_at {d}, i.id {d}",
}


def serialize_items(db, rows):
    ids = [r["id"] for r in rows]
    if not ids:
        return []
    marks = ",".join("?" * len(ids))
    files, tags = {}, {}
    for f in db.execute(f"SELECT id, item_id, kind, role, width, height, duration, mtime, missing FROM files "
                        f"WHERE item_id IN ({marks}) ORDER BY kind='video', id", ids):
        files.setdefault(f["item_id"], []).append(
            {"id": f["id"], "kind": f["kind"], "role": f["role"], "width": f["width"], "height": f["height"],
             "duration": f["duration"], "v": f["mtime"] // 1_000_000_000, "missing": bool(f["missing"])})
    for t in db.execute(f"SELECT it.item_id, t.id, t.name FROM item_tags it JOIN tags t ON t.id=it.tag_id "
                        f"WHERE it.item_id IN ({marks}) ORDER BY t.name", ids):
        tags.setdefault(t["item_id"], []).append({"id": t["id"], "name": t["name"]})
    out = []
    for r in rows:
        fs = files.get(r["id"], [])
        has_image = any(f["kind"] == "image" for f in fs)
        itype = "live" if any(f["role"] == "motion" for f in fs) else ("image" if has_image else "video")
        out.append({"id": r["id"], "name": r["name"], "favorite": bool(r["favorite"]), "taken_at": r["taken_at"],
                    "type": itype, "files": fs, "tags": tags.get(r["id"], []),
                    "cover_file_id": fs[0]["id"] if fs else None})
    return out


@bp.get("/items")
def list_items():
    db = get_db()
    where, params = build_filters(request.args)
    d = "DESC" if request.args.get("dir", "desc") == "desc" else "ASC"
    order = SORTS.get(request.args.get("sort", "taken"), SORTS["taken"]).format(d=d)
    limit = min(max(int(request.args.get("limit", 200)), 1), 1000)
    offset = max(int(request.args.get("offset", 0)), 0)
    total = db.execute(f"SELECT COUNT(*) FROM items i WHERE {where}", params).fetchone()[0]
    rows = db.execute(f"SELECT i.* FROM items i WHERE {where} ORDER BY {order} LIMIT ? OFFSET ?",
                      params + [limit, offset]).fetchall()
    return jsonify(total=total, items=serialize_items(db, rows))


@bp.get("/items/ids")
def list_item_ids():
    """All item ids matching the filters (for 'select all')."""
    db = get_db()
    where, params = build_filters(request.args)
    return jsonify([r[0] for r in db.execute(f"SELECT i.id FROM items i WHERE {where}", params)])


def _item(db, iid):
    row = db.execute("SELECT * FROM items WHERE id=?", (iid,)).fetchone()
    return serialize_items(db, [row])[0] if row else None


def _set_tags(db, iid, names):
    db.execute("DELETE FROM item_tags WHERE item_id=?", (iid,))
    for n in filter(None, map(clean_tag, names)):
        db.execute("INSERT OR IGNORE INTO item_tags VALUES (?,?)", (iid, ensure_tag(db, n)))


@bp.get("/items/<int:iid>")
def get_item(iid):
    item = _item(get_db(), iid)
    return jsonify(item) if item else err("Not found", 404)


@bp.patch("/items/<int:iid>")
def patch_item(iid):
    db, body = get_db(), request.get_json(silent=True) or {}
    if not db.execute("SELECT 1 FROM items WHERE id=?", (iid,)).fetchone():
        return err("Not found", 404)
    if "name" in body:
        name = " ".join(str(body["name"] or "").split())[:200]
        db.execute("UPDATE items SET name=? WHERE id=?", (name or None, iid))
    if "favorite" in body:
        db.execute("UPDATE items SET favorite=? WHERE id=?", (int(bool(body["favorite"])), iid))
    if "tags" in body:
        _set_tags(db, iid, body["tags"])
    db.commit()
    return jsonify(_item(db, iid))


@bp.post("/items/bulk")
def bulk():
    db, body = get_db(), request.get_json(silent=True) or {}
    ids = [i for i in body.get("ids", []) if isinstance(i, int)]
    for n in filter(None, map(clean_tag, body.get("add_tags", []))):
        tid = ensure_tag(db, n)
        db.executemany("INSERT OR IGNORE INTO item_tags VALUES (?,?)", [(i, tid) for i in ids])
    for n in filter(None, map(clean_tag, body.get("remove_tags", []))):
        row = db.execute("SELECT id FROM tags WHERE name=?", (n,)).fetchone()
        if row:
            db.executemany("DELETE FROM item_tags WHERE item_id=? AND tag_id=?", [(i, row["id"]) for i in ids])
    if body.get("favorite") is not None:
        db.executemany("UPDATE items SET favorite=? WHERE id=?", [(int(bool(body["favorite"])), i) for i in ids])
    db.commit()
    return "", 204


# ---------- media ----------

def _file_or_404(fid):
    f = get_db().execute(
        "SELECT f.*, r.path AS root_path, r.enabled FROM files f JOIN roots r ON r.id=f.root_id WHERE f.id=?",
        (fid,)).fetchone()
    if not f or f["missing"] or not f["enabled"]:
        abort(404)
    root = os.path.realpath(f["root_path"])
    src = os.path.realpath(os.path.join(root, f["rel_path"]))
    if os.path.commonpath([root, src]) != root or not os.path.isfile(src):
        abort(404)
    return f, Path(src)


def _send(path, **kw):
    return send_file(path, conditional=True, max_age=31536000, **kw)


@bp.get("/files/<int:fid>/thumb")
def file_thumb(fid):
    f, src = _file_or_404(fid)
    try:
        return _send(media.thumb_path(current_app.config["CACHE_DIR"], f, src), mimetype="image/jpeg")
    except Exception:
        abort(500)


@bp.get("/files/<int:fid>/original")
def file_original(fid):
    """Image rendition for the viewer (HEIC converted to JPEG), or the raw video file."""
    f, src = _file_or_404(fid)
    ext = src.suffix.lower()
    if f["kind"] == "image" and ext in media.DERIVE_EXT:
        return _send(media.display_path(current_app.config["CACHE_DIR"], f, src), mimetype="image/jpeg")
    return _send(src, mimetype="video/mp4" if ext == ".mov" else None)


@bp.get("/files/<int:fid>/playback")
def file_playback(fid):
    f, src = _file_or_404(fid)
    status, path = media.playback_status(current_app.config["CACHE_DIR"], f, src, src.suffix.lower())
    if status == "error":
        with media._jobs_lock:
            return jsonify(status="error", error=media._jobs[fid]["error"])
    return jsonify(status=status, url=f"/api/files/{fid}/stream?v={f['mtime']}" if status == "ready" else None)


@bp.get("/files/<int:fid>/stream")
def file_stream(fid):
    f, src = _file_or_404(fid)
    status, path = media.playback_status(current_app.config["CACHE_DIR"], f, src, src.suffix.lower())
    if status != "ready":
        abort(409)
    return _send(path, mimetype="video/mp4")
