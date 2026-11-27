import {
  asAttachment,
  asAttachmentList,
  asHttpHref,
  asImageSrc,
  asImageSrcList,
  asPerson,
  normalizeSchemaValue,
  type DbRecord,
  type FieldSpec,
  type FieldType,
} from '@biu/type-file-system'
import { asStringList, enumDisplayLabel, resolveFieldType } from './fields.ts'
import { tableClearedValue, type TableCellCursor } from './table-keys.ts'
import { isViewCatalogField } from './view-catalog.ts'

export type TableClipboardCell = {
  text: string
  raw?: unknown
  fieldType?: FieldType
  fieldKey?: string
  readonly?: boolean
  empty: boolean
  fromInternal: boolean
}

export type TableClipboardPayload = {
  plain: string
  matrix: TableClipboardCell[][]
  at: number
}

export type TablePasteColumn = {
  key: string
  field: FieldSpec
}

export type TablePasteMutation = {
  row: DbRecord
  rowIndex: number
  colIndex: number
  key: string
  field: FieldSpec
  value: unknown
}

export type TablePasteStats = {
  updated: number
  unchanged: number
  skippedReadonly: number
  skippedInvalid: number
  totalTargetCells: number
}

export type TablePastePlan = {
  mutations: TablePasteMutation[]
  appliedRange: { anchor: TableCellCursor; focus: TableCellCursor } | null
  stats: TablePasteStats
}

let internalClipboard: TableClipboardPayload | null = null

function normalizeClipboardPlain(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '')
}

export function rememberTableClipboard(payload: TableClipboardPayload | null) {
  internalClipboard = payload
}

export function clearTableClipboard() {
  internalClipboard = null
}

export function readTableClipboard(plain?: string | null): TableClipboardPayload | null {
  if (!internalClipboard) return null
  if (plain === undefined || plain === null) return internalClipboard
  if (normalizeClipboardPlain(plain) === normalizeClipboardPlain(internalClipboard.plain)) {
    return internalClipboard
  }
  return null
}

/** ⌘D / Ctrl+D：向下填充选中区域（单行时取正上一行的值）。 */
export function tableFillDownHotkey(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}) {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  return event.key === 'd' || event.key === 'D'
}

/** RFC 4180 风格 TSV 解析：支持双引号包裹的跨行/含制表符单元格，去掉末尾单个换行。 */
export function parseTsvMatrix(input: string): string[][] {
  const text = normalizeClipboardPlain(input)
  if (!text) return []
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"' && cell.length === 0) {
      inQuotes = true
      continue
    }
    if (ch === '\t') {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += ch
  }
  row.push(cell)
  rows.push(row)

  const maxCols = rows.reduce((max, item) => Math.max(max, item.length), 0)
  if (maxCols === 0) return []
  return rows.map((item) => (item.length < maxCols ? [...item, ...Array<string>(maxCols - item.length).fill('')] : item))
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code)
      return Number.isFinite(n) ? String.fromCodePoint(n) : ''
    })
}

/** 解析来自 Excel / Google Sheets / 飞书 / 网页表格的 HTML <table> 剪贴板。 */
export function parseHtmlTableMatrix(html: string): string[][] | null {
  if (!html || !/<table[\s>]/i.test(html)) return null

  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const table = doc.querySelector('table')
      if (!table) return null
      const trs = Array.from(table.querySelectorAll('tr'))
      if (!trs.length) return null
      const rows: string[][] = []
      for (const tr of trs) {
        const tds = Array.from(tr.children).filter((el) => el.tagName === 'TD' || el.tagName === 'TH')
        if (!tds.length) continue
        rows.push(
          tds.map((td) => {
            const clone = td.cloneNode(true) as HTMLElement
            clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
            return (clone.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trim()
          }),
        )
      }
      if (!rows.length) return null
      const maxCols = rows.reduce((max, r) => Math.max(max, r.length), 0)
      return rows.map((r) => (r.length < maxCols ? [...r, ...Array<string>(maxCols - r.length).fill('')] : r))
    } catch {
      /* fallback to regex parser */
    }
  }

  const trMatches = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)
  if (!trMatches?.length) return null
  const rows: string[][] = []
  for (const tr of trMatches) {
    const cellMatches = tr.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi)
    if (!cellMatches?.length) continue
    rows.push(
      cellMatches.map((raw) =>
        decodeHtmlEntities(
          raw
            .replace(/^<t[dh]\b[^>]*>/i, '')
            .replace(/<\/t[dh]>$/i, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
            .replace(/<[^>]+>/g, ''),
        ).trim(),
      ),
    )
  }
  if (!rows.length) return null
  const maxCols = rows.reduce((max, r) => Math.max(max, r.length), 0)
  return rows.map((r) => (r.length < maxCols ? [...r, ...Array<string>(maxCols - r.length).fill('')] : r))
}

