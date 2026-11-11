"""Store factory: Google Sheet when configured, otherwise a local JSON file."""

from __future__ import annotations

import logging

from .. import config
from .base import ApprovedWrite, InvoiceLogEntry, PO, POLine, Snapshot, Store, Vendor  # noqa: F401

log = logging.getLogger(__name__)
_store: Store | None = None
_store_note: str = ""


def get_store() -> Store:
    global _store, _store_note
    if _store is not None:
        return _store
    if config.STORE_BACKEND == "gsheets":
        if config.GOOGLE_SHEET_ID and (config.GOOGLE_SERVICE_ACCOUNT_JSON or config.GOOGLE_SERVICE_ACCOUNT_FILE.exists()):
            from .gsheets import GoogleSheetStore
            _store = GoogleSheetStore()
            _store_note = "Google Sheet"
            return _store
        log.warning("Google Sheet not configured (GOOGLE_SHEET_ID / service-account file missing) - using local store")
    from .local import LocalStore
    _store = LocalStore()
    _store_note = "local store"
    return _store


def store_note() -> str:
    get_store()
    return _store_note
