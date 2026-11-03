import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
const ROW = '[role="treeitem"][data-row-key^="workspace:"][aria-expanded]'

function store(value) {
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    set(next) { value = next; for (const fn of [...listeners]) fn() }, listeners }
}

function fixture() {
  let scans = 0, mutations = 0, observer, activeLanguage = 'zh'
  class Node {
    nodeType = 1
    children = []
    attributes = {}
    dataset = {}
    parentNode = null
    title = ''
    constructor(tag = 'div') { this.tag = tag }
    setAttribute(name, value) { this.attributes[name] = String(value) }
    getAttribute(name) { return this.attributes[name] ?? null }
    appendChild(child) {
      if (child.parentNode) child.remove()
      child.parentNode = this; this.children.push(child); mutations++
      return child
    }
    remove() {
      if (!this.parentNode) return
      this.parentNode.children = this.parentNode.children.filter(child => child !== this)
      this.parentNode = null; mutations++
    }
    matches(selector) {
      assert.equal(selector, ROW)
      return this.getAttribute('role') === 'treeitem' && this.getAttribute('data-row-key')?.startsWith('workspace:') && this.getAttribute('aria-expanded') !== null
    }
    querySelector(selector) { return this.children.find(child => child.matches(selector)) ?? this.children.map(child => child.querySelector(selector)).find(Boolean) ?? null }
    closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) ?? null }
  }
  const body = new Node('body'), head = new Node('head')
  function row(key = 'w', expanded = false) {
    const node = new Node()
    node.setAttribute('role', 'treeitem')
    node.setAttribute('data-row-key', `workspace:${key}`)
    node.setAttribute('aria-expanded', expanded)
    node.appendChild(new Node('title'))
    node.appendChild(new Node('actions'))
    body.appendChild(node)
    return node
  }
  const initialRow = row()
  const sessions = store({ byId: { a: { running: false } }, projectionsBySession: {} })
  const workspaces = store({ items: [{ workspaceId: 'w', sessionIds: ['a'] }], archivedSessionIds: [] })
  const statuses = store(new Map()), language = store('zh'), dictionaries = {}, cleanups = []
  const ctx = {
    sessions: { list: sessions }, workspaces: { list: workspaces }, uiSession: { sessionStatus: statuses },
    locale: {
      register(ns, values) { dictionaries[ns] = values; return () => { delete dictionaries[ns] } },
      bind(ns) { return (key, params) => dictionaries[ns][activeLanguage][key].replace('{count}', params.count) },
      subscribe: language.subscribe,
    },
    effect(fn) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup) },
    inject(services, fn) { if (services.every(name => ctx[name])) fn(ctx) },
  }
  runInNewContext(source, {
    document: {
      head, body, createElement: tag => new Node(tag),
      querySelectorAll(selector) {
        scans++
        const walk = parent => parent.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...walk(child)])
        return walk(body)
      },
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.active = true; observer = this }
      observe(target, options) { assert.equal(target, body); assert.equal(options.subtree, true); assert.deepEqual(Array.from(options.attributeFilter), ['aria-expanded', 'data-row-key']) }
      disconnect() { this.active = false }
    },
    window: { __ModuleLoader__: { load: module => module.factory(() => ({})).apply(ctx) } },
  })
  return {
    Node, row, initialRow, body, head, sessions, workspaces, statuses, language,
    get scans() { return scans }, get mutations() { return mutations },
    marker: (node = initialRow) => node.children.find(child => child.dataset.uiEnhancements === 'collapsed-workspace-status'),
    status: entries => statuses.set(new Map(entries)),
    notify(records) { if (observer.active) observer.callback(records) },
    expansion(node, expanded) {
      node.setAttribute('aria-expanded', expanded)
      if (observer.active) observer.callback([{ type: 'attributes', target: node }])
    },
    switchLanguage(value) { activeLanguage = value; language.set(value) },
    dispose() { for (const cleanup of cleanups.reverse()) cleanup() },
    get observerActive() { return observer.active },
    get dictionaries() { return dictionaries },
  }
}

