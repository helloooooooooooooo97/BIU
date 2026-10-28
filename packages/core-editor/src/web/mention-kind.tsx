import { PickKindGlyph } from '@biu/core-pick/web'

export type MentionKind = 'page' | 'task' | 'facet' | 'session'

const PAGE_PATH = 'M2.5 3.5A1.5 1.5 0 0 1 4 2h4.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5v-9Z'
const TASK_PATH = 'M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z'
const FACET_PATH = 'M4.5 2A2.5 2.5 0 0 0 2 4.5v2.879a2.5 2.5 0 0 0 .732 1.767l4.5 4.5a2.5 2.5 0 0 0 3.536 0l2.878-2.878a2.5 2.5 0 0 0 0-3.536l-4.5-4.5A2.5 2.5 0 0 0 7.38 2H4.5ZM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z'
const SESSION_PATH = 'M7.25 1.75a.75.75 0 0 1 1.5 0v1.5a.75.75 0 0 1-1.5 0v-1.5ZM11.536 2.904a.75.75 0 1 1 1.06 1.06l-1.06 1.061a.75.75 0 0 1-1.061-1.06l1.06-1.061ZM14.5 7.5a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 .75-.75ZM4.464 9.975a.75.75 0 0 1 1.061 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.061ZM4.5 7.5a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 .75-.75ZM5.525 3.964a.75.75 0 0 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 1.06-1.061l1.061 1.06ZM8.779 7.438a.75.75 0 0 0-1.368.366l-.396 5.283a.75.75 0 0 0 1.212.646l.602-.474.288 1.074a.75.75 0 1 0 1.449-.388l-.288-1.075.759.11a.75.75 0 0 0 .726-1.165L8.78 7.438Z'

export function MentionKindGlyph({ kind }: { kind: MentionKind }) {
  return <PickKindGlyph kind={kind} />
}

function pathNode(d: string, evenodd = false) {
  return evenodd
    ? (['path', { d, 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' }] as const)
    : (['path', { d }] as const)
}

export function mentionIconSpec(kind: MentionKind) {
  const attrs = {
    class: 'pick-kind-icon mention-icon',
    viewBox: '0 0 16 16',
    fill: 'currentColor',
    width: '12',
    height: '12',
    'aria-hidden': 'true',
    'data-mention-kind': kind,
  }
  if (kind === 'task') return ['svg', attrs, pathNode(TASK_PATH, true)] as const
  if (kind === 'facet') return ['svg', attrs, pathNode(FACET_PATH)] as const
  if (kind === 'session') return ['svg', attrs, pathNode(SESSION_PATH)] as const
  return ['svg', attrs, pathNode(PAGE_PATH)] as const
}
