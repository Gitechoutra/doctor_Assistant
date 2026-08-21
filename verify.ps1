# The whole verification workflow, from the repository root.
#
#   ./verify.ps1              everything
#   ./verify.ps1 --quick      static checks and the build -- no servers, no database
#   ./verify.ps1 --no-e2e     everything but the browser pass
#
# A thin wrapper: it finds the backend's interpreter and hands every argument
# straight to verify/run.py, which is where the workflow actually lives.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$python = Join-Path $root "backend\venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "python" }

& $python (Join-Path $root "verify\run.py") @args
exit $LASTEXITCODE