test('collapsed workspace shows spinner, native unread completion dot, then clears on read', () => {
  const ui = fixture()
  assert.equal(ui.marker(), undefined)
  ui.status([['a', { running: true }]])
  assert.equal(ui.marker().dataset.status, 'running')
  assert.equal(ui.marker().title, '1 个会话正在运行')
  assert.equal(ui.marker().getAttribute('role'), 'img')
  assert.equal(ui.marker().getAttribute('aria-label'), ui.marker().title)
  ui.status([['a', { running: false, completionUnread: true }]])
  assert.equal(ui.marker().dataset.status, 'done')
  ui.status([['a', { running: false, completionUnread: false }]])
  assert.equal(ui.marker(), undefined)
  ui.dispose()
})

test('expanded workspace hides the summary and collapsing restores it without clearing unread', () => {
  const ui = fixture()
  ui.status([['a', { completionUnread: true }]])
  ui.expansion(ui.initialRow, true)
  assert.equal(ui.marker(), undefined)
  assert.equal(ui.statuses.getSnapshot().get('a').completionUnread, true)
  ui.expansion(ui.initialRow, false)
  assert.equal(ui.marker().dataset.status, 'done')
  ui.dispose()
})

test('running wins across members while the tooltip retains unread result counts', () => {
  const ui = fixture()
  ui.sessions.set({ byId: { a: {}, b: {} } })
  ui.workspaces.set({ items: [{ workspaceId: 'w', sessionIds: ['a', 'b', 'b'] }], archivedSessionIds: [] })
  ui.status([['a', { completionUnread: true }], ['b', { running: true }]])
  assert.equal(ui.marker().dataset.status, 'running')
  assert.match(ui.marker().title, /1 个会话正在运行\n1 个会话有完成结果待查看/)
  ui.status([['a', { completionUnread: true }], ['b', { running: false }]])
  assert.equal(ui.marker().dataset.status, 'done')
  ui.dispose()
})

test('waiting for approval, plan review or an answer is amber, not a completed or loading state', () => {
  const ui = fixture()
  for (const kind of ['approval', 'plan-review', 'question']) {
    ui.status([['a', { running: true, completionUnread: true, pendingInteraction: { kind } }]])
    assert.equal(ui.marker().dataset.status, 'waiting')
    assert.match(ui.marker().title, /等待审批或回答/)
    assert.doesNotMatch(ui.marker().title, /完成结果/)
  }
  ui.status([['a', { running: true, pendingInteraction: { kind: 'unsupported' } }]])
  assert.equal(ui.marker().dataset.status, 'running')
  ui.dispose()
})

test('summary running is a fallback, but explicit UI runtime false overrides stale summary true', () => {
  const ui = fixture()
  ui.sessions.set({ byId: { a: { running: true } } })
  assert.equal(ui.marker().dataset.status, 'running')
  ui.status([['a', { running: false }]])
  assert.equal(ui.marker(), undefined)
  ui.dispose()
})

test('running subagents count through the native catalog without importing child completion reminders', () => {
  const ui = fixture()
  ui.sessions.set({ byId: { a: {}, child: { origin: 'subagent', running: true } },
    projectionsBySession: { a: { values: { subagentCatalog: [{ id: 'child' }] } } } })
  assert.equal(ui.marker().dataset.status, 'running')
  ui.status([['child', { running: false, completionUnread: true }]])
  assert.equal(ui.marker(), undefined)
  ui.dispose()
})

test('archived, blank, missing, and direct subagent members never create a workspace reminder', () => {
  const ui = fixture()
  for (const summary of [{ blank: true }, { origin: 'subagent' }, undefined]) {
    ui.sessions.set({ byId: { a: summary } })
    ui.status([['a', { running: true, completionUnread: true }]])
    assert.equal(ui.marker(), undefined)
  }
  ui.sessions.set({ byId: { a: { running: false } } })
  ui.workspaces.set({ items: [{ workspaceId: 'w', sessionIds: ['a'] }], archivedSessionIds: ['a'] })
  assert.equal(ui.marker(), undefined)
  ui.dispose()
})

