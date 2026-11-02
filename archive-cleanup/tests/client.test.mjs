import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

async function browser(fetch) {
  const rows = {}, effects = [], dictionaries = {}
  let plugin
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: initial => [initial, () => {}],
    useEffect: callback => effects.push(callback),
  }
  const document = { querySelector: () => ({}), head: { appendChild() {} } }
  runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), {
    fetch, document,
    window: { __ModuleLoader__: { load: module => { plugin = module.factory(() => React) } } },
  })
  plugin.apply({
    effect: callback => callback(),
    locale: { register: (_ns, value) => Object.assign(dictionaries, value.zh) },
    slots: { inject: (_name, callback) => callback(), register: (spec, component) => { rows[spec.name] = component } },
  })
  const t = (key, params = {}) => dictionaries[key].replace(/\{(\w+)\}/g, (_, name) => params[name])
  return {
    render: () => rows['settings.general.item']({ t }),
    async mount() { for (const effect of effects.splice(0)) effect(); await new Promise(setImmediate) },
  }
}
const text = node => typeof node === 'string' ? node : (node?.children ?? []).map(text).join(' ')

test('loading or failed status is never presented as an empty archive; retry recovers the count', async () => {
  let fail = true
  const calls = []
  const ui = await browser(async (path, init) => {
    calls.push([path, init])
    if (fail) throw new Error('HTTP 500')
    return { ok: true, json: async () => ({ ok: true, archived: 9, bytes: 4096 }) }
  })
  assert.match(text(ui.render()), /正在读取归档/)
  await ui.mount()
  let row = ui.render()
  assert.match(text(row), /读取归档失败.*HTTP 500/)
  assert.doesNotMatch(text(row), /没有已归档/)
  assert.equal(row.children[1].props.disabled, false)
  fail = false
  await row.children[1].props.onClick()
  row = ui.render()
  assert.match(text(row), /已归档 9 个会话/)
  assert.equal(row.children[1].props.disabled, false)
  assert.ok(calls.every(([path, init]) => path.endsWith('.status') && init.cache === 'no-store'))
})

test('a successful zero count displays the empty state and disables cleanup', async () => {
  const ui = await browser(async () => ({ ok: true, json: async () => ({ ok: true, archived: 0, bytes: 0 }) }))
  ui.render()
  await ui.mount()
  const row = ui.render()
  assert.match(text(row), /没有已归档的会话/)
  assert.equal(row.children[1].props.disabled, true)
})
