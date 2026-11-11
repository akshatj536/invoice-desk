"""System-of-record interface: vendors, POs, PO lines, invoice log.

The pipeline reads a Snapshot once per run and writes only through
`record_approved_invoice` (called by the Act stage on APPROVE).
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, field_validator

from .. import config

TABS = ["Vendors", "POs", "PO_Lines", "Invoice_Log"]

COLUMNS: dict[str, list[str]] = {
    "Vendors": ["vendor_id", "legal_name", "aliases", "tax_id", "bank_name", "bank_account", "bank_routing",
                "phone_on_file", "approved", "notes"],
    "POs": ["po_number", "vendor_id", "created_date", "currency", "total", "amount_invoiced", "status", "description"],
    "PO_Lines": ["po_number", "line_no", "sku", "description", "qty_ordered", "unit_price", "qty_received",
                 "qty_invoiced"],
    "Invoice_Log": ["run_id", "vendor_id", "vendor_name", "invoice_number", "invoice_date", "po_number", "subtotal",
                    "total", "currency", "file_hash", "lines_fingerprint", "decision", "processed_at", "note"],
}

SEED_FILES = {"Vendors": "vendors.json", "POs": "pos.json", "PO_Lines": "po_lines.json",
              "Invoice_Log": "invoice_log.json"}


def _num(v: Any) -> float:
    if v in (None, ""):
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    return float(str(v).replace(",", "").replace("$", "").strip())


class Vendor(BaseModel):
    vendor_id: str
    legal_name: str
    aliases: list[str] = []
    tax_id: str = ""
    bank_name: str = ""
    bank_account: str = ""
    bank_routing: str = ""
    phone_on_file: str = ""
    approved: bool = False
    notes: str = ""

    @field_validator("aliases", mode="before")
    @classmethod
    def _split(cls, v):
        if isinstance(v, str):
            return [a.strip() for a in v.split(";") if a.strip()]
        return v or []

    @field_validator("approved", mode="before")
    @classmethod
    def _bool(cls, v):
        return str(v).strip().upper() in {"TRUE", "YES", "Y", "1"}

    @field_validator("bank_account", "bank_routing", "tax_id", "phone_on_file", mode="before")
    @classmethod
    def _str(cls, v):
        return "" if v is None else str(v)


class PO(BaseModel):
    po_number: str
    vendor_id: str
    created_date: str = ""
    currency: str = "USD"
    total: float
    amount_invoiced: float = 0.0
    status: str = "open"
    description: str = ""

    @field_validator("total", "amount_invoiced", mode="before")
    @classmethod
    def _nums(cls, v):
        return _num(v)

    @property
    def remaining(self) -> float:
        return round(self.total - self.amount_invoiced, 2)


class POLine(BaseModel):
    po_number: str
    line_no: int
    sku: str = ""
    description: str
    qty_ordered: float
    unit_price: float
    qty_received: float = 0.0
    qty_invoiced: float = 0.0

    @field_validator("qty_ordered", "unit_price", "qty_received", "qty_invoiced", mode="before")
    @classmethod
    def _nums(cls, v):
        return _num(v)

    @field_validator("line_no", mode="before")
    @classmethod
    def _int(cls, v):
        return int(_num(v))

    @field_validator("sku", mode="before")
    @classmethod
    def _str(cls, v):
        return "" if v is None else str(v)

    @property
    def qty_remaining(self) -> float:
        return round(self.qty_ordered - self.qty_invoiced, 4)


class InvoiceLogEntry(BaseModel):
    run_id: str
    vendor_id: str
    vendor_name: str = ""
    invoice_number: str
    invoice_date: str = ""
    po_number: str = ""
    subtotal: float = 0.0
    total: float = 0.0
    currency: str = "USD"
    file_hash: str = ""
    lines_fingerprint: str = ""
    decision: str = "APPROVE"
    processed_at: str = ""
    note: str = ""

    @field_validator("subtotal", "total", mode="before")
    @classmethod
    def _nums(cls, v):
        return _num(v)

    @field_validator("invoice_number", "file_hash", "lines_fingerprint", "note", "po_number", mode="before")
    @classmethod
    def _str(cls, v):
        return "" if v is None else str(v)


class Snapshot(BaseModel):
    vendors: list[Vendor]
    pos: list[PO]
    po_lines: list[POLine]
    invoice_log: list[InvoiceLogEntry]

    def vendor(self, vendor_id: str) -> Vendor | None:
        return next((v for v in self.vendors if v.vendor_id == vendor_id), None)

    def po(self, po_number: str) -> PO | None:
        return next((p for p in self.pos if p.po_number == po_number), None)

    def lines_for(self, po_number: str) -> list[POLine]:
        return sorted((l for l in self.po_lines if l.po_number == po_number), key=lambda l: l.line_no)


class ApprovedWrite(BaseModel):
    """Everything the Act stage writes for one approved invoice. Stored with the run so a
    reviewer's later approval can execute exactly the same write."""
    log_entry: InvoiceLogEntry
    po_number: str
    amount_add: float
    line_qty_add: dict[int, float]  # po line_no -> qty billed on this invoice


def load_seed() -> dict[str, list[dict]]:
    return {tab: json.loads((config.SEED_DIR / f).read_text()) for tab, f in SEED_FILES.items()}


class Store(ABC):
    backend: str = "base"

    @abstractmethod
    def snapshot(self) -> Snapshot: ...

    @abstractmethod
    def record_approved_invoice(self, write: ApprovedWrite) -> dict:
        """Append the log row and update PO + PO lines. Must be idempotent on run_id.
        Returns a description of what changed (for the run view)."""

    @abstractmethod
    def reset(self) -> None:
        """Restore the seed data (demo reset)."""

    def sheet_url(self) -> str | None:
        return None

    # Shared helper so both backends apply identical bookkeeping rules.
    @staticmethod
    def apply_write(snap: Snapshot, write: ApprovedWrite) -> tuple[PO, list[POLine]]:
        po = snap.po(write.po_number)
        if po is None:
            raise ValueError(f"PO {write.po_number} not found")
        lines = snap.lines_for(po.po_number)
        changed_lines = []
        for l in lines:
            add = write.line_qty_add.get(l.line_no, 0)
            if add:
                l.qty_invoiced = round(l.qty_invoiced + add, 4)
                changed_lines.append(l)
        po.amount_invoiced = round(po.amount_invoiced + write.amount_add, 2)
        fully_billed_lines = all(l.qty_invoiced >= l.qty_ordered - 1e-9 for l in lines) if lines else False
        within_tolerance = po.remaining <= po.total * config.POLICY.running_total_tolerance_pct
        if fully_billed_lines or within_tolerance:
            po.status = "closed"
        return po, changed_lines
