import { execFile } from 'node:child_process'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

export const inject = ['connection']
export const route = '/api/local-desktop-autostart'

// Windows is the source of truth. Only this plugin's named values are touched.
const registry = String.raw`
$ErrorActionPreference = 'Stop'
$name = 'DSH Desktop Autostart'
$hkcu = [Microsoft.Win32.Registry]::CurrentUser
$runPath = 'Software\Microsoft\Windows\CurrentVersion\Run'
$approvalPath = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
$command = '"' + $env:DSH_AUTOSTART_EXE + '"'
$mode = $env:DSH_AUTOSTART_MODE
$run = if ($mode -eq 'on') { $hkcu.CreateSubKey($runPath) } else { $hkcu.OpenSubKey($runPath, ($mode -eq 'off')) }
$approval = $null
try {
  $approval = $hkcu.OpenSubKey($approvalPath, ($mode -ne 'status'))
  if ($mode -eq 'on') { $run.SetValue($name, $command, [Microsoft.Win32.RegistryValueKind]::String) }
  if ($mode -eq 'off' -and $null -ne $run) { $run.DeleteValue($name, $false) }
  if ($mode -ne 'status' -and $null -ne $approval) { $approval.DeleteValue($name, $false) }
  $current = if ($null -ne $run) { $run.GetValue($name) }
  $flag = if ($null -ne $approval) { $approval.GetValue($name) }
  $blocked = $flag -is [array] -and $flag.Length -gt 0 -and ($flag[0] -band 1) -ne 0
  if ($mode -eq 'off' -and $null -ne $current) { throw 'Startup entry still exists' }
  if ($current -eq $command -and -not $blocked) { 'on' } else { 'off' }
} finally {
  if ($null -ne $approval) { $approval.Dispose() }
  if ($null -ne $run) { $run.Dispose() }
}
`

const exec = promisify(execFile)
async function readOrSet(mode) {
  const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const { stdout } = await exec(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(registry, 'utf16le').toString('base64')], {
    windowsHide: true,
    timeout: 5000,
    env: { ...process.env, DSH_AUTOSTART_MODE: mode, DSH_AUTOSTART_EXE: process.execPath },
  })
  const result = stdout.trim()
  if (!['on', 'off'].includes(result) || (mode !== 'status' && mode !== result)) throw new Error('Unexpected startup state')
  return result === 'on'
}

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export function createHandler({ supported, readOrSet, warn = () => {} }) {
  return async request => {
    if (!supported) return json({ supported: false })
    let mode = 'status'
    if (request.method === 'POST') {
      if (request.headers.get('content-type') !== 'application/json') return json({ error: 'invalid-request' }, 400)
      const body = await request.json().catch(() => null)
      if (typeof body?.enabled !== 'boolean') return json({ error: 'invalid-request' }, 400)
      mode = body.enabled ? 'on' : 'off'
    }
    try {
      return json({ supported: true, enabled: await readOrSet(mode) })
    } catch (error) {
      warn(error)
      return json({ error: 'startup-operation-failed' }, 500)
    }
  }
}

export function apply(ctx) {
  const supported = process.platform === 'win32' && Boolean(process.versions.electron)
    && /^deepseek[ _-]*harness\.exe$/i.test(basename(process.execPath))
  ctx.connection.fetch.register({
    path: route,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: createHandler({ supported, readOrSet, warn: error => ctx.logger('desktop-autostart').warn(String(error)) }),
  })
}
