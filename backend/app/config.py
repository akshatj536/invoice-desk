"""Central configuration: paths, secrets (from .env) and AP policy thresholds."""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

# --- Model -----------------------------------------------------------------
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
GEMINI_TIMEOUT_S = float(os.getenv("GEMINI_TIMEOUT_S", "90"))

# --- System of record --------------------------------------------------------
STORE_BACKEND = os.getenv("STORE_BACKEND", "gsheets").strip().lower()  # gsheets | local
GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID", "").strip()
_sa = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "secrets/service-account.json").strip()
GOOGLE_SERVICE_ACCOUNT_FILE = Path(_sa) if Path(_sa).is_absolute() else ROOT / _sa
# Alternative for hosting platforms: the service-account JSON itself, as an env var
GOOGLE_SERVICE_ACCOUNT_JSON = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()

# --- Paths -------------------------------------------------------------------
DATA_DIR = ROOT / "data"
SEED_DIR = DATA_DIR / "seed"
INVOICES_DIR = DATA_DIR / "invoices"
VAR_DIR = Path(os.getenv("VAR_DIR", str(ROOT / "backend" / "var")))
UPLOADS_DIR = VAR_DIR / "uploads"
RUNS_DB_PATH = VAR_DIR / "runs.sqlite3"
LOCAL_STORE_PATH = VAR_DIR / "local_store.json"
FRONTEND_DIST = ROOT / "frontend" / "dist"

for _d in (VAR_DIR, UPLOADS_DIR):
    _d.mkdir(parents=True, exist_ok=True)


# --- AP policy (the business rules; shown in the UI) --------------------------
@dataclass(frozen=True)
class Policy:
    price_tolerance_pct: float = 0.01        # unit price may be up to 1% above PO price
    running_total_tolerance_pct: float = 0.01  # all invoices on a PO may total up to PO total + 1%
    rounding_tolerance: float = 0.05         # arithmetic differences up to $0.05 are rounding
    near_duplicate_window_days: int = 30     # same vendor + amount + lines within N days = suspected duplicate
    base_currency: str = "USD"

    def as_dict(self) -> dict:
        return asdict(self)


POLICY = Policy()
