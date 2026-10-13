import os
from pathlib import Path

from flask import Flask

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
    return app