export function parseClipboardMatrix(input: { plain?: string; html?: string }): TableClipboardCell[][] {
  const internal = readTableClipboard(input.plain ?? null)
  if (internal?.matrix.length) return internal.matrix

  const htmlMatrix = input.html ? parseHtmlTableMatrix(input.html) : null
  const rawMatrix = htmlMatrix?.length ? htmlMatrix : parseTsvMatrix(input.plain ?? '')
  return rawMatrix.map((row) =>
    row.map((text) => ({
      text,
      empty: text.trim() === '',
      fromInternal: false,
    })),
  )
}

import { escapeTsvCell } from './table-keys.ts'

/** 构造带位置对齐的内部剪贴板矩阵与纯文本 TSV（只读列保留占位，避免粘贴错列）。 */
export function buildTableClipboardPayload(
  cursors: TableCellCursor[],
  readCell: (cursor: TableCellCursor) => Omit<TableClipboardCell, 'fromInternal'> | null | undefined,
): TableClipboardPayload | null {
  const rows: TableClipboardCell[][] = []
  const byRow = new Map<string, TableClipboardCell[]>()
  let count = 0
  let singleText = ''

  for (const cursor of cursors) {
    if (!cursor.key) continue
    const data = readCell(cursor)
    if (!data) continue
    const rowId = cursor.rowKey || cursor.id
    let bucket = byRow.get(rowId)
    if (!bucket) {
      bucket = []
      byRow.set(rowId, bucket)
      rows.push(bucket)
    }
    bucket.push({ ...data, fromInternal: true })
    count += 1
    singleText = data.text
  }

  if (count === 0) return null
  const plain =
    count === 1
      ? singleText
      : rows.map((row) => row.map((cell) => escapeTsvCell(cell.text)).join('\t')).join('\n')

  return { plain, matrix: rows, at: Date.now() }
}

export function isPasteColumnWritable(col: TablePasteColumn, cellFieldWritable: (field: FieldSpec) => boolean): boolean {
  if (!col.key || col.key === 'actions' || col.key === 'shareScope' || col.key === 'shareRole') return false
  if (isViewCatalogField(col.key)) return false
  if (col.field.computed) return false
  if (!cellFieldWritable(col.field)) return false
  const kind = resolveFieldType(col.field)
  if (kind === 'action' || kind === 'file') return false
  return true
}

function matchEnumValue(field: FieldSpec, candidate: string): string | null {
  const trimmed = candidate.trim()
  if (!trimmed) return null
  const options = field.enum ?? []
  if (!options.length) return trimmed
  if (options.includes(trimmed)) return trimmed
  for (const opt of options) {
    if (enumDisplayLabel(field, opt).trim() === trimmed) return opt
  }
  const lower = trimmed.toLowerCase()
  for (const opt of options) {
    if (opt.toLowerCase() === lower || enumDisplayLabel(field, opt).trim().toLowerCase() === lower) {
      return opt
    }
  }
  return null
}

