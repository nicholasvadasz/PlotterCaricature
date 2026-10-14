# One-time setup for a Windows laptop. Does not overwrite .env.local.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Push-Location -LiteralPath $PSScriptRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Install Node.js 24 from https://nodejs.org/en/download and reopen the terminal.'
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'npm.cmd was not found. Reinstall Node.js with npm and reopen the terminal.'
    }
    & node -e 'const [major,minor]=process.versions.node.split(/\./).map(Number); process.exit(major>22 || major===22 && minor>=12 ? 0 : 1)'
    if ($LASTEXITCODE -ne 0) { throw 'Node.js 22.12 or newer is required; Node 24 is tested.' }
    if ($CheckOnly) {
        & node scripts/doctor.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Setup checks failed. See the messages above.' }
    } else {
        & node scripts/setup-backend.mjs --check
        if ($LASTEXITCODE -ne 0) { throw 'Python preflight failed. See the message above.' }
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'JavaScript dependency installation failed.' }
        & node scripts/setup.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Model download / WASM setup failed. Check the internet connection and rerun.' }
        & node scripts/setup-backend.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
        if (-not (Test-Path -LiteralPath '.env.local')) {
            Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
            Write-Host 'Created .env.local. Add your GEMINI_API_KEY there before generating portraits.'
        }
        & node scripts/doctor.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Setup checks failed. See the messages above.' }
        Write-Host ''
        Write-Host 'Setup complete. Run npm start to open http://127.0.0.1:5195'
    }
} catch {
    Write-Host "Setup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
