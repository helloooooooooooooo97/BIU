import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { AdjustmentsHorizontalIcon, ChevronLeftIcon, ShareIcon, StarIcon } from '@heroicons/react/16/solid'
import { AnchorMenu } from '@biu/biu-ui/anchor-menu'
import { dismissInspectorPaneMenu } from './inspector-pane-menu.tsx'
import { getPagePrefs, getPageWidthVersion, persistPagePrefs, subscribePageWidth } from './page-width.ts'
import { getStarredViews, getStarredViewsVersion, isViewStarred, persistStarredViews, subscribeStarredViews, toggleStarredView } from './view-storage.ts'

export function PaneConfigMenuItem() {
  useSyncExternalStore(subscribePageWidth, getPageWidthVersion, () => 0)
  const wide = getPagePrefs().wide
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="fsdb-detail-more-item"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        data-testid="fsdb-pane-config"
        onClick={(event) => {
          const btn = event.currentTarget
          setAnchor((prev) => (prev ? null : btn))
        }}
      >
        <AdjustmentsHorizontalIcon aria-hidden />
        配置
        <ChevronLeftIcon aria-hidden className="fsdb-detail-more-caret" />
      </button>
      {anchor ? (
        <AnchorMenu
          anchor={anchor}
          onClose={() => setAnchor(null)}
          className="fsdb-detail-more-menu"
          role="menu"
          minWidth={168}
          placement="left"
          zIndex={210}
          inside={(node) => anchor.contains(node)}
        >
          <button
            type="button"
            role="menuitemradio"
            className="fsdb-detail-more-item"
            aria-checked={wide}
            data-testid="fsdb-pane-width-wide"
            onClick={() => persistPagePrefs({ wide: true })}
          >
            宽屏
          </button>
          <button
            type="button"
            role="menuitemradio"
            className="fsdb-detail-more-item"
            aria-checked={!wide}
            data-testid="fsdb-pane-width-narrow"
            onClick={() => persistPagePrefs({ wide: false })}
          >
            窄屏
          </button>
        </AnchorMenu>
      ) : null}
    </>
  )
}

export function ViewPaneMenu({
  share,
  collectionPath,
  viewId,
}: {
  share?: ReactNode
  collectionPath: string
  viewId?: string | null
}) {
  useSyncExternalStore(subscribeStarredViews, getStarredViewsVersion, () => 0)
  const starred = Boolean(viewId && isViewStarred(getStarredViews(), collectionPath, viewId))
  const [shareItem, setShareItem] = useState<HTMLElement | null>(null)
  return (
    <>
      {share ? (
        <button
          type="button"
          role="menuitem"
          className="fsdb-detail-more-item"
          aria-haspopup="dialog"
          aria-expanded={Boolean(shareItem)}
          data-testid="fsdb-view-share"
          onClick={(event) => {
            const btn = event.currentTarget
            setShareItem((prev) => (prev ? null : btn))
          }}
        >
          <ShareIcon aria-hidden />
          分享
          <ChevronLeftIcon aria-hidden className="fsdb-detail-more-caret" />
        </button>
      ) : null}
      {viewId ? (
        <button
          type="button"
          role="menuitem"
          className="fsdb-detail-more-item"
          aria-pressed={starred}
          data-testid="fsdb-view-star"
          onClick={() => {
            persistStarredViews(toggleStarredView(getStarredViews(), collectionPath, viewId))
            dismissInspectorPaneMenu()
          }}
        >
          <StarIcon aria-hidden className={starred ? 'is-starred' : undefined} />
          {starred ? '取消收藏' : '收藏'}
        </button>
      ) : null}
      <PaneConfigMenuItem />
      {share && shareItem ? (
        <AnchorMenu
          anchor={shareItem}
          onClose={() => setShareItem(null)}
          className="fsdb-detail-more-menu has-share"
          role="dialog"
          minWidth={360}
          placement="left"
          zIndex={210}
          inside={(node) => shareItem.contains(node)}
        >
          {share}
        </AnchorMenu>
      ) : null}
    </>
  )
}
