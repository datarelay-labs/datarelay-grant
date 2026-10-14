"""Only escaped emphasis and one-level lists. No raw HTML, links or executable syntax."""
import html
import re


def render_rich_text(text: str) -> str:
    escaped = html.escape(text, quote=True)
    escaped = re.sub(r"\*\*([^*\n]{1,500})\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"(?<!\w)_([^_\n]{1,500})_(?!\w)", r"<em>\1</em>", escaped)
    parts, in_list = [], False
    for line in escaped.split("\n"):
        bullet = line.startswith("- ")
        if bullet and not in_list:
            parts.append('<ul style="margin:8px 0;padding-left:24px">')
        elif not bullet and in_list:
            parts.append("</ul>")
        parts.append("<li>" + line[2:] + "</li>" if bullet else line + "<br>")
        in_list = bullet
    if in_list:
        parts.append("</ul>")
    return "".join(parts)
