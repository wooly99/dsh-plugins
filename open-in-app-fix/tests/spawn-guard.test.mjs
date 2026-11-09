import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, name } from '../index.js'
import { cleanGuiLaunchOptions, installSpawnGuard } from '../spawn-guard.js'

const command = 'D:\\apps with spaces\\VS Code\\Code.exe'
const folder = 'D:\\项目 with spaces\\work'
const facts = { platform: 'win32', directory: path => path === folder }
const launchOptions = () => ({
  detached: true,
  stdio: 'ignore',
  windowsHide: false,
  cwd: 'D:\\existing cwd',
  env: { PATH: 'preserve', LANG: 'zh_CN.UTF-8', ELECTRON_RUN_AS_NODE: '1', CUSTOM: 'keep' },
})

function fixture(overrides = {}) {
  const calls = []
  const result = { pid: 42 }
  const runtime = { spawn: function (...args) { calls.push({ args, receiver: this }); return result } }
  const original = runtime.spawn
  let syncs = 0
  const install = () => installSpawnGuard({ runtime, sync: () => { syncs += 1 }, ...facts, ...overrides })
  return { calls, result, runtime, original, install, syncs: () => syncs }
}

test('cleans only a copied GUI child environment and preserves options', () => {
  const options = launchOptions()
  const before = structuredClone(options)
  const cleaned = cleanGuiLaunchOptions(command, [folder], options, facts)
  assert.notEqual(cleaned, options)
  assert.notEqual(cleaned.env, options.env)
  assert.equal(cleaned.env.ELECTRON_RUN_AS_NODE, undefined)
  const expected = structuredClone(options)
  delete expected.env.ELECTRON_RUN_AS_NODE
  assert.deepEqual(cleaned, expected)
  assert.deepEqual(options, before)
})

test('recognizes Windows case variants, Code Insiders and UNC folders', () => {
  for (const executable of ['CODE.EXE', 'Code.exe', 'Code - Insiders.exe']) {
    const options = launchOptions()
    options.env.electron_run_as_node = '1'
    const cleaned = cleanGuiLaunchOptions(`D:\\apps\\${executable}`, [folder], options, facts)
    assert(!Object.keys(cleaned.env).some(key => key.toUpperCase() === 'ELECTRON_RUN_AS_NODE'))
  }
  const unc = '\\\\server\\share\\工作区'
  const options = launchOptions()
  assert.notEqual(cleanGuiLaunchOptions(command, [unc], options, { platform: 'win32', directory: () => true }), options)
})

const unmatched = [
  ['Linux', command, [folder], () => launchOptions(), { ...facts, platform: 'linux' }],
  ['macOS', command, [folder], () => launchOptions(), { ...facts, platform: 'darwin' }],
  ['another Electron GUI', 'D:\\GitHubDesktop.exe', [folder]],
  ['DSH background process', 'D:\\DeepSeek Harness.exe', [folder]],
  ['VS Code cmd CLI', 'D:\\bin\\code.cmd', [folder]],
  ['VS Code cli.js', command, ['D:\\resources\\app\\out\\cli.js', folder]],
  ['Node script single arg', command, ['D:\\script.js']],
  ['relative folder', command, ['relative-folder']],
  ['POSIX path', command, ['/tmp/workspace']],
  ['empty args', command, []],
  ['non-array args', command, { cwd: folder }],
  ['missing args', command, undefined],
  ['extra flags', command, ['--new-window', folder]],
  ['null byte', command, [folder + '\0']],
  ['missing directory', command, [folder], () => launchOptions(), { ...facts, directory: () => false }],
  ['not detached', command, [folder], () => ({ ...launchOptions(), detached: false })],
  ['piped tool', command, [folder], () => ({ ...launchOptions(), stdio: 'pipe' })],
  ['array stdio', command, [folder], () => ({ ...launchOptions(), stdio: ['ignore', 'ignore', 'ignore'] })],
  ['implicit host environment', command, [folder], () => ({ detached: true, stdio: 'ignore' })],
  ['null environment', command, [folder], () => ({ ...launchOptions(), env: null })],
  ['missing flag', command, [folder], () => ({ ...launchOptions(), env: { PATH: 'keep' } })],
  ['empty flag', command, [folder], () => ({ ...launchOptions(), env: { ELECTRON_RUN_AS_NODE: '' } })],
  ['undefined flag', command, [folder], () => ({ ...launchOptions(), env: { ELECTRON_RUN_AS_NODE: undefined } })],
  ['missing options', command, [folder], () => undefined],
  ['non-string command', null, [folder]],
]
for (const [label, executable, args, optionsFactory = launchOptions, testFacts = facts] of unmatched) {
  test(`delegates unchanged: ${label}`, () => {
    const options = optionsFactory()
    assert.equal(cleanGuiLaunchOptions(executable, args, options, testFacts), options)
  })
}

test('real filesystem predicate leaves nonexistent absolute directories untouched', () => {
  const options = launchOptions()
  assert.equal(cleanGuiLaunchOptions(command, ['Z:\\does-not-exist-dsh-fix-861f2820'], options, { platform: 'win32' }), options)
})

