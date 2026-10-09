<#
Deploy the `frontend/` folder to the `gh-pages` branch on the remote.
Usage: .\deploy_frontend.ps1 -Remote origin -Branch gh-pages
Requires: git with `subtree` support.
#>
param(
  [string]$Remote = 'origin',
  [string]$Branch = 'gh-pages'
)

if (-not (Test-Path ./frontend)) {
  Write-Error "frontend folder not found"
  exit 1
}

Write-Host "Pushing ./frontend to $Remote/$Branch using git subtree..."
git fetch $Remote
git subtree push --prefix frontend $Remote $Branch
