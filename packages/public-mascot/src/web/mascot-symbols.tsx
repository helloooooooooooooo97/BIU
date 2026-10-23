import { GROK_COLORS, GROK_SHAPES, type SessionMascotIdentity } from './grok-bot-types.ts'
import { mascotFill, mascotShapePath } from './static-mascot-mark.tsx'

const SHEET_ID = 'mascot-symbol-sheet'
/** Fallback outlines live in ~0..229. Keep one viewBox for every stamp. */
const VIEW_BOX = '0 0 229 229'

export function mascotSymbolId(identity: Pick<SessionMascotIdentity, 'shape' | 'color'>) {
  return `mascot-${identity.shape}-${identity.color}`
}

const SYMBOL_MARKUP = GROK_SHAPES.flatMap((shape) =>
  GROK_COLORS.map((color) => {
    const id = mascotSymbolId({ shape, color })
    return `<symbol id="${id}" viewBox="${VIEW_BOX}"><path d="${mascotShapePath(shape)}" fill="${mascotFill(color)}"/></symbol>`
  }),
).join('')

/** Inject the sprite once. Table cells only stamp <use>. */
export function ensureMascotSymbols() {
  if (typeof document === 'undefined') return
  if (document.getElementById(SHEET_ID)) return
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.id = SHEET_ID
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.style.position = 'absolute'
  svg.style.width = '0'
  svg.style.height = '0'
  svg.style.overflow = 'hidden'
  svg.innerHTML = `<defs>${SYMBOL_MARKUP}</defs>`
  document.body.prepend(svg)
}

export function TableMascotMark({
  identity,
  size = 18,
  title,
}: {
  identity: SessionMascotIdentity
  size?: number
  title?: string
}) {
  ensureMascotSymbols()
  return (
    <svg width={size} height={size} viewBox={VIEW_BOX} aria-hidden title={title}>
      <use href={`#${mascotSymbolId(identity)}`} />
    </svg>
  )
}
