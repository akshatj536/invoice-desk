"""Google Sheet as the system of record (4 tabs: Vendors, POs, PO_Lines, Invoice_Log).

* One batched read per snapshot.
* Writes use RAW input so IDs like bank account "004417820093" keep leading zeros.
* Writes re-read the sheet first (fresh numbers) and are idempotent on run_id.
"""

from __future__ import annotations

import json
import threading

import gspread

from .. import config
from .base import COLUMNS, TABS, ApprovedWrite, Snapshot, Store, load_seed
from .local import _change_summary


def _col(idx: int) -> str:
    return chr(ord("A") + idx)


def _records(values: list[list[str]]) -> list[dict]:
    if not values:
        return []
    header, rows = values[0], values[1:]
    out = []
    for r in rows:
        if not any(str(c).strip() for c in r):
            continue
        r = list(r) + [""] * (len(header) - len(r))
        out.append(dict(zip(header, r)))
    return out


class GoogleSheetStore(Store):
    backend = "gsheets"

    def __init__(self, sheet_id: str | None = None, sa_file=None):
        self.sheet_id = sheet_id or config.GOOGLE_SHEET_ID
        if config.GOOGLE_SERVICE_ACCOUNT_JSON and not sa_file:
            self.gc = gspread.service_account_from_dict(json.loads(config.GOOGLE_SERVICE_ACCOUNT_JSON))
        else:
            self.gc = gspread.service_account(filename=str(sa_file or config.GOOGLE_SERVICE_ACCOUNT_FILE))
        self.sh = self.gc.open_by_key(self.sheet_id)
        self._lock = threading.Lock()
        self._gids: dict[str, int] = {}
        existing = {ws.title for ws in self.sh.worksheets()}
        if not set(TABS) <= existing:
            self.reset()
        self._refresh_gids()

    def _refresh_gids(self) -> None:
        self._gids = {ws.title: ws.id for ws in self.sh.worksheets()}

    def _read(self, tabs: list[str]) -> dict[str, list[dict]]:
        resp = self.sh.values_batch_get([f"'{t}'" for t in tabs])
        out = {}
        for tab, vr in zip(tabs, resp.get("valueRanges", [])):
            out[tab] = _records(vr.get("values", []))
        return out

    def snapshot(self) -> Snapshot:
        d = self._read(TABS)
        return Snapshot(vendors=d["Vendors"], pos=d["POs"], po_lines=d["PO_Lines"], invoice_log=d["Invoice_Log"])

    def record_approved_invoice(self, write: ApprovedWrite) -> dict:
        with self._lock:
            snap = self.snapshot()  # fresh read right before writing
            if any(e.run_id == write.log_entry.run_id for e in snap.invoice_log):
                return {"skipped": True, "reason": "already recorded for this run"}
            po, changed_lines = self.apply_write(snap, write)

            po_cols, line_cols = COLUMNS["POs"], COLUMNS["PO_Lines"]
            po_row = next(i for i, p in enumerate(snap.pos) if p.po_number == po.po_number) + 2
            data = [
                {"range": f"'POs'!{_col(po_cols.index('amount_invoiced'))}{po_row}", "values": [[po.amount_invoiced]]},
                {"range": f"'POs'!{_col(po_cols.index('status'))}{po_row}", "values": [[po.status]]},
            ]
            for l in changed_lines:
                row = next(i for i, x in enumerate(snap.po_lines)
                           if x.po_number == l.po_number and x.line_no == l.line_no) + 2
                data.append({"range": f"'PO_Lines'!{_col(line_cols.index('qty_invoiced'))}{row}",
                             "values": [[l.qty_invoiced]]})
            self.sh.values_batch_update({"valueInputOption": "RAW", "data": data})

            entry = write.log_entry.model_dump()
            self.sh.worksheet("Invoice_Log").append_row(
                [entry.get(c, "") for c in COLUMNS["Invoice_Log"]], value_input_option="RAW")
        return _change_summary(po, changed_lines, write)

    def reset(self) -> None:
        seed = load_seed()
        with self._lock:
            existing = {ws.title: ws for ws in self.sh.worksheets()}
            for tab in TABS:
                cols = COLUMNS[tab]
                ws = existing.get(tab) or self.sh.add_worksheet(title=tab, rows=200, cols=len(cols))
                ws.clear()
                rows = [cols] + [[r.get(c, "") for c in cols] for r in seed[tab]]
                ws.update(values=rows, range_name="A1", value_input_option="RAW")
                ws.format(f"A1:{_col(len(cols) - 1)}1",
                          {"textFormat": {"bold": True}, "backgroundColor": {"red": 0.93, "green": 0.95, "blue": 0.98}})
                ws.freeze(rows=1)
            # drop the default empty sheet if present
            if "Sheet1" in existing and len(self.sh.worksheets()) > len(TABS):
                self.sh.del_worksheet(existing["Sheet1"])
            self._refresh_gids()
            self.sh.batch_update({"requests": [
                {"autoResizeDimensions": {"dimensions": {"sheetId": self._gids[t], "dimension": "COLUMNS",
                                                         "startIndex": 0, "endIndex": len(COLUMNS[t])}}}
                for t in TABS]})

    def sheet_url(self, tab: str | None = None) -> str:
        url = f"https://docs.google.com/spreadsheets/d/{self.sheet_id}/edit"
        if tab and tab in self._gids:
            url += f"#gid={self._gids[tab]}"
        return url
