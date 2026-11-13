$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')

npm.cmd run sync
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node --env-file=.env src/alerts.js --send
exit $LASTEXITCODE
