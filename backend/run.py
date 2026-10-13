import os

from pv import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PV_PORT", 5057)), threaded=True)
