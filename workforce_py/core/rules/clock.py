"""
Time helpers (port of workforce/src/lib/workload/clock.ts).

All display is in team-local time: Manila, UTC+8, no daylight saving. In sample-data mode the
clock starts at the design's reference moment (Thu 24 Sep 2026 10:30) and runs forward in real
time, so the sample screens always look the same. Saved data uses the real clock.
"""
from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone
from typing import Callable, Union

TZ = timezone(timedelta(hours=8), "Asia/Manila")
H = timedelta(hours=1)
DAY = timedelta(days=1)
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]  # Python weekday() order

_LOADED_AT = time.time()


def now() -> datetime:
    from django.conf import settings

    if settings.WFM_DEMO:
        base = datetime.fromisoformat(settings.WFM_DEMO_CLOCK).replace(tzinfo=TZ)
        return base + timedelta(seconds=time.time() - _LOADED_AT)
    return datetime.now(TZ)


def local(dt: datetime) -> datetime:
    return dt.astimezone(TZ)


def day_key(dt: datetime) -> str:
    return local(dt).date().isoformat()


def local_hour(dt: datetime) -> float:
    d = local(dt)
    return d.hour + d.minute / 60


def day_start(dt: datetime) -> datetime:
    d = local(dt)
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


def weekend(dt: datetime) -> bool:
    return local(dt).weekday() >= 5


def fmt_t(dt: datetime) -> str:
    """"Thu 24 Sep, 10:30\""""
    d = local(dt)
    return f"{DOW[d.weekday()]} {d.day} {MON[d.month - 1]}, {d:%H:%M}"


def fmt_s(dt: datetime, ref: datetime) -> str:
    """"Today 10:30" or "23 Sep 14:05\""""
    d = local(dt)
    head = "Today" if day_key(dt) == day_key(ref) else f"{d.day} {MON[d.month - 1]}"
    return f"{head} {d:%H:%M}"


def fmt_day(d: date) -> str:
    """"Tue 1 Sep\""""
    return f"{DOW[d.weekday()]} {d.day} {MON[d.month - 1]}"


def dur(td: timedelta) -> str:
    """"1d 1h 47m", "2h 5m" or "45m\""""
    ms = max(0, int(td.total_seconds()))
    dd, rest = divmod(ms, 86400)
    h, rest = divmod(rest, 3600)
    m = rest // 60
    return f"{dd}d {h}h {m}m" if dd else f"{h}h {m}m" if h else f"{m}m"


def fmt_min(minutes: float) -> str:
    m = round(minutes)
    return f"{m // 60}h {m % 60}m" if m >= 60 else f"{m} min"


OffDays = Union[bool, Callable[[datetime], bool]]


def _off_fn(skip: OffDays):
    if callable(skip):
        return skip
    return weekend if skip else None


def add_hours(start: datetime, hours: float, skip: OffDays) -> datetime:
    """`start` plus `hours`, skipping whole days that are off (team time)."""
    off = _off_fn(skip)
    left = timedelta(hours=hours)
    if not off:
        return start + left
    t = start
    for _ in range(2000):
        end = day_start(t) + DAY
        if off(t):
            t = end
            continue
        if t + left <= end:
            return t + left
        left -= end - t
        t = end
    return t + left


def span(a: datetime, b: datetime, skip: OffDays) -> timedelta:
    """Time between a and b (0 if b <= a), not counting days that are off."""
    if b <= a:
        return timedelta(0)
    off = _off_fn(skip)
    if not off:
        return b - a
    total = timedelta(0)
    t = a
    for _ in range(2000):
        if t >= b:
            break
        end = min(b, day_start(t) + DAY)
        if not off(t):
            total += end - t
        t = end
    return total
