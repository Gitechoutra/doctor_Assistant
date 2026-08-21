"""Shared plumbing for the detectors.

A detector is a module with `NAME`, `TITLE` and `run(ctx) -> list[Finding]`.
It reports what it found and does not decide what that means for the exit
code -- `verify/run.py` owns that, so severity policy lives in one place.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"

# Windows keeps the interpreter in venv/Scripts; every other platform in
# venv/bin. CI installs into the runner's own Python and has no venv at all,
# so fall back to whatever is running this file.
def backend_python() -> str:
    for candidate in (
        BACKEND / "venv" / "Scripts" / "python.exe",
        BACKEND / "venv" / "bin" / "python",
    ):
        if candidate.exists():
            return str(candidate)
    return sys.executable


ERROR = "error"
WARN = "warn"


@dataclass
class Finding:
    """One thing worth a human's attention.

    `where` is a file path (plus :line where known) so the report can be
    clicked through to; `detail` carries the evidence, because a finding
    nobody can verify gets ignored.
    """

    severity: str
    summary: str
    where: str = ""
    detail: str = ""

    def render(self) -> str:
        head = f"  [{self.severity.upper()}] {self.summary}"
        if self.where:
            head += f"\n         at {self.where}"
        if self.detail:
            for line in str(self.detail).splitlines():
                head += f"\n         {line}"
        return head


@dataclass
class Ctx:
    """What the detectors are allowed to know about the run."""

    root: Path = ROOT
    backend: Path = BACKEND
    frontend: Path = FRONTEND
    api_base: str = ""          # e.g. http://127.0.0.1:5001/api, when live
    web_base: str = ""          # e.g. http://127.0.0.1:4173, when live
    live: bool = False          # were servers started for this run?
    env: dict = field(default_factory=dict)


def run_cmd(cmd, cwd=None, timeout=900, env=None):
    """Run a command, returning (returncode, combined_output)."""
    merged = dict(os.environ)
    if env:
        merged.update(env)
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=merged,
            shell=isinstance(cmd, str),
            errors="replace",
        )
    except subprocess.TimeoutExpired:
        return 124, f"timed out after {timeout}s"
    except FileNotFoundError as exc:
        return 127, str(exc)
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def source_files(base: Path, suffixes, skip=()):
    """Every source file under `base`, minus the directories nobody wrote."""
    default_skip = {
        "node_modules", "venv", ".venv", "__pycache__", "dist", "build",
        ".git", ".pytest_cache", "uploads", "logs", ".bin",
    }
    skip = default_skip | set(skip)
    for path in sorted(base.rglob("*")):
        if not path.is_file() or path.suffix not in suffixes:
            continue
        if any(part in skip for part in path.parts):
            continue
        yield path


def line_of(text: str, index: int) -> int:
    """1-based line number of a character offset -- for pointing at a match."""
    return text.count("\n", 0, index) + 1


def strip_comments_js(src: str) -> str:
    """Blank out JS comments and string bodies well enough for path scanning.

    Replaces rather than deletes so character offsets still map to the right
    line number.
    """
    out = list(src)
    i, n = 0, len(src)
    while i < n:
        two = src[i : i + 2]
        if two == "//":
            j = src.find("\n", i)
            j = n if j < 0 else j
            for k in range(i, j):
                out[k] = " "
            i = j
        elif two == "/*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                if src[k] != "\n":
                    out[k] = " "
            i = j
        else:
            i += 1
    return "".join(out)
