import type { Node as PmNode } from '@tiptap/pm/model'
import { nodeBlockId } from './block-id.ts'

export type CommentAnchor = {
  blockId: string
  quote: string
  originalQuote?: string
  prefix: string
  suffix: string
  offset: number
}

export type ResolvedCommentAnchor = {
  from: number
  to: number
  blockId: string
  confidence: 'exact-offset' | 'block-context' | 'block-fuzzy' | 'doc-match'
  updated?: CommentAnchor
}

const CONTEXT_LEN = 32
const SEP_POS = -1

type IndexedDoc = {
  /** Unified flat document text with '\n' between textblocks (W3C TextQuoteSelector model). */
  text: string
  /** ProseMirror doc position for each char index in `text`, or SEP_POS (-1) for block separators. */
  posMap: number[]
  /** Top-level blockId owning each char index in `text` ('' for separators or unstamped blocks). */
  blockMap: string[]
}

function indexDoc(doc: PmNode): IndexedDoc {
  let text = ''
  const posMap: number[] = []
  const blockMap: string[] = []
  let hasTextblock = false

  doc.forEach((topNode, topPos) => {
    const blockId = nodeBlockId(topNode)
    const walk = (node: PmNode, absPos: number) => {
      if (node.isTextblock) {
        if (hasTextblock) {
          text += '\n'
          posMap.push(SEP_POS)
          blockMap.push('')
        }
        hasTextblock = true
        const contentStart = absPos + 1
        node.forEach((child, relPos) => {
          if (child.isText && child.text) {
            for (let i = 0; i < child.text.length; i += 1) {
              text += child.text[i]!
              posMap.push(contentStart + relPos + i)
              blockMap.push(blockId)
            }
          } else if (child.isInline && child.isLeaf) {
            text += '\ufffc'
            posMap.push(contentStart + relPos)
            blockMap.push(blockId)
          }
        })
        return
      }
      if (node.isLeaf) return
      const contentStart = absPos + 1
      node.forEach((child, relPos) => {
        walk(child, contentStart + relPos)
      })
    }
    walk(topNode, topPos)
  })

  return { text, posMap, blockMap }
}

function charRangeToDocRange(indexed: IndexedDoc, start: number, end: number): { from: number; to: number; blockId: string } | null {
  let s = Math.max(0, start)
  const clampedEnd = Math.min(indexed.text.length, end)
  while (s < clampedEnd && indexed.posMap[s] === SEP_POS) s += 1
  let e = clampedEnd - 1
  while (e >= s && indexed.posMap[e] === SEP_POS) e -= 1
  if (e < s) return null
  const from = indexed.posMap[s]!
  const to = indexed.posMap[e]! + 1
  if (to <= from) return null
  return { from, to, blockId: indexed.blockMap[s] ?? '' }
}

export function captureCommentAnchor(doc: PmNode, rawFrom: number, rawTo: number): CommentAnchor | null {
  const from = Math.max(0, Math.min(rawFrom, rawTo))
  const to = Math.min(doc.content.size, Math.max(rawFrom, rawTo))
  if (to <= from) return null
  const indexed = indexDoc(doc)
  if (!indexed.text.length) return null

  let start = -1
  let end = -1
  for (let i = 0; i < indexed.posMap.length; i += 1) {
    const p = indexed.posMap[i]!
    if (p === SEP_POS) continue
    if (start < 0 && p >= from) start = i
    if (p < to) end = i + 1
  }
  if (start < 0 || end <= start) return null

  const exactQuote = indexed.text.slice(start, end)
  if (!exactQuote.replace(/\ufffc/g, '').trim()) return null

  const prefix = indexed.text.slice(Math.max(0, start - CONTEXT_LEN), start)
  const suffix = indexed.text.slice(end, Math.min(indexed.text.length, end + CONTEXT_LEN))
  return {
    blockId: indexed.blockMap[start] ?? '',
    quote: exactQuote,
    originalQuote: exactQuote,
    prefix,
    suffix,
    offset: start,
  }
}

function commonSuffixLen(a: string, b: string) {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1
  return i
}

function commonPrefixLen(a: string, b: string) {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i += 1
  return i
}

