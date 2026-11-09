import childProcess from 'node:child_process'
import { statSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { win32 } from 'node:path'

const FLAG = 'ELECTRON_RUN_AS_NODE'
const STATE = Symbol.for('@local/dsh-open-in-app-fix/spawn-guard/v1')
const EXECUTABLES = new Set(['code.exe', 'code - insiders.exe'])

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

// Only match DSH's VS Code folder launches, never CLI/script launches.
export function cleanGuiLaunchOptions(command, args, options, {
  platform = process.platform,
  directory = isDirectory,
} = {}) {
  if (platform !== 'win32' || typeof command !== 'string') return options
  if (!EXECUTABLES.has(win32.basename(command).toLowerCase())) return options
  if (!Array.isArray(args) || args.length !== 1 || typeof args[0] !== 'string') return options
  if (!win32.isAbsolute(args[0]) || args[0].includes('\0')) return options
  if (options?.detached !== true || options.stdio !== 'ignore') return options
  const env = options.env
  if (env === null || typeof env !== 'object') return options
  const keys = Object.keys(env).filter(key => key.toUpperCase() === FLAG)
  if (!keys.some(key => env[key] !== undefined && env[key] !== '')) return options
  if (!directory(args[0])) return options
  const cleanedEnv = { ...env }
  for (const key of keys) delete cleanedEnv[key]
  return { ...options, env: cleanedEnv }
}

// Sync existing ESM imports; keep host env and route authorization unchanged.
export function installSpawnGuard({
  runtime = childProcess,
  sync = syncBuiltinESMExports,
  platform = process.platform,
  directory = isDirectory,
} = {}) {
  if (platform !== 'win32') return () => {}
  let state = runtime[STATE]
  if (state && (!state.enabled || runtime.spawn !== state.wrapped)) {
    throw new Error('open-in-app-fix: spawn was replaced by another hook; restart DSH')
  }
  if (!state) {
    const original = runtime.spawn
    if (typeof original !== 'function') throw new Error('open-in-app-fix: Node spawn is unavailable')
    state = { original, owners: 0, enabled: true }
    state.wrapped = function (...callArgs) {
      if (state.enabled) {
        const cleaned = cleanGuiLaunchOptions(callArgs[0], callArgs[1], callArgs[2], { platform, directory })
        if (cleaned !== callArgs[2]) callArgs[2] = cleaned
      }
      return Reflect.apply(original, this, callArgs)
    }
    Object.defineProperty(runtime, STATE, { value: state, configurable: true })
    try {
      runtime.spawn = state.wrapped
      sync()
    } catch (error) {
      state.enabled = false
      if (runtime.spawn === state.wrapped) runtime.spawn = original
      delete runtime[STATE]
      try { sync() } catch { /* keep the original activation error */ }
      throw error
    }
  }
  state.owners += 1
  let released = false
  return () => {
    if (released) return
    released = true
    state.owners -= 1
    if (state.owners !== 0) return
    state.enabled = false
    if (runtime[STATE] === state) delete runtime[STATE]
    // Leave other plugins' later wrappers intact.
    if (runtime.spawn === state.wrapped) {
      runtime.spawn = state.original
      sync()
    }
  }
}
