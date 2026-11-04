param(
    [Parameter(Mandatory)][string]$Installer,
    [Parameter(Mandatory)][string]$Version,
    [Parameter(Mandatory)][string]$AppFile,
    [Parameter(Mandatory)][string]$AppFolder,
    [Parameter(Mandatory)][string]$RegistryKey
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, System.Windows.Forms

$context = [Windows.Markup.ParserContext]::new()
$context.BaseUri = [uri]("$PSScriptRoot\")
$layout = [IO.File]::OpenRead((Join-Path $PSScriptRoot 'setup.xaml'))
try { $window = [Windows.Markup.XamlReader]::Load($layout, $context) }
finally { $layout.Dispose() }
$workArea = [Windows.SystemParameters]::WorkArea
$window.MaxWidth = $workArea.Width
$window.MaxHeight = $workArea.Height
$window.FindName('VersionLabel').Text = "VERSION $Version"
$icon = Join-Path $PSScriptRoot 'studio.ico'
if (Test-Path -LiteralPath $icon) {
    $window.Icon = [Windows.Media.Imaging.BitmapFrame]::Create([uri]$icon)
}
$controls = @{}
foreach ($name in 'TitleBar', 'CloseButton', 'Options', 'Folder', 'ForMe', 'ForEveryone',
    'BrowseButton', 'Desktop', 'Engine', 'Git', 'Apple', 'Progress', 'Primary', 'Status') {
    $controls[$name] = $window.FindName($name)
}
function Test-OpenFruitInstalled {
    $binary = $env:OPENFRUIT_BIN
    if (-not $binary) {
        $engineHome = if ($env:OPENFRUIT_HOME) { $env:OPENFRUIT_HOME } else { Join-Path $env:LOCALAPPDATA 'OPENFRUIT' }
        $binary = Join-Path $engineHome 'bin\openfruit.exe'
    }
    Test-Path -LiteralPath $binary -PathType Leaf -ErrorAction SilentlyContinue
}

function Test-GitInstalled {
    if (Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue) { return $true }
    foreach ($key in 'HKCU:\Software\GitForWindows', 'HKLM:\Software\GitForWindows',
        'HKLM:\Software\WOW6432Node\GitForWindows') {
        $installPath = Get-ItemPropertyValue -LiteralPath $key -Name InstallPath -ErrorAction SilentlyContinue
        if ($installPath -and (Test-Path -LiteralPath (Join-Path $installPath 'cmd\git.exe') -PathType Leaf)) {
            return $true
        }
    }
    return $false
}

function Update-DependencyStatus {
    $installed = @{
        Engine = Test-OpenFruitInstalled
        Git = Test-GitInstalled
        Apple = (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) -and
            [bool](Get-AppxPackage -Name AppleInc.AppleDevices -ErrorAction SilentlyContinue)
    }
    foreach ($name in 'Engine', 'Git', 'Apple') {
        $option = $controls[$name]
        if ($installed[$name]) {
            $option.IsChecked = $false
            $option.Tag = 'Installed'
            $option.IsEnabled = $false
            [Windows.Automation.AutomationProperties]::SetItemStatus($option, 'Already installed')
        } else {
            $option.Tag = $null
            $option.IsEnabled = $true
            [Windows.Automation.AutomationProperties]::SetItemStatus($option, '')
        }
    }
}

Update-DependencyStatus

function Get-InstalledFolder([bool]$AllUsers) {
    $hive = if ($AllUsers) { 'LocalMachine' } else { 'CurrentUser' }
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, 'Registry64')
    try {
        $key = $base.OpenSubKey($RegistryKey)
        if ($key) {
            try { $key.GetValue('InstallLocation') } finally { $key.Dispose() }
        }
    } finally {
        $base.Dispose()
    }
}

$userRoot = Join-Path $env:LOCALAPPDATA 'Programs'
$machineRoot = if ($env:ProgramW6432) { $env:ProgramW6432 } else { $env:ProgramFiles }
$defaultFolders = @((Join-Path $userRoot $AppFolder), (Join-Path $machineRoot $AppFolder))
$desktopFolders = @(
    [Environment]::GetFolderPath('DesktopDirectory'),
    [Environment]::GetFolderPath('CommonDesktopDirectory')
)

function Set-DefaultOptions {
    $scope = [int][bool]$controls.ForEveryone.IsChecked
    $installed = Get-InstalledFolder ($scope -eq 1)
    if ($installed) {
        $controls.Folder.Text = $installed
        $link = Join-Path $desktopFolders[$scope] 'OpenFruit Studio.lnk'
        $controls.Desktop.IsChecked = Test-Path -LiteralPath $link
    } else {
        $controls.Folder.Text = $defaultFolders[$scope]
        $controls.Desktop.IsChecked = $true
    }
}

$controls.ForMe.Add_Checked({ Set-DefaultOptions })
$controls.ForEveryone.Add_Checked({ Set-DefaultOptions })
if ((Get-InstalledFolder $true) -and -not (Get-InstalledFolder $false)) {
    $controls.ForEveryone.IsChecked = $true
} else {
    $controls.ForMe.IsChecked = $true
}

$controls.BrowseButton.Add_Click({
    $picker = New-Object Windows.Forms.FolderBrowserDialog
    $picker.Description = 'Choose the folder where Setup should create the Studio subfolder.'
    $picker.SelectedPath = Split-Path -Parent $controls.Folder.Text
    try {
        if ($picker.ShowDialog() -eq 'OK') {
            $controls.Folder.Text = Join-Path $picker.SelectedPath $AppFolder
        }
    } finally {
        $picker.Dispose()
    }
})

$script:stage = 'ready'
$script:worker = $null
$script:targetApp = $null
$componentOutput = Join-Path $PSScriptRoot 'components.log'
$componentErrors = Join-Path $PSScriptRoot 'components-error.log'
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(300)

function Set-Busy([bool]$Busy) {
    $controls.Progress.Visibility = if ($Busy) { 'Visible' } else { 'Collapsed' }
    $controls.CloseButton.IsEnabled = -not $Busy
    $controls.Primary.IsEnabled = -not $Busy
    $controls.Options.IsEnabled = -not $Busy -and $script:stage -ne 'done'
}

function Set-Result([string]$Stage, [string]$Message) {
    $script:stage = $Stage
    $controls.Status.Text = $Message
    $controls.Primary.Content = if ($Stage -eq 'done') { 'Open Studio' } else { 'Retry' }
    Set-Busy $false
}

$timer.Add_Tick({
    if (-not $script:worker.HasExited) { return }
    $timer.Stop()
    try {
        $exitCode = $script:worker.ExitCode
        $script:worker.Dispose()
        if ($script:stage -eq 'installing') {
            if ($exitCode -ne 0 -or -not (Test-Path -LiteralPath $script:targetApp -PathType Leaf)) {
                Set-Result 'ready' "Installation was interrupted or failed (exit code $exitCode)."
                return
            }
            Update-DependencyStatus
            $engine = [int][bool]$controls.Engine.IsChecked
            $git = [int][bool]$controls.Git.IsChecked
            $apple = [int][bool]$controls.Apple.IsChecked
            if ($engine -or $git -or $apple) {
                $script:stage = 'components'
                $controls.Status.Text = 'Installing selected components...'
                $helper = Join-Path $PSScriptRoot 'components.ps1'
                $script:worker = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -PassThru -WindowStyle Hidden `
                    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$helper`" -Engine $engine -Git $git -Apple $apple" `
                    -RedirectStandardOutput $componentOutput -RedirectStandardError $componentErrors
                $timer.Start()
                return
            }
        } else {
            Update-DependencyStatus
        }
        if ($script:stage -eq 'components' -and $exitCode -ne 0) {
            $failure = Get-Content -LiteralPath $componentOutput |
                Where-Object { $_ -match '^(OpenFruit|Git|Apple Devices) - ' } | Select-Object -Last 1
            Set-Result 'done' "Studio is installed. $(if ($failure) { $failure } else { 'Some components are unavailable.' })"
            return
        }
        Set-Result 'done' 'OpenFruit Studio is ready.'
    } catch {
        if ($script:stage -eq 'installing') {
            Set-Result 'ready' "Could not verify the installation: $($_.Exception.Message)"
        } else {
            Set-Result 'done' "Studio is installed. Error installing optional components: $($_.Exception.Message)"
        }
    }
})

$controls.Primary.Add_Click({
    if ($script:stage -eq 'done') {
        try {
            Start-Process -FilePath $script:targetApp
            $window.Close()
        } catch {
            $controls.Status.Text = "Could not open Studio: $($_.Exception.Message)"
        }
        return
    }
    try {
        $folder = $controls.Folder.Text.TrimEnd('\')
        $script:targetApp = Join-Path $folder $AppFile
        $allUsers = [bool]$controls.ForEveryone.IsChecked
        if ((Test-Path -LiteralPath $folder) -and $folder -ne (Get-InstalledFolder $allUsers) -and
            (Get-ChildItem -LiteralPath $folder -Force | Select-Object -First 1)) {
            $controls.Status.Text = 'Choose an empty folder for the new installation.'
            return
        }
        $scope = if ($allUsers) { '/allusers' } else { '/currentuser' }
        $desktop = [int][bool]$controls.Desktop.IsChecked
        $script:worker = Start-Process -FilePath $Installer -ArgumentList "/S $scope /studio-desktop=$desktop /D=$folder" -PassThru
        $script:stage = 'installing'
        $controls.Status.Text = 'Installing OpenFruit Studio...'
        Set-Busy $true
        $timer.Start()
    } catch {
        Set-Result 'ready' "Could not start the installation: $($_.Exception.Message)"
    }
})

$controls.TitleBar.Add_MouseLeftButtonDown({
    param($sender, $event)
    if (-not $controls.CloseButton.IsMouseOver -and $event.LeftButton -eq 'Pressed') {
        $window.DragMove()
    }
})
$controls.CloseButton.Add_Click({ $window.Close() })
$window.Add_Closing({
    param($sender, $event)
    $event.Cancel = $script:stage -in 'installing', 'components'
})

[void]$window.ShowDialog()
