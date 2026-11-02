/**
 * Host half: permanently deletes archived sessions and their logs to free disk
 * space. Only archived sessions are eligible, and only while they are cold
 * (no live Agent, no running turn, no reported activity); a non-archived
 * Session is never touched. Deletion removes the Session directory, its
 * projection cache, and the rows that name it, then unarchives the id so the
 * archive list does not keep pointing at a missing log.
 */
import { readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const PURGE_PATH = '/api/archive-cleanup.purge'
export const STATUS_PATH = '/api/archive-cleanup.status'

const PROJECTION_CACHE_DIR = join('storages', 'session_projcache', 'sessions')
const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export const name = 'archive-cleanup'

export const inject = ['connection', 'workspaceRegistry', 'sessionPersistence']

export function apply(ctx) {
  ctx.connection.fetch.register({
    path: PURGE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: request => handlePurge(ctx, request),
  })
  ctx.connection.fetch.register({
    path: STATUS_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: () => handleStatus(ctx),
  })
}

function json(status, body) {
  return { status, body }
}

function toResponse(outcome) {
  return new Response(JSON.stringify(outcome.body), {
    status: outcome.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function handleStatus(ctx) {
  try {
    const ids = archivedIds(ctx)
    const bytes = await archivedBytes(ctx, ids)
    return toResponse(json(200, { ok: true, archived: ids.length, bytes }))
  } catch (error) {
    return toResponse(json(500, { ok: false, error: { code: 'status_failed', message: messageOf(error) } }))
  }
}

async function handlePurge(ctx, request) {
  let payload = {}
  try {
    const text = await request.text()
    if (text.trim() !== '') payload = JSON.parse(text)
  } catch {
    return toResponse(json(400, { ok: false, error: { code: 'invalid_request', message: 'The body must be JSON.' } }))
  }
  const requested = payload?.sessionIds
  if (requested !== undefined && (!Array.isArray(requested) || requested.some(id => typeof id !== 'string' || !SAFE_SESSION_ID.test(id)))) {
    return toResponse(json(400, { ok: false, error: { code: 'invalid_request', message: 'sessionIds must be session identifiers.' } }))
  }
  try {
    const result = await purgeArchived(ctx, requested)
    return toResponse(json(200, { ok: true, ...result }))
  } catch (error) {
    return toResponse(json(500, { ok: false, error: { code: 'purge_failed', message: messageOf(error) } }))
  }
}

function archivedIds(ctx) {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) throw new Error('Workspace registry is not mounted.')
  return registry.archivedSessionIds.map(String).filter(id => SAFE_SESSION_ID.test(id))
}

async function persistedSessions(ctx) {
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined) return undefined
  return persistence.list()
}

async function sessionBytes(root, id) {
  let total = 0
  for (const directory of await sessionDirectories(root, id)) total += await directoryBytes(directory)
  return total
}

async function directoryBytes(directory) {
  let total = 0
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    try {
      if (entry.isDirectory()) total += await directoryBytes(path)
      else total += (await stat(path)).size
    } catch {
      /* a file that vanished mid-scan costs nothing to report */
    }
  }
  return total
}

async function archivedBytes(ctx, ids) {
  if (ids.length === 0) return 0
  const roots = await existingSessionRoots(ctx)
  let total = 0
  for (const id of ids) for (const root of roots) total += await sessionBytes(root, id)
  return total
}

/**
 * Delete every eligible archived Session, or only `sessionIds` when given.
 * @returns {{deleted: {id: string, bytes: number}[], skipped: {id: string, reason: string}[], bytes: number}} outcome
 */
export async function purgeArchived(ctx, sessionIds) {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) throw new Error('Workspace registry is not mounted.')
  const archived = archivedIds(ctx)
  const targets = (sessionIds ?? archived).filter(id => archived.includes(id))
  const deleted = []
  const skipped = []
  for (const id of targets) {
    const outcome = await deleteOne(ctx, id)
    if (outcome === undefined) skipped.push({ id, reason: 'busy' })
    else if (outcome === false) skipped.push({ id, reason: 'missing' })
    else deleted.push({ id, bytes: outcome })
  }
  return { deleted, skipped, bytes: deleted.reduce((sum, entry) => sum + entry.bytes, 0) }
}

