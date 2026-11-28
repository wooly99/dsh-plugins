import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

export const inject = ['connection']
export const route = '/api/local-desktop-autostart'

const exec = promisify(execFile)
let pending = Promise.resolve()
function readOrSet(mode) {
  // Keep Windows reads and migrations ordered, even with multiple settings windows.
  const operation = pending.then(async () => {
    const script = await readFile(new URL('./windows.ps1', import.meta.url), 'utf8')
    const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const { stdout } = await exec(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true,
      timeout: 15000,
      env: { ...process.env, DSH_AUTOSTART_MODE: mode, DSH_AUTOSTART_EXE: process.execPath },
    })
    const state = JSON.parse(stdout)
    if (state?.error === 'admin-required') return { error: state.error }
    if (typeof state?.enabled !== 'boolean' || typeof state.adminMode !== 'boolean' || typeof state.needsRepair !== 'boolean'
      || (mode === 'on' && !state.enabled) || (mode === 'off' && state.enabled)) throw new Error('Unexpected startup state')
    return { enabled: state.enabled, adminMode: state.adminMode, needsRepair: state.needsRepair }
  })
  pending = operation.catch(() => {})
  return operation
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
      const state = await readOrSet(mode)
      if (state.error === 'admin-required') return json({ error: state.error }, 403)
      return json({ supported: true, ...state })
    } catch (error) {
      warn(error)
      return json({ error: 'startup-operation-failed' }, 500)
    }
  }
}

export function apply(ctx) {
  const supported = process.platform === 'win32' && Boolean(process.versions.electron)
    && /^deepseek[ _-]*harness\.exe$/i.test(basename(process.execPath))
  const warn = error => ctx.logger('desktop-autostart').warn(String(error))
  ctx.connection.fetch.register({
    path: route,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: createHandler({ supported, readOrSet, warn }),
  })
  if (supported) {
    void readOrSet('init').then(state => {
      if (state.error) warn(state.error)
    }).catch(warn)
  }
}
