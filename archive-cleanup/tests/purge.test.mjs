import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { apply, collectSubtree, deleteSessionFiles, dshHomeCandidates, purgeArchived } from '../index.js'

const TARGET = 'session-00000000-0000-4000-8000-000000000001'
const CHILD = 'session-00000000-0000-4000-8000-000000000002'
const FORK = 'session-00000000-0000-4000-8000-000000000003'
const OTHER = 'session-00000000-0000-4000-8000-000000000004'
const LIVE = 'session-00000000-0000-4000-8000-000000000005'

function snapshot(id, headerExtra = {}) {
  return { header: { version: 4, id, createdAt: 1, cwd: 'C:\\work\\demo', isSeeded: false, ...headerExtra }, sizeBytes: 10 }
}

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'dsh-archive-cleanup-'))
  t.after(async () => {
    assert.equal(dirname(resolve(base)), resolve(tmpdir()))
    assert.match(basename(base), /^dsh-archive-cleanup-/)
    await rm(base, { recursive: true, force: true })
  })
  const home = join(base, 'home')
  const root = join(home, 'sessions')
  const cache = join(home, 'storages', 'session_projcache', 'sessions')
  await mkdir(cache, { recursive: true })
  const dir = id => join(root, '--C--work--demo--', id)
  for (const id of [TARGET, CHILD, FORK, OTHER, LIVE]) {
    await mkdir(dir(id), { recursive: true })
    await writeFile(join(dir(id), 'session.v4.jsonl'), 'x'.repeat(100))
  }
  await writeFile(join(cache, `${TARGET}.json`), '{}')
  const snapshots = [
    snapshot(TARGET),
    snapshot(CHILD, { origin: 'subagent', parentSession: TARGET }),
    snapshot(FORK, { parentSession: TARGET, isSeeded: true }),
    snapshot(OTHER),
    snapshot(LIVE),
  ]
  const archived = [TARGET, LIVE]
  const used = { detached: [], schedules: [], removed: [], unarchived: [], killed: [] }
  const registry = {
    get archivedSessionIds() { return archived },
    list: () => [{ id: 'ws', sessionIds: [TARGET, CHILD, OTHER], detachSession: async id => used.detached.push(id) }],
    unarchiveSession: async id => { used.unarchived.push(id); const at = archived.indexOf(id); if (at >= 0) archived.splice(at, 1) },
  }
  const persistence = { root, list: async () => snapshots }
  const schedule = { catalog: async () => [{ id: 'task', sessionId: TARGET }], delete: async r => used.schedules.push(r.id) }
  const services = {
    workspaceRegistry: registry,
    sessionPersistence: persistence,
    schedule,
    agents: undefined,
    sessions: { get: id => (id === LIVE ? {} : undefined) },
  }
  const routes = {}
  const ctx = {
    get: service => services[service],
    emit: (event, id) => used.removed.push([event, id]),
    waterfall: async () => [],
    connection: { fetch: { register: route => { routes[route.path] = route } } },
  }
  return { home, root, cache, dir, snapshots, archived, used, services, ctx, routes }
}

function post(route, body) {
  return route.fetch(new Request('http://127.0.0.1:1/x', { method: 'POST', body: JSON.stringify(body) }))
}

