"""
Run the app on a Windows (or Linux) server with Waitress, a production WSGI server that
works natively on Windows:

    python serve.py                 # listens on 0.0.0.0:8080
    set WFM_PORT=80 & python serve.py

Put IIS (or Nginx) in front for HTTPS, or register this as a Windows service (see README).
"""
import os

from waitress import serve

from wfm.wsgi import application

if __name__ == "__main__":
    host = os.environ.get("WFM_HOST", "0.0.0.0")
    port = int(os.environ.get("WFM_PORT", "8080"))
    print(f"Workforce Management on http://{host}:{port}/")
    serve(application, host=host, port=port, threads=int(os.environ.get("WFM_THREADS", "8")))
