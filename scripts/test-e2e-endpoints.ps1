$ErrorActionPreference = "Stop"

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  npm run test:e2e:endpoints
}
finally {
  Pop-Location
}

