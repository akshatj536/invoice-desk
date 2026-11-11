"""Small deterministic helpers shared by the stages."""

from __future__ import annotations

import re
from datetime import date
from difflib import SequenceMatcher

from ..models import ExtractedLine

_SUFFIXES = {"inc", "llc", "ltd", "co", "corp", "corporation", "company", "limited", "the", "plc", "llp", "gmbh"}


def money(x: float | None) -> str:
    if x is None:
        return "-"
    sign = "-" if x < 0 else ""
    return f"{sign}${abs(x):,.2f}"


def norm_name(s: str | None) -> str:
    s = (s or "").lower().replace("&", " and ").replace(".", "").replace("'", "")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return " ".join(t for t in s.split() if t not in _SUFFIXES)


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, norm_name(a), norm_name(b)).ratio()


def norm_po(ref: str | None) -> str | None:
    """'PO 1042', 'po#1042', 'PO-1042', '1042' -> 'PO-1042'. Free text -> None."""
    if not ref:
        return None
    m = re.fullmatch(r"\s*(?:P\.?\s*O\.?)?\s*[#:\-]?\s*(\d{3,8})\s*", ref, flags=re.I)
    return f"PO-{m.group(1)}" if m else None


def norm_sku(s: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def norm_invoice_no(s: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def digits(s: str | None) -> str:
    return re.sub(r"\D", "", s or "")


def mask(account: str | None) -> str:
    d = digits(account)
    return f"••••{d[-4:]}" if d else "-"


def parse_date(s: str | None) -> date | None:
    try:
        return date.fromisoformat((s or "").strip()[:10])
    except ValueError:
        return None


def line_amount(l: ExtractedLine) -> float:
    if l.amount is not None:
        return l.amount
    if l.quantity is not None and l.unit_price is not None:
        return round(l.quantity * l.unit_price, 2)
    return 0.0


def lines_sum(lines: list[ExtractedLine]) -> float:
    return round(sum(line_amount(l) for l in lines), 2)


def fingerprint(lines: list[ExtractedLine]) -> str:
    """Description-independent signature of the billed lines: '3x425.00|10x310.00'."""
    parts = sorted(f"{(l.quantity or 0):g}x{(l.unit_price or 0):.2f}" for l in lines)
    return "|".join(parts)


def plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"
