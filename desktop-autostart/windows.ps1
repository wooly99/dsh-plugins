$ErrorActionPreference = 'Stop'
$name = 'DSH Desktop Autostart'
$runPath = 'Software\Microsoft\Windows\CurrentVersion\Run'
$approvalPath = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
$layersPath = 'Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers'
$settingsPath = 'Software\DSH\DesktopAutostart'
$hkcu = [Microsoft.Win32.Registry]::CurrentUser
$hklm = [Microsoft.Win32.Registry]::LocalMachine
$exe = $env:DSH_AUTOSTART_EXE
$workDir = [IO.Path]::GetDirectoryName($exe)
$command = '"' + $exe + '"'
$mode = $env:DSH_AUTOSTART_MODE
if ($mode -notin 'init', 'status', 'on', 'off') { throw 'Invalid startup operation' }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $identity.User.Value
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isElevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$taskName = "$name $sid"

function Read-Value($root, $path, $valueName) {
  $key = $root.OpenSubKey($path)
  if ($null -eq $key) { return }
  try { return ,($key.GetValue($valueName)) } finally { $key.Dispose() }
}

function Remove-Value($path) {
  $key = $hkcu.OpenSubKey($path, $true)
  if ($null -eq $key) { return }
  try { $key.DeleteValue($name, $false) } finally { $key.Dispose() }
}

if ($mode -eq 'init') {
  # The first mount enables startup; later mounts respect the saved choice.
  $mode = if (Read-Value $hkcu $settingsPath 'Configured') { 'status' } else { 'on' }
}

$wantsAdmin = $isElevated -or (
  (Read-Value $hkcu $layersPath $exe) -match '(?:^|\s)RUNASADMIN(?:\s|$)') -or (
  (Read-Value $hklm $layersPath $exe) -match '(?:^|\s)RUNASADMIN(?:\s|$)')

# Query the task through the built-in scheduler COM API (no Admin-only CIM query).
$scheduler = New-Object -ComObject 'Schedule.Service'
$scheduler.Connect()
$folder = $scheduler.GetFolder('\')

function Find-Task {
  try { return $folder.GetTask($taskName) }
  catch [System.IO.FileNotFoundException] { return $null }
}

function Test-User($user) {
  if ($user -eq $sid) { return $true }
  if (-not $user) { return $false }
  try { return [Security.Principal.NTAccount]::new($user).Translate([Security.Principal.SecurityIdentifier]).Value -eq $sid }
  catch [Security.Principal.IdentityNotMappedException] { return $false }
}

function Test-AdminTask($task) {
  if ($null -eq $task -or -not $task.Enabled) { return $false }
  $def = $task.Definition
  if ($def.Principal.LogonType -ne 3 -or $def.Principal.RunLevel -ne 1 -or
      -not (Test-User $def.Principal.UserId) -or $def.Triggers.Count -ne 1 -or $def.Actions.Count -ne 1) { return $false }
  $trigger = $def.Triggers.Item(1)
  $action = $def.Actions.Item(1)
  return $trigger.Type -eq 9 -and $trigger.Enabled -and (Test-User $trigger.UserId) -and
    $action.Type -eq 0 -and $action.Path -eq $exe -and -not $action.Arguments -and $action.WorkingDirectory -eq $workDir
}

function Register-AdminTask {
  $def = $scheduler.NewTask(0)
  $def.RegistrationInfo.Description = 'Launch DeepSeek Harness at sign-in for this user.'
  $def.Principal.UserId = $sid
  $def.Principal.LogonType = 3 # TASK_LOGON_INTERACTIVE_TOKEN
  $def.Principal.RunLevel = 1 # TASK_RUNLEVEL_HIGHEST
  $def.Settings.DisallowStartIfOnBatteries = $false
  $def.Settings.StopIfGoingOnBatteries = $false
  $def.Settings.ExecutionTimeLimit = 'PT0S' # Do not stop this GUI app after the default 72 hours.
  $trigger = $def.Triggers.Create(9) # TASK_TRIGGER_LOGON
  $trigger.UserId = $sid
  $action = $def.Actions.Create(0) # TASK_ACTION_EXEC
  $action.Path = $exe
  $action.WorkingDirectory = $workDir
  $null = $folder.RegisterTaskDefinition($taskName, $def, 6, $sid, $null, 3, $null) # TASK_CREATE_OR_UPDATE
}

$task = Find-Task
$taskEnabled = Test-AdminTask $task
if ($mode -eq 'on' -and ($wantsAdmin -or $taskEnabled)) {
  if (-not $taskEnabled) {
    if (-not $isElevated) { '{"error":"admin-required"}'; return }
    Register-AdminTask
    $taskEnabled = Test-AdminTask (Find-Task)
    if (-not $taskEnabled) { throw 'Elevated startup task could not be verified' }
  }
  # Do not remove the old entry until the replacement is verified.
  Remove-Value $runPath
  Remove-Value $approvalPath
} elseif ($mode -eq 'on') {
  if ($null -ne $task) { $folder.DeleteTask($taskName, 0) }
  $run = $hkcu.CreateSubKey($runPath)
  try { $run.SetValue($name, $command, [Microsoft.Win32.RegistryValueKind]::String) } finally { $run.Dispose() }
  Remove-Value $approvalPath
} elseif ($mode -eq 'off') {
  if ($null -ne $task) { $folder.DeleteTask($taskName, 0) }
  Remove-Value $runPath
  Remove-Value $approvalPath
  $taskEnabled = $false
  if ($null -ne (Find-Task) -or $null -ne (Read-Value $hkcu $runPath $name)) { throw 'Startup entry still exists' }
}

$flag = Read-Value $hkcu $approvalPath $name
$blocked = $flag -is [byte[]] -and $flag.Length -gt 0 -and ($flag[0] -band 1) -ne 0
$legacyEnabled = (Read-Value $hkcu $runPath $name) -eq $command -and -not $blocked
$enabled = $taskEnabled -or ($legacyEnabled -and -not $wantsAdmin)
if ($mode -eq 'off' -or ($mode -eq 'on' -and $enabled)) {
  $settings = $hkcu.CreateSubKey($settingsPath)
  try { $settings.SetValue('Configured', 1, [Microsoft.Win32.RegistryValueKind]::DWord) } finally { $settings.Dispose() }
}
[ordered]@{
  enabled = $enabled
  adminMode = $taskEnabled -or $wantsAdmin
  needsRepair = $legacyEnabled -and $wantsAdmin -and -not $taskEnabled
} | ConvertTo-Json -Compress
