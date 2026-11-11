"""JSON-file store: same behaviour as the Google Sheet, for tests and offline rehearsal."""

from __future__ import annotations

import json
import threading
from pathlib import Path

from .. import config
from .base import COLUMNS, ApprovedWrite, Snapshot, Store, load_seed


class LocalStore(Store):
    backend = "local"

    def __init__(self, path: Path | None = None):
        self.path = path or config.LOCAL_STORE_PATH
        self._lock = threading.Lock()
        if not self.path.exists():
            self.reset()

    def _read(self) -> dict[str, list[dict]]:
        return json.loads(self.path.read_text())

    def _write(self, data: dict[str, list[dict]]) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(self.path)

    def snapshot(self) -> Snapshot:
        d = self._read()
        return Snapshot(vendors=d["Vendors"], pos=d["POs"], po_lines=d["PO_Lines"], invoice_log=d["Invoice_Log"])

    def record_approved_invoice(self, write: ApprovedWrite) -> dict:
        with self._lock:
            data = self._read()
            if any(r.get("run_id") == write.log_entry.run_id for r in data["Invoice_Log"]):
                return {"skipped": True, "reason": "already recorded for this run"}
            snap = self.snapshot()
            po, changed_lines = self.apply_write(snap, write)
            data["POs"] = [p.model_dump(include=set(COLUMNS["POs"])) for p in snap.pos]
            data["PO_Lines"] = [l.model_dump(include=set(COLUMNS["PO_Lines"])) for l in snap.po_lines]
            data["Invoice_Log"].append(write.log_entry.model_dump())
            self._write(data)
        return _change_summary(po, changed_lines, write)

    def reset(self) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self._write(load_seed())


def _change_summary(po, changed_lines, write: ApprovedWrite) -> dict:
    return {
        "invoice_log_row": write.log_entry.model_dump(include={"invoice_number", "po_number", "subtotal", "total"}),
        "po": {"po_number": po.po_number, "amount_invoiced": po.amount_invoiced, "remaining": po.remaining,
               "status": po.status},
        "po_lines": [{"line_no": l.line_no, "description": l.description, "qty_invoiced": l.qty_invoiced,
                      "qty_ordered": l.qty_ordered} for l in changed_lines],
    }
