#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$temp = Join-Path ([IO.Path]::GetTempPath()) ('dsh-plugin-test-' + [guid]::NewGuid().ToString('N'))
$repo = Join-Path $temp ('repo space ' + [char]0x4E2D)
$homeDir = Join-Path $temp 'home'
$profile = Join-Path $homeDir 'profiles/test'
New-Item -ItemType Directory -Path $repo, $profile -Force | Out-Null
try {
    Copy-Item -LiteralPath "$root/restore-plugins.ps1", "$root/plugins.json" -Destination $repo
    foreach ($name in @('rightbar-middle-close', 'archive-cleanup')) {
        New-Item -ItemType Directory -Path "$repo/$name" | Out-Null
        Copy-Item -LiteralPath "$root/$name/package.json" -Destination "$repo/$name"
    }
    $manifest = Join-Path $profile 'package.json'
    '{"dependencies":{"keep":"1.0.0","@local/dsh-session-delete":"1.0.0"},"dsh":{"profile":{"bundles":["keep","@local/dsh-session-delete"]}}}' | Set-Content -LiteralPath $manifest -Encoding UTF8
    $fake = Join-Path $temp 'fake.ps1'
    @'
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$CliArgs)
$file = Join-Path $env:DSH_HOME 'profiles/test/package.json'
$data = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
if ($CliArgs[3] -eq 'remove') {
    if ($data.dsh.profile.bundles -notcontains '@local/dsh-archive-cleanup') { throw 'Old plugin removed before replacement was installed.' }
    $data.dependencies.PSObject.Properties.Remove('@local/dsh-session-delete')
    $data.dsh.profile.bundles = @($data.dsh.profile.bundles | Where-Object { $_ -ne '@local/dsh-session-delete' })
    $data | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $file -Encoding UTF8
    $global:LASTEXITCODE = 0
    return
}
if ($CliArgs.Count -ne 10 -or $CliArgs[3] -ne 'add' -or $CliArgs[5] -ne '--ignore-scripts' -or $CliArgs[8] -ne 'dsh-codex-subscription@latest' -or $CliArgs[9] -ne '@dsh-electron/dsh-plugin-git@latest') { throw 'Wrong CLI arguments.' }
foreach ($spec in $CliArgs[6..9]) {
    $name = $spec -replace '@[^@]+$', ''
    if ($spec.StartsWith('link:')) { $name = (Get-Content -LiteralPath ($spec.Substring(5) + '/package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).name }
    if ($data.dsh.profile.bundles -notcontains $name) { $data.dsh.profile.bundles += $name }
    $directory = Join-Path (Split-Path $file) ('node_modules/' + $name)
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    @{name=$name;version='1.0.0'} | ConvertTo-Json | Set-Content -LiteralPath "$directory/package.json" -Encoding UTF8
}
$data | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $file -Encoding UTF8
$global:LASTEXITCODE = 0
'@ | Set-Content -LiteralPath $fake -Encoding UTF8
    $options = @{ Profile = 'test'; DshHome = $homeDir; DshPath = $fake }
    $hash = (Get-FileHash -LiteralPath $manifest).Hash
    & "$repo/restore-plugins.ps1" @options
    if ((Get-FileHash -LiteralPath $manifest).Hash -ne $hash -or (Test-Path "$profile/.plugin-restore-backups")) { throw 'Preview changed files.' }
    & "$repo/restore-plugins.ps1" @options -Apply
    & "$repo/restore-plugins.ps1" @options -Apply
    $data = Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($data.dsh.profile.bundles.Count -ne 5 -or $data.dependencies.keep -ne '1.0.0' -or $data.dependencies.PSObject.Properties['@local/dsh-session-delete']) { throw 'Merge, migration or repeat install failed.' }
    '$global:LASTEXITCODE = 7' | Set-Content -LiteralPath $fake -Encoding UTF8
    $failed = $false
    try { & "$repo/restore-plugins.ps1" @options -Apply } catch { $failed = $_.Exception.Message -match 'code 7' }
    if (-not $failed) { throw 'Installer failure was not reported.' }
    Write-Host 'Tests passed.'
} finally {
    $resolved = [IO.Path]::GetFullPath($temp)
    if ((Split-Path $resolved -Parent) -ne ([IO.Path]::GetTempPath()).TrimEnd('\', '/') -or (Split-Path $resolved -Leaf) -notmatch '^dsh-plugin-test-[a-f0-9]{32}$') { throw 'Unsafe cleanup path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