test('purge deletes only archived cold sessions with their subtree and metadata', async t => {
  const f = await fixture(t)
  process.env.DSH_HOME = f.home
  apply(f.ctx)
  assert.ok(f.routes['/api/archive-cleanup.status'], 'status route registered')
  assert.ok(f.routes['/api/archive-cleanup.purge'], 'purge route registered')

  const statusRoute = f.routes['/api/archive-cleanup.status']
  assert.equal(statusRoute.requestBody, 'buffered', 'GET must not be bridged as a streaming request with a body')
  const status = await statusRoute.fetch(new Request('http://dsh.internal/api/archive-cleanup.status', {
    method: 'GET',
    ...(statusRoute.requestBody === 'buffered' ? {} : { body: 'unexpected body' }),
  }))
  const statusBody = await status.json()
  assert.equal(statusBody.archived, 2)

  const response = await post(f.routes['/api/archive-cleanup.purge'], {})
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body.deleted.map(entry => entry.id), [TARGET])
  assert.deepEqual(body.skipped, [{ id: LIVE, reason: 'busy' }])
  assert.ok(body.bytes >= 100)
  assert.equal(await stat(f.dir(TARGET)).then(() => 'present', () => 'gone'), 'gone')
  assert.equal(await stat(f.dir(CHILD)).then(() => 'present', () => 'gone'), 'gone')
  assert.equal(await stat(f.dir(FORK)).then(() => 'present', () => 'gone'), 'present', 'forks survive')
  assert.equal(await stat(f.dir(OTHER)).then(() => 'present', () => 'gone'), 'present', 'unarchived survives')
  assert.equal(await stat(f.dir(LIVE)).then(() => 'present', () => 'gone'), 'present', 'live survives')
  assert.deepEqual(f.used.unarchived, [TARGET])
  assert.deepEqual(f.used.detached, [TARGET, CHILD])
  assert.deepEqual(f.used.schedules, ['task'])
  assert.deepEqual(f.used.removed, [['api-session/removed', TARGET], ['api-session/removed', CHILD]])
  assert.equal(await stat(join(f.cache, `${TARGET}.json`)).then(() => 'present', () => 'gone'), 'gone')
})

test('a session reporting activity is skipped and keeps its files', async t => {
  const f = await fixture(t)
  f.context = undefined
  f.ctx.waterfall = async (_name, { sessionId }) => (sessionId === TARGET ? ['running'] : [])
  apply(f.ctx)
  const body = await (await post(f.routes['/api/archive-cleanup.purge'], {})).json()
  assert.deepEqual(body.deleted, [])
  assert.ok(body.skipped.some(entry => entry.id === TARGET && entry.reason === 'busy'))
  assert.equal(await stat(f.dir(TARGET)).then(() => 'present', () => 'gone'), 'present')
})

test('a non-archived id in the request is ignored', async t => {
  const f = await fixture(t)
  apply(f.ctx)
  const body = await (await post(f.routes['/api/archive-cleanup.purge'], { sessionIds: [OTHER] })).json()
  assert.deepEqual(body.deleted, [])
  assert.equal(await stat(f.dir(OTHER)).then(() => 'present', () => 'gone'), 'present')
})

test('malformed identifiers are refused before touching storage', async t => {
  const f = await fixture(t)
  apply(f.ctx)
  const response = await post(f.routes['/api/archive-cleanup.purge'], { sessionIds: ['../escape'] })
  assert.equal(response.status, 400)
  assert.equal(await stat(f.dir(TARGET)).then(() => 'present', () => 'gone'), 'present')
})

test('missing logs are skipped instead of failing the whole purge', async t => {
  const f = await fixture(t)
  f.archived.push('session-00000000-0000-4000-8000-000000000099')
  apply(f.ctx)
  const body = await (await post(f.routes['/api/archive-cleanup.purge'], {})).json()
  assert.deepEqual(body.deleted.map(entry => entry.id), [TARGET])
  assert.ok(body.skipped.some(entry => entry.reason === 'missing'))
})

test('subtree follows subagents only, and helpers stay exported', async t => {
  const f = await fixture(t)
  const tree = collectSubtree(f.snapshots, f.snapshots[0])
  assert.deepEqual(tree.map(item => item.header.id), [TARGET, CHILD])
  assert.equal(await deleteSessionFiles(f.root, OTHER), 1)
  assert.ok(dshHomeCandidates().length >= 1)
})

test('purgeArchived reports freed bytes for archived targets only', async t => {
  const f = await fixture(t)
  f.services.sessions = { get: () => undefined }
  const result = await purgeArchived(f.ctx)
  assert.deepEqual(result.deleted.map(entry => entry.id), [TARGET, LIVE])
  assert.ok(result.bytes >= 100)
  const files = await readdir(f.root)
  assert.ok(files.includes('--C--work--demo--'))
})
