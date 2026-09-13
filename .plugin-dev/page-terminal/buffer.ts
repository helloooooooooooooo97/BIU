const CSI = /^\x1b\[([0-9;]*)([@-~])/
const OSC = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/
const CHARSET = /^\x1b[()][0-9A-Za-z]/
const OTHER = /^\x1b./

function nums(raw: string) {
  return raw.split(';').filter(Boolean).map((item) => Number(item) || 0)
}

/** 按列覆盖的文本缓冲：`\\r` 只回到行首，不会把历史整段删掉。 */
export class TerminalBuffer {
  lines = ['']
  row = 0
  col = 0
  cols: number
  rows: number

  constructor(cols = 80, rows = 24) {
    this.cols = cols
    this.rows = rows
  }

  write(raw: string) {
    this.apply(raw)
  }

  resize(cols: number, rows: number) {
    this.cols = Math.max(1, cols)
    this.rows = Math.max(1, rows)
  }

  text() {
    return this.lines.join('\n')
  }

  cursor() {
    let index = 0
    for (let i = 0; i < this.row; i++) index += this.lines[i].length + 1
    return index + Math.min(this.col, this.lines[this.row]?.length ?? 0)
  }

  apply(raw: string) {
    let i = 0
    while (i < raw.length) {
      if (raw.charCodeAt(i) === 0x1b) {
        const rest = raw.slice(i)
        const csi = rest.match(CSI)
        if (csi) {
          this.csi(csi[1], csi[2])
          i += csi[0].length
          continue
        }
        const skip = rest.match(OSC)?.[0] ?? rest.match(CHARSET)?.[0] ?? rest.match(OTHER)?.[0]
        i += skip ? skip.length : 1
        continue
      }
      const ch = raw[i]
      if (ch === '\r') this.col = 0
      else if (ch === '\n') this.newline()
      else if (ch === '\b') this.col = Math.max(0, this.col - 1)
      else if (ch === '\x07') {
        /* bell */
      } else if (ch === '\t') {
        const next = Math.floor(this.col / 8) * 8 + 8
        while (this.col < next) this.put(' ')
      } else this.put(ch)
      i += 1
    }
    if (this.lines.length > 4000) {
      const cut = this.lines.length - 3000
      this.lines = this.lines.slice(cut)
      this.row = Math.max(0, this.row - cut)
    }
  }

  private put(ch: string) {
    const line = this.lines[this.row] ?? ''
    if (this.col >= line.length) this.lines[this.row] = line + ch
    else this.lines[this.row] = line.slice(0, this.col) + ch + line.slice(this.col + 1)
    this.col += 1
  }

  private newline() {
    this.row += 1
    this.col = 0
    while (this.lines.length <= this.row) this.lines.push('')
  }

  private csi(args: string, cmd: string) {
    const n = nums(args)
    const a = n[0] || 0
    if (cmd === 'm') return
    if (cmd === 'C') this.col += a || 1
    else if (cmd === 'D') this.col = Math.max(0, this.col - (a || 1))
    else if (cmd === 'G') this.col = Math.max(0, (a || 1) - 1)
    else if (cmd === 'A') this.row = Math.max(0, this.row - (a || 1))
    else if (cmd === 'B') {
      const down = a || 1
      this.row += down
      while (this.lines.length <= this.row) this.lines.push('')
    } else if (cmd === 'H' || cmd === 'f') {
      this.row = Math.max(0, (n[0] || 1) - 1)
      this.col = Math.max(0, (n[1] || 1) - 1)
      while (this.lines.length <= this.row) this.lines.push('')
    } else if (cmd === 'K') {
      const line = this.lines[this.row] ?? ''
      if (a === 2) this.lines[this.row] = ''
      else if (a === 1) this.lines[this.row] = ' '.repeat(this.col) + line.slice(this.col)
      else this.lines[this.row] = line.slice(0, this.col)
    } else if (cmd === 'J') {
      if (a === 2 || a === 3) {
        this.lines = ['']
        this.row = 0
        this.col = 0
      } else if (a === 0) {
        this.lines[this.row] = (this.lines[this.row] ?? '').slice(0, this.col)
        this.lines = this.lines.slice(0, this.row + 1)
      }
    }
    const line = this.lines[this.row] ?? ''
    if (this.col > line.length) this.lines[this.row] = line + ' '.repeat(this.col - line.length)
  }
}

export function applyPtyChunk(text: string, raw: string) {
  const buf = new TerminalBuffer()
  if (text) buf.apply(text)
  buf.apply(raw)
  return buf.text()
}

export function keyToPty(event: KeyboardEvent): string | null {
  if (event.isComposing) return null
  if (event.metaKey) return null
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
      if (event.key.length === 1 && !event.ctrlKey) return event.key
      return null
  }
}
