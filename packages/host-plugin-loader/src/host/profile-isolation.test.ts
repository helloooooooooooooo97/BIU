import assert from 'node:assert/strict'
import { test } from 'vitest'
import { findRepoRoot, readCordisConfig, resolveHostProfile } from './index.ts'

const DESKTOP_ONLY_IDS = ['update', 'fs', 'terminal', 'lsp', 'desktop-cloud-link']
const REQUIRED_DRIVER_IDS = ['driver-realtime', 'driver-blob', 'driver-storage', 'driver-task-dispatch']

test('resolveHostProfile respects BIU_PROFILE and falls back to BIU_ONLINE', () => {
  assert.equal(resolveHostProfile({ BIU_PROFILE: 'cloud-worker', BIU_ONLINE: '0' }), 'cloud-worker')
  assert.equal(resolveHostProfile({ BIU_PROFILE: 'cloud-api' }), 'cloud-api')
  assert.equal(resolveHostProfile({ BIU_PROFILE: 'desktop' }), 'desktop')
  assert.equal(resolveHostProfile({ BIU_ONLINE: '0' }), 'desktop')
  assert.equal(resolveHostProfile({ BIU_ONLINE: '1' }), 'cloud-api')
  assert.equal(resolveHostProfile({}), 'all')
})

test('cordis.plugins.json isolates desktop-only plugins from cloud-api and cloud-worker profiles', () => {
  const root = findRepoRoot()
  const desktop = readCordisConfig(root, { profile: 'desktop' })
  const cloudApi = readCordisConfig(root, { profile: 'cloud-api' })
  const cloudWorker = readCordisConfig(root, { profile: 'cloud-worker' })

  const desktopIds = (desktop.host ?? []).map((item) => item.id)
  const cloudApiIds = (cloudApi.host ?? []).map((item) => item.id)
  const cloudWorkerIds = (cloudWorker.host ?? []).map((item) => item.id)

  for (const driverId of REQUIRED_DRIVER_IDS) {
    assert.ok(desktopIds.includes(driverId), `desktop missing ${driverId}`)
    assert.ok(cloudApiIds.includes(driverId), `cloud-api missing ${driverId}`)
    assert.ok(cloudWorkerIds.includes(driverId), `cloud-worker missing ${driverId}`)
  }

  // 驱动必须在 http / account 之前注册，保证所有宿主服务启动时即可通过 Ports 拿到驱动。
  const httpIdx = cloudApiIds.indexOf('http')
  assert.ok(httpIdx >= REQUIRED_DRIVER_IDS.length, 'drivers must load before http')

  for (const desktopId of DESKTOP_ONLY_IDS) {
    assert.ok(desktopIds.includes(desktopId), `desktop profile should include ${desktopId}`)
    assert.ok(!cloudApiIds.includes(desktopId), `cloud-api profile must exclude desktop-only plugin ${desktopId}`)
    assert.ok(!cloudWorkerIds.includes(desktopId), `cloud-worker profile must exclude desktop-only plugin ${desktopId}`)
  }

  assert.ok(cloudApiIds.includes('http'), 'cloud-api must include http')
  assert.ok(!cloudWorkerIds.includes('http'), 'cloud-worker must not open public http listener')
  assert.ok(cloudWorkerIds.includes('agent-loop'), 'cloud-worker must include agent-loop')
  assert.ok(cloudWorkerIds.includes('sandbox'), 'cloud-worker must include sandbox')
})
