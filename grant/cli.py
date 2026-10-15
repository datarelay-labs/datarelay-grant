"""Local installation lifecycle. No production or remote-system administration."""

import argparse
import getpass
import json
import os
import sqlite3
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.fernet import Fernet

from .auth import Auth
from .config import Settings
from .db import CURRENT_SCHEMA_VERSION, Database
from .errors import GrantError
from .models import NewUser


def refuse_storage(operation: str, error: Exception) -> None:
    """Fail closed without dumping internal stack traces or private storage paths.

    Existing validation errors are static, bounded operator reasons. Unexpected
    filesystem / SQLite errors are deliberately generalized; no repair, retry,
    restore publication or recovery acknowledgment is performed.
    """
    reason = (
        str(error)
        if isinstance(error, ValueError)
        else "Invalid or inaccessible protected SQLite storage"
    )
    raise SystemExit(f"{operation}_REFUSED: {reason}") from None


def refuse_configuration(command: str, error: Exception) -> None:
    """Return bounded operator guidance for installation configuration failures."""
    operation = command.replace("-", "_").upper()
    if isinstance(error, FileNotFoundError):
        reason = (
            "Installation configuration is missing; use --config PATH or create "
            "the default .dev/config.json with grant init"
        )
    elif isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError):
        reason = str(error)
    else:
        reason = "Invalid or inaccessible installation configuration"
    raise SystemExit(f"{operation}_REFUSED: {reason}") from None


def main():
    parser = argparse.ArgumentParser(description="DataRelay Grant single-installation CLI")
    parser.add_argument(
        "--config",
        default=".dev/config.json",
        help="Installation configuration path (default: .dev/config.json)",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser(
        "init",
        help="Create a new protected installation configuration",
        description=(
            "Create a new protected installation configuration. "
            "This does not create users or a database."
        ),
    )
    init.add_argument("--origin", default="http://127.0.0.1:8794")
    init.add_argument("--dev", action="store_true")
    user = sub.add_parser(
        "user-add",
        help="Create a local user account",
        description=(
            "Create a local user account in an existing installation. "
            "The password is prompted twice without echo."
        ),
    )
    user.add_argument("--username", required=True)
    user.add_argument("--email", required=True)
    user.add_argument("--role", choices=["admin", "member"], default="member")
    sub.add_parser(
        "serve",
        help="Serve Grant on the configured loopback port",
        description=(
            "Serve Grant on 127.0.0.1 using the configured origin port. "
            "TLS/reverse-proxy exposure is deployment-operator owned."
        ),
    )
    backup = sub.add_parser(
        "backup",
        help="Create a private SQLite backup at a new path",
        description=(
            "Create a private SQLite backup of existing installation state at a NEW path. "
            "This does not upgrade the database."
        ),
    )
    backup.add_argument("--output", type=Path, required=True)
    restore = sub.add_parser(
        "restore",
        help="Restore a backup into a new paused database",
        description=(
            "Restore a validated backup into a NEW database. "
            "Sessions are cleared and delivery/consumption remains PAUSED."
        ),
    )
    restore.add_argument("--input", type=Path, required=True)
    restore.add_argument("--output", type=Path, required=True)
    sub.add_parser(
        "check",
        help="Inspect existing installation health without mutation",
        description=(
            "Inspect existing database/schema/recovery-pause/SMTP state without "
            "initializing or migrating installation state."
        ),
    )
    resume = sub.add_parser(
        "recovery-resume",
        help="Resume a restored installation after external reconciliation",
        description=(
            "Resume a restored installation only after external reconciliation. "
            "Acknowledged resume cancels restored open requests and marks unfinished "
            "committed executions UNKNOWN."
        ),
    )
    resume.add_argument(
        "--acknowledge-external-reconciliation",
        action="store_true",
        help=(
            "Confirm external reconciliation; restored open requests are cancelled "
            "and unfinished committed executions become UNKNOWN"
        ),
    )
    args = parser.parse_args()
    os.umask(0o077)
    config = Path(args.config).resolve()
    if args.command == "init":
        data = {
            "database": str(config.parent / "grant.sqlite"),
            "encryption_key": Fernet.generate_key().decode(),
            "public_url": args.origin,
            "dev_mode": args.dev,
            "callback_urls": [],
        }
        try:
            Settings(**{**data, "database": Path(data["database"])})
            config.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with config.open("x") as output:
                json.dump(data, output, indent=2)
        except FileExistsError:
            raise SystemExit("INIT_REFUSED: Configuration already exists") from None
        except ValueError as exc:
            refuse_configuration("init", exc)
        except OSError:
            raise SystemExit("INIT_REFUSED: Unable to create protected configuration") from None
        print("Configuration created. No users, integrations or external credentials created.")
        return
    try:
        settings = Settings.load(config)
    except (FileNotFoundError, json.JSONDecodeError, KeyError, TypeError, ValueError, OSError) as exc:
        refuse_configuration(args.command, exc)
    if args.command == "restore":
        try:
            Database.restore(args.input, args.output)
        except (ValueError, OSError, sqlite3.DatabaseError) as exc:
            refuse_storage("RESTORE", exc)
        print("Restored NEW database; sessions cleared; delivery/consumption PAUSED.")
        print("Reconcile external effects and configure the new database before resuming.")
        return
    # Inspection and pre-upgrade backup may NOT bootstrap a missing database or
    # silently migrate old authorization state before a protected snapshot.
    if args.command == "check":
        try:
            version, paused = Database.inspect_existing(settings.database)
        except (ValueError, OSError, sqlite3.DatabaseError) as exc:
            refuse_storage("CHECK", exc)
        if version != CURRENT_SCHEMA_VERSION:
            raise SystemExit("SCHEMA_UPGRADE_REQUIRED: backup first; check does not migrate")
        print("DATABASE=ok")
        print("PAUSED=" + paused)
        print("SMTP=" + ("CONFIGURED" if settings.smtp_host else "NOT_CONFIGURED"))
        return
    if args.command == "backup":
        try:
            Database.backup_existing(settings.database, args.output)
        except (ValueError, OSError, sqlite3.DatabaseError) as exc:
            refuse_storage("BACKUP", exc)
        print("Backup created. Protect the installation encryption key separately.")
        return
    db = Database(settings.database)
    if args.command == "user-add":
        password = getpass.getpass("New password (8+ chars; uppercase, number, special): ")
        if password != getpass.getpass("Confirm password: "):
            raise SystemExit("Passwords do not match")
        draft = NewUser(username=args.username, email=args.email, password=password, role=args.role)
        user = Auth(db, settings).create_user(
            draft.username, draft.email, draft.password, draft.role
        )
        print("Created local account:", user["username"])
    elif args.command == "recovery-resume":
        from .core import Core

        try:
            result = Core(db, settings).resume_after_restore(
                acknowledged=args.acknowledge_external_reconciliation
            )
        except GrantError as exc:
            raise SystemExit(f"RECOVERY_RESUME_REFUSED: {exc.code}") from None
        print(json.dumps(result))
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
