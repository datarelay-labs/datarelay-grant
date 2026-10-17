"""ET-2 asset upload and snapshot regression; generated in-memory raster only."""
import base64
import re
from io import BytesIO

import pytest
from PIL import Image, PngImagePlugin


def image_bytes(size=(100, 40), metadata=False):
    output = BytesIO()
    info = PngImagePlugin.PngInfo()
    if metadata:
        info.add_text("Comment", "private metadata must not survive")
    Image.new("RGB", size, (10, 30, 50)).save(output, format="PNG", pnginfo=info)
    return output.getvalue()


def test_logo_normalization_strips_metadata_and_is_content_addressed():
    from grant.email_assets import normalize_logo

    normalized = normalize_logo(base64.b64encode(image_bytes(metadata=True)).decode())
    assert normalized["media_type"] == "image/png"
    assert normalized["width"] == 100
    assert b"private metadata" not in normalized["data"]
    again = normalize_logo(base64.b64encode(normalized["data"]).decode())
    assert again["id"] == normalized["id"]


@pytest.mark.parametrize("raw", [b"<svg onload=alert(1)></svg>", b"GIF89a", b"not an image"])
def test_logo_rejects_non_raster_or_unsupported(raw):
    from grant.email_assets import normalize_logo

    with pytest.raises(ValueError):
        normalize_logo(base64.b64encode(raw).decode())


def test_logo_rejects_oversize_and_malformed():
    from grant.email_assets import normalize_logo

    for value in ("!invalid!", base64.b64encode(image_bytes((513, 40))).decode(), "A" * 350000):
        with pytest.raises(ValueError):
            normalize_logo(value)


def test_logo_upload_preview_and_reference_authority(env):
    from test_email_renderer import CONTEXT

    from grant.email_design import EmailDesign
    from grant.mail_templates import DEFAULT_EVENT_TEMPLATES

    admin = env.human("admin")
    body = {"data_base64": base64.b64encode(image_bytes()).decode()}
    assert env.human("approver").post("/api/v1/notification-assets", json=body).status_code == 403
    asset = admin.post("/api/v1/notification-assets", json=body)
    assert asset.status_code == 201, asset.text
    assert "data" not in asset.json()
    design = EmailDesign(shared_layout_revision=6, logo_asset_id=asset.json()["id"]).model_dump()
    saved = admin.post("/api/v1/notification-template-sets", json={
        "name": "Asset sample", "templates": DEFAULT_EVENT_TEMPLATES, "design": design,
    }).json()
    preview = admin.post("/api/v1/notification-template-sets/" + saved["id"] + "/preview", json={
        "event": "requested", "sample": CONTEXT,
    })
    assert preview.status_code == 200, preview.text
    rendered = preview.json()["rendered"]
    assert "data:image/png;base64," in rendered["html"]
    images = re.findall(r"<img\b[^>]*>", rendered["html"], re.IGNORECASE)
    assert len(images) == 1 and "https://" not in images[0]
    assert "DataRelay Grant" in rendered["html"]


def test_jpeg_trailing_payload_and_concatenated_images_fail_closed():
    from grant.email_assets import normalize_logo

    output = BytesIO()
    Image.new("RGB", (100, 40), (10, 30, 50)).save(output, format="JPEG", progressive=True)
    raw = output.getvalue()
    assert normalize_logo(base64.b64encode(raw).decode())["width"] == 100
    for value in (raw + b"tail", raw + raw, raw + b"ignored" + b"\xff\xd9"):
        with pytest.raises(ValueError):
            normalize_logo(base64.b64encode(value).decode())


def test_immutable_logo_validation_does_not_reencode_published_bytes(monkeypatch):
    from grant.email_assets import normalize_logo, validate_snapshot_logo

    value = normalize_logo(base64.b64encode(image_bytes()).decode())
    snapshot = {key: value[key] for key in ("id", "media_type", "width", "height")}
    snapshot["data_base64"] = base64.b64encode(value["data"]).decode()
    monkeypatch.setattr("grant.email_assets.normalize_logo", lambda *args: pytest.fail("Published bytes must not be reencoded"))
    assert validate_snapshot_logo(value["id"], snapshot) == snapshot
    with pytest.raises(ValueError):
        validate_snapshot_logo(value["id"], {**snapshot, "width": 101})
    with pytest.raises(ValueError):
        validate_snapshot_logo("0" * 64, {**snapshot, "id": "0" * 64})


