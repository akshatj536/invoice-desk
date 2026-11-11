"""Command line: run an invoice through the pipeline and print what happened.

  uv run python -m app.cli run ../data/invoices/01_happy_path.pdf
  uv run python -m app.cli reset          # restore seed data in the store, clear run history
"""

from __future__ import annotations

import argparse
import logging
import shutil
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

from . import config, runs_db  # noqa: E402
from .pipeline import orchestrator  # noqa: E402
from .store import get_store, store_note  # noqa: E402

ICON = {"pass": "✓", "warn": "!", "fail": "✗", "skip": "–"}


def run_file(path: Path, quiet: bool = False) -> dict:
    dest = config.UPLOADS_DIR / path.name
    if path.resolve() != dest.resolve():
        shutil.copy(path, dest)
    run_id = runs_db.create_run(path.name, str(dest), source="cli")
    ctx = orchestrator.execute(run_id)
    if not quiet:
        for ev in runs_db.list_events(run_id):
            p = ev["payload"]
            if ev["type"] == "stage_completed":
                print(f"  [{ev['stage']:<9}] {p['summary']}  ({p['duration_ms']} ms)")
                for c in p["checks"]:
                    if c["status"] != "pass":
                        print(f"      {ICON[c['status']]} {c['label']}: {c['message']}")
            elif ev["type"] == "stage_skipped":
                print(f"  [{ev['stage']:<9}] skipped - {p['reason']}")
            elif ev["type"] == "stage_failed":
                print(f"  [{ev['stage']:<9}] FAILED - {p['error']}")
        print(f"  => {ctx.decision} {ctx.reason_codes}")
        print(f"     {ctx.explanation}")
        print(f"     Next: {ctx.next_action}")
    return {"run_id": run_id, "decision": ctx.decision, "reason_codes": ctx.reason_codes}


def main() -> None:
    logging.basicConfig(level=logging.WARNING)
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run"); r.add_argument("files", nargs="+", type=Path)
    sub.add_parser("reset")
    a = ap.parse_args()
    print(f"Store: {store_note()} · Model: {config.GEMINI_MODEL}")
    if a.cmd == "reset":
        get_store().reset(); runs_db.clear_all(); print("Seed data restored, run history cleared.")
        return
    for f in a.files:
        print(f"\n{f.name}")
        run_file(f)


if __name__ == "__main__":
    sys.exit(main())
