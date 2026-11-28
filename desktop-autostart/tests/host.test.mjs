import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler } from '../index.js'

const url = 'http://localhost/api/local-desktop-autostart'
const post = (body, type = 'application/json') => new Request(url, {
  method: 'POST', headers: { 'content-type': type }, body,
})

test('status only reads and switches report the resulting Windows state', async () => {
  const modes = []
  let enabled = false
  const handle = createHandler({ supported: true, readOrSet: async mode => {
    modes.push(mode)
    if (mode !== 'status') enabled = mode === 'on'
    return { enabled, adminMode: false, needsRepair: false }
  } })
  for (const [request, expected] of [
    [new Request(url), false], [post('{"enabled":true}'), true],
    [new Request(url), true], [post('{"enabled":false}'), false],
  ]) {
    const response = await handle(request)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { supported: true, enabled: expected, adminMode: false, needsRepair: false })
  }
  assert.deepEqual(modes, ['status', 'on', 'status', 'off'])
})

test('unsupported hosts and malformed requests never touch system settings', async () => {
  let calls = 0
  const readOrSet = async () => { calls++ }
  const supported = createHandler({ supported: true, readOrSet })
  const unsupported = createHandler({ supported: false, readOrSet })
  assert.deepEqual(await (await unsupported(post('{"enabled":true}'))).json(), { supported: false })
  for (const request of [post('!'), post('{"enabled":"true"}'), post('{"enabled":true}', 'text/plain')]) {
    assert.equal((await supported(request)).status, 400)
  }
  assert.equal(calls, 0)
})

test('legacy migration and missing administrator permissions are visible to the client', async () => {
  const handle = createHandler({ supported: true, readOrSet: async mode => mode === 'status'
    ? { enabled: false, adminMode: true, needsRepair: true }
    : { error: 'admin-required' } })
  assert.deepEqual(await (await handle(new Request(url))).json(), {
    supported: true, enabled: false, adminMode: true, needsRepair: true,
  })
  const response = await handle(post('{"enabled":true}'))
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: 'admin-required' })
})

test('system errors are reported without leaking host details', async () => {
  const failure = new Error('internal error')
  const handle = createHandler({ supported: true, readOrSet: async () => { throw failure }, warn: error => assert.equal(error, failure) })
  const response = await handle(new Request(url))
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'startup-operation-failed' })
})