function allOccurrences(haystack: string, needle: string): number[] {
  if (!needle) return []
  const out: number[] = []
  let idx = haystack.indexOf(needle)
  while (idx >= 0) {
    out.push(idx)
    idx = haystack.indexOf(needle, idx + 1)
  }
  return out
}

function scoreOccurrence(indexed: IndexedDoc, idx: number, len: number, anchor: CommentAnchor) {
  const text = indexed.text
  const left = text.slice(Math.max(0, idx - CONTEXT_LEN), idx)
  const right = text.slice(idx + len, Math.min(text.length, idx + len + CONTEXT_LEN))
  const preScore = commonSuffixLen(left, anchor.prefix)
  const sufScore = commonPrefixLen(right, anchor.suffix)
  const blockBonus = anchor.blockId && indexed.blockMap[idx] === anchor.blockId ? 12 : 0
  const distPenalty = Math.min(10, Math.abs(idx - anchor.offset) / 40)
  return preScore * 3 + sufScore * 3 + blockBonus - distPenalty
}

function bigrams(str: string): Map<string, number> {
  const map = new Map<string, number>()
  const norm = str.replace(/\s+/g, ' ').trim()
  if (norm.length < 2) {
    if (norm) map.set(norm, 1)
    return map
  }
  for (let i = 0; i < norm.length - 1; i += 1) {
    const bg = norm.slice(i, i + 2)
    map.set(bg, (map.get(bg) ?? 0) + 1)
  }
  return map
}

function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  const ba = bigrams(a)
  const bb = bigrams(b)
  let inter = 0
  let totalA = 0
  let totalB = 0
  for (const [k, v] of ba) {
    totalA += v
    const vb = bb.get(k)
    if (vb) inter += Math.min(v, vb)
  }
  for (const v of bb.values()) totalB += v
  return totalA + totalB > 0 ? (2 * inter) / (totalA + totalB) : 0
}

function fuzzyMatchInText(
  text: string,
  anchor: CommentAnchor,
  minScore: number,
  windowStart = 0,
  windowEnd = text.length,
): { start: number; end: number; score: number } | null {
  const slice = text.slice(windowStart, windowEnd)
  const target = anchor.quote
  if (!slice || !target) return null

  // 1) Prefix + suffix boundary bracket (Hypothesis-style: recovers edits inside the quoted span)
  const preNeedle = anchor.prefix.slice(-Math.min(10, anchor.prefix.length))
  const sufNeedle = anchor.suffix.slice(0, Math.min(10, anchor.suffix.length))
  if (preNeedle.length >= 2 && sufNeedle.length >= 2) {
    const preHits = allOccurrences(slice, preNeedle)
    const sufHits = allOccurrences(slice, sufNeedle)
    let best: { start: number; end: number; score: number } | null = null
    for (const p of preHits) {
      const start = p + preNeedle.length
      for (const s of sufHits) {
        if (s <= start) continue
        const spanLen = s - start
        if (spanLen > Math.max(target.length * 3, target.length + 60)) continue
        const candidate = slice.slice(start, s)
        const sim = diceSimilarity(candidate, target)
        if (sim >= 0.35 && (!best || sim > best.score)) {
          best = { start: windowStart + start, end: windowStart + s, score: Math.max(sim, 0.85) }
        }
      }
    }
    if (best) return best
  }

  // 2) Sliding window bigram similarity (bounded for performance on large docs)
  if (slice.length > 4000) return null
  const winMin = Math.max(1, Math.floor(target.length * 0.7))
  const winMax = Math.min(slice.length, Math.ceil(target.length * 1.35))
  const step = target.length > 20 ? 2 : 1
  let best: { start: number; end: number; score: number } | null = null
  for (let start = 0; start <= slice.length - winMin; start += step) {
    for (const len of new Set([target.length, winMin, Math.min(winMax, slice.length - start)])) {
      const end = Math.min(slice.length, start + len)
      if (end <= start) continue
      const candidate = slice.slice(start, end)
      const sim = diceSimilarity(candidate, target)
      if (sim >= minScore && (!best || sim > best.score)) {
        best = { start: windowStart + start, end: windowStart + end, score: sim }
      }
    }
  }
  return best
}

