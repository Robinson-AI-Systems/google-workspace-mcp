param(
 [ValidatePattern('^[a-f0-9]{40}$')]
 [string]$ExpectedLive = 'fbac5349fa66fed52502730441b4a84d05d6fb7c',
 [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# A private portable runtime: no admin, npm, global install or PATH change.
$runtime = Join-Path $env:LOCALAPPDATA 'RobinsonWorkspaceCheck\node-v24.22.0'
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
$digest = if ($arch -eq 'arm64') { 'df4b0e71e4e4d022bf8582fbe75f6061feb9c4a111a86f3fec6300d24b6fe5e0' } else { 'ba93f9a70bd86fce3ebbb39ec758501458453467aa92a34a0a3602d1e3fc2b9c' }
$runtime = Join-Path $runtime $arch
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$node = Join-Path $runtime 'node.exe'
if (!(Test-Path $node) -or (Get-FileHash $node -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest) {
 $download = Join-Path $runtime 'node.download'
 Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/download/release/v24.22.0/win-$arch/node.exe" -OutFile $download
 if ((Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest) {
  Remove-Item $download
  throw 'Node download checksum mismatch; stopped before execution.'
 }
 Move-Item -Force $download $node
}
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
 $arguments = @('scripts/v1-native-browser-check.mjs', '--expected-live', $ExpectedLive)
 if ($PrepareOnly) { $arguments += '--prepare-only' }
 & $node @arguments
 if ($LASTEXITCODE -ne 0) { throw 'Local launcher failed. No acceptance pass.' }
} finally { Pop-Location }
