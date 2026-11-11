"""Stage 1 - Ingest: open the file, fingerprint it, detect digital vs scanned, load the records."""

from __future__ import annotations

import hashlib

import fitz

from ..models import CheckResult, StageOutput
from ..store import store_note
from .context import RunContext


def run(ctx: RunContext) -> StageOutput:
    ctx.pdf_bytes = ctx.pdf_path.read_bytes()
    ctx.file_hash = hashlib.sha256(ctx.pdf_bytes).hexdigest()
    try:
        doc = fitz.open(stream=ctx.pdf_bytes, filetype="pdf")
        pages = doc.page_count
        text_chars = sum(len(p.get_text().strip()) for p in doc)
    except Exception as e:  # not a PDF / corrupted / encrypted
        ctx.halted = "The file could not be opened as a PDF"
        return StageOutput(
            summary="Could not open the file as a PDF",
            checks=[CheckResult(id="ingest.readable", stage="ingest", label="File is a readable PDF", status="fail",
                                reason_code="UNREADABLE_DOCUMENT",
                                message=f"The file could not be opened ({type(e).__name__}). Ask the vendor to resend it.")])

    ctx.kind = "digital" if text_chars > 40 else "scanned"
    ctx.snapshot = ctx.store.snapshot()
    snap = ctx.snapshot
    kind_label = "Digital PDF (text layer)" if ctx.kind == "digital" else "Scanned PDF (image only, no text layer)"
    return StageOutput(
        summary=f"{kind_label}, {pages} page{'s' if pages != 1 else ''} · loaded records from {store_note()}",
        data={
            "filename": ctx.filename, "pages": pages, "kind": ctx.kind, "text_chars": text_chars,
            "size_kb": round(len(ctx.pdf_bytes) / 1024, 1), "sha256": ctx.file_hash[:16],
            "records": {"vendors": len(snap.vendors), "pos": len(snap.pos), "po_lines": len(snap.po_lines),
                        "invoice_log": len(snap.invoice_log)},
            "source": store_note(),
        },
        checks=[CheckResult(id="ingest.readable", stage="ingest", label="File is a readable PDF", status="pass",
                            message=f"{pages}-page PDF, {ctx.kind}")],
    )
