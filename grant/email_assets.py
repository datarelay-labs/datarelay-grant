"""Bounded local PNG/JPEG normalization; never fetch or trust caller asset IDs."""
import base64
import binascii
import hashlib
import struct
import warnings
import zlib
from io import BytesIO

from PIL import Image
from pydantic import BaseModel, ConfigDict, Field


class LogoUpload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    data_base64: str = Field(min_length=1, max_length=43692)


MAX_LOGO_BYTES = 32 * 1024
MAX_NORMALIZED_LOGO_BYTES = 32 * 1024
MAX_LOGO_DIMENSION = 512
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _bounded_png(raw: bytes) -> bytes:
    offset, chunks, ended = len(PNG_SIGNATURE), [], False
    while offset < len(raw):
        if offset + 12 > len(raw):
            raise ValueError("Truncated PNG structure")
        length = int.from_bytes(raw[offset:offset + 4], "big")
        end = offset + 12 + length
        if end > len(raw):
            raise ValueError("Invalid PNG chunk length")
        kind = raw[offset + 4:offset + 8]
        data = raw[offset + 8:end - 4]
        crc = int.from_bytes(raw[end - 4:end], "big")
        if zlib.crc32(kind + data) & 0xFFFFFFFF != crc:
            raise ValueError("Invalid PNG checksum")
        if not chunks and (kind != b"IHDR" or length != 13):
            raise ValueError("PNG header is required first")
        if kind == b"IHDR":
            if chunks:
                raise ValueError("Duplicate PNG header")
            width, height = struct.unpack(">II", data[:8])
            if not 1 <= width <= MAX_LOGO_DIMENSION or not 1 <= height <= MAX_LOGO_DIMENSION:
                raise ValueError("Logo dimensions must not exceed 512 x 512 pixels")
        if kind in (b"acTL", b"fcTL", b"fdAT"):
            raise ValueError("Animated images are not supported")
        if kind in (b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS"):
            chunks.append(raw[offset:end])
        elif kind[0] & 32 == 0:
            raise ValueError("Unsupported critical PNG chunk")
        # Other ancillary chunks are deliberately not passed to a decoder.
        if kind == b"IEND":
            if length or end != len(raw):
                raise ValueError("PNG trailing payload is not permitted")
            ended = True
            break
        offset = end
    if not ended:
        raise ValueError("PNG end marker is required")
    return PNG_SIGNATURE + b"".join(chunks)


def _complete_jpeg(raw: bytes) -> None:
    """Require one bounded JPEG marker stream, not a valid prefix plus payload."""
    if not raw.startswith(b"\xff\xd8"):
        raise ValueError("Only PNG or JPEG images are supported")
    offset, scanned = 2, False
    while offset < len(raw):
        if raw[offset] != 0xFF:
            raise ValueError("Malformed JPEG marker")
        while offset < len(raw) and raw[offset] == 0xFF:
            offset += 1
        if offset >= len(raw):
            break
        marker = raw[offset]
        offset += 1
        if marker == 0xD9:
            if not scanned or offset != len(raw):
                raise ValueError("JPEG trailing payload is not permitted")
            return
        if marker in (0, 0xD8) or 0xD0 <= marker <= 0xD7:
            raise ValueError("Unexpected JPEG marker")
        if marker == 1:
            continue
        if offset + 2 > len(raw):
            break
        length = int.from_bytes(raw[offset:offset + 2], "big")
        if length < 2 or offset + length > len(raw):
            raise ValueError("Invalid JPEG segment length")
        offset += length
        if marker == 0xDA:
            scanned = True
            while offset < len(raw):
                if raw[offset] != 0xFF:
                    offset += 1
                    continue
                start = offset
                while offset < len(raw) and raw[offset] == 0xFF:
                    offset += 1
                if offset == len(raw):
                    break
                if raw[offset] == 0 or 0xD0 <= raw[offset] <= 0xD7:
                    offset += 1
                    continue
                offset = start
                break
    raise ValueError("JPEG end marker is required")


def normalize_logo(encoded: str) -> dict:
    if not isinstance(encoded, str) or not encoded or len(encoded) > 4 * ((MAX_LOGO_BYTES + 2) // 3):
        raise ValueError("Logo data exceeds the bounded upload size")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Logo must be canonical base64 image bytes") from exc
    if not raw or len(raw) > MAX_LOGO_BYTES:
        raise ValueError("Logo input must not exceed 32 KiB")
    if raw.startswith(PNG_SIGNATURE):
        raw = _bounded_png(raw)
    else:
        _complete_jpeg(raw)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw), formats=["PNG", "JPEG"]) as source:
                width, height = source.size
                if not 1 <= width <= MAX_LOGO_DIMENSION or not 1 <= height <= MAX_LOGO_DIMENSION:
                    raise ValueError("Logo dimensions must not exceed 512 x 512 pixels")
                if getattr(source, "n_frames", 1) != 1:
                    raise ValueError("Animated images are not supported")
                source.load()
                rgba = source.convert("RGBA")
                # Do not carry EXIF, ICC, textual or arbitrary decoder metadata.
                clean = Image.frombytes("RGBA", source.size, rgba.tobytes())
                output = BytesIO()
                clean.save(output, format="PNG", compress_level=9, optimize=False)
                data = output.getvalue()
    except (OSError, SyntaxError, Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise ValueError("The bounded raster image could not be decoded") from exc
    if len(data) > MAX_NORMALIZED_LOGO_BYTES:
        raise ValueError("Normalized logo exceeds 32 KiB; use a smaller image")
    return {"id": hashlib.sha256(data).hexdigest(), "media_type": "image/png",
            "width": width, "height": height, "data": data}


def snapshot_logo(conn, template: dict) -> dict:
    """Bind immutable normalized bytes before saving a publication or previewing."""
    ident = (template.get("design") or {}).get("logo_asset_id")
    if not ident:
        return template
    from .errors import GrantError

    row = conn.execute("SELECT id,media_type,width,height,data FROM notification_assets WHERE id=?", (ident,)).fetchone()
    if not row:
        raise GrantError("NOTIFICATION_ASSET_NOT_FOUND", 422)
    logo = {key: row[key] for key in ("id", "media_type", "width", "height")}
    logo["data_base64"] = base64.b64encode(row["data"]).decode("ascii")
    validate_snapshot_logo(ident, logo)
    return {**template, "logo": logo}


def validate_snapshot_logo(ident: str, logo: object) -> dict:
    if not isinstance(logo, dict) or set(logo) != {"id", "media_type", "width", "height", "data_base64"}:
        raise ValueError("Immutable logo snapshot is required")
    if logo["id"] != ident or logo["media_type"] != "image/png":
        raise ValueError("Immutable logo identity differs")
    encoded = logo["data_base64"]
    if not isinstance(encoded, str) or len(encoded) > 43692:
        raise ValueError("Immutable logo exceeds its byte budget")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("Invalid immutable logo encoding") from exc
    if (not raw.startswith(PNG_SIGNATURE) or len(raw) > MAX_NORMALIZED_LOGO_BYTES
            or hashlib.sha256(raw).hexdigest() != ident
            or base64.b64encode(raw).decode("ascii") != encoded or _bounded_png(raw) != raw):
        raise ValueError("Immutable logo bytes or identity differ")
    width, height = struct.unpack(">II", raw[16:24])
    if (raw[24:29] != bytes((8, 6, 0, 0, 0))
            or any(type(logo[key]) is not int for key in ("width", "height"))
            or (width, height) != (logo["width"], logo["height"])):
        raise ValueError("Immutable normalized RGBA dimensions differ")
    # Validate the stored PNG, but never regenerate historical pixel bytes.
    try:
        with Image.open(BytesIO(raw), formats=["PNG"]) as image:
            image.verify()
    except (OSError, SyntaxError) as exc:
        raise ValueError("Immutable PNG is invalid") from exc
    return dict(logo)


def upload_logo(core, actor, encoded: str) -> dict:
    import time

    from .auth import require_current_authority
    from .db import audit
    from .errors import GrantError

    actor.require_admin()
    with core.db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
    try:
        logo = normalize_logo(encoded)
    except ValueError as exc:
        raise GrantError("NOTIFICATION_ASSET_INVALID", 422) from exc
    with core.db.transaction() as conn:
        require_current_authority(conn, actor)
        previous = conn.execute("SELECT data FROM notification_assets WHERE id=?", (logo["id"],)).fetchone()
        if previous:
            if previous["data"] != logo["data"]:
                raise GrantError("NOTIFICATION_ASSET_INTEGRITY", 409)
        else:
            if conn.execute("SELECT COUNT(*) FROM notification_assets").fetchone()[0] >= 512:
                raise GrantError("NOTIFICATION_ASSET_CAPACITY", 409)
            conn.execute("INSERT INTO notification_assets VALUES(?,?,?,?,?,?,?)", (
                logo["id"], logo["media_type"], logo["width"], logo["height"], logo["data"], actor.id, time.time(),
            ))
            audit(conn, None, actor.id, "notification.asset_uploaded", {"asset_id": logo["id"], "bytes": len(logo["data"])})
    return {key: logo[key] for key in ("id", "media_type", "width", "height")} | {"bytes": len(logo["data"]), "immutable": True}


def read_logo(core, actor, ident: str) -> dict:
    from .auth import require_current_authority
    from .errors import GrantError

    actor.require_admin()
    with core.db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        row = conn.execute("SELECT id,media_type,width,height,data FROM notification_assets WHERE id=?", (ident,)).fetchone()
        if not row:
            raise GrantError("NOTIFICATION_ASSET_NOT_FOUND", 404)
        value = {key: row[key] for key in ("id", "media_type", "width", "height")}
        value["data_base64"] = base64.b64encode(row["data"]).decode("ascii")
        return {**validate_snapshot_logo(ident, value), "immutable": True}


def mail_inline_logo(images: object, html: str) -> tuple[str, list[dict]]:
    """Bind exactly one trusted inline PNG to its deterministic CID before SMTP."""
    if images is None or images == []:
        return html, []
    if not isinstance(images, list) or len(images) != 1 or not isinstance(images[0], dict):
        raise ValueError("Only one immutable logo attachment is supported")
    image = images[0]
    if set(image) != {"id", "media_type", "width", "height", "data_base64", "cid"}:
        raise ValueError("Invalid inline logo metadata")
    logo = validate_snapshot_logo(image["id"], {key: value for key, value in image.items() if key != "cid"})
    cid = "grant-logo-" + logo["id"] + "@grant.local"
    if image["cid"] != cid:
        raise ValueError("Inline logo CID does not match its content identity")
    import re

    expected_data = "data:image/png;base64," + logo["data_base64"]
    expected_cid = "cid:" + cid
    matches = list(re.finditer(r'<img\b[^>]*\bsrc="([^"<>]+)"[^>]*>', html, re.IGNORECASE))
    if len(matches) != 1 or matches[0][1] not in (expected_data, expected_cid):
        raise ValueError("The rendered logo does not match its MIME attachment")
    match = matches[0]
    html = html[:match.start(1)] + expected_cid + html[match.end(1):]
    return html, [{"cid": cid, "data": base64.b64decode(logo["data_base64"], validate=True)}]
