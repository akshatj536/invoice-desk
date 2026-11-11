"""All prompts in one place, so the model's job is easy to audit.

Every prompt asks the model to read or interpret — never to approve, reject or
compute whether something is within tolerance. Those are code's job.
"""

EXTRACT_SYSTEM = """You are a meticulous accounts-payable data-entry clerk.
You transcribe documents exactly. You never correct, recompute or "fix" numbers:
if the document's own arithmetic is wrong, you still copy what is printed.
"""

EXTRACT_USER = """Read the attached document and fill in the schema.

Rules:
- Copy every number exactly as printed. Do NOT recompute subtotal, tax or total, even if they look wrong.
- Line items: one entry per printed line. Keep descriptions as printed. Put item codes / SKUs in `sku` (null if the document has no code column).
- Dates: convert to YYYY-MM-DD. US documents use MM/DD/YYYY.
- po_reference: only a purchase-order number that is actually printed (e.g. "PO-1042"). If none is printed, use null. Do not guess.
- Bank details: the remit-to account and routing numbers exactly as printed (digits only, no spaces).
- doc_type:
    invoice      = a bill requesting payment for goods/services delivered
    proforma     = a request for advance payment / "proforma invoice" / "not a tax invoice"
    credit_note  = a credit or refund document (negative amounts, "credit memo")
    statement    = a list of several invoices / account summary
    quote        = an estimate or quotation
    receipt      = proof that payment was already made
- confidence per field: "high" if clearly legible and unambiguous; "medium" if legible but you had to interpret;
  "low" if smudged, cut off, contradictory or guessed.
- reader_notes: mention anything a careful clerk would flag (e.g. notices about changed bank details, handwritten edits,
  illegible digits). Keep it to one or two short sentences, or null.
"""

REREAD_USER = """You already read this document once. Your first reading has an arithmetic inconsistency:

{discrepancy}

Look at the document again, very carefully, and re-transcribe it.
- If you misread a digit the first time, correct it.
- If the document itself really is inconsistent (the vendor made an arithmetic mistake), copy the printed values
  exactly as they appear — do NOT make the numbers agree.
"""

BANK_REREAD_USER = """You already read this document once. Look again ONLY at the remit-to / payment bank details
(bank account number and routing number). The page may be blurry, skewed or low resolution, so read them digit by digit.
Report exactly the digits printed - do not guess or "correct" them. Fill in the whole schema as before.
"""

PAIR_SYSTEM = """You match invoice lines to purchase-order lines for an accounts-payable team.
You decide only whether two lines describe the SAME product or service. Ignore quantity and price differences —
another system checks those. Abbreviations, reordered words, pack-size notation ("10pk" = "pack of 10"), and
synonyms ("shipping & handling" = "freight") count as the same item. Different products do not match, even if similar.
"""

PAIR_USER = """Invoice lines (1-based index):
{invoice_lines}

Purchase-order lines (line_no):
{po_lines}

For EVERY invoice line, return the matching po_line (or null if none is the same item), a confidence
("high" = clearly the same item, "medium" = probably but wording is ambiguous, "low" = a guess) and a one-sentence reason.
Each PO line can match at most one invoice line.
"""

PO_SUGGEST_SYSTEM = """You help an accounts-payable team find which purchase order an invoice belongs to.
You may only choose from the candidate POs provided. If none clearly fits, return null.
"""

PO_SUGGEST_USER = """The invoice {ref_note}

Invoice: vendor "{vendor}", dated {date}, subtotal {subtotal}.
Invoice lines:
{invoice_lines}

Candidate open purchase orders for this vendor:
{candidates}

Which candidate PO does this invoice belong to? Base it mainly on whether the items match.
"""

EXPLAIN_SYSTEM = """You write short decision notes for accounts-payable clerks who are not technical.
Use only the facts given. Do not invent amounts, names or reasons. No jargon, no reason codes, no bullet points.
"""

EXPLAIN_USER = """Decision: {decision}
Invoice: {invoice_number} from {vendor}, total {total}. PO: {po}.

Findings that drove the decision:
{findings}

Checks that passed: {passed}

Write:
- summary: 2-3 plain sentences explaining the decision and why.
- next_action: one imperative sentence telling the clerk exactly what to do next
  (e.g. who to contact and what to ask for). For APPROVE, say it has been recorded and is ready for payment.
"""
