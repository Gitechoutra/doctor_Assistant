#!/usr/bin/env bash
# The whole verification workflow, from the repository root.
#
#   ./verify.sh              everything
#   ./verify.sh --quick      static checks and the build -- no servers, no database
#   ./verify.sh --no-e2e     everything but the browser pass
#
# A thin wrapper: it finds the backend's interpreter and hands every argument
# straight to verify/run.py, which is where the workflow actually lives.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

python="$root/backend/venv/bin/python"
[ -x "$python" ] || python="$root/backend/venv/Scripts/python.exe"
[ -x "$python" ] || python="$(command -v python3 || command -v python)"

exec "$python" "$root/verify/run.py" "$@"
