/** 文件系统缺省分配的短随机 id：12 位小写字母数字。 */
export const ALLOCATED_RECORD_ID_LENGTH = 12
export const ALLOCATED_RECORD_ID_RE = /^[a-z0-9]{12}$/

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** 导入/显式指定时允许的记录 id（含旧页 p053、旧任务 task_*）。 */
export function isAssignableRecordId(id: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(String(id ?? '').trim())
}

export function isAllocatedRecordId(id: string) {
  return ALLOCATED_RECORD_ID_RE.test(String(id ?? '').trim())
}

export function allocateRecordId() {
  const bytes = new Uint8Array(8)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  let n = 0n
  for (const byte of bytes) n = (n << 8n) | BigInt(byte)
  let out = ''
  while (out.length < ALLOCATED_RECORD_ID_LENGTH) {
    out = ALPHABET[Number(n % 36n)] + out
    n /= 36n
  }
  return out
}
