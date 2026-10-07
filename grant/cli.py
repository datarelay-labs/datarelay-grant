"""Local installation lifecycle. No production or remote-system administration."""

import argparse
import getpass
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.fernet import Fernet

from .auth import Auth
from .config import Settings
from .db import Database
from .models import NewUser


def main():
    parser = argparse.ArgumentParser(description="DataRelay Grant single-installation CLI")
    parser.add_argument("--config", default=".dev/config.json")
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init")
    init.add_argument("--origin", default="http://127.0.0.1:8794")
    init.add_argument("--dev", action="store_true")
    user = sub.add_parser("user-add")
    user.add_argument("--username", required=True)
    user.add_argument("--email", required=True)
    user.add_argument("--role", choices=["admin", "member"], default="member")
    sub.add_parser("serve")
    backup = sub.add_parser("backup")
    backup.add_argument("--output", type=Path, required=True)
    restore = sub.add_parser("restore")
    restore.add_argument("--input", type=Path, required=True)
    restore.add_argument("--output", type=Path, required=True)
    sub.add_parser("check")
    resume = sub.add_parser("recovery-resume")
    resume.add_argument("--acknowledge-external-reconciliation", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    config = Path(args.config).resolve()
    if args.command == "init":
        config.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        data = {
            "database": str(config.parent / "grant.sqlite"),
            "encryption_key": Fernet.generate_key().decode(),
            "public_url": args.origin,
            "dev_mode": args.dev,
            "callback_urls": [],
            "web_root": str(Path("web/dist").resolve()),
        }
        Settings(**{**data, "database": Path(data["database"])})
        with config.open("x") as output:
            json.dump(data, output, indent=2)
        print("Configuration created. No users, integrations or external credentials created.")
        return
    settings = Settings.load(config)
    if args.command == "restore":
        Database.restore(args.input, args.output)
        print("Restored NEW database; sessions cleared; delivery/consumption PAUSED.")
        print("Reconcile external effects and configure the new database before resuming.")
        return
    db = Database(settings.database)
    if args.command == "user-add":
        password = getpass.getpass("New password (12+ characters): ")
        if password != getpass.getpass("Confirm password: "):
            raise SystemExit("Passwords do not match")
        draft = NewUser(username=args.username, email=args.email, password=password, role=args.role)
        user = Auth(db, settings).create_user(
            draft.username, draft.email, draft.password, draft.role
        )
        print("Created local account:", user["username"])
    elif args.command == "backup":
        db.backup(args.output)
        print("Backup created. Protect the installation encryption key separately.")
    elif args.command == "recovery-resume":
        from .core import Core

        result = Core(db, settings).resume_after_restore(
            acknowledged=args.acknowledge_external_reconciliation
        )
        print(json.dumps(result))
    elif args.command == "check":
        with db.transaction(write=False) as conn:
            print("DATABASE=" + conn.execute("PRAGMA quick_check").fetchone()[0])
            print(
                "PAUSED="
                + conn.execute("SELECT value FROM runtime WHERE key='paused'").fetchone()[0]
            )
        print("SMTP=" + ("CONFIGURED" if settings.smtp_host else "NOT_CONFIGURED"))
    elif args.command == "serve":
        import uvicorn

        from .app import create_app

        parsed = urlsplit(settings.origin)
        # Always loopback; an explicitly configured TLS reverse proxy is separate.
        uvicorn.run(
            create_app(settings),
            host="127.0.0.1",
            port=parsed.port or 8794,
            access_log=False,
            proxy_headers=False,
        )


if __name__ == "__main__":
    main()
