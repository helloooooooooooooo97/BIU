import { CodeBracketIcon } from '@heroicons/react/16/solid'
import type { DbRecord } from '@biu/type-file-system'
import { togglePageSourceMode, usePageSourceMode } from './source-mode.ts'

export function SourceToggle({ record }: { record: DbRecord }) {
  const source = usePageSourceMode(record.id)
  const label = source ? '正文' : '源码'
  return (
    <button
      type="button"
      className={`tasks-icon-btn${source ? ' is-on' : ''}`}
      title={label}
      data-dock-tip={label}
      data-testid="page-source-toggle"
      aria-pressed={source}
      aria-label={source ? '切换到正文' : '切换到源码'}
      onClick={() => togglePageSourceMode(record.id)}
    >
      <CodeBracketIcon aria-hidden className="size-4" />
    </button>
  )
}