function parseNumberFromText(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const cleaned = trimmed
    .replace(/^[\s+¥$€£￥]+/, '')
    .replace(/[\s,]+/g, '')
    .replace(/%$/, '')
  if (!cleaned || !/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const BOOL_TRUE = new Set(['true', '1', 'yes', 'y', 'on', '✓', '✔', '☑', '是', '真', 'checked'])
const BOOL_FALSE = new Set(['false', '0', 'no', 'n', 'off', '✗', '✘', '☐', '否', '假', 'unchecked'])

function parseBooleanFromText(raw: string): boolean | null {
  const key = raw.trim().toLowerCase()
  if (BOOL_TRUE.has(key)) return true
  if (BOOL_FALSE.has(key)) return false
  return null
}

function parseDateTimeFromText(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^\d{10,13}$/.test(trimmed)) {
    const n = Number(trimmed)
    if (Number.isFinite(n) && n > 0) return trimmed.length === 10 ? n * 1000 : n
  }
  const match = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (match) {
    const [, y, m, d, hh = '0', mm = '0', ss = '0'] = match
    const year = Number(y)
    const month = Number(m)
    const day = Number(d)
    const hour = Number(hh)
    const minute = Number(mm)
    const second = Number(ss)
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null
    const dt = new Date(year, month - 1, day, hour, minute, second)
    if (dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day) {
      return dt.getTime()
    }
    return null
  }
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function splitMultiTokens(text: string): string[] {
  return text
    .split(/[,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function cloneSafe<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch {
    return value
  }
}

export type CoerceResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'invalid' }

/**
 * 三层转换管道：
 * 1. 空值 → 合法清空（tableClearedValue）
 * 2. 同构无损通道（应用内同类型复制直接复用结构化值）
 * 3. 跨类型文本强转（失败返回 invalid，保留目标格原值）
 */
export function coerceClipboardCell(cell: TableClipboardCell, targetField: FieldSpec): CoerceResult {
  const targetKind = resolveFieldType(targetField)

  if (cell.empty) {
    const empty = tableClearedValue(targetKind)
    if (empty === undefined) return { ok: false, reason: 'invalid' }
    return { ok: true, value: empty }
  }

  // Tier 1: 应用内同类型无损直通
  if (cell.fromInternal && cell.fieldType === targetKind && cell.raw !== undefined) {
    if (targetKind === 'select') {
      const matched = matchEnumValue(targetField, String(cell.raw))
      if (matched !== null) return { ok: true, value: matched }
      // 跨列同为 select 但枚举集不同时，继续尝试按 displayText 匹配
    } else if (targetKind === 'multi-select') {
      const list = asStringList(cell.raw)
      if (!targetField.enum?.length) return { ok: true, value: list }
      const mapped = Array.from(new Set(list.map((item) => matchEnumValue(targetField, item)).filter((v): v is string => v !== null)))
      if (mapped.length > 0) return { ok: true, value: mapped }
      return { ok: false, reason: 'invalid' }
    } else if (targetKind === 'tag') {
      return { ok: true, value: normalizeSchemaValue(cloneSafe(cell.raw)) }
    } else {
      return { ok: true, value: cloneSafe(cell.raw) }
    }
  }

  // Tier 2: 跨类型文本强转
  const text = cell.text

  if (targetKind === 'string') {
    return { ok: true, value: text }
  }

  if (targetKind === 'url') {
    const href = asHttpHref(text.trim())
    if (href) return { ok: true, value: href }
    return { ok: false, reason: 'invalid' }
  }

  if (targetKind === 'number') {
    if (cell.fromInternal && typeof cell.raw === 'number' && Number.isFinite(cell.raw)) {
      return { ok: true, value: cell.raw }
    }
    const n = parseNumberFromText(text)
    return n === null ? { ok: false, reason: 'invalid' } : { ok: true, value: n }
  }

  if (targetKind === 'boolean') {
    if (cell.fromInternal && typeof cell.raw === 'boolean') {
      return { ok: true, value: cell.raw }
    }
    const b = parseBooleanFromText(text)
    return b === null ? { ok: false, reason: 'invalid' } : { ok: true, value: b }
  }

  if (targetKind === 'datetime') {
    if (cell.fromInternal && cell.fieldType === 'datetime' && typeof cell.raw === 'number' && Number.isFinite(cell.raw) && cell.raw > 0) {
      return { ok: true, value: cell.raw }
    }
    const ts = parseDateTimeFromText(text)
    return ts === null ? { ok: false, reason: 'invalid' } : { ok: true, value: ts }
  }

  if (targetKind === 'select') {
    const candidate =
      cell.fromInternal && cell.fieldType === 'multi-select'
        ? (asStringList(cell.raw)[0] ?? text)
        : text
    const matched = matchEnumValue(targetField, candidate)
    return matched === null ? { ok: false, reason: 'invalid' } : { ok: true, value: matched }
  }

  if (targetKind === 'multi-select') {
    const tokens =
      cell.fromInternal && (cell.fieldType === 'select' || cell.fieldType === 'multi-select')
        ? asStringList(cell.raw)
        : splitMultiTokens(text)
    if (!tokens.length) return { ok: false, reason: 'invalid' }
    if (!targetField.enum?.length) return { ok: true, value: Array.from(new Set(tokens)) }
    const mapped = Array.from(new Set(tokens.map((token) => matchEnumValue(targetField, token)).filter((v): v is string => v !== null)))
    return mapped.length ? { ok: true, value: mapped } : { ok: false, reason: 'invalid' }
  }

  if (targetKind === 'tag') {
    const trimmed = text.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { tags?: unknown }).tags)) {
          return { ok: true, value: normalizeSchemaValue(parsed) }
        }
      } catch {
        return { ok: false, reason: 'invalid' }
      }
    }
    return { ok: false, reason: 'invalid' }
  }

  if (targetKind === 'ref') {
    const id = text.trim()
    return id ? { ok: true, value: id } : { ok: false, reason: 'invalid' }
  }

  if (targetKind === 'multi-ref') {
    const ids = splitMultiTokens(text)
    return ids.length ? { ok: true, value: Array.from(new Set(ids)) } : { ok: false, reason: 'invalid' }
  }

  if (targetKind === 'image') {
    const srcs = asImageSrcList(text.trim())
    if (srcs.length) return { ok: true, value: srcs }
    const single = asImageSrc(text.trim())
    return single ? { ok: true, value: [single] } : { ok: false, reason: 'invalid' }
  }

  if (targetKind === 'person') {
    const trimmed = text.trim()
    if (trimmed.startsWith('{')) {
      try {
        const person = asPerson(JSON.parse(trimmed))
        if (person) return { ok: true, value: person }
      } catch {
        return { ok: false, reason: 'invalid' }
      }
    }
    return { ok: false, reason: 'invalid' }
  }

  if (targetKind === 'attachment' || targetKind === 'document') {
    const trimmed = text.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        const list = asAttachmentList(parsed)
        if (list.length) return { ok: true, value: list }
        const one = asAttachment(parsed)
        if (one) return { ok: true, value: [one] }
      } catch {
        return { ok: false, reason: 'invalid' }
      }
    }
    return { ok: false, reason: 'invalid' }
  }

  return { ok: false, reason: 'invalid' }
}

