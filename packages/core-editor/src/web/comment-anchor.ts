import type { Node as PmNode } from '@tiptap/pm/model'
import { nodeBlockId } from './block-id.ts'

export type CommentAnchorEndpoint = {
  blockId: string
  quote: string
  prefix: string
  suffix: string
  offset: number
}

export type CommentAnchor = {
  blockId: string
  quote: string
  startQuote?: string
  originalQuote?: string
  prefix: string
  suffix: string
  offset: number
  end?: CommentAnchorEndpoint
}

export type ResolvedCommentAnchor = {
  from: number
  to: number
  blockId: string
  confidence: 'exact-offset' | 'block-context' | 'block-fuzzy' | 'doc-match'
  updated?: CommentAnchor
}

const CONTEXT_LEN = 24

type IndexedBlock = {
  blockId: string
  pos: number
  end: number
  text: string
  /** Document position for each character index in `text`, plus end pos at `text.length`. */
  posMap: number[]
}

function indexBlock(node: PmNode, pos: number): IndexedBlock {
  const blockId = nodeBlockId(node)
  let text = ''
  const posMap: number[] = []
  const contentStart = pos + 1
  node.descendants((child, relPos) => {
    if (child.isText && child.text) {
      for (let i = 0; i < child.text.length; i += 1) {
        text += child.text[i]!
        posMap.push(contentStart + relPos + i)
      }
      return false
    }
    if (child.isInline && child.isLeaf) {
      text += '\ufffc'
      posMap.push(contentStart + relPos)
      return false
    }
    return true
  })
  const lastEnd = posMap.length ? posMap[posMap.length - 1]! + 1 : contentStart
  posMap.push(lastEnd)
  return {
    blockId,
    pos,
    end: pos + node.nodeSize,
    text,
    posMap,
  }
}

function indexDocBlocks(doc: PmNode): IndexedBlock[] {
  const out: IndexedBlock[] = []
  doc.forEach((node, pos) => {
    out.push(indexBlock(node, pos))
  })
  return out
}

function docPosFromCharIndex(block: IndexedBlock, charIdx: number): number {
  const clamped = Math.max(0, Math.min(charIdx, block.posMap.length - 1))
  return block.posMap[clamped]!
}

function charRangeFromDocRange(block: IndexedBlock, from: number, to: number): { start: number; end: number } | null {
  if (!block.text.length) return null
  let start = -1
  let end = -1
  for (let i = 0; i < block.text.length; i += 1) {
    const p = block.posMap[i]!
    if (start < 0 && p >= from) start = i
    if (p < to) end = i + 1
  }
  if (start < 0 || end <= start) return null
  return { start, end }
}

