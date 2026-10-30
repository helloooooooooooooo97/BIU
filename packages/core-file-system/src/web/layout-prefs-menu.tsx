import { useSyncExternalStore } from 'react'
import { getPagePrefs, getPageWidthVersion, persistPagePrefs, subscribePageWidth, type BodyScale, type PagePrefs } from './page-width.ts'

const BOOLS: { key: keyof Pick<PagePrefs, 'wide' | 'outlineExpand' | 'outlinePin' | 'navPin'>; label: string; testId: string }[] = [
  { key: 'wide', label: '宽屏', testId: 'fsdb-layout-wide' },
  { key: 'outlineExpand', label: '展开悬浮', testId: 'fsdb-layout-outline-expand' },
  { key: 'outlinePin', label: '悬浮目录常驻', testId: 'fsdb-layout-outline-pin' },
  { key: 'navPin', label: '翻页常驻', testId: 'fsdb-layout-nav-pin' },
]

const SCALES: { value: BodyScale; label: string }[] = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
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
            <span>{item.label}</span>
          </button>
        )
      })}
      <div className="fsdb-layout-scale">
        <span>文字</span>
        <div className="fsdb-layout-pills">
          {SCALES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="menuitemradio"
              className={`fsdb-layout-opt${live.bodySize === item.value ? ' is-active' : ''}`}
              aria-checked={live.bodySize === item.value}
              data-testid={`${testPrefix}-size-${item.value}`}
              onClick={() => apply({ bodySize: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="fsdb-layout-scale">
        <span>间距</span>
        <div className="fsdb-layout-pills">
          {SCALES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="menuitemradio"
              className={`fsdb-layout-opt${live.bodyGap === item.value ? ' is-active' : ''}`}
              aria-checked={live.bodyGap === item.value}
              data-testid={`${testPrefix}-gap-${item.value}`}
              onClick={() => apply({ bodyGap: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
