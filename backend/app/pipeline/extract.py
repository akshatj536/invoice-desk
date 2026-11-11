"""Stage 2 - Extract: the model reads the PDF into fixed fields (same path for digital and scanned)."""

from __future__ import annotations

from .. import llm, prompts
from ..models import InvoiceExtraction, StageOutput
from .context import RunContext
from .util import money, plural


def read_invoice(pdf_bytes: bytes, extra_instruction: str | None = None) -> llm.LLMResult:
    contents = [llm.pdf_part(pdf_bytes), prompts.EXTRACT_USER]
    if extra_instruction:
        contents.append(extra_instruction)
    # First read uses low thinking (fast). The re-read only happens when the arithmetic check failed,
    # so it gets the model's full reasoning effort.
    return llm.generate(purpose="reread" if extra_instruction else "extract", schema=InvoiceExtraction,
                        system=prompts.EXTRACT_SYSTEM, contents=contents,
                        thinking=None if extra_instruction else "low")


def run(ctx: RunContext) -> StageOutput:
    from .. import config
    ctx.progress(f"Sending the {ctx.kind} PDF to {config.GEMINI_MODEL} to read every field")
    r = read_invoice(ctx.pdf_bytes)
    x: InvoiceExtraction = r.value
    ctx.extraction = x
    bits = [x.vendor_name or "vendor unreadable", x.invoice_number or "no invoice #",
            f"total {money(x.total)}", plural(len(x.line_items), "line")]
    if x.doc_type != "invoice":
        bits.insert(0, f"document type: {x.doc_type}")
    return StageOutput(
        summary="Read " + " · ".join(bits),
        data={"extraction": x.model_dump(mode="json"), "kind": ctx.kind},
        llm_calls=[r.meta.as_dict()],
    )
