import sqlite3

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS roots (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    name TEXT,
    favorite INTEGER NOT NULL DEFAULT 0,
    taken_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    root_id INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
    rel_path TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    size INTEGER NOT NULL,
    mtime INTEGER NOT NULL,
    kind TEXT NOT NULL,            -- image | video
    role TEXT,                     -- still | motion (Live Photo parts), else NULL
    width INTEGER,
    height INTEGER,
    duration REAL,
    codec TEXT,
    missing INTEGER NOT NULL DEFAULT 0,
    UNIQUE (root_id, rel_path)
);
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS item_tags (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
);
CREATE TABLE IF NOT EXISTS slideshows (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS slideshow_items (
    slideshow_id INTEGER NOT NULL REFERENCES slideshows(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (slideshow_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_items_taken ON items(taken_at, id);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_files_item ON files(item_id);
CREATE INDEX IF NOT EXISTS idx_files_fp ON files(fingerprint, size);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id, item_id);
"""


def connect(path):
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(path):
    conn = connect(path)
    conn.executescript(SCHEMA)
    if "full_hash" not in {r["name"] for r in conn.execute("PRAGMA table_info(files)")}:
        conn.execute("ALTER TABLE files ADD COLUMN full_hash TEXT")  # sha1 of whole file; only set for duplicate candidates
    if "rotation" not in {r["name"] for r in conn.execute("PRAGMA table_info(items)")}:
        conn.execute("ALTER TABLE items ADD COLUMN rotation INTEGER NOT NULL DEFAULT 0")  # display rotation, clockwise degrees
    conn.execute("CREATE INDEX IF NOT EXISTS idx_files_full_hash ON files(full_hash)")
    conn.commit()
    conn.close()


def get_db():
    if "db" not in g:
        g.db = connect(current_app.config["DB_PATH"])
    return g.db


def close_db(_exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()
