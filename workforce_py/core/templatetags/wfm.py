"""{% icon "queue" %}: the same Lucide line icons as the original app (components/ui.tsx)."""
from django import template
from django.utils.html import format_html_join, mark_safe

register = template.Library()

ICONS = {
    "my": ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 6v6l4 2"],
    "queue": ["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"],
    "dash": ["M3 3v18h18M18 17V9M13 17V5M8 17v-3"],
    "check": ["M20 6 9 17l-5-5"],
    "play": ["M6 3l14 9-14 9V3z"],
    "plus": ["M5 12h14M12 5v14"],
    "down": ["m6 9 6 6 6-6"],
    "left": ["m15 18-6-6 6-6"],
    "right": ["m9 18 6-6-6-6"],
    "search": ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "m21 21-4.3-4.3"],
    "calendar": ["M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M8 2v4", "M16 2v4", "M3 10h18"],
    "bcp": ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
    "requests": ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M16 13H8", "M16 17H8", "M10 9H8"],
    "bell": ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"],
    "reports": ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M12 18v-6", "m9 15 3 3 3-3"],
    "mail": ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"],
}


@register.simple_tag
def icon(name, size=18, stroke="currentColor"):
    paths = format_html_join("", '<path d="{}"/>', ((d,) for d in ICONS[name]))
    return mark_safe(
        f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{stroke}" stroke-width="1.5" '
        f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths}</svg>'
    )


@register.simple_tag
def corners():
    """The four "+" registration marks of an Industry blueprint frame."""
    return mark_safe('<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>')
