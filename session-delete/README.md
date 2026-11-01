# @local/dsh-session-delete

A profile plugin for the DeepSeek Harness Web UI that adds **Delete conversation**
to a Session row's `…` menu and permanently removes that Session from local
storage.

## What the user sees

- The Session row menu gains a destructive `删除会话` / `Delete conversation` row
  after the shipped *Copy session ID* row (order 500).
- Choosing it opens a confirmation dialog. The dialog explains that the chat
  history is deleted permanently.
- Confirming a Session that is open in the main panel first moves the main view
  to another conversation in the same Workspace (or a fresh one), then deletes.
- A Session that is actively running a turn is refused with an explanation.
- A Session that was merely *opened* in this Host process is deleted normally:
  the Harness keeps an idle Agent for every opened Session until the process
  restarts, and that alone is not running work.

## How deletion works

The Host half registers one authenticated same-origin route,
`POST /api/session.delete`, through `ctx.connection.fetch`. The browser half
posts `{ sessionId }` and localizes the returned failure code.

The Host then:

1. Resolves the Session through `ctx.sessionPersistence` and refuses when it is
   absent or its Agent is running a turn.
2. Collects the Session's subagent subtree. A forked Session also records
   `parentSession`, but it is an independent conversation and is never deleted
   with its source.
3. Removes every `sessions/<project>/<session-id>/` directory under the harness
   home (`$DSH_HOME` first, then `~/.dsh`). If a materialized Session has no
   directory under those roots, the request fails before any metadata cleanup.
4. Cancels background jobs still owned by the conversation, then removes the
   derived projection-cache entry and the Session's schedule rows, pin/archive
   membership, and Workspace accounting.
5. For an idle Agent that still holds the Session in the live corpus, archives
   the id so a later list rebuild hides the now file-less row instead of
   resurrecting it; the id is simply absent after the next Host start.
6. Emits `api-session/removed` per deleted Session so every open page drops the
   row without a reload.

The Session log is the only source of truth, and the persistence seam has no
delete API (`dsh-session-persistence-jsonl` explicitly leaves removal to
external tooling). Deletion therefore removes the session-owned files and the
derived rows that name the Session. Shared attachment blobs are deliberately
left in place: they are content-addressed and may still be referenced by other
Sessions.

## Files

| File | Role |
|---|---|
| `index.js` | Host half: route, safety checks, file/row cleanup |
| `client.js` | Browser half: menu row, confirmation dialog, request flow |
| `cordis.patch.yml` | Inserts the `session-delete` row into the profile |
| `locale/*.json` | Plugin Manager display metadata |
| `tests/host.test.mjs` | Fixture-based Host checks (route, refusal, cascade) |

## Limits

- Deletion is local-file deletion, so it is only as complete as the storage
  layout it understands. A deployment that moves the Session root away from
  `$DSH_HOME/sessions` or `~/.dsh/sessions` is refused (`storage_unavailable`)
  rather than partially cleaned.
- The search index is not rewritten here; `dsh-session-query-sqlite` reconciles
  against persistence on its next search and drops rows whose Sessions are gone.
- A conversation opened during the current Host run keeps an idle Agent that the
  public API cannot dispose. Its files are deleted and its id archived so the
  default list hides it; until the next Host start it can still appear under
  *All conversations* and is not openable. A restarted Host is clean.
- The dialog is browser interaction: automated verification covers the Host
  route and cleanup logic, not a real click in the page.