/** @returns {Promise<number | false | undefined>} freed bytes, false when the log is gone, undefined when busy */
async function deleteOne(ctx, sessionId) {
  const persistence = ctx.get('sessionPersistence')
  const registry = ctx.get('workspaceRegistry')
  if (persistence === undefined) throw new Error('Session persistence is not mounted.')
  const snapshots = await persistedSessions(ctx)
  const rootSnapshot = snapshots?.find(snapshot => String(snapshot.header.id) === sessionId)
  const ids = rootSnapshot === undefined ? [sessionId] : collectSubtree(snapshots, rootSnapshot).map(snapshot => String(snapshot.header.id))
  if (await hasBlockingActivity(ctx, ids)) return undefined
  const roots = await existingSessionRoots(ctx)
  let bytes = 0
  let removedDirs = 0
  for (const id of ids) {
    for (const root of roots) {
      bytes += await sessionBytes(root, id)
      removedDirs += await deleteSessionFiles(root, id)
    }
  }
  if (removedDirs === 0) {
    if (rootSnapshot?.sizeBytes !== undefined || rootSnapshot?.eventCount !== undefined) return false
    return false
  }
  for (const home of dshHomeCandidates()) {
    for (const id of ids) await deleteProjectionCache(home, id).catch(() => {})
  }
  cancelOwnedJobs(ctx, ids)
  await removeSessionBoundRows(ctx, ids)
  for (const id of ids) {
    try {
      ctx.emit('api-session/removed', id)
    } catch {
      /* the page can still refresh its own list */
    }
  }
  try {
    await registry.unarchiveSession(sessionId)
  } catch {
    /* the id stays archived until its accounting is cleaned */
  }
  return bytes
}

export function collectSubtree(snapshots, rootSnapshot) {
  const byParent = new Map()
  for (const snapshot of snapshots) {
    const header = snapshot.header
    if (header.origin !== 'subagent' || header.parentSession === undefined) continue
    const parent = String(header.parentSession)
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent).push(snapshot)
  }
  const result = []
  const seen = new Set()
  const queue = [rootSnapshot]
  while (queue.length > 0) {
    const snapshot = queue.shift()
    const id = String(snapshot.header.id)
    if (seen.has(id)) continue
    seen.add(id)
    result.push(snapshot)
    for (const child of byParent.get(id) ?? []) queue.push(child)
  }
  return result
}

/** A Session stays untouched while it is loaded, owned by an Agent, or reports activity. */
async function hasBlockingActivity(ctx, ids) {
  const agents = ctx.get('agents')
  for (const id of ids) {
    if (ctx.get('sessions')?.get?.(id) !== undefined) return true
    if (agents?.get?.(id) !== undefined) return true
    if (typeof ctx.waterfall === 'function') {
      const activity = await ctx.waterfall('workspace/session-activity', { sessionId: id }, () => Promise.resolve([]))
      if (activity.length > 0) return true
    }
  }
  return false
}

function cancelOwnedJobs(ctx, ids) {
  const jobs = ctx.get('jobs')
  if (jobs === undefined || typeof jobs.list !== 'function' || typeof jobs.kill !== 'function') return
  for (const id of ids) {
    for (const job of jobs.list(id)) {
      if (String(job.owner ?? '') !== id) continue
      if (job.status !== 'running' && job.status !== 'stopping') continue
      try {
        jobs.kill(job.id, id, 'archived conversation deleted')
      } catch {
        /* settled between the projection and the request */
      }
    }
  }
}

async function removeSessionBoundRows(ctx, ids) {
  const schedule = ctx.get('schedule')
  if (schedule !== undefined && typeof schedule.catalog === 'function' && typeof schedule.delete === 'function') {
    let catalog = []
    try {
      catalog = await schedule.catalog()
    } catch {
      catalog = []
    }
    for (const entry of catalog) {
      if (!ids.includes(String(entry.sessionId))) continue
      try {
        await schedule.delete({ sessionId: entry.sessionId, id: entry.id })
      } catch {
        /* one stale reminder cannot block freeing space */
      }
    }
  }
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined || typeof registry.list !== 'function') return
  for (const workspace of registry.list()) {
    const accounted = new Set((workspace.sessionIds ?? []).map(String))
    for (const id of ids) {
      if (!accounted.has(id) || typeof workspace.detachSession !== 'function') continue
      try {
        await workspace.detachSession(id)
      } catch {
        /* the next registry mutation prunes a failed detach */
      }
    }
  }
}

export async function sessionDirectories(root, id) {
  const found = []
  if (await isDirectory(join(root, id))) found.push(join(root, id))
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return found
    throw error
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === id) continue
    const candidate = join(root, entry.name, id)
    if (await isDirectory(candidate)) found.push(candidate)
  }
  return found
}

export async function deleteSessionFiles(root, id) {
  const directories = await sessionDirectories(root, id)
  for (const directory of directories) await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 })
  return directories.length
}

async function deleteProjectionCache(home, id) {
  await rm(join(home, PROJECTION_CACHE_DIR, `${id}.json`), { force: true })
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function existingSessionRoots(ctx) {
  const roots = []
  const persistence = ctx.get('sessionPersistence')
  const configured = persistence?.root
  if (typeof configured === 'string' && configured !== '') {
    if (await isDirectory(configured)) roots.push(configured)
    return roots
  }
  for (const home of dshHomeCandidates()) {
    const root = join(home, 'sessions')
    if (await isDirectory(root)) roots.push(root)
  }
  return roots
}

export function dshHomeCandidates() {
  const homes = []
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') homes.push(configured.trim())
  homes.push(join(homedir(), '.dsh'))
  return [...new Set(homes)]
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
