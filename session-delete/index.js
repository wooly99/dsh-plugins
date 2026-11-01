/**
 * Host half of the session-delete bundle.
 *
 * Registers one authenticated, same-origin Fetch route that permanently removes
 * a Session and its subagent subtree from durable storage. The Session log is
 * the only source of truth, so deletion is exactly: remove the session-owned
 * directories under the persistence root, drop derived caches and Session-bound
 * rows (schedules, workspace accounting, pin/archive membership), then tell the
 * page that the Session is gone.
 *
 * A Session that was opened in this Host process keeps a live, idle Agent until
 * the process restarts (the Harness exposes no close/dispose entry point), and
 * that Agent keeps the Session in the live corpus. Deletion is refused while
 * that Agent is actually running a turn; an idle one is deleted and its id is
 * archived so a later list rebuild hides the now file-less live Session instead
 * of resurrecting it. Those ids are fully absent after the next Host start.
 */
import { readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Absolute path the Host registers; the browser addresses it document-relatively. */
export const SESSION_DELETE_PATH = '/api/session.delete'

/** One in-flight deletion per Session, keyed by id. */
const inflight = new Map()

/** Route-safe session id shape; ids are opaque outside path safety. */
const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** Projection-cache directory name owned by dsh-session-projection-cache. */
const PROJECTION_CACHE_DIR = join('storages', 'session_projcache', 'sessions')

export const name = 'session-delete'

export const inject = ['connection']

/**
 * Register the deletion route.
 * @param ctx - Host context carrying the browser connection carrier.
 */
export function apply(ctx) {
  ctx.connection.fetch.register({
    path: SESSION_DELETE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handle(ctx, request),
  })
}

/**
 * @param {number} status - HTTP status.
 * @param {unknown} body - JSON body.
 * @returns {{ status: number, body: unknown }} A transport-neutral outcome.
 */
function json(status, body) {
  return { status, body }
}

/**
 * @param {number} status - HTTP status.
 * @param {string} code - Stable failure code the page localizes.
 * @param {string} message - Operator-facing detail.
 * @param {Record<string, unknown>} [extra] - Extra fields merged into the error.
 * @returns {{ status: number, body: unknown }} A transport-neutral outcome.
 */
function failure(status, code, message, extra = {}) {
  return json(status, { ok: false, error: { code, message, ...extra } })
}

/**
 * @param {{ status: number, body: unknown }} outcome - Transport-neutral outcome.
 * @returns {Response} HTTP response handed to the connection bridge.
 */
function toResponse(outcome) {
  return new Response(JSON.stringify(outcome.body), {
    status: outcome.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/**
 * Resolve one deletion request.
 * @param {any} ctx - Host context.
 * @param {Request} request - POSTed `{ sessionId }` request.
 * @returns {Promise<Response>} JSON outcome.
 */
async function handle(ctx, request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return toResponse(failure(400, 'invalid_request', 'The request body must be JSON.'))
  }
  const sessionId = payload?.sessionId
  if (typeof sessionId !== 'string' || !SAFE_SESSION_ID.test(sessionId)) {
    return toResponse(failure(400, 'invalid_request', 'sessionId must be a session identifier.'))
  }

  const previous = inflight.get(sessionId)
  if (previous !== undefined) return toResponse(await previous)

  const task = runDeletion(ctx, sessionId, request.signal).finally(() => {
    inflight.delete(sessionId)
  })
  inflight.set(sessionId, task)
  return toResponse(await task)
}

/**
 * @param {any} ctx - Host context.
 * @param {string} sessionId - Session to delete.
 * @param {AbortSignal} signal - Request lifetime.
 * @returns {Promise<{ status: number, body: unknown }>} JSON outcome.
 */
async function runDeletion(ctx, sessionId, signal) {
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined) {
    return failure(503, 'storage_unavailable', 'Session persistence is not mounted.')
  }

  let rootSnapshot
  try {
    rootSnapshot = await persistence.stat(sessionId, { signal })
  } catch (error) {
    return failure(500, 'delete_failed', `Could not read the Session: ${messageOf(error)}`)
  }
  if (rootSnapshot === undefined) {
    return failure(404, 'session_not_found', 'That Session does not exist.')
  }

  let snapshots
  try {
    snapshots = await persistence.list({ signal })
  } catch (error) {
    return failure(500, 'delete_failed', `Could not list Sessions: ${messageOf(error)}`)
  }

  const subtree = collectSubtree(snapshots, rootSnapshot)
  const ids = subtree.map((snapshot) => String(snapshot.header.id))

  const runningId = findRunningTurn(ctx, ids)
  if (runningId !== undefined) {
    return failure(409, 'session_busy', 'That conversation is running a turn. Stop it before deleting the conversation.', {
      reason: 'turn',
      sessionId: runningId,
    })
  }

  const roots = await existingSessionRoots()
  const removedDirs = new Map()
  for (const snapshot of subtree) {
    const id = String(snapshot.header.id)
    let count = 0
    for (const root of roots) {
      try {
        count += await deleteSessionFiles(root, id)
      } catch (error) {
        return failure(500, 'delete_failed', `Could not delete the Session log: ${messageOf(error)}`)
      }
    }
    removedDirs.set(id, count)
  }

  const materialized = subtree.filter((snapshot) => snapshot.sizeBytes !== undefined || snapshot.eventCount !== undefined)
  const found = subtree.filter((snapshot) => (removedDirs.get(String(snapshot.header.id)) ?? 0) > 0)
  if (materialized.length > 0 && found.length === 0) {
    return failure(
      503,
      'storage_unavailable',
      'The Session log was not found under the configured Session root, so nothing was deleted.',
    )
  }

  const warnings = []
  for (const home of dshHomeCandidates()) {
    for (const id of ids) {
      try {
        await deleteProjectionCache(home, id)
      } catch (error) {
        warnings.push(`Could not remove the projection cache of ${id}: ${messageOf(error)}`)
      }
    }
  }

  const cancelledJobs = cancelOwnedJobs(ctx, ids)
  try {
    await removeSessionBoundRows(ctx, ids)
  } catch (error) {
    warnings.push(`Session-bound rows were not fully cleaned: ${messageOf(error)}`)
  }

  const hiddenLive = await hideLiveRoot(ctx, sessionId)
  if (hiddenLive === false && hasLiveAgent(ctx, sessionId)) {
    warnings.push(
      'This Host already had the conversation loaded, so it may reappear until the app restarts. Its files are deleted.',
    )
  }

  for (const id of ids) {
    try {
      ctx.emit('api-session/removed', id)
    } catch (error) {
      warnings.push(`The page was not told that ${id} is gone: ${messageOf(error)}`)
    }
  }
  return json(200, { ok: true, deleted: ids, cancelledJobs, hiddenLive, warnings })
}

/**
 * The Session plus every descendant recorded as a subagent child. Forks also
 * carry `parentSession`, but they are independent conversations and are never
 * cascade targets.
 * @param {readonly any[]} snapshots - Every persisted Session snapshot.
 * @param {any} rootSnapshot - Requested Session snapshot.
 * @returns {any[]} Root first, then its subagent descendants.
 */
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

/**
 * A live Agent alone does not mean running work: every Session opened since the
 * Host started keeps an idle Agent. Only an active turn writes the log, so only
 * that blocks deletion.
 * @param {any} ctx - Host context.
 * @param {readonly string[]} ids - Sessions being deleted.
 * @returns {string | undefined} The id of a Session running a turn.
 */
function findRunningTurn(ctx, ids) {
  const agents = ctx.get('agents')
  if (agents === undefined || typeof agents.get !== 'function') return undefined
  for (const id of ids) {
    const agent = agents.get(id)
    if (agent !== undefined && agent.status === 'running') return id
  }
  return undefined
}

/**
 * @param {any} ctx - Host context.
 * @param {string} sessionId - Session id.
 * @returns {boolean} Whether a live Agent still holds this Session.
 */
function hasLiveAgent(ctx, sessionId) {
  const agents = ctx.get('agents')
  if (agents === undefined || typeof agents.get !== 'function') return false
  return agents.get(sessionId) !== undefined
}

/**
 * Background jobs owned by a deleted conversation have no reachable reader
 * anymore; cancel the live ones so their producers stop with the conversation.
 * @param {any} ctx - Host context.
 * @param {readonly string[]} ids - Sessions being deleted.
 * @returns {string[]} Ids of the jobs a cancellation was requested for.
 */
function cancelOwnedJobs(ctx, ids) {
  const jobs = ctx.get('jobs')
  if (jobs === undefined || typeof jobs.list !== 'function' || typeof jobs.kill !== 'function') return []
  const cancelled = []
  for (const id of ids) {
    let owned
    try {
      owned = jobs.list(id).filter((job) => String(job.owner ?? '') === id)
    } catch {
      continue
    }
    for (const job of owned) {
      if (job.status !== 'running' && job.status !== 'stopping') continue
      try {
        jobs.kill(job.id, id, 'conversation deleted')
        cancelled.push(String(job.id))
      } catch {
        /* settled between the projection and the request */
      }
    }
  }
  return cancelled
}

/**
 * Schedules, workspace accounting, and pin/archive membership all name Session
 * ids; drop the ones that are about to disappear so no dangling row survives.
 * @param {any} ctx - Host context.
 * @param {readonly string[]} ids - Sessions being deleted.
 */
async function removeSessionBoundRows(ctx, ids) {
  const schedule = ctx.get('schedule')
  if (schedule !== undefined && typeof schedule.catalog === 'function' && typeof schedule.delete === 'function') {
    let catalog = []
    try {
      catalog = await schedule.catalog()
    } catch {
      catalog = []
    }
    const doomed = new Set(ids)
    for (const entry of catalog) {
      if (!doomed.has(String(entry.sessionId))) continue
      try {
        await schedule.delete({ sessionId: entry.sessionId, id: entry.id })
      } catch {
        /* one stale reminder cannot block deleting the conversation */
      }
    }
  }

  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined || typeof registry.list !== 'function') return
  for (const id of ids) {
    try {
      await registry.unpinSession(id)
    } catch {
      /* unknown or already-absent pin */
    }
    try {
      await registry.unarchiveSession(id)
    } catch {
      /* unknown or already-absent archive mark */
    }
  }
  for (const workspace of registry.list()) {
    const accounted = new Set(workspace.sessionIds.map(String))
    for (const id of ids) {
      if (!accounted.has(id) || typeof workspace.detachSession !== 'function') continue
      try {
        await workspace.detachSession(id)
      } catch {
        /* the next registry mutation prunes what a failed detach left behind */
      }
    }
  }
}

/**
 * A live Session survives in the live corpus even after its files are gone, so
 * a list rebuild would bring the deleted row back. Archiving the id keeps it
 * out of the default list until the next Host start, when it is simply absent.
 * @param {any} ctx - Host context.
 * @param {string} sessionId - Root Session being deleted.
 * @returns {Promise<boolean>} Whether the hide was written.
 */
async function hideLiveRoot(ctx, sessionId) {
  if (!hasLiveAgent(ctx, sessionId)) return false
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined || typeof registry.archiveSession !== 'function') return false
  try {
    await registry.archiveSession(sessionId)
    return true
  } catch {
    try {
      await registry.archiveSession(sessionId, { stopActivity: true })
      return true
    } catch {
      return false
    }
  }
}

