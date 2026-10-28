import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadBiuEnv, superAdminEmail, superAdminPassword } from './env.ts'

test('loadBiuEnv fills missing keys and keeps process overrides', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-env-'))
  writeFileSync(join(dir, '.env'), 'BIU_SUPER_ADMIN_EMAIL=from-file@biu.com\nBIU_HOME=from-file\n')
  const prevEmail = process.env.BIU_SUPER_ADMIN_EMAIL
  const prevHome = process.env.BIU_HOME
  process.env.BIU_SUPER_ADMIN_EMAIL = 'already@set.com'
  delete process.env.BIU_HOME
  try {
    assert.equal(loadBiuEnv(dir), join(dir, '.env'))
    assert.equal(process.env.BIU_SUPER_ADMIN_EMAIL, 'already@set.com')
    assert.equal(process.env.BIU_HOME, 'from-file')
    assert.equal(superAdminEmail(), 'already@set.com')
  } finally {
    if (prevEmail === undefined) delete process.env.BIU_SUPER_ADMIN_EMAIL
    else process.env.BIU_SUPER_ADMIN_EMAIL = prevEmail
    if (prevHome === undefined) delete process.env.BIU_HOME
    else process.env.BIU_HOME = prevHome
  }
})

test('super admin defaults match the documented account', () => {
  const prevEmail = process.env.BIU_SUPER_ADMIN_EMAIL
  const prevPass = process.env.BIU_SUPER_ADMIN_PASSWORD
  delete process.env.BIU_SUPER_ADMIN_EMAIL
  delete process.env.BIU_SUPER_ADMIN_PASSWORD
  try {
    assert.equal(superAdminEmail(), '97@biu.com')
    assert.equal(superAdminPassword(), '123456')
  } finally {
    if (prevEmail === undefined) delete process.env.BIU_SUPER_ADMIN_EMAIL
    else process.env.BIU_SUPER_ADMIN_EMAIL = prevEmail
    if (prevPass === undefined) delete process.env.BIU_SUPER_ADMIN_PASSWORD
    else process.env.BIU_SUPER_ADMIN_PASSWORD = prevPass
  }
})
