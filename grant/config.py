"""Installation-owned settings. Secrets never belong in Git or public projections."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.fernet import Fernet


@dataclass(frozen=True)
class Settings:
    database: Path
    encryption_key: str = field(repr=False)
    public_url: str = "https://grant.invalid"
    dev_mode: bool = False
    callback_urls: tuple[str, ...] = ()
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = field(default="", repr=False)
    smtp_from: str = "grant@localhost"
    smtp_starttls: bool = True
    worker_enabled: bool = True
    session_seconds: int = 28800
    max_body_bytes: int = 65536
    max_delivery_attempts: int = 5
    web_root: Path = Path("web/dist")

    def __post_init__(self) -> None:
        Fernet(self.encryption_key.encode())
        parsed = urlsplit(self.public_url)
        if (
            not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("public_url must be an origin without credentials")
        if parsed.path not in ("", "/"):
            raise ValueError("public_url must not have a path")
        if parsed.scheme != "https" and not (
            self.dev_mode
            and parsed.scheme == "http"
            and parsed.hostname in ("localhost", "127.0.0.1", "::1", "testserver")
        ):
            raise ValueError("HTTPS required outside explicit loopback development")
        if not 1 <= self.max_delivery_attempts <= 20:
            raise ValueError("max_delivery_attempts must be between 1 and 20")
        if not 1024 <= self.max_body_bytes <= 1048576:
            raise ValueError("max_body_bytes must be between 1 KiB and 1 MiB")
        if self.session_seconds < 60 or self.session_seconds > 86400:
            raise ValueError("session_seconds outside supported bounds")
        if (
            not self.smtp_starttls
            and self.smtp_host
            and not (self.dev_mode and self.smtp_host in ("localhost", "127.0.0.1", "::1"))
        ):
            raise ValueError("SMTP TLS required outside explicit loopback development")

    @property
    def origin(self) -> str:
        return self.public_url.rstrip("/")

    @property
    def cipher(self) -> Fernet:
        return Fernet(self.encryption_key.encode())

    def seal(self, value: object) -> str:
        return self.cipher.encrypt(json.dumps(value, ensure_ascii=False).encode()).decode()

    def unseal(self, value: str) -> object:
        return json.loads(self.cipher.decrypt(value.encode()))

    @classmethod
    def load(cls, filename: str | Path) -> Settings:
        path = Path(filename)
        if path.stat().st_mode & 0o077:
            raise ValueError("configuration with secrets must be owner-readable only (0600)")
        data = json.loads(path.read_text())
        data["database"] = Path(data["database"]).expanduser().resolve()
        data["web_root"] = Path(data.get("web_root", "web/dist")).expanduser().resolve()
        data["callback_urls"] = tuple(data.get("callback_urls", []))
        return cls(**data)


def private_file(path: Path) -> None:
    """Tighten files created by this application, never system/user credentials."""
    os.chmod(path, 0o600)