/**
 * Locate the session-owned directories for one id under a persistence root.
 * The layout groups sessions by readable project directory, and the encoded id
 * is the final segment; scanning one level keeps this independent of the cwd
 * normalization rules.
 * @param {string} root - Session persistence root.
 * @param {string} id - Session id.
 * @returns {Promise<string[]>} Existing session directories.
 */
async function sessionDirectories(root, id) {
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

/**
 * Remove every directory that stores one Session's log.
 * @param {string} root - Session persistence root.
 * @param {string} id - Session id.
 * @returns {Promise<number>} Number of removed directories.
 */
export async function deleteSessionFiles(root, id) {
  const directories = await sessionDirectories(root, id)
  for (const directory of directories) {
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 })
  }
  return directories.length
}

/**
 * @param {string} home - Harness home candidate.
 * @param {string} id - Session id.
 * @returns {Promise<void>} Resolution after the derived cache entry is gone.
 */
async function deleteProjectionCache(home, id) {
  const file = join(home, PROJECTION_CACHE_DIR, `${id}.json`)
  await rm(file, { force: true })
}

/**
 * @param {string} path - Candidate path.
 * @returns {Promise<boolean>} Whether it is a directory.
 */
async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * @returns {Promise<string[]>} Existing candidate Session roots.
 */
async function existingSessionRoots() {
  const roots = []
  for (const home of dshHomeCandidates()) {
    const root = join(home, 'sessions')
    if (await isDirectory(root)) roots.push(root)
  }
  return roots
}

/**
 * @returns {string[]} Candidate harness home directories, most specific first.
 */
export function dshHomeCandidates() {
  const homes = []
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') homes.push(configured.trim())
  homes.push(join(homedir(), '.dsh'))
  return [...new Set(homes)]
}

/**
 * @param {unknown} error - Original failure.
 * @returns {string} A message safe to return to the page.
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