test('generic unread messages and timestamps are not completion signals', () => {
  const ui = fixture()
  ui.sessions.set({ byId: { a: { unread: true, updatedAt: '2099-01-01', lastRole: 'assistant' } } })
  assert.equal(ui.marker(), undefined)
  ui.dispose()
})

test('workspace membership is exact, independent of sibling paths or the ungrouped bucket', () => {
  const ui = fixture(), other = ui.row('other'), ungrouped = ui.row('')
  ui.sessions.set({ byId: { a: { running: true }, b: { running: false } } })
  ui.workspaces.set({ items: [
    { workspaceId: 'w', path: '/repo', sessionIds: ['b'] },
    { workspaceId: 'other', path: '/repo/child', sessionIds: ['a'] },
  ], archivedSessionIds: [] })
  assert.equal(ui.marker(), undefined)
  assert.equal(ui.marker(other).dataset.status, 'running')
  assert.equal(ui.marker(ungrouped), undefined)
  ui.workspaces.set({ items: [{ workspaceId: 'w', sessionIds: ['a'] }], archivedSessionIds: [] })
  assert.equal(ui.marker().dataset.status, 'running')
  assert.equal(ui.marker(other), undefined)
  ui.dispose()
})

test('row remounts and removed markers are repaired, while repeats do not duplicate markers', () => {
  const ui = fixture()
  ui.status([['a', { running: true }]])
  const marker = ui.marker()
  const record = { type: 'childList', target: ui.initialRow, addedNodes: [marker], removedNodes: [] }
  const mutations = ui.mutations
  ui.notify([record, record])
  assert.equal(ui.mutations, mutations)
  assert.equal(ui.initialRow.children.filter(node => node.dataset.uiEnhancements === 'collapsed-workspace-status').length, 1)
  marker.remove()
  ui.notify([{ type: 'childList', target: ui.initialRow, addedNodes: [], removedNodes: [marker] }])
  assert.equal(ui.marker(), marker)
  ui.initialRow.remove()
  const remounted = ui.row('w')
  ui.notify([{ type: 'childList', target: ui.body, addedNodes: [remounted], removedNodes: [ui.initialRow] }])
  assert.equal(ui.marker(), undefined)
  assert.equal(ui.marker(remounted).dataset.status, 'running')
  remounted.setAttribute('data-row-key', 'not-a-workspace')
  ui.notify([{ type: 'attributes', target: remounted }])
  assert.equal(ui.marker(remounted), undefined)
  ui.dispose()
})

test('chat streaming mutations do not scan workspace rows or mutate the DOM', () => {
  const ui = fixture(), chat = new ui.Node()
  const scans = ui.scans, mutations = ui.mutations
  ui.notify([{ type: 'childList', target: chat, addedNodes: [{ nodeType: 3 }], removedNodes: [] }])
  assert.equal(ui.scans, scans)
  assert.equal(ui.mutations, mutations)
  ui.dispose()
})

test('locale changes update hints; unloading removes markers, styles, observer, and every subscription', () => {
  const ui = fixture()
  ui.status([['a', { running: true }]])
  ui.switchLanguage('en')
  assert.equal(ui.marker().title, '1 running sessions')
  const css = ui.head.children[0].textContent
  assert.match(css, /prefers-reduced-motion:reduce/)
  assert.equal(ui.initialRow.children.at(-2).tag, 'actions')
  ui.dispose()
  assert.equal(ui.marker(), undefined)
  assert.equal(ui.head.children.length, 0)
  assert.equal(ui.observerActive, false)
  for (const source of [ui.sessions, ui.workspaces, ui.statuses, ui.language]) assert.equal(source.listeners.size, 0)
  assert.equal(Object.keys(ui.dictionaries).length, 0)
  ui.status([['a', { running: true }]])
  assert.equal(ui.marker(), undefined)
})
