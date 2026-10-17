"""Read-only notification-template inventory detail projections."""
from .auth import require_current_authority
from .errors import GrantError


def template_usage(core, actor, ident: str, limit: int, offset: int) -> dict:
    actor.require_admin()
    with core.db.transaction(write=False) as conn:
        require_current_authority(conn, actor)
        if not conn.execute("SELECT 1 FROM email_templates WHERE id=?", (ident,)).fetchone():
            raise GrantError("EMAIL_TEMPLATE_NOT_FOUND", 404)
        total = conn.execute(
            "SELECT COUNT(*) FROM profile_versions WHERE lifecycle='ACTIVE' AND email_template_id=?",
            (ident,),
        ).fetchone()[0]
        policies = [dict(row) for row in conn.execute(
            """SELECT id,profile_id,version,name,lifecycle,updated_at
               FROM profile_versions
               WHERE lifecycle='ACTIVE' AND email_template_id=?
               ORDER BY name,profile_id,version,id LIMIT ? OFFSET ?""",
            (ident, limit, offset),
        ).fetchall()]
    return {"template_id": ident, "total": total, "offset": offset, "limit": limit,
            "has_more": offset + len(policies) < total, "policies": policies}
