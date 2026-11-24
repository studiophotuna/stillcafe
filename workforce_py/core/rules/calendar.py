"""
Calendar rules (port of workforce/src/lib/calendar/engine.ts › Cal.raw and org helpers).

A read model built once per request from the database rows; every function is plain Python so
it is unit-tested without a database.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

# Code → (label, background, text colour, border); identical to calendar/constants.ts › CODES.
T = "1px solid transparent"
CODES = {
    "RTO": ("In office (RTO)", "transparent", "var(--color-neutral-800)", "1px solid var(--color-divider)"),
    "WFH": ("Work from home", "var(--color-accent-100)", "var(--color-accent-800)", "1px solid var(--color-accent-300)"),
    "VL": ("Vacation leave", "var(--color-accent-700)", "var(--color-bg)", T),
    "SL": ("Sick leave", "var(--color-accent-800)", "var(--color-bg)", T),
    "EL": ("Emergency leave", "var(--color-accent-900)", "var(--color-bg)", T),
    "HD": ("Half-day leave", "var(--color-accent-300)", "var(--color-accent-900)", T),
    "BT": ("Business trip", "transparent", "var(--color-accent-700)", "1px solid var(--color-accent-700)"),
    "HOL": ("Holiday", "var(--color-neutral-300)", "var(--color-neutral-800)", T),
    "HDY": ("Holiday duty (OT)", "var(--color-neutral-300)", "var(--color-accent-800)", "1px solid var(--color-accent-700)"),
    "RD": ("Rest day", "var(--color-neutral-200)", "var(--color-neutral-700)", T),
    "RDOT": ("Rest day OT", "var(--color-neutral-200)", "var(--color-accent-800)", "1px solid var(--color-accent-700)"),
    "ML": ("Maternity leave", "#7a2e5b", "#fff", T),
    "PL": ("Paternity leave", "#2e5b7a", "#fff", T),
    "SPL": ("Solo parent leave", "#5b4a8a", "#fff", T),
}
PEND = ("#fff4dc", "#8a5300", "1px dashed #d99a1e")
BUCKET_STYLE = {
    "morning": ("var(--color-accent-100)", "var(--color-accent-800)", "1px solid var(--color-accent-300)"),
    "mid": ("var(--color-accent-300)", "var(--color-accent-900)", T),
    "gy": ("var(--color-accent-800)", "var(--color-bg)", T),
}
WORKING = ["RTO", "WFH", "HDY", "RDOT"]
ANNUAL = ["VL", "SL", "EL", "HD", "ML", "PL", "SPL"]
LEADER_LEVELS = {"lead", "srlead", "supervisor", "manager", "director"}


@dataclass
class Node:
    id: str
    type: str
    name: str
    parent: str | None


@dataclass
class P:
    """A person as the rules see them."""

    id: int
    name: str
    level: str
    assign: list[str]
    pattern: str = "A"
    shift: str | None = None
    resign: date | None = None
    wfh_days: list[int] | None = None


@dataclass
class Req:
    id: str
    pid: int
    type: str
    start: date
    end: date
    approvals: dict


@dataclass
class Hol:
    date: date
    name: str
    scope: str


@dataclass
class Cell:
    code: str
    wk: bool
    gone: bool = False
    pending: bool = False
    note: str = ""
    shift: str | None = None


@dataclass
class Org:
    nodes: list[Node]
    by: dict[str, Node] = field(init=False)

    def __post_init__(self):
        self.by = {n.id: n for n in self.nodes}
        self._anc: dict[str, list[str]] = {}

    def anc(self, nid: str) -> list[str]:
        """The node and everything above it."""
        if nid in self._anc:
            return self._anc[nid]
        out, c, g = [], self.by.get(nid), 0
        while c and g < 10:
            out.append(c.id)
            c = self.by.get(c.parent) if c.parent else None
            g += 1
        self._anc[nid] = out
        return out

    def up(self, nid: str, typ: str) -> Node | None:
        return next((self.by[i] for i in self.anc(nid) if self.by[i].type == typ), None)

    def kids(self, nid: str, typ: str | None = None) -> list[Node]:
        return [n for n in self.nodes if n.parent == nid and (typ is None or n.type == typ)]

    def in_node(self, p: P, nid: str) -> bool:
        return any(nid in self.anc(a) for a in p.assign)

    def sub(self, nid: str) -> str:
        """"TariffPro · Consolidation": the system and trade path of an allocation."""
        names = [self.by[i].name for i in self.anc(nid) if self.by[i].type in ("system", "trade")]
        return " · ".join(reversed(names))


class Cal:
    """What each person's day shows (port of the TypeScript Cal read model)."""

    def __init__(self, org: Org, people: list[P], requests: list[Req], holidays: list[Hol], overrides: dict, roster: dict):
        self.O = org
        self.people = {p.id: p for p in people}
        self.overrides = overrides  # {(pid, date): code}
        self.roster = roster  # {(pid, date): shift id}
        self.reqs: dict[int, list[Req]] = {}
        for q in requests:
            self.reqs.setdefault(q.pid, []).append(q)
        self.hols: dict[date, list[Hol]] = {}
        for h in holidays:
            self.hols.setdefault(h.date, []).append(h)

    def shift_for(self, p: P, d: date) -> str | None:
        return self.roster.get((p.id, d)) or p.shift

    def hol_for(self, p: P, d: date) -> Hol | None:
        return next((h for h in self.hols.get(d, []) if h.scope == "all" or self.O.in_node(p, h.scope)), None)

    def find_req(self, pid: int, d: date, bid: str | None) -> Req | None:
        for q in self.reqs.get(pid, []):
            if not (q.start <= d <= q.end):
                continue
            # A team without its own say on the request shows the overall status.
            if bid and bid in q.approvals:
                if q.approvals[bid] != "declined":
                    return q
            elif any(v != "declined" for v in q.approvals.values()):
                return q
        return None

    def raw(self, p: P, d: date, bid: str | None) -> Cell:
        """Order: resigned → holiday (or holiday duty) → leave → admin override → weekend → weekly pattern."""
        wk = d.weekday() >= 5
        if p.resign and d > p.resign:
            return Cell("", wk, gone=True)
        o = self.overrides.get((p.id, d))
        if not wk:
            h = self.hol_for(p, d)
            if h:
                if o in WORKING:
                    return Cell("HDY", wk, note=h.name, shift=self.shift_for(p, d))
                return Cell("HOL", wk, note=h.name)
            q = self.find_req(p.id, d, bid)
            if q:
                pending = q.approvals.get(bid) == "pending" if bid and bid in q.approvals else any(v == "pending" for v in q.approvals.values())
                return Cell(q.type, wk, pending=pending)
        # "HOL" is a member's reply that they're off on a holiday; it means nothing on other days.
        if o and o != "HOL":
            return Cell(o, wk, shift=self.shift_for(p, d) if o in WORKING else None)
        if wk:
            return Cell("", wk)
        js_dow = (d.weekday() + 1) % 7  # 0 = Sunday, as in the TypeScript version
        if p.wfh_days is not None:
            wfh = js_dow in p.wfh_days
        else:
            wfh = js_dow in (1, 2) if p.pattern == "A" else js_dow in (4, 5)
        return Cell("WFH" if wfh else "RTO", wk, shift=self.shift_for(p, d))

    def alive(self, p: P, d: date) -> bool:
        return not p.resign or p.resign >= d


def cell_style(cell: Cell, shift_mode: bool, shifts: dict) -> tuple[str, str, str, str]:
    """(label, background, colour, border) for a grid cell."""
    sh = shifts.get(cell.shift) if cell.shift else None
    if shift_mode and sh and cell.code in ("RTO", "WFH"):
        bg, fg, bd = BUCKET_STYLE[sh.bucket]
        return sh.id, bg, fg, bd
    if not cell.code:
        return "", "transparent", "inherit", "1px solid transparent"
    if cell.pending:
        return (cell.code, *PEND)
    _, bg, fg, bd = CODES[cell.code]
    return cell.code, bg, fg, bd
