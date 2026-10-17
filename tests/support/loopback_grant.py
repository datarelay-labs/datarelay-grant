"""Run the *real* isolated Grant ASGI app on an ephemeral loopback socket.

This is technical integration qualification, NOT an installed product, public
HTTPS service or independently operated human Full User E2E.
"""

from __future__ import annotations

import socket
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import replace

import uvicorn

from grant.app import create_app


@contextmanager
def run_loopback_grant(app) -> Iterator[str]:
    address = '127.0.0.1'
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind((address, 0))
    port = sock.getsockname()[1]
    sock.listen(128)
    # Grant validates the *configured exact origin* Host header. Rebuild the
    # fixture app with its original isolated database and an exact ephemeral
    # loopback origin; never weaken or monkeypatch Grant's host protection.
    served_app = create_app(replace(
        app.state.settings, public_url=f'http://{address}:{port}',
        worker_enabled=False,
    ))
    config = uvicorn.Config(served_app, host=address, port=port, access_log=False,
                            log_level='error', lifespan='off')
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, kwargs={'sockets': [sock]}, daemon=True)
    thread.start()
    try:
        for _ in range(100):
            if server.started:
                break
            if not thread.is_alive():
                raise RuntimeError('ISOLATED_GRANT_SERVER_TERMINATED')
            time.sleep(0.02)
        else:
            raise RuntimeError('ISOLATED_GRANT_SERVER_NOT_READY')
        yield f'http://{address}:{port}'
    finally:
        server.should_exit = True
        thread.join(timeout=8)
        sock.close()
        if thread.is_alive():
            raise RuntimeError('ISOLATED_GRANT_SERVER_NOT_STOPPED')
