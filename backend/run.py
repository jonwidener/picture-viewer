import os
import sys

from pv import create_app

app = create_app()
port = int(os.environ.get("PV_PORT", 5057))

if __name__ == "__main__":
    if "--prod" in sys.argv:
        from waitress import serve

        serve(app, host="0.0.0.0", port=port, threads=8)
    else:
        app.run(host="0.0.0.0", port=port, threaded=True)
