import os
from pathlib import Path

from flask import Flask, abort, send_from_directory

from . import db


def create_app():
    app = Flask(__name__)
    data_dir = Path(os.environ.get("PV_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
    (data_dir / "cache").mkdir(parents=True, exist_ok=True)
    app.config["DATA_DIR"] = data_dir
    app.config["CACHE_DIR"] = data_dir / "cache"
    app.config["DB_PATH"] = data_dir / "picviewer.db"
    db.init_db(app.config["DB_PATH"])
    app.teardown_appcontext(db.close_db)

    from .api import bp

    app.register_blueprint(bp, url_prefix="/api")

    # Single-process mode: serve the built frontend (frontend/dist) if it exists.
    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if dist.is_dir():
        @app.get("/", defaults={"path": ""})
        @app.get("/<path:path>")
        def spa(path):
            if path.startswith("api/"):
                abort(404)
            return send_from_directory(dist, path if path and (dist / path).is_file() else "index.html")
    return app