test('wrapper passes exact arguments, receiver, return value and host env through', () => {
  const f = fixture()
  const options = launchOptions()
  const hostEnv = { ...process.env }
  const release = f.install()
  const receiver = { marker: true }
  assert.equal(f.runtime.spawn.call(receiver, command, [folder], options, 'extra'), f.result)
  const call = f.calls[0]
  assert.equal(call.receiver, receiver)
  assert.equal(call.args[0], command)
  assert.deepEqual(call.args[1], [folder])
  assert.equal(call.args[3], 'extra')
  assert.equal(call.args[2].env.ELECTRON_RUN_AS_NODE, undefined)
  assert.deepEqual({ ...process.env }, hostEnv)
  assert.equal(options.env.ELECTRON_RUN_AS_NODE, '1')
  release()
  assert.equal(f.runtime.spawn, f.original)
  assert.equal(f.syncs(), 2)
})

test('unmatched spawn overloads preserve exact arity and object identity', () => {
  const f = fixture()
  const release = f.install()
  const options = { env: { ELECTRON_RUN_AS_NODE: '1' } }
  f.runtime.spawn('node', options)
  assert.equal(f.calls[0].args.length, 2)
  assert.equal(f.calls[0].args[1], options)
  f.runtime.spawn('node')
  assert.equal(f.calls[1].args.length, 1)
  release()
})

test('native synchronous errors are not swallowed or converted', () => {
  const error = Object.assign(new Error('spawn failure'), { code: 'EINVAL' })
  const runtime = { spawn() { throw error } }
  const release = installSpawnGuard({ runtime, sync() {}, ...facts })
  assert.throws(() => runtime.spawn(command, [folder], launchOptions()), value => value === error)
  release()
})

test('async child errors remain on the exact original child object', async () => {
  const { EventEmitter, once } = await import('node:events')
  const child = new EventEmitter()
  const runtime = { spawn() { return child } }
  const release = installSpawnGuard({ runtime, sync() {}, ...facts })
  const returned = runtime.spawn(command, [folder], launchOptions())
  assert.equal(returned, child)
  const observed = once(returned, 'error')
  const error = Object.assign(new Error('not found'), { code: 'ENOENT' })
  child.emit('error', error)
  assert.equal((await observed)[0], error)
  release()
})

test('multiple activations share one hook; cleanup is reference-counted and idempotent', () => {
  const f = fixture()
  const first = f.install()
  const wrapper = f.runtime.spawn
  const second = f.install()
  assert.equal(f.runtime.spawn, wrapper)
  assert.equal(f.syncs(), 1)
  first()
  first()
  assert.equal(f.runtime.spawn, wrapper)
  second()
  assert.equal(f.runtime.spawn, f.original)
  assert.equal(f.syncs(), 2)
  const third = f.install()
  assert.notEqual(f.runtime.spawn, wrapper)
  third()
  assert.equal(f.runtime.spawn, f.original)
})

test('disabling does not overwrite a later hook; captured wrapper becomes inert', () => {
  const f = fixture()
  const release = f.install()
  const captured = f.runtime.spawn
  const other = function (...args) { return Reflect.apply(captured, this, args) }
  f.runtime.spawn = other
  release()
  assert.equal(f.runtime.spawn, other)
  const options = launchOptions()
  f.runtime.spawn(command, [folder], options)
  assert.equal(f.calls[0].args[2], options)
  assert.equal(f.syncs(), 1)
  const again = f.install()
  f.runtime.spawn(command, [folder], options)
  assert.equal(f.calls[1].args[2].env.ELECTRON_RUN_AS_NODE, undefined)
  again()
  assert.equal(f.runtime.spawn, other)
})

test('detects a conflicting replacement while an installation remains owned', () => {
  const f = fixture()
  const release = f.install()
  const other = () => {}
  f.runtime.spawn = other
  assert.throws(f.install, /spawn was replaced/)
  release()
  assert.equal(f.runtime.spawn, other)
})

test('failed synchronizer rolls back native spawn and leaves no stale owner state', () => {
  const runtime = { spawn() {} }
  const original = runtime.spawn
  const error = new Error('sync failed')
  assert.throws(() => installSpawnGuard({ runtime, sync() { throw error }, ...facts }), value => value === error)
  assert.equal(runtime.spawn, original)
  const release = installSpawnGuard({ runtime, sync() {}, ...facts })
  release()
  assert.equal(runtime.spawn, original)
})

test('non-Windows activation is a no-op and does not synchronize global exports', () => {
  const f = fixture({ platform: 'linux' })
  const release = f.install()
  assert.equal(f.runtime.spawn, f.original)
  assert.equal(f.syncs(), 0)
  release()
})

test('apply owns its only registration as a disposable Host effect', () => {
  assert.equal(name, 'open-in-app-fix')
  const effects = []
  apply({ effect(factory, label) { effects.push({ factory, label }) } })
  assert.equal(effects.length, 1)
  assert.equal(typeof effects[0].factory, 'function')
  assert.match(effects[0].label, /VS Code child environment/)
})
