import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingPosition } from '@biu/biu-ui/floating-position'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import {
  OVERLAY_Z,
  claimOverlayOpen,
  overlayPortalRoot,
  overlayZ,
  releaseOverlayOpen,
} from '@biu/biu-ui/overlay-portal'
import {
  VIEWS_COLLECTION_PATH,
  isIndexCollection,
  isPersonalOnlyCollection,
  isSystemCollection,
  normalizeCollectionPath,
} from '../paths.ts'
import { roleActionLabel } from '../shared/authz-labels.ts'
import { SHARE_POPOVER_OVERLAY_GROUP, SharePanel } from './share-popover.tsx'
import { AccessMark, accessText, accessTone, ScopeMark, scopeText, scopeTone } from './share-scope-label.tsx'

export function roleLabel(role: string) {
  return roleActionLabel(role)
}

function isNonShareableRecord(collection: string, builtin: boolean) {
  if (builtin) return true
  const normalized = normalizeCollectionPath(collection)
  if (isIndexCollection(normalized) || isPersonalOnlyCollection(normalized)) return true
  return isSystemCollection(normalized) && normalized !== VIEWS_COLLECTION_PATH
}

function RecordSharePopoverTrigger({
  collection,
  recordId,
  title,
  builtin,
  localOnly,
  defaultTab,
  className,
  testId,
  ariaLabel,
  children,
}: {
  collection: string
  recordId: string
  title: string
  builtin: boolean
  localOnly: boolean | null
  defaultTab: 'public' | 'collaboration'
  className: string
  testId: string
  ariaLabel: string
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const overlayIdRef = useRef(Symbol('fsdb-share-popover'))
  const [open, setOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const panelPos = useFloatingPosition(anchorEl, panelRef, {
    placement: 'bottom-end',
    offset: 6,
    padding: 8,
    fallbackWidth: 380,
    fallbackHeight: 360,
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    const overlayId = overlayIdRef.current
    claimOverlayOpen(
      {
        id: overlayId,
        group: SHARE_POPOVER_OVERLAY_GROUP,
        close: () => setOpen(false),
        contentEl: () => panelRef.current,
      },
      anchorEl,
    )
    return () => releaseOverlayOpen(overlayId)
  }, [open, anchorEl])

  if (isNonShareableRecord(collection, builtin)) {
    return (
      <span className={className} data-testid={testId}>
        {children}
      </span>
    )
  }

  return (
    <div className="fsdb-scope-detail" ref={wrapRef}>
      <button
        type="button"
        className={className}
        data-testid={testId}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          setAnchorEl(event.currentTarget)
          setOpen((prev) => !prev)
        }}
      >
        {children}
      </button>
      {open ? createPortal(
        <HeadlessDismiss
          onDismiss={() => setOpen(false)}
          inside={(node) => Boolean(wrapRef.current?.contains(node) || panelRef.current?.contains(node))}
        >
          <div
            ref={panelRef}
            className="fsdb-share-floating"
            style={{
              position: 'fixed',
              top: panelPos.top,
              left: panelPos.left,
              maxHeight: panelPos.maxHeight,
              zIndex: overlayZ(OVERLAY_Z.popover, anchorEl),
            }}
          >
            <SharePanel
              target={{
                kind: 'record',
                collection,
                recordId,
                title,
              }}
              localOnly={Boolean(localOnly)}
              embedded
              defaultTab={defaultTab}
            />
          </div>
        </HeadlessDismiss>,
        overlayPortalRoot(anchorEl) ?? document.body,
      ) : null}
    </div>
  )
}

/** 分享范围胶囊。点击统一打开右上角同款分享与权限管理弹窗。 */
export function ShareScopeDetail({
  collection,
  recordId,
  label,
  title = '',
  tableLabel = '',
  builtin = false,
  localOnly = false,
}: {
  collection: string
  recordId: string
  label: string
  title?: string
  tableLabel?: string
  builtin?: boolean
  localOnly?: boolean | null
}) {
  const chip = scopeTone(label)
  return (
    <RecordSharePopoverTrigger
      collection={collection}
      recordId={recordId}
      title={title || tableLabel}
      builtin={builtin}
      localOnly={localOnly}
      defaultTab={localOnly ? 'public' : 'collaboration'}
      className={`fsdb-scope-tag is-${chip}`}
      testId="fsdb-scope-tag"
      ariaLabel={`${label || scopeText(chip)}的分享与权限设置`}
    >
      <ScopeMark scope={chip} />
    </RecordSharePopoverTrigger>
  )
}

/** 我的权限胶囊。点击统一打开右上角同款分享与权限管理弹窗。 */
export function ShareRoleDetail({
  collection,
  recordId,
  label,
  title = '',
  tableLabel = '',
  builtin = false,
  localOnly = false,
}: {
  collection: string
  recordId: string
  label: string
  title?: string
  tableLabel?: string
  builtin?: boolean
  localOnly?: boolean | null
}) {
  const shown = accessText(label)
  return (
    <RecordSharePopoverTrigger
      collection={collection}
      recordId={recordId}
      title={title || tableLabel}
      builtin={builtin}
      localOnly={localOnly}
      defaultTab={localOnly ? 'public' : 'collaboration'}
      className={`fsdb-scope-tag is-${accessTone(shown)}`}
      testId="fsdb-role-tag"
      ariaLabel={`${shown}的分享与权限设置`}
    >
      <AccessMark role={shown} />
    </RecordSharePopoverTrigger>
  )
}