def test_normalized_logo_and_cid_are_bound_in_mime_without_smtp(monkeypatch):
    import json
    from types import SimpleNamespace

    from test_email_renderer import CONTEXT

    from grant.email_assets import normalize_logo
    from grant.email_design import EmailDesign
    from grant.mail_templates import DEFAULT_EVENT_TEMPLATES, render_preview
    from grant.transport import send_email

    value = normalize_logo(base64.b64encode(image_bytes()).decode())
    logo = {key: value[key] for key in ("id", "media_type", "width", "height")}
    logo["data_base64"] = base64.b64encode(value["data"]).decode()
    rendered = render_preview({"templates": DEFAULT_EVENT_TEMPLATES, "logo": logo,
                              "design": EmailDesign(shared_layout_revision=6, logo_asset_id=value["id"]).model_dump()}, "requested", CONTEXT)
    captured = []
    opened = []

    class FakeSMTP:
        def __init__(self, *args, **kwargs):
            opened.append(True)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def ehlo(self):
            return None

        def send_message(self, message):
            captured.append(message)

    monkeypatch.setattr("grant.transport.smtplib.SMTP", FakeSMTP)
    settings = SimpleNamespace(smtp_host="example.invalid", smtp_port=25,
                               smtp_from="sample@example.invalid", smtp_starttls=False, smtp_user="")
    send_email(settings, {"email": "sample@example.invalid"}, json.dumps(rendered), "synthetic")
    assert len(captured) == 1
    parts = list(captured[0].walk())
    image = next(part for part in parts if part.get_content_type() == "image/png")
    assert image.get_payload(decode=True) == value["data"]
    cid = "grant-logo-" + value["id"] + "@grant.local"
    assert image["Content-ID"] == "<" + cid + ">"
    html = next(part for part in parts if part.get_content_type() == "text/html").get_content()
    assert 'src="cid:' + cid + '"' in html and "data:image/png" not in html
    assert next(part for part in parts if part.get_content_type() == "text/plain").get_content().rstrip() == rendered["body"].rstrip()
    bad = json.loads(json.dumps(rendered))
    bad["inline_images"][0]["cid"] = "untrusted@example.invalid"
    with pytest.raises(ValueError):
        send_email(settings, {"email": "sample@example.invalid"}, json.dumps(bad), "invalid")
    assert len(opened) == 1


def test_published_logo_preview_uses_snapshot_not_current_asset_table(env):
    import json

    from test_email_publication import publish

    from grant.email_design import EmailDesign
    from grant.mail_templates import DEFAULT_EVENT_TEMPLATES

    admin = env.human("admin")
    data = {"data_base64": base64.b64encode(image_bytes(metadata=True)).decode()}
    first = admin.post("/api/v1/notification-assets", json=data)
    assert first.status_code == 201
    assert admin.post("/api/v1/notification-assets", json=data).json()["id"] == first.json()["id"]
    ident = first.json()["id"]
    assert admin.get("/api/v1/notification-assets/" + ident).json()["immutable"] is True
    assert env.human("approver").get("/api/v1/notification-assets/" + ident).status_code == 403
    template = admin.post("/api/v1/notification-template-sets", json={
        "name": "Immutable logo", "templates": DEFAULT_EVENT_TEMPLATES,
        "design": EmailDesign(shared_layout_revision=6, logo_asset_id=ident).model_dump(),
    })
    assert template.status_code == 201, template.text
    prefix = "/api/v1/notification-template-sets/" + template.json()["id"]
    assert publish(admin, template.json()["id"]).status_code == 200
    before = admin.get(prefix + "/versions/1/preview")
    assert before.status_code == 200, before.text
    with env.db.transaction() as conn:
        value = json.loads(conn.execute("SELECT snapshot FROM email_template_revisions WHERE template_id=?", (template.json()["id"],)).fetchone()[0])
        assert value["logo"]["id"] == ident
        # Disposable test DB only: prove the immutable publication is self-contained.
        conn.execute("DELETE FROM notification_assets WHERE id=?", (ident,))
    after = admin.get(prefix + "/versions/1/preview")
    assert after.status_code == 200
    assert before.json() == after.json()
    assert ident in after.json()["rendered"]["inline_images"][0]["cid"]


@pytest.mark.parametrize("revision", [1, 2, 3, 4, 5])
def test_uploaded_logo_cannot_reinterpret_old_layouts(revision):
    from grant.email_design import EmailDesign

    with pytest.raises(ValueError):
        EmailDesign(shared_layout_revision=revision, logo_asset_id="a" * 64)


def test_crc_trailing_payload_and_animated_png_are_rejected():
    import struct
    import zlib

    from grant.email_assets import normalize_logo

    raw = image_bytes()
    bad_crc = raw[:29] + bytes([raw[29] ^ 255]) + raw[30:]
    animation = b"acTL" + struct.pack(">II", 2, 0)
    chunk = struct.pack(">I", 8) + animation + struct.pack(">I", zlib.crc32(animation))
    for value in (bad_crc, raw + b"payload", raw[:33] + chunk + raw[33:]):
        with pytest.raises(ValueError):
            normalize_logo(base64.b64encode(value).decode())


@pytest.mark.parametrize("revision", [1, 2, 3, 4, 5])
def test_old_design_responses_do_not_gain_new_logo_width_defaults(revision):
    from grant.email_design import EmailDesign

    assert "logo_width" not in EmailDesign(shared_layout_revision=revision).model_dump()
    assert EmailDesign(shared_layout_revision=6).model_dump()["logo_width"] == 160
