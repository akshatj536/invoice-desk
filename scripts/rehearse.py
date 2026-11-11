"""Demo rehearsal: reset the records, run every demo invoice in order through the REAL pipeline
(real Gemini calls), and check each decision + reason codes against the manifest.

Run:  cd backend && uv run python ../scripts/rehearse.py [--times 3] [--only 02,03]
Exit code 0 only if every run matched.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import config, runs_db  # noqa: E402
from app.cli import run_file  # noqa: E402
from app.store import get_store, store_note  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--times", type=int, default=1)
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    manifest = json.loads((config.INVOICES_DIR / "manifest.json").read_text())
    if a.only:
        keep = tuple(a.only.split(","))
        manifest = [m for m in manifest if m["file"].startswith(keep)]
    print(f"Store: {store_note()} · Model: {config.GEMINI_MODEL} · {len(manifest)} invoices × {a.times}")
    failures = 0
    for round_ in range(1, a.times + 1):
        get_store().reset()
        runs_db.clear_all()
        print(f"\n--- round {round_} (records reset) ---")
        for m in manifest:
            t0 = time.perf_counter()
            res = run_file(config.INVOICES_DIR / m["file"], quiet=True)
            dt = time.perf_counter() - t0
            want_d, want_c = m["expected_decision"], set(m["expected_codes"])
            ok = res["decision"] == want_d and want_c <= set(res["reason_codes"])
            extra = sorted(set(res["reason_codes"]) - want_c)
            failures += not ok
            print(f"  {'PASS' if ok else 'FAIL'}  {m['file']:<30} {res['decision']:<8} "
                  f"{','.join(res['reason_codes']) or '-':<45} {dt:5.1f}s"
                  + (f"   expected {want_d} {sorted(want_c)}" if not ok else "")
                  + (f"   (also: {', '.join(extra)})" if ok and extra else ""))
    print(f"\n{'ALL PASSED' if not failures else f'{failures} FAILED'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
