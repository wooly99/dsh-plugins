/**
 * Unit checks for the session-delete Host half against a disposable fixture.
 * Run with the bundled Electron Node:
 *   ELECTRON_RUN_AS_NODE=1 ELECTRON_NO_ASAR=1 "<app exe>" --expose-internals tests\host.test.mjs
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

import { apply, collectSubtree, deleteSessionFiles, dshHomeCandidates } from '../index.js'

const ROOT = await mkdtemp(join(tmpdir(), 'dsh-session-delete-'))
const HOME = join(ROOT, 'home')
const SESSIONS = join(HOME, 'sessions')
const CACHE = join(HOME, 'storages', 'session_projcache', 'sessions')

const TARGET = 'session-00000000-0000-4000-8000-000000000001'
const CHILD = 'session-00000000-0000-4000-8000-000000000002'
const GRANDCHILD = 'session-00000000-0000-4000-8000-000000000003'
const FORK = 'session-00000000-0000-4000-8000-000000000004'
const OTHER = 'session-00000000-0000-4000-8000-000000000005'

const results = []
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => results.push(`ok   ${name}`))
    .catch((error) => {
      results.push(`FAIL ${name}: ${error.message}`)
      process.exitCode = 1
    })
}

async function writeSession(project, id, content = `${id}\n`) {
  const dir = join(SESSIONS, project, id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'session.v4.jsonl'), content)
  return dir
}

function header(id, extra = {}) {
  return { version: 4, id, createdAt: 1, cwd: 'C:\\work\\demo', isSeeded: false, ...extra }
}

function snapshot(id, extra = {}, headerExtra = {}) {
  return { header: header(id, headerExtra), revision: 'r', sizeBytes: 10, eventCount: 1, ...extra }
}

const targetDir = await writeSession('--C--work--demo--', TARGET)
const childDir = await writeSession('--C--work--demo--', CHILD)
const grandchildDir = await writeSession('--C--work--demo--', GRANDCHILD)
const forkDir = await writeSession('--C--work--demo--', FORK)
const otherDir = await writeSession('--C--other--', OTHER)
await mkdir(CACHE, { recursive: true })
await writeFile(join(CACHE, `${TARGET}.json`), '{}')

const snapshots = [
  snapshot(TARGET),
  snapshot(CHILD, {}, { origin: 'subagent', parentSession: TARGET, delegationDepth: 1 }),
  snapshot(GRANDCHILD, {}, { origin: 'subagent', parentSession: CHILD, delegationDepth: 2 }),
  snapshot(FORK, {}, { parentSession: TARGET, isSeeded: true }),
  snapshot(OTHER),
]

await check('collectSubtree follows subagent children only', () => {
  const subtree = collectSubtree(snapshots, snapshots[0])
  assert.deepEqual(
    subtree.map((item) => item.header.id),
    [TARGET, CHILD, GRANDCHILD],
  )
})

await check('deleteSessionFiles removes only the addressed session directory', async () => {
  const removed = await deleteSessionFiles(SESSIONS, TARGET)
  assert.equal(removed, 1)
  await assert.rejects(stat(targetDir), /ENOENT/)
  assert.ok((await stat(childDir)).isDirectory())
  assert.ok((await stat(forkDir)).isDirectory())
})

let captured
const emitted = []
const detached = []
const archived = []
const killedJobs = []
const deletedSchedules = []
const registry = {
  list: () => [
    {
      id: 'ws-1',
      sessionIds: [TARGET, CHILD, OTHER],
      detachSession: async (id) => {
        detached.push(id)
      },
    },
  ],
  unpinSession: async () => {},
  unarchiveSession: async () => {},
  archiveSession: async (id, options) => {
    archived.push([id, options?.stopActivity === true])
  },
}
const persistence = {
  stat: async (id) => snapshots.find((item) => item.header.id === id),
  list: async () => snapshots,
}
const schedule = {
  catalog: async () => [
    { id: 'task-1', sessionId: TARGET },
    { id: 'task-2', sessionId: OTHER },
  ],
  delete: async (request) => {
    deletedSchedules.push(request.id)
    return { id: request.id, deleted: true }
  },
}
const jobs = {
  list: (id) => (id === TARGET ? [{ id: 'job-1', owner: TARGET, status: 'running' }] : []),
  kill: (id, caller) => {
    killedJobs.push([id, caller])
    return 'requested'
  },
}
const services = {
  sessionPersistence: persistence,
  workspaceRegistry: registry,
  schedule,
  agents: undefined,
  jobs: undefined,
}
const ctx = {
  get: (name) => services[name],
  emit: (name, id) => emitted.push([name, id]),
  connection: {
    fetch: {
      register: (route) => {
        captured = route
      },
    },
  },
}

process.env.DSH_HOME = HOME
apply(ctx)

await check('apply registers the authenticated POST route', () => {
  assert.equal(captured.path, '/api/session.delete')
  assert.deepEqual(captured.methods, ['POST'])
  assert.equal(typeof captured.fetch, 'function')
})

function request(body) {
  return new Request('http://127.0.0.1:1/api/session.delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

await check('a malformed session id is refused without touching storage', async () => {
  const response = await captured.fetch(request({ sessionId: '../../escape' }))
  assert.equal(response.status, 400)
})

await check('an unknown session answers 404', async () => {
  const response = await captured.fetch(request({ sessionId: 'session-does-not-exist' }))
  assert.equal(response.status, 404)
})

await check('a running turn is a refusal, not a deletion', async () => {
  services.agents = { get: (id) => (id === TARGET ? { status: 'running' } : undefined) }
  const response = await captured.fetch(request({ sessionId: TARGET }))
  const body = await response.json()
  assert.equal(response.status, 409)
  assert.equal(body.error.reason, 'turn')
  assert.ok((await stat(childDir)).isDirectory())
  assert.deepEqual(archived, [])
  services.agents = undefined
})

await check('an idle live Agent no longer blocks deletion', async () => {
  services.agents = { get: (id) => (id === TARGET ? { status: 'idle' } : undefined) }
  services.jobs = jobs
  const response = await captured.fetch(request({ sessionId: TARGET }))
  const body = await response.json()
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.deepEqual(body.deleted, [TARGET, CHILD, GRANDCHILD])
  for (const dir of [childDir, grandchildDir]) await assert.rejects(stat(dir), /ENOENT/)
  assert.ok((await stat(forkDir)).isDirectory(), 'forks are independent conversations')
  assert.ok((await stat(otherDir)).isDirectory(), 'unrelated sessions survive')
  assert.deepEqual(deletedSchedules, ['task-1'])
  assert.deepEqual(detached, [TARGET, CHILD])
  assert.deepEqual(killedJobs, [['job-1', TARGET]])
  assert.deepEqual(archived, [[TARGET, false]], 'an idle live root is hidden from the next list rebuild')
  assert.deepEqual(emitted, [
    ['api-session/removed', TARGET],
    ['api-session/removed', CHILD],
    ['api-session/removed', GRANDCHILD],
  ])
  await assert.rejects(readFile(join(CACHE, `${TARGET}.json`)), /ENOENT/)
})

await check('a cold session is deleted without archiving it', async () => {
  services.agents = undefined
  services.jobs = undefined
  const response = await captured.fetch(request({ sessionId: OTHER }))
  assert.equal(response.status, 200)
  assert.ok(!archived.some(([id]) => id === OTHER))
})

await check('home resolution prefers DSH_HOME', () => {
  assert.equal(dshHomeCandidates()[0], HOME)
})

await rm(ROOT, { recursive: true, force: true })
console.log(results.join('\n'))
