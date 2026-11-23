import type { ComponentType, SVGProps } from 'react'
import { useSyncExternalStore } from 'react'
import {
  ArrowsRightLeftIcon,
  BookmarkIcon,
  BookOpenIcon,
} from '@heroicons/react/16/solid'
import { getPagePrefs, getPageWidthVersion, persistPagePrefs, subscribePageWidth, type PagePrefs } from './page-width.ts'

type Icon = ComponentType<SVGProps<SVGSVGElement>>

const BOOLS: { key: keyof Pick<PagePrefs, 'wide' | 'outlinePin' | 'navPin'>; label: string; testId: string; icon: Icon }[] = [
  { key: 'wide', label: '宽屏', testId: 'fsdb-layout-wide', icon: ArrowsRightLeftIcon },
  { key: 'outlinePin', label: '目录常驻', testId: 'fsdb-layout-outline-pin', icon: BookmarkIcon },
  { key: 'navPin', label: '翻页常驻', testId: 'fsdb-layout-nav-pin', icon: BookOpenIcon },
]

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
            <span className={`fsdb-group-switch${on ? ' is-on' : ''}`} aria-hidden>
              <span className="fsdb-group-switch-thumb" />
            </span>
          </button>
        )
      })}
    </div>
  )
}
