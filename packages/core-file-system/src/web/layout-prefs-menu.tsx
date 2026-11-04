import type { ComponentType, SVGProps } from 'react'
import { useSyncExternalStore } from 'react'
import {
  ArrowsPointingOutIcon,
  ArrowsUpDownIcon,
  BookmarkIcon,
  ChevronUpDownIcon,
  LanguageIcon,
} from '@heroicons/react/16/solid'
import { getPagePrefs, getPageWidthVersion, persistPagePrefs, subscribePageWidth, type BodyScale, type PagePrefs } from './page-width.ts'

type Icon = ComponentType<SVGProps<SVGSVGElement>>

const BOOLS: { key: keyof Pick<PagePrefs, 'wide' | 'outlinePin' | 'navPin'>; label: string; testId: string; icon: Icon }[] = [
  { key: 'wide', label: '宽屏', testId: 'fsdb-layout-wide', icon: ArrowsPointingOutIcon },
  { key: 'outlinePin', label: '目录常驻', testId: 'fsdb-layout-outline-pin', icon: BookmarkIcon },
  { key: 'navPin', label: '翻页常驻', testId: 'fsdb-layout-nav-pin', icon: ChevronUpDownIcon },
]

const SCALES: { value: BodyScale; label: string }[] = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
]

function ScaleRow({
  icon: Icon,
  label,
  value,
  testPrefix,
  kind,
  onPick,
}: {
  icon: Icon
  label: string
  value: BodyScale
  testPrefix: string
  kind: 'size' | 'gap'
  onPick: (value: BodyScale) => void
}) {
  return (
    <div className="fsdb-layout-scale">
      <span className="fsdb-layout-label">
        <Icon aria-hidden />
        {label}
      </span>
      <div className="fsdb-layout-pills">
        {SCALES.map((item) => (
          <button
            key={item.value}
            type="button"
            role="menuitemradio"
            className={`fsdb-layout-opt${value === item.value ? ' is-active' : ''}`}
            aria-checked={value === item.value}
            data-testid={`${testPrefix}-${kind}-${item.value}`}
            onClick={() => onPick(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function LayoutPrefsMenu({
  prefs,
  testPrefix = 'fsdb-layout',
  className,
  onChange,
}: {
  prefs: PagePrefs
  testPrefix?: string
  className?: string
  onChange?: (patch: Partial<PagePrefs>) => void
}) {
  const apply = onChange ?? persistPagePrefs
  useSyncExternalStore(subscribePageWidth, getPageWidthVersion, () => 0)
  const live = onChange ? prefs : getPagePrefs()
  return (
    <div className={className ? `fsdb-tool-flyout fsdb-layout-menu ${className}` : 'fsdb-tool-flyout fsdb-layout-menu'} role="menu" data-testid={`${testPrefix}-menu`}>
      {BOOLS.map((item) => {
        const on = live[item.key]
        const Icon = item.icon
        return (
          <button
            key={item.key}
            type="button"
            role="menuitemcheckbox"
            className={`fsdb-layout-row fsdb-tool-row${on ? ' is-on' : ''}`}
            aria-checked={on}
            data-testid={item.testId}
            onClick={() => apply({ [item.key]: !on })}
          >
            <span className="fsdb-layout-label">
              <Icon aria-hidden />
              {item.label}
            </span>
          </button>
        )
      })}
      <ScaleRow
        icon={LanguageIcon}
        label="文字"
        value={live.bodySize}
        testPrefix={testPrefix}
        kind="size"
        onPick={(bodySize) => apply({ bodySize })}
      />
      <ScaleRow
        icon={ArrowsUpDownIcon}
        label="间距"
        value={live.bodyGap}
        testPrefix={testPrefix}
        kind="gap"
        onPick={(bodyGap) => apply({ bodyGap })}
      />
    </div>
  )
}
