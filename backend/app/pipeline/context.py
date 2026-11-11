"""Mutable state carried through one run of the pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from ..models import CheckResult, InvoiceExtraction, Outcome
from ..store import PO, ApprovedWrite, Snapshot, Store, Vendor


@dataclass
class RunContext:
    run_id: str
    pdf_path: Path
    filename: str
    store: Store

    pdf_bytes: bytes = b""
    file_hash: str = ""
    kind: str = ""                         # "digital" | "scanned"
    snapshot: Snapshot | None = None

    extraction: InvoiceExtraction | None = None
    math_ok: bool = True                   # False -> amount-based checks are skipped

    vendor: Vendor | None = None
    po: PO | None = None
    po_inferred: bool = False              # PO chosen by suggestion, not printed on the invoice
    pairs: list[dict] = field(default_factory=list)
    billed_subtotal: float | None = None

    checks: list[CheckResult] = field(default_factory=list)
    decision: Outcome | None = None
    reason_codes: list[str] = field(default_factory=list)
    approved_write: ApprovedWrite | None = None

    explanation: str = ""
    next_action: str = ""
    halted: str | None = None              # set when downstream stages cannot meaningfully run
    progress: Callable[[str], None] = lambda msg: None   # sub-step notes for the live view

    def fails(self):
        return [c for c in self.checks if c.status == "fail"]
