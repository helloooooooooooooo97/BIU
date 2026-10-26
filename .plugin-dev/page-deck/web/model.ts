export const DECK_LAYOUTS = ['title', 'split', 'hero', 'trio', 'stack'] as const
export type DeckLayout = (typeof DECK_LAYOUTS)[number]
export const CELL_KINDS = ['heading', 'text', 'list', 'quote', 'stat'] as const
export type CellKind = (typeof CELL_KINDS)[number]

export type DeckCell = {
  id: string
  kind: CellKind
  text: string
}

export type DeckSlide = {
  id: string
  layout: DeckLayout
  cells: DeckCell[]
}

export type DeckData = {
  title: string
  index: number
  slides: DeckSlide[]
}

export const LAYOUT_META: Record<DeckLayout, { label: string; slots: number; hint: string }> = {
  title: { label: '标题', slots: 2, hint: '整页标题 + 一句说明' },
  split: { label: '对开', slots: 2, hint: '左右各一块' },
  hero: { label: '主从', slots: 2, hint: '左侧主文，右侧要点' },
  trio: { label: '三列', slots: 3, hint: '三张并排卡片' },
  stack: { label: '纵叠', slots: 3, hint: '从上到下三段' },
}

export function isDeckLayout(value: unknown): value is DeckLayout {
  return (DECK_LAYOUTS as readonly string[]).includes(String(value))
}

export function isCellKind(value: unknown): value is CellKind {
  return (CELL_KINDS as readonly string[]).includes(String(value))
}

function clip(value: unknown, max = 400) {
  return String(value ?? '').slice(0, max)
}

function uid(prefix: string) {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`
}

export function emptyCell(kind: CellKind = 'text', text = ''): DeckCell {
  return { id: uid('c'), kind, text }
}

export function emptySlide(layout: DeckLayout = 'split'): DeckSlide {
  const slots = LAYOUT_META[layout].slots
  const kinds: CellKind[] = layout === 'title' ? ['heading', 'text'] : layout === 'trio' ? ['stat', 'stat', 'stat'] : ['heading', 'text']
  return {
    id: uid('s'),
    layout,
    cells: Array.from({ length: slots }, (_, i) => emptyCell(kinds[i] ?? 'text')),
  }
}

export function parseDeck(raw: Record<string, unknown> | null | undefined): DeckData {
  const data = raw && typeof raw === 'object' ? raw : {}
  const slides = Array.isArray(data.slides) ? data.slides.map(parseSlide).filter(Boolean) as DeckSlide[] : []
  const list = slides.length ? slides : demoSlides()
  const index = Math.min(list.length - 1, Math.max(0, Number(data.index) || 0))
  const title = clip(data.title, 80) || 'Deck'
  return { title, index, slides: list }
}

function parseSlide(raw: unknown): DeckSlide | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const layout = isDeckLayout(rec.layout) ? rec.layout : 'split'
  const cells = Array.isArray(rec.cells)
    ? rec.cells.map(parseCell).filter((item): item is DeckCell => Boolean(item))
    : []
  return {
    id: clip(rec.id, 24) || uid('s'),
    layout,
    cells: cells.length ? cells : emptySlide(layout).cells,
  }
}

function parseCell(raw: unknown): DeckCell | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  return {
    id: clip(rec.id, 24) || uid('c'),
    kind: isCellKind(rec.kind) ? rec.kind : 'text',
    text: clip(rec.text),
  }
}

export function fitCells(cells: DeckCell[], layout: DeckLayout): DeckCell[] {
  const n = LAYOUT_META[layout].slots
  const next = cells.slice(0, n)
  while (next.length < n) next.push(emptyCell(next.length === 0 ? 'heading' : 'text'))
  return next
}

export function patchSlide(deck: DeckData, slideId: string, patch: Partial<DeckSlide>): DeckData {
  return {
    ...deck,
    slides: deck.slides.map((slide) => {
      if (slide.id !== slideId) return slide
      const layout = patch.layout && isDeckLayout(patch.layout) ? patch.layout : slide.layout
      const cells = fitCells(patch.cells ?? slide.cells, layout)
      return { ...slide, ...patch, layout, cells }
    }),
  }
}

export function stepDeck(index: number, delta: number, length: number) {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.max(0, index + delta))
}

export function demoSlides(): DeckSlide[] {
  return [
    {
      id: 'demo-title',
      layout: 'title',
      cells: [
        { id: 't1', kind: 'heading', text: 'Deck' },
        { id: 't2', kind: 'text', text: '一页里放下多种块，换排版，放大成幻灯片。' },
      ],
    },
    {
      id: 'demo-split',
      layout: 'split',
      cells: [
        { id: 's1', kind: 'heading', text: '对开\n左边讲问题，右边给结论。' },
        { id: 's2', kind: 'list', text: '格子是块，不是整页 HTML\n换 layout 只重排，不重写\n放大后按页编辑' },
      ],
    },
    {
      id: 'demo-hero',
      layout: 'hero',
      cells: [
        { id: 'h1', kind: 'text', text: '主从\n\n左侧吃掉更多宽度，适合一段说明；右侧放数字或要点。' },
        { id: 'h2', kind: 'stat', text: '16:9\n画布' },
      ],
    },
    {
      id: 'demo-trio',
      layout: 'trio',
      cells: [
        { id: 'a1', kind: 'stat', text: '3\n列卡片' },
        { id: 'a2', kind: 'stat', text: '5\n种排版' },
        { id: 'a3', kind: 'stat', text: '1\n次放大' },
      ],
    },
    {
      id: 'demo-stack',
      layout: 'stack',
      cells: [
        { id: 'k1', kind: 'heading', text: '纵叠' },
        { id: 'k2', kind: 'quote', text: '先把块丢进格子，再决定这一页怎么站。' },
        { id: 'k3', kind: 'text', text: '标题、列表、引语、数字都可以挤在同一张幻灯片里。' },
      ],
    },
  ]
}
