"""Shared data shapes.

Two families:
  * Schemas the model fills in (extraction, line pairing, PO suggestion, explanation).
    These are passed to Gemini as `response_schema`, so they stay simple: no dicts.
  * Records the pipeline produces (check results, stage outputs).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Confidence = Literal["high", "medium", "low"]
DocType = Literal["invoice", "credit_note", "proforma", "statement", "quote", "receipt", "other"]
Outcome = Literal["APPROVE", "HOLD", "REJECT"]
CheckStatus = Literal["pass", "warn", "fail", "skip"]


# --------------------------------------------------------------------------
# Model-filled schemas
# --------------------------------------------------------------------------
class ExtractedLine(BaseModel):
    sku: str | None = Field(None, description="Item code / SKU / part number exactly as printed, or null")
    description: str = Field(description="Line description as printed")
    quantity: float | None = Field(None, description="Quantity as printed")
    unit_price: float | None = Field(None, description="Unit price as printed, before tax")
    amount: float | None = Field(None, description="Line amount as printed")


class FieldConfidence(BaseModel):
    vendor_name: Confidence
    invoice_number: Confidence
    invoice_date: Confidence
    po_reference: Confidence
    bank_details: Confidence
    line_items: Confidence
    totals: Confidence


class InvoiceExtraction(BaseModel):
    doc_type: DocType = Field(description="What kind of document this is")
    vendor_name: str | None = Field(None, description="Legal name of the company issuing the document")
    vendor_tax_id: str | None = None
    vendor_phone: str | None = None
    bank_account_number: str | None = Field(None, description="Remit-to bank account number, digits as printed")
    bank_routing_number: str | None = Field(None, description="Remit-to routing / ABA / sort code, as printed")
    invoice_number: str | None = None
    invoice_date: str | None = Field(None, description="ISO format YYYY-MM-DD")
    due_date: str | None = Field(None, description="ISO format YYYY-MM-DD")
    po_reference: str | None = Field(None, description="Purchase order number exactly as printed, or null if none is printed")
    currency: str | None = Field(None, description="ISO 4217 code, e.g. USD")
    line_items: list[ExtractedLine] = Field(default_factory=list)
    subtotal: float | None = Field(None, description="Subtotal exactly as printed (do not recompute)")
    tax_amount: float | None = Field(None, description="Tax exactly as printed, or null if none")
    tax_inclusive: bool | None = Field(None, description="True if line prices already include tax")
    total: float | None = Field(None, description="Total amount due exactly as printed (do not recompute)")
    confidence: FieldConfidence
    reader_notes: str | None = Field(None, description="Anything unusual: smudged digits, handwritten edits, notices to the customer")


class LinePair(BaseModel):
    invoice_line: int = Field(description="1-based index of the invoice line")
    po_line: int | None = Field(None, description="PO line_no it corresponds to, or null if no PO line is the same item")
    confidence: Confidence
    reason: str = Field(description="One short sentence")


class LinePairing(BaseModel):
    pairs: list[LinePair]


class POSuggestion(BaseModel):
    po_number: str | None = Field(None, description="One of the candidate PO numbers, or null if none fits")
    confidence: Confidence
    reason: str


class Explanation(BaseModel):
    summary: str = Field(description="2-3 plain-English sentences for an AP clerk")
    next_action: str = Field(description="One imperative sentence: what the clerk should do next")


# --------------------------------------------------------------------------
# Pipeline records
# --------------------------------------------------------------------------
class CheckResult(BaseModel):
    id: str                       # e.g. "reconcile.price"
    stage: str
    label: str                    # short human label, e.g. "Unit prices within tolerance"
    status: CheckStatus
    on_fail: Literal["HOLD", "REJECT"] = "HOLD"
    reason_code: str | None = None
    message: str = ""
    evidence: dict[str, Any] = Field(default_factory=dict)

    @property
    def blocking(self) -> bool:
        return self.status == "fail"


class StageOutput(BaseModel):
    summary: str
    data: dict[str, Any] = Field(default_factory=dict)
    checks: list[CheckResult] = Field(default_factory=list)
    llm_calls: list[dict[str, Any]] = Field(default_factory=list)
