#requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$Profile = 'desktop',
    [string]$DshHome = $env:DSH_HOME,
    [string]$DshPath
)
$ErrorActionPreference = 'Stop'
if ($Profile -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]*$') { throw 'Invalid profile name.' }
if (-not $DshHome) { $DshHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh' }
$target = Join-Path (Join-Path $DshHome 'profiles') $Profile
$packages = foreach ($spec in (Get-Content "$PSScriptRoot/plugins.json" -Raw -Encoding UTF8 | ConvertFrom-Json)) {
    if ($spec.StartsWith('./')) {
        $directory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot $spec.Substring(2))).Path
        $metadata = Get-Content -LiteralPath "$directory/package.json" -Raw -Encoding UTF8 | ConvertFrom-Json
        [pscustomobject]@{ Name = $metadata.name; Spec = 'link:' + ($directory -replace '\\', '/') }
    } else {
        [pscustomobject]@{ Name = $spec -replace '@[^@]+$', ''; Spec = $spec }
    }
}
# Reject cmd.exe metacharacters; spaces and Unicode paths are supported.
if (($packages.Spec -join '') -match '["%!&|<>^()\r\n]') { throw 'Use a repository path without cmd.exe special characters.' }
Write-Host "Target: $target"
$packages.Spec | ForEach-Object { Write-Host "  $_" }
if (-not $Apply) { Write-Host 'Preview only. Quit DSH, then run with -Apply to install.'; return }

if (-not $DshPath) {
    $command = Get-Command dsh -CommandType Application, ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { $DshPath = $command.Source }
    foreach ($base in @("$env:LOCALAPPDATA/Programs/DeepSeek Harness", "$env:ProgramFiles/DeepSeek Harness")) {
        $candidate = Join-Path $base 'resources/runtime/cli/bin/dsh.cmd'
        if (-not $DshPath -and (Test-Path -LiteralPath $candidate)) { $DshPath = $candidate }
    }
}
if (-not $DshPath) { throw 'DSH CLI not found. Supply -DshPath; see README.' }
$DshPath = (Resolve-Path -LiteralPath $DshPath).Path
if ($DshPath -match '["%!&|<>^()\r\n]') { throw 'Use a DSH CLI path without cmd.exe special characters.' }
if ($env:DSH_SHELL -eq '1' -and $env:DSH_PROFILE_DIR -and
    [IO.Path]::GetFullPath($target).TrimEnd('\', '/') -eq [IO.Path]::GetFullPath($env:DSH_PROFILE_DIR).TrimEnd('\', '/')) {
    throw 'Quit DSH and run this from an external PowerShell.'
}
if ($Profile -eq 'desktop' -and (Get-Process -Name 'DeepSeek Harness', 'deepseek-harness' -ErrorAction SilentlyContinue)) {
    throw 'Fully quit DSH, including the system tray, before installing.'
}
$manifest = Join-Path $target 'package.json'
if (-not (Test-Path -LiteralPath $manifest)) { throw 'Open DSH once to initialize this profile, then quit it.' }
$before = Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($package in $packages) {
    if ($before.dependencies -and $before.dependencies.PSObject.Properties[$package.Name] -and $before.dsh.profile.bundles -notcontains $package.Name) {
        throw "Enable $($package.Name) in DSH first, then quit and retry."
    }
}
$backup = Join-Path $target ('.plugin-restore-backups/' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup | Out-Null
foreach ($name in @('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml')) {
    $file = Join-Path $target $name
    if (Test-Path -LiteralPath $file) { Copy-Item -LiteralPath $file -Destination $backup }
}
$oldHome = $env:DSH_HOME
try {
    $env:DSH_HOME = $DshHome
    $cliArgs = @('plugin', '--profile', $Profile, 'add', '--save-exact', '--ignore-scripts') + @($packages.Spec)
    $global:LASTEXITCODE = 0
    & $DshPath @cliArgs
    if ($LASTEXITCODE -ne 0) { throw "DSH installer exited with code $LASTEXITCODE." }
    $after = Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($package in $packages) {
        if ($after.dsh.profile.bundles -notcontains $package.Name) { throw "DSH did not register $($package.Name). Update DSH or enable it in the GUI." }
        $installed = Get-Content -LiteralPath "$target/node_modules/$($package.Name)/package.json" -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($installed.name -ne $package.Name) { throw "Package verification failed: $($package.Name)" }
    }
    if ($packages.Name -contains '@local/dsh-archive-cleanup' -and $before.dependencies -and $before.dependencies.PSObject.Properties['@local/dsh-session-delete']) {
        & $DshPath plugin --profile $Profile remove '@local/dsh-session-delete' --config.ignore-scripts=true
        if ($LASTEXITCODE -ne 0) { throw 'New plugin installed, but removing the old session-delete plugin failed.' }
    }
} catch {
    throw "$($_.Exception.Message) Backup: $backup . Downloaded modules may remain."
} finally {
    $env:DSH_HOME = $oldHome
}
Write-Host 'Installed. Restart DSH and sign in to Codex.'