function buildUpdatedAnchor(indexed: IndexedDoc, start: number, end: number, prev: CommentAnchor): CommentAnchor | undefined {
  const quote = indexed.text.slice(start, end)
  const prefix = indexed.text.slice(Math.max(0, start - CONTEXT_LEN), start)
  const suffix = indexed.text.slice(end, Math.min(indexed.text.length, end + CONTEXT_LEN))
  const blockId = indexed.blockMap[start] ?? ''
  const changed =
    blockId !== prev.blockId ||
    start !== prev.offset ||
    quote !== prev.quote ||
    prefix !== prev.prefix ||
    suffix !== prev.suffix
  if (!changed) return undefined
  return {
    blockId,
    quote,
    originalQuote: prev.originalQuote || prev.quote,
    prefix,
    suffix,
    offset: start,
  }
}

export function resolveCommentAnchor(doc: PmNode, anchor: CommentAnchor | null | undefined): ResolvedCommentAnchor | null {
  if (!anchor || !anchor.quote) return null
  const indexed = indexDoc(doc)
  if (!indexed.text.length) return null

  const quote = anchor.quote
  const sameBlock = (start: number) => Boolean(anchor.blockId && indexed.blockMap[start] === anchor.blockId)

  // Tier 1: exact offset + exact quote (O(1) fast path for both single-block and multi-block!)
  const start = anchor.offset
  const end = start + quote.length
  if (
    start >= 0 &&
    end <= indexed.text.length &&
    indexed.text.slice(start, end) === quote &&
    (!anchor.blockId || indexed.blockMap[start] === anchor.blockId)
  ) {
    const docRange = charRangeToDocRange(indexed, start, end)
    if (docRange) {
      return {
        from: docRange.from,
        to: docRange.to,
        blockId: docRange.blockId,
        confidence: 'exact-offset',
      }
    }
  }

  // Tier 2: exact full-doc quote match disambiguated by prefix/suffix context + blockId + offset (W3C / Hypothesis)
  const hits = allOccurrences(indexed.text, quote)
  if (hits.length > 0) {
    let bestIdx = hits[0]!
    let bestScore = -Infinity
    for (const idx of hits) {
      const s = scoreOccurrence(indexed, idx, quote.length, anchor)
      if (s > bestScore) {
        bestScore = s
        bestIdx = idx
      }
    }
    const endIdx = bestIdx + quote.length
    const docRange = charRangeToDocRange(indexed, bestIdx, endIdx)
    if (docRange) {
      return {
        from: docRange.from,
        to: docRange.to,
        blockId: docRange.blockId,
        confidence: sameBlock(bestIdx) ? 'block-context' : 'doc-match',
        updated: buildUpdatedAnchor(indexed, bestIdx, endIdx, anchor),
      }
    }
  }

  // Tier 3: fuzzy / prefix+suffix bracket recovery (search around anchor.offset first, then full doc)
  const winStart = Math.max(0, anchor.offset - 800)
  const winEnd = Math.min(indexed.text.length, anchor.offset + quote.length + 800)
  const localFuzzy = fuzzyMatchInText(indexed.text, anchor, 0.65, winStart, winEnd)
  if (localFuzzy) {
    const docRange = charRangeToDocRange(indexed, localFuzzy.start, localFuzzy.end)
    if (docRange) {
      return {
        from: docRange.from,
        to: docRange.to,
        blockId: docRange.blockId,
        confidence: sameBlock(localFuzzy.start) ? 'block-fuzzy' : 'doc-match',
        updated: buildUpdatedAnchor(indexed, localFuzzy.start, localFuzzy.end, anchor),
      }
    }
  }

  const fullFuzzy = fuzzyMatchInText(indexed.text, anchor, 0.78)
  if (fullFuzzy) {
    const docRange = charRangeToDocRange(indexed, fullFuzzy.start, fullFuzzy.end)
    if (docRange) {
      return {
        from: docRange.from,
        to: docRange.to,
        blockId: docRange.blockId,
        confidence: 'doc-match',
        updated: buildUpdatedAnchor(indexed, fullFuzzy.start, fullFuzzy.end, anchor),
      }
    }
  }

  // Tier 4: detached / orphaned
  return null
}
