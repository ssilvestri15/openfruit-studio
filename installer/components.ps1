param(
    [int]$Engine,
    [int]$Git,
    [int]$Apple
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Install-OpenFruit {
    $repository = 'ssilvestri15/openfruit'
    try {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repository/releases/latest" -Headers @{
            Accept = 'application/vnd.github+json'
            'User-Agent' = 'OpenFruit-Studio-Setup'
        } -TimeoutSec 30
    } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) {
            throw "No public stable release of OpenFruit is available. https://github.com/$repository/releases"
        }
        throw
    }

    $assets = @($release.assets | Where-Object {
        $_.name -match '^OpenFruit[ ._-]*Setup(?:[ ._-][a-zA-Z0-9._-]+)?\.exe$' -and
        $_.name -notmatch '(?:arm64|ia32|x86)(?:[._-]|$)'
    })
    if ($assets.Count -ne 1) {
        throw "Release $($release.tag_name) must provide exactly one OpenFruit Setup .exe for Windows x64."
    }
    $asset = $assets[0]
    $download = [uri]$asset.browser_download_url
    if ($download.Scheme -ne 'https' -or $download.Host -ne 'github.com' -or
        -not $download.AbsolutePath.StartsWith("/$repository/releases/download/", [StringComparison]::OrdinalIgnoreCase) -or
        $asset.digest -notmatch '^sha256:[a-fA-F0-9]{64}$') {
        throw 'OpenFruit Setup must have an official GitHub URL and a SHA-256 digest.'
    }

    $scratch = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $scratch | Out-Null
    try {
        $setup = Join-Path $scratch 'OpenFruitSetup.exe'
        Write-Host "Downloading OpenFruit $($release.tag_name)..."
        Invoke-WebRequest -Uri $download -OutFile $setup -UseBasicParsing -TimeoutSec 600
        if ((Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash -ne $asset.digest.Substring(7)) {
            throw 'The SHA-256 digest of OpenFruit Setup does not match.'
        }
        $process = Start-Process -FilePath $setup -PassThru -Wait
        if ($process.ExitCode -notin 0, 3010, 1641) {
            throw "OpenFruit Setup returned exit code $($process.ExitCode)."
        }
    } finally {
        Remove-Item -LiteralPath (Join-Path $scratch 'OpenFruitSetup.exe') -Force -ErrorAction SilentlyContinue
        [IO.Directory]::Delete($scratch)
    }
}

function Install-WinGetPackage([string]$Id, [string]$Source, [string]$ManualUrl) {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "WinGet is unavailable. Install manually: $ManualUrl"
    }
    & $winget.Source install --id $Id --exact --source $Source --no-upgrade --accept-source-agreements --accept-package-agreements
    $result = $LASTEXITCODE
    # 0x8A15002B also covers a package that WinGet already considers current.
    if ($result -notin 0, 3010, 1641, -1978335189) {
        throw "WinGet returned exit code $result. Install manually: $ManualUrl"
    }
}

$failed = $false
if ($Engine -eq 1) {
    try { Install-OpenFruit } catch { Write-Host "OpenFruit - $_"; $failed = $true }
}
if ($Git -eq 1) {
    try { Install-WinGetPackage 'Git.Git' 'winget' 'https://git-scm.com/download/win' }
    catch { Write-Host "Git - $_"; $failed = $true }
}
if ($Apple -eq 1) {
    try { Install-WinGetPackage '9NP83LWLPZ9K' 'msstore' 'https://apps.microsoft.com/detail/9NP83LWLPZ9K' }
    catch { Write-Host "Apple Devices - $_"; $failed = $true }
}
if ($failed) { exit 1 }
