const CSI = /^\x1b\[[0-9;?=]*[ -/]*[@-~]/
const OSC = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/
const CHARSET = /^\x1b[()][0-9A-Za-z]/
const OTHER = /^\x1b./

/** 把 PTY 字节流收成可滚动的纯文本（处理换行、回车、退格、清屏，丢掉颜色码）。 */
export function applyPtyChunk(text: string, raw: string): string {
  let out = text
  let i = 0
  while (i < raw.length) {
    if (raw.charCodeAt(i) === 0x1b) {
      const rest = raw.slice(i)
      const esc = rest.match(CSI)?.[0] ?? rest.match(OSC)?.[0] ?? rest.match(CHARSET)?.[0] ?? rest.match(OTHER)?.[0]
      if (esc) {
        if (/^\x1b\[2J/.test(esc) || /^\x1b\[3J/.test(esc)) out = ''
        i += esc.length
        continue
      }
      i += 1
      continue
    }
    const ch = raw[i]
    if (ch === '\r') {
      const nl = out.lastIndexOf('\n')
      out = out.slice(0, nl + 1)
      i += 1
      continue
    }
    if (ch === '\b') {
      if (out.length && !out.endsWith('\n')) out = out.slice(0, -1)
      i += 1
      continue
    }
    if (ch === '\n') {
      out += '\n'
      i += 1
      continue
    }
    if (ch === '\x07') {
      i += 1
      continue
    }
    out += ch
    i += 1
  }
  if (out.length > 240_000) out = out.slice(-160_000)
  return out
}

export function keyToPty(event: KeyboardEvent): string | null {
  if (event.metaKey && event.key !== 'v') return null
  if (event.ctrlKey && !event.altKey && event.key.length === 1) {
    const code = event.key.toLowerCase().charCodeAt(0)
    if (code >= 97 && code <= 122) return String.fromCharCode(code - 96)
  }
  switch (event.key) {
    case 'Enter':
      return '\r'
    case 'Backspace':
      return '\x7f'
    case 'Tab':
      return '\t'
    case 'Escape':
      return '\x1b'
    case 'ArrowUp':
      return '\x1b[A'
    case 'ArrowDown':
      return '\x1b[B'
    case 'ArrowRight':
      return '\x1b[C'
    case 'ArrowLeft':
      return '\x1b[D'
    case 'Home':
      return '\x1b[H'
    case 'End':
      return '\x1b[F'
    case 'Delete':
      return '\x1b[3~'
    default:
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) return event.key
      return null
  }
}