export function captureCommentAnchor(doc: PmNode, rawFrom: number, rawTo: number): CommentAnchor | null {
  const from = Math.max(0, Math.min(rawFrom, rawTo))
  const to = Math.min(doc.content.size, Math.max(rawFrom, rawTo))
  if (to <= from) return null
  const blocks = indexDocBlocks(doc)
  // 收集所有包含非空选中文字的相交顶层块：单块保持原格式，跨多块时同时记录起止端点，避免截断后续段落/标题。
  const hits: Array<{
    block: IndexedBlock
    start: number
    end: number
    exactQuote: string
    prefix: string
    suffix: string
  }> = []
  for (const block of blocks) {
    if (block.end <= from) continue
    if (block.pos >= to) break
    const blockFrom = Math.max(from, block.pos)
    const blockTo = Math.min(to, block.end)
    const range = charRangeFromDocRange(block, blockFrom, blockTo)
    if (!range) continue
    const quote = block.text.slice(range.start, range.end).replace(/\ufffc/g, '').trim()
    if (!quote) continue
    const exactQuote = block.text.slice(range.start, range.end)
    const prefix = block.text.slice(Math.max(0, range.start - CONTEXT_LEN), range.start)
    const suffix = block.text.slice(range.end, Math.min(block.text.length, range.end + CONTEXT_LEN))
    hits.push({ block, start: range.start, end: range.end, exactQuote, prefix, suffix })
  }
  if (!hits.length) return null
  const first = hits[0]!
  if (hits.length === 1) {
    return {
      blockId: first.block.blockId,
      quote: first.exactQuote,
      originalQuote: first.exactQuote,
      prefix: first.prefix,
      suffix: first.suffix,
      offset: first.start,
    }
  }
  const last = hits[hits.length - 1]!
  const fullQuote = hits.map((h) => h.exactQuote).join('\n')
  return {
    blockId: first.block.blockId,
    quote: fullQuote,
    startQuote: first.exactQuote,
    originalQuote: fullQuote,
    prefix: first.prefix,
    suffix: first.suffix,
    offset: first.start,
    end: {
      blockId: last.block.blockId,
      quote: last.exactQuote,
      prefix: last.prefix,
      suffix: last.suffix,
      offset: last.start,
    },
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

function scoreOccurrence(text: string, idx: number, len: number, anchor: CommentAnchor) {
  const left = text.slice(Math.max(0, idx - CONTEXT_LEN), idx)
  const right = text.slice(idx + len, Math.min(text.length, idx + len + CONTEXT_LEN))
  const preScore = commonSuffixLen(left, anchor.prefix)
  const sufScore = commonPrefixLen(right, anchor.suffix)
  const distPenalty = Math.min(10, Math.abs(idx - anchor.offset) / 40)
  return preScore * 3 + sufScore * 3 - distPenalty
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

function fuzzyMatchInBlock(block: IndexedBlock, anchor: CommentAnchor, minScore: number): { start: number; end: number; score: number } | null {
  const text = block.text
  const target = anchor.quote
  if (!text || !target) return null

  // 1) Try prefix + suffix boundary bracket first (handles edits inside the quoted span!)
  const preNeedle = anchor.prefix.slice(-Math.min(10, anchor.prefix.length))
  const sufNeedle = anchor.suffix.slice(0, Math.min(10, anchor.suffix.length))
  if (preNeedle.length >= 2 && sufNeedle.length >= 2) {
    const preHits = allOccurrences(text, preNeedle)
    const sufHits = allOccurrences(text, sufNeedle)
    let best: { start: number; end: number; score: number } | null = null
    for (const p of preHits) {
      const start = p + preNeedle.length
      for (const s of sufHits) {
        if (s <= start) continue
        const spanLen = s - start
        if (spanLen > Math.max(target.length * 3, target.length + 40)) continue
        const candidate = text.slice(start, s)
        const sim = diceSimilarity(candidate, target)
        if (sim >= 0.35 && (!best || sim > best.score)) {
          best = { start, end: s, score: Math.max(sim, 0.85) }
        }
      }
    }
    if (best) return best
  }

  // 2) Sliding window bigram similarity
  const winMin = Math.max(1, Math.floor(target.length * 0.7))
  const winMax = Math.min(text.length, Math.ceil(target.length * 1.35))
  const step = target.length > 20 ? 2 : 1
  let best: { start: number; end: number; score: number } | null = null
  for (let start = 0; start <= text.length - winMin; start += step) {
    for (const len of new Set([target.length, winMin, Math.min(winMax, text.length - start)])) {
      const end = Math.min(text.length, start + len)
      if (end <= start) continue
      const candidate = text.slice(start, end)
      const sim = diceSimilarity(candidate, target)
      if (sim >= minScore && (!best || sim > best.score)) {
        best = { start, end, score: sim }
      }
    }
  }
  return best
}

function buildUpdatedAnchor(block: IndexedBlock, start: number, end: number, prev: CommentAnchor): CommentAnchor | undefined {
  const quote = block.text.slice(start, end)
  const prefix = block.text.slice(Math.max(0, start - CONTEXT_LEN), start)
  const suffix = block.text.slice(end, Math.min(block.text.length, end + CONTEXT_LEN))
  const changed =
    block.blockId !== prev.blockId ||
    start !== prev.offset ||
    quote !== prev.quote ||
    prefix !== prev.prefix ||
    suffix !== prev.suffix
  if (!changed) return undefined
  return {
    blockId: block.blockId,
    quote,
    originalQuote: prev.originalQuote || prev.quote,
    prefix,
    suffix,
    offset: start,
  }
}

function resolveSingleBlockAnchor(
  blocks: IndexedBlock[],
  anchor: CommentAnchor,
): ResolvedCommentAnchor | null {
  if (!anchor.quote) return null
  const targetBlock = anchor.blockId ? blocks.find((b) => b.blockId === anchor.blockId) : undefined

  // Tier 1: exact blockId + exact offset + exact quote
  if (targetBlock) {
    const start = anchor.offset
    const end = start + anchor.quote.length
    if (start >= 0 && end <= targetBlock.text.length && targetBlock.text.slice(start, end) === anchor.quote) {
      return {
        from: docPosFromCharIndex(targetBlock, start),
        to: docPosFromCharIndex(targetBlock, end),
        blockId: targetBlock.blockId,
        confidence: 'exact-offset',
      }
    }

    // Tier 2: exact quote anywhere inside the same block, disambiguated by prefix/suffix + offset
    const hits = allOccurrences(targetBlock.text, anchor.quote)
    if (hits.length > 0) {
      let bestIdx = hits[0]!
      let bestScore = -Infinity
      for (const idx of hits) {
        const s = scoreOccurrence(targetBlock.text, idx, anchor.quote.length, anchor)
        if (s > bestScore) {
          bestScore = s
          bestIdx = idx
        }
      }
      const endIdx = bestIdx + anchor.quote.length
      return {
        from: docPosFromCharIndex(targetBlock, bestIdx),
        to: docPosFromCharIndex(targetBlock, endIdx),
        blockId: targetBlock.blockId,
        confidence: 'block-context',
        updated: buildUpdatedAnchor(targetBlock, bestIdx, endIdx, anchor),
      }
    }

    // Tier 3a: fuzzy match inside the same block (typo fixed / span edited)
    const fuzzy = fuzzyMatchInBlock(targetBlock, anchor, 0.65)
    if (fuzzy) {
      return {
        from: docPosFromCharIndex(targetBlock, fuzzy.start),
        to: docPosFromCharIndex(targetBlock, fuzzy.end),
        blockId: targetBlock.blockId,
        confidence: 'block-fuzzy',
        updated: buildUpdatedAnchor(targetBlock, fuzzy.start, fuzzy.end, anchor),
      }
    }
  }

  // Tier 3b: cross-block full-doc match (block split, merged, or Agent rewrote blockId)
  let bestDocHit: { block: IndexedBlock; start: number; end: number; score: number } | null = null
  for (const block of blocks) {
    if (block === targetBlock) continue
    const hits = allOccurrences(block.text, anchor.quote)
    for (const idx of hits) {
      const s = scoreOccurrence(block.text, idx, anchor.quote.length, anchor) + 100
      if (!bestDocHit || s > bestDocHit.score) {
        bestDocHit = { block, start: idx, end: idx + anchor.quote.length, score: s }
      }
    }
  }
  if (bestDocHit) {
    return {
      from: docPosFromCharIndex(bestDocHit.block, bestDocHit.start),
      to: docPosFromCharIndex(bestDocHit.block, bestDocHit.end),
      blockId: bestDocHit.block.blockId,
      confidence: 'doc-match',
      updated: buildUpdatedAnchor(bestDocHit.block, bestDocHit.start, bestDocHit.end, anchor),
    }
  }

  // Cross-block fuzzy fallback (stricter threshold 0.78 to avoid false positives)
  let bestFuzzyDoc: { block: IndexedBlock; start: number; end: number; score: number } | null = null
  for (const block of blocks) {
    if (block === targetBlock) continue
    const fuzzy = fuzzyMatchInBlock(block, anchor, 0.78)
    if (fuzzy && (!bestFuzzyDoc || fuzzy.score > bestFuzzyDoc.score)) {
      bestFuzzyDoc = { block, start: fuzzy.start, end: fuzzy.end, score: fuzzy.score }
    }
  }
  if (bestFuzzyDoc) {
    return {
      from: docPosFromCharIndex(bestFuzzyDoc.block, bestFuzzyDoc.start),
      to: docPosFromCharIndex(bestFuzzyDoc.block, bestFuzzyDoc.end),
      blockId: bestFuzzyDoc.block.blockId,
      confidence: 'doc-match',
      updated: buildUpdatedAnchor(bestFuzzyDoc.block, bestFuzzyDoc.start, bestFuzzyDoc.end, anchor),
    }
  }

  // Tier 4: detached / orphaned
  return null
}

export function resolveCommentAnchor(doc: PmNode, anchor: CommentAnchor | null | undefined): ResolvedCommentAnchor | null {
  if (!anchor || !anchor.quote) return null
  const blocks = indexDocBlocks(doc)
  if (!blocks.length) return null

  if (anchor.end) {
    const startHit = resolveSingleBlockAnchor(blocks, {
      ...anchor,
      quote: anchor.startQuote || anchor.quote.split('\n')[0] || anchor.quote,
    })
    const endHit = resolveSingleBlockAnchor(blocks, {
      blockId: anchor.end.blockId,
      quote: anchor.end.quote,
      prefix: anchor.end.prefix,
      suffix: anchor.end.suffix,
      offset: anchor.end.offset,
    })
    if (startHit && endHit && endHit.to > startHit.from) {
      return {
        from: startHit.from,
        to: endHit.to,
        blockId: startHit.blockId,
        confidence: startHit.confidence,
      }
    }
    return startHit ?? endHit
  }

  return resolveSingleBlockAnchor(blocks, anchor)
}
