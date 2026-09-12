export type LineDiffStats = {
  added: number
  removed: number
  jump_line: number
}

function firstChangeLine(beforeLines: string[], afterLines: string[]) {
  const n = Math.min(beforeLines.length, afterLines.length)
  let i = 0
  while (i < n && beforeLines[i] === afterLines[i]) i += 1
  return Math.min(i + 1, Math.max(afterLines.length, 1))
}

function lcsLength(a: string[], b: string[]) {
  const n = a.length
  const m = b.length
  let prev = new Uint16Array(m + 1)
  for (let i = 1; i <= n; i++) {
    const cur = new Uint16Array(m + 1)
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : prev[j] > cur[j - 1] ? prev[j] : cur[j - 1]
    }
    prev = cur
  }
  return prev[m]
}

function bagCounts(lines: string[]) {
  const bag = new Map<string, number>()
  for (const line of lines) bag.set(line, (bag.get(line) ?? 0) + 1)
  return bag
}

export function diffLineStats(before: string, after: string): LineDiffStats {
  if (before === after) return { added: 0, removed: 0, jump_line: 1 }
  const a = before.split('\n')
  const b = after.split('\n')
  const jump_line = firstChangeLine(a, b)
  if (a.length * b.length <= 250_000) {
    const lcs = lcsLength(a, b)
    return { added: b.length - lcs, removed: a.length - lcs, jump_line }
  }
  const left = bagCounts(a)
  let shared = 0
  for (const line of b) {
    const n = left.get(line) ?? 0
    if (n > 0) {
      shared += 1
      left.set(line, n - 1)
    }
  }
  return { added: b.length - shared, removed: a.length - shared, jump_line }
}

/** 共同前后缀之外的中间段：多了多少字、少了多少字。跳行仍按第一处行变化。 */
export function diffCharStats(before: string, after: string): LineDiffStats {
  if (before === after) return { added: 0, removed: 0, jump_line: 1 }
  let i = 0
  const min = Math.min(before.length, after.length)
  while (i < min && before[i] === after[i]) i += 1
  let j = 0
  while (j < min - i && before[before.length - 1 - j] === after[after.length - 1 - j]) j += 1
  return {
    added: after.length - i - j,
    removed: before.length - i - j,
    jump_line: firstChangeLine(before.split('\n'), after.split('\n')),
  }
}
