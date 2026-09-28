# Builds the Chrome Web Store upload: dist/lysdexi-<version>.zip containing only runtime files.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/package.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version
$dist = Join-Path $root 'dist'
$out = Join-Path $dist "lysdexi-$version.zip"

New-Item -ItemType Directory -Force $dist | Out-Null
if (Test-Path $out) { Remove-Item $out }

# tar.exe (bsdtar, bundled with Windows 10+) writes forward-slash zip paths, which the Web Store requires.
Push-Location $root
try {
  tar.exe -a -c -f $out manifest.json popup.html popup.css popup.js background content shared assets/icons assets/fonts assets/logo.png
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

Write-Host "Created $out"
