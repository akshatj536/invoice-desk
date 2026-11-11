"""Plain-English labels for reason codes (used in stage summaries; the UI has the same catalogue)."""

LABELS = {
    "BANK_DETAILS_MISMATCH": "bank details changed",
    "VENDOR_MATH_ERROR": "vendor's maths is wrong",
    "DUPLICATE_SUSPECTED": "possible duplicate",
    "DUPLICATE_EXACT": "already paid",
    "QTY_EXCEEDS_REMAINING": "more than ordered",
    "RUNNING_TOTAL_EXCEEDS_PO": "over the PO total",
    "PRICE_OVER_TOLERANCE": "price above PO",
    "PO_INFERRED": "PO suggested, not printed",
    "PO_VENDOR_MISMATCH": "PO belongs to another vendor",
    "PO_NOT_FOUND": "no matching PO",
    "PO_CLOSED": "PO already closed",
    "CURRENCY_MISMATCH": "different currency",
    "LINE_UNMATCHED": "charge not on PO",
    "LINE_MATCH_UNCERTAIN": "line match uncertain",
    "VENDOR_NOT_APPROVED": "vendor not approved",
    "DOC_NOT_INVOICE": "not an invoice",
    "MISSING_FIELD": "missing information",
    "LOW_CONFIDENCE_FIELD": "hard to read",
    "UNREADABLE_DOCUMENT": "unreadable file",
    "SYSTEM_ERROR": "system problem",
}


def label(code: str | None) -> str:
    return LABELS.get(code or "", (code or "issue").replace("_", " ").lower())
