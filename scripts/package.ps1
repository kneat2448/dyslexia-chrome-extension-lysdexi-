# Builds the Chrome Web Store upload: dist/lysdexi-<version>.zip containing only runtime files.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/package.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version
$dist = Join-Path $root 'dist'
$out = Join-Path $dist "lysdexi-$version.zip"

New-Item -ItemType Directory -Force $dist | Out-Null
if (Test-Path $out) { Remove-Item $out }

# Windows' bundled bsdtar writes forward-slash zip paths, which the Web Store requires. Call it by full path:
# Git for Windows puts GNU tar on PATH, which can't write zips and treats "C:" as a remote host.
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'
Push-Location $root
try {
  & $tar -a -c -f $out manifest.json popup.html popup.css popup.js background content shared assets/icons assets/fonts assets/logo.png
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

Write-Host "Created $out"