export type PasteBounds = {
  rStart: number
  rEnd: number
  cStart: number
  cEnd: number
}

/**
 * 源矩阵 (srcRows × srcCols) → 目标选区映射规则：
 * 1. 1×1 源 → 广播填满整个目标选区
 * 2. 目标选区是源尺寸的整数倍（且不止 1 格）→ 周期平铺
 * 3. 其它情况 → 以目标选区左上角为锚点按源尺寸展开（裁剪到表格边界）
 */
export function resolvePasteTargetBounds(opts: {
  srcRows: number
  srcCols: number
  selRStart: number
  selREnd: number
  selCStart: number
  selCEnd: number
  maxRows: number
  maxCols: number
}): PasteBounds | null {
  const { srcRows, srcCols, selRStart, selREnd, selCStart, selCEnd, maxRows, maxCols } = opts
  if (srcRows <= 0 || srcCols <= 0 || maxRows <= 0 || maxCols <= 0) return null
  if (selRStart < 0 || selCStart < 0 || selRStart >= maxRows || selCStart >= maxCols) return null

  const selRows = selREnd - selRStart + 1
  const selCols = selCEnd - selCStart + 1

  // 1. 1×1 广播
  if (srcRows === 1 && srcCols === 1) {
    return {
      rStart: selRStart,
      rEnd: Math.min(maxRows - 1, selREnd),
      cStart: selCStart,
      cEnd: Math.min(maxCols - 1, selCEnd),
    }
  }

  // 2. 整倍平铺
  if ((selRows > 1 || selCols > 1) && selRows % srcRows === 0 && selCols % srcCols === 0) {
    return {
      rStart: selRStart,
      rEnd: Math.min(maxRows - 1, selREnd),
      cStart: selCStart,
      cEnd: Math.min(maxCols - 1, selCEnd),
    }
  }

  // 3. 锚点展开
  return {
    rStart: selRStart,
    rEnd: Math.min(maxRows - 1, selRStart + srcRows - 1),
    cStart: selCStart,
    cEnd: Math.min(maxCols - 1, selCStart + srcCols - 1),
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a == null && b == null) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

export function buildTablePastePlan(opts: {
  sourceMatrix: TableClipboardCell[][]
  rowIds: string[]
  rowKeys?: string[]
  columns: TablePasteColumn[]
  selection: { anchor: TableCellCursor; focus: TableCellCursor }
  findRow: (id: string) => DbRecord | undefined
  readCurrentValue: (row: DbRecord, key: string, field: FieldSpec) => unknown
  cellFieldWritable: (field: FieldSpec) => boolean
}): TablePastePlan {
  const { sourceMatrix, rowIds, rowKeys, columns, selection, findRow, readCurrentValue, cellFieldWritable } = opts
  const emptyStats: TablePasteStats = {
    updated: 0,
    unchanged: 0,
    skippedReadonly: 0,
    skippedInvalid: 0,
    totalTargetCells: 0,
  }
  const srcRows = sourceMatrix.length
  const srcCols = sourceMatrix[0]?.length ?? 0
  if (!srcRows || !srcCols || !rowIds.length || !columns.length) {
    return { mutations: [], appliedRange: null, stats: emptyStats }
  }

  const colKeys = columns.map((col) => col.key)
  const locateRow = (cursor: TableCellCursor) =>
    rowKeys && cursor.rowKey ? rowKeys.indexOf(cursor.rowKey) : rowIds.indexOf(cursor.id)
  const r1 = locateRow(selection.anchor)
  const r2 = locateRow(selection.focus)
  const c1 = colKeys.indexOf(selection.anchor.key)
  const c2 = colKeys.indexOf(selection.focus.key)
  if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) {
    return { mutations: [], appliedRange: null, stats: emptyStats }
  }

  const bounds = resolvePasteTargetBounds({
    srcRows,
    srcCols,
    selRStart: Math.min(r1, r2),
    selREnd: Math.max(r1, r2),
    selCStart: Math.min(c1, c2),
    selCEnd: Math.max(c1, c2),
    maxRows: rowIds.length,
    maxCols: columns.length,
  })
  if (!bounds) return { mutations: [], appliedRange: null, stats: emptyStats }

  const mutations: TablePasteMutation[] = []
  const stats: TablePasteStats = { ...emptyStats }

  for (let r = bounds.rStart; r <= bounds.rEnd; r += 1) {
    const rowId = rowIds[r]
    const row = rowId ? findRow(rowId) : undefined
    if (!row) continue
    const srcR = (r - bounds.rStart) % srcRows

    for (let c = bounds.cStart; c <= bounds.cEnd; c += 1) {
      const col = columns[c]
      if (!col) continue
      stats.totalTargetCells += 1

      // 不可编辑列：按位置对齐占位跳过，绝不前移
      if (!isPasteColumnWritable(col, cellFieldWritable)) {
        stats.skippedReadonly += 1
        continue
      }

      const srcC = (c - bounds.cStart) % srcCols
      const srcCell = sourceMatrix[srcR]?.[srcC]
      if (!srcCell) continue

      const coerced = coerceClipboardCell(srcCell, col.field)
      if (!coerced.ok) {
        stats.skippedInvalid += 1
        continue
      }

      const current = readCurrentValue(row, col.key, col.field)
      if (sameValue(current, coerced.value)) {
        stats.unchanged += 1
        continue
      }

      mutations.push({
        row,
        rowIndex: r,
        colIndex: c,
        key: col.key,
        field: col.field,
        value: coerced.value,
      })
      stats.updated += 1
    }
  }

  const makeCursor = (r: number, c: number): TableCellCursor => ({
    id: rowIds[r]!,
    key: colKeys[c]!,
    ...(rowKeys?.[r] ? { rowKey: rowKeys[r] } : {}),
  })

  return {
    mutations,
    appliedRange: {
      anchor: makeCursor(bounds.rStart, bounds.cStart),
      focus: makeCursor(bounds.rEnd, bounds.cEnd),
    },
    stats,
  }
}

export function formatTablePasteNotice(stats: TablePasteStats, verb: '粘贴' | '填充' | '清空' = '粘贴'): string {
  const skippedParts: string[] = []
  if (stats.skippedReadonly > 0) skippedParts.push(`跳过 ${stats.skippedReadonly} 个不可编辑格`)
  if (stats.skippedInvalid > 0) skippedParts.push(`跳过 ${stats.skippedInvalid} 个类型不匹配格`)

  if (stats.updated > 0) {
    return skippedParts.length
      ? `已${verb} ${stats.updated} 个单元格（${skippedParts.join('，')}）`
      : `已${verb} ${stats.updated} 个单元格`
  }

  if (stats.unchanged > 0) {
    return skippedParts.length ? `内容无变化（${skippedParts.join('，')}）` : ''
  }

  if (stats.skippedReadonly > 0 && stats.skippedInvalid === 0) {
    return `未${verb}：目标列不可编辑`
  }
  if (stats.skippedInvalid > 0 && stats.skippedReadonly === 0) {
    return `未${verb}：内容与目标列类型不匹配`
  }
  if (skippedParts.length) {
    return `未${verb}（${skippedParts.join('，')}）`
  }
  return ''
}
