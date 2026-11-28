$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this integration test as an administrator.'
}

$tag = 'DSHAutostartTest-' + [guid]::NewGuid().ToString('N')
$root = "Software\$tag"
$taskName = "$tag $($identity.User.Value)"
$code = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '../windows.ps1'))
$code = $code.Replace("'DSH Desktop Autostart'", "'$tag'").Replace(
  'Software\Microsoft\Windows\CurrentVersion\Run', "$root\Run").Replace(
  'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run', "$root\Approval").Replace(
  'Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers', "$root\Layers").Replace(
  'Software\DSH\DesktopAutostart', "$root\Settings")
$fixture = [scriptblock]::Create($code)
$ordinaryCode = $code -replace '(?m)^\$isElevated = .+$', '$$isElevated = $false'
$ordinary = [scriptblock]::Create($ordinaryCode)
$failing = [scriptblock]::Create($code.Replace('  $null = $folder.RegisterTaskDefinition(', "  throw 'simulated registration failure'`n  " + '$null = $folder.RegisterTaskDefinition('))
$hkcu = [Microsoft.Win32.Registry]::CurrentUser
$scheduler = New-Object -ComObject 'Schedule.Service'
$scheduler.Connect()
$folder = $scheduler.GetFolder('\')

function Write-FixtureValue($subkey, $keyName, $value, $kind) {
  $key = $hkcu.CreateSubKey("$root\$subkey")
  try { $key.SetValue($keyName, $value, $kind) } finally { $key.Dispose() }
}

function Assert-State($script, $mode, $expected) {
  $env:DSH_AUTOSTART_MODE = $mode
  $result = (& $script | ConvertFrom-Json)
  foreach ($key in $expected.Keys) {
    if ($result.$key -ne $expected[$key]) { throw "$mode expected $key=$($expected[$key]), got $($result | ConvertTo-Json -Compress)" }
  }
}

# Register test-only Notepad actions but never run them; the task can be deleted without opening an app.
$env:DSH_AUTOSTART_EXE = Join-Path $env:SystemRoot 'System32\notepad.exe'
try {
  Assert-State $ordinary status @{ enabled = $false; adminMode = $false }
  Assert-State $ordinary init @{ enabled = $true; adminMode = $false }
  Write-FixtureValue Approval $tag ([byte[]]@(3, 0)) Binary
  Assert-State $ordinary init @{ enabled = $false; adminMode = $false }
  Assert-State $ordinary on @{ enabled = $true; adminMode = $false }
  $hkcu.DeleteSubKey("$root\Settings") # Simulate an upgrade from a version without a saved choice.
  Write-FixtureValue Layers $env:DSH_AUTOSTART_EXE '~ RUNASADMIN' String
  Assert-State $ordinary status @{ enabled = $false; adminMode = $true; needsRepair = $true }
  Assert-State $ordinary init @{ error = 'admin-required' }
  Assert-State $fixture status @{ enabled = $false; adminMode = $true; needsRepair = $true }

  try {
    Assert-State $failing init @{}
    throw 'Expected registration to fail'
  } catch { if ($_.Exception.Message -ne 'simulated registration failure') { throw } }
  Assert-State $fixture status @{ enabled = $false; needsRepair = $true }

  Assert-State $fixture init @{ enabled = $true; adminMode = $true; needsRepair = $false }
  $task = $folder.GetTask($taskName)
  $settings = $task.Definition.Settings
  if ($settings.DisallowStartIfOnBatteries -or $settings.StopIfGoingOnBatteries -or $settings.ExecutionTimeLimit -ne 'PT0S') {
    throw 'Unexpected restrictions for the login task'
  }
  $run = $hkcu.OpenSubKey("$root\Run")
  try { if ($null -ne $run.GetValue($tag)) { throw 'Legacy startup entry was not removed' } } finally { $run.Dispose() }
  Assert-State $fixture on @{ enabled = $true }
  $task.Enabled = $false
  Assert-State $fixture status @{ enabled = $false; adminMode = $true }
  Assert-State $fixture on @{ enabled = $true; adminMode = $true }
  Assert-State $fixture off @{ enabled = $false; needsRepair = $false }
  Assert-State $fixture init @{ enabled = $false; needsRepair = $false }
  try {
    $null = $folder.GetTask($taskName)
    throw 'Test task still exists after disabling auto-start'
  } catch [System.IO.FileNotFoundException] {}
  'Windows startup integration checks passed'
} finally {
  try { $folder.DeleteTask($taskName, 0) } catch [System.IO.FileNotFoundException] {}
  finally { $hkcu.DeleteSubKeyTree($root, $false) }
}
