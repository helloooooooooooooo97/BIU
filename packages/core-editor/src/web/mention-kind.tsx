import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  DocumentIcon,
  RectangleStackIcon,
} from '@heroicons/react/16/solid'

export type MentionKind = 'page' | 'task' | 'facet' | 'session'

const PAGE_PATH = 'M2.5 3.5A1.5 1.5 0 0 1 4 2h4.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5v-9Z'
const TASK_PATH = 'M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z'
const FACET_PATH = 'M5 3.5A1.5 1.5 0 0 1 6.5 2h3A1.5 1.5 0 0 1 11 3.5H5ZM4.5 5A1.5 1.5 0 0 0 3 6.5v.041a3.02 3.02 0 0 1 .5-.041h9c.17 0 .337.014.5.041V6.5A1.5 1.5 0 0 0 11.5 5h-7ZM12.5 8h-9A1.5 1.5 0 0 0 2 9.5v3A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-3A1.5 1.5 0 0 0 12.5 8Z'
const SESSION_PATHS = [
  'M1 8.849c0 1 .738 1.851 1.734 1.947L3 10.82v2.429a.75.75 0 0 0 1.28.53l1.82-1.82A3.484 3.484 0 0 1 5.5 10V9A3.5 3.5 0 0 1 9 5.5h4V4.151c0-1-.739-1.851-1.734-1.947a44.539 44.539 0 0 0-8.532 0C1.738 2.3 1 3.151 1 4.151V8.85Z',
  'M7 9a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-.25v1.25a.75.75 0 0 1-1.28.53L9.69 12H9a2 2 0 0 1-2-2V9Z',
]

export function mentionKindIcon(kind: MentionKind) {
  if (kind === 'task') return CheckCircleIcon
  if (kind === 'facet') return RectangleStackIcon
  if (kind === 'session') return ChatBubbleLeftRightIcon
  return DocumentIcon
}

export function MentionKindGlyph({ kind }: { kind: MentionKind }) {
  const Icon = mentionKindIcon(kind)
  return <Icon className="mention-kind-icon" aria-hidden data-mention-kind={kind} />
}

function pathNode(d: string, evenodd = false) {
  return evenodd
    ? (['path', { d, 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' }] as const)
    : (['path', { d }] as const)
}

export function mentionIconSpec(kind: MentionKind) {
  const attrs = {
    class: 'mention-icon',
    viewBox: '0 0 16 16',
    fill: 'currentColor',
    width: '12',
    height: '12',
    'aria-hidden': 'true',
    'data-mention-kind': kind,
  }
  if (kind === 'task') return ['svg', attrs, pathNode(TASK_PATH, true)] as const
  if (kind === 'facet') return ['svg', attrs, pathNode(FACET_PATH)] as const
  if (kind === 'session') return ['svg', attrs, pathNode(SESSION_PATHS[0]!), pathNode(SESSION_PATHS[1]!)] as const
  return ['svg', attrs, pathNode(PAGE_PATH)] as const
}
