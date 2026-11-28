export type DiffLine = {
  type: 'same' | 'add' | 'del'
  text: string
  oldLine?: number
  newLine?: number
}

function normalizeNewlines(value: string | null | undefined) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function splitLines(value: string): string[] {
  const norm = normalizeNewlines(value)
  if (!norm) return []
  return norm.split('\n')
}

/**
 * 计算两段 Markdown/文本的逐行 Diff（支持行号）。
 * 行数乘积适中时用 LCS 精准回溯；超大文本退化为公共前后缀 + 块替换，避免 O(N*M) 卡顿。
 */
export function computeLineDiff(before: string, after: string): DiffLine[] {
  const a = splitLines(before)
  const b = splitLines(after)
  if (!a.length && !b.length) return []

  // 先剥离共同前后缀，大幅缩小矩阵规模
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const out: DiffLine[] = []
  for (let i = 0; i < prefix; i++) {
    out.push({ type: 'same', text: a[i]!, oldLine: i + 1, newLine: i + 1 })
  }

  const midA = a.slice(prefix, a.length - suffix)
  const midB = b.slice(prefix, b.length - suffix)
  const n = midA.length
  const m = midB.length

  if (n > 0 || m > 0) {
    if (n * m <= 250_000) {
      const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
      for (let i = n - 1; i >= 0; i--) {
        const row = dp[i]!
        const next = dp[i + 1]!
        for (let j = m - 1; j >= 0; j--) {
          row[j] = midA[i] === midB[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!)
        }
      }
      let i = 0
      let j = 0
      while (i < n && j < m) {
        if (midA[i] === midB[j]) {
          out.push({ type: 'same', text: midA[i]!, oldLine: prefix + i + 1, newLine: prefix + j + 1 })
          i += 1
          j += 1
        } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
          out.push({ type: 'del', text: midA[i]!, oldLine: prefix + i + 1 })
          i += 1
        } else {
          out.push({ type: 'add', text: midB[j]!, newLine: prefix + j + 1 })
          j += 1
        }
      }
      while (i < n) {
        out.push({ type: 'del', text: midA[i]!, oldLine: prefix + i + 1 })
        i += 1
      }
      while (j < m) {
        out.push({ type: 'add', text: midB[j]!, newLine: prefix + j + 1 })
        j += 1
      }
    } else {
      for (let i = 0; i < n; i++) {
        out.push({ type: 'del', text: midA[i]!, oldLine: prefix + i + 1 })
      }
      for (let j = 0; j < m; j++) {
        out.push({ type: 'add', text: midB[j]!, newLine: prefix + j + 1 })
      }
    }
  }

  for (let k = 0; k < suffix; k++) {
    const oldIdx = a.length - suffix + k
    const newIdx = b.length - suffix + k
    out.push({ type: 'same', text: a[oldIdx]!, oldLine: oldIdx + 1, newLine: newIdx + 1 })
  }

  return out
}

export type DiffHunkItem =
  | { kind: 'line'; line: DiffLine }
  | { kind: 'collapse'; count: number }

/** 按上下文行折叠未变更的长段，保留变更前后各 `context` 行。 */
export function collapseDiffContext(lines: DiffLine[], context = 3): DiffHunkItem[] {
  if (!lines.length) return []
  const keep = new Uint8Array(lines.length)
  let anyChanged = false
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.type === 'same') continue
    anyChanged = true
    const from = Math.max(0, i - context)
    const to = Math.min(lines.length - 1, i + context)
    for (let k = from; k <= to; k++) keep[k] = 1
  }
  if (!anyChanged) return []
  const out: DiffHunkItem[] = []
  let skipped = 0
  for (let i = 0; i < lines.length; i++) {
    if (keep[i]) {
      if (skipped > 0) {
        out.push({ kind: 'collapse', count: skipped })
        skipped = 0
      }
      out.push({ kind: 'line', line: lines[i]! })
    } else {
      skipped += 1
    }
  }
  if (skipped > 0) out.push({ kind: 'collapse', count: skipped })
  return out
}
