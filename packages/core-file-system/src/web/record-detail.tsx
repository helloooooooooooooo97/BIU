import { useEffect, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import type { CollectionChrome, FsDetailPane } from '@biu/type-file-system/ui'
import type { CollectionSchema, DbRecord, FieldSpec } from '@biu/type-file-system'
import { ChevronDownIcon, ChevronLeftIcon, ChevronUpIcon, HashtagIcon, ShareIcon } from '@heroicons/react/16/solid'
import { AnchorMenu, RecordEmojiBoard } from '@biu/biu-ui'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { contentFieldKey, fieldHasValue, formatField, resolveFieldType } from './fields.ts'
import { LocalText } from './controls.tsx'
import { FieldGlyph, FilePreview } from './fsdb-cells.tsx'
import { PropertyRow } from './property-row.tsx'
import { TagPackEditor } from './schema-field.tsx'
import { idleTableIconKind } from './nav-glyphs.tsx'
import { TAGS_COLLECTION_PATH } from './database-path.ts'
import { normalizeRecordEmoji, recordPreviewEmoji } from './sidebar-preview.ts'
import { FOCUS_RECORD_CONTENT, FOCUS_RECORD_TITLE, shouldLeaveContentForTitle, shouldLeaveTitleForContent, focusRecordTitleNear } from './title-content-nav.ts'
import { HeadingOutline } from './heading-outline.tsx'
import { PageBanner } from './page-banner.tsx'
import { fieldPickAttrs, recordSourcePath } from './pick-dom.ts'
import { dismissInspectorPaneMenu } from './inspector-pane-menu.tsx'
import { PaneConfigMenuItem } from './pane-more-menu.tsx'
import { PageContentFailed, PageContentLoading } from './page-content-status.tsx'

export { PageContentFailed, PageContentLoading } from './page-content-status.tsx'

function renderDetailPanes(
  panes: FsDetailPane[] | undefined,
  record: DbRecord,
  openRecord: ((recordId: string, collection?: string) => void) | undefined,
  className: string,
) {
  if (!panes?.length) return null
  return (
    <div className={className}>
      {panes.map((pane) => {
        const Pane = pane.Pane
        const count = pane.badge?.(record)
        return (
          <section key={pane.id} className="fsdb-detail-extra" data-testid={`fsdb-pane-${pane.id}`}>
            <h3 className="fsdb-detail-extra-title">
              {pane.label}
              {count ? <span className="fsdb-detail-extra-count">{count}</span> : null}
            </h3>
            <Pane record={record} openRecord={openRecord} />
          </section>
        )
      })}
    </div>
  )
}

function DetailTitleIcon({
  emoji,
  tableIcon,
  label,
  record,
  Icon,
  onChange,
  locked,
}: {
  emoji: string
  tableIcon?: string
  label: string
  record: DbRecord
  Icon?: CollectionChrome['Icon']
  onChange: (next: string) => void
  locked?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  if (locked) {
    return (
      <span className="fsdb-detail-title-icon-wrap">
        <span className="fsdb-detail-title-icon">
          {emoji ? (
            <span className="fsdb-record-emoji">{emoji}</span>
          ) : Icon ? (
            <span className="fsdb-record-mark is-lg">
              <Icon record={record} size={78} />
            </span>
          ) : (
            <span className="fsdb-record-mark is-lg" data-icon={idleTableIconKind(tableIcon)} />
          )}
        </span>
      </span>
    )
  }
  return (
    <span className="fsdb-detail-title-icon-wrap">
      <button
        type="button"
        className="fsdb-detail-title-icon"
        title={emoji ? '更换图标' : '设置图标'}
        aria-label={emoji ? `更换 ${label} 的图标` : `设置 ${label} 的图标`}
        onClick={(event) => {
          const btn = event.currentTarget
          setOpen((prev) => {
            if (prev) {
              setAnchor(null)
              return false
            }
            setAnchor(btn)
            return true
          })
        }}
      >
        {emoji ? (
          <span className="fsdb-record-emoji">{emoji}</span>
        ) : Icon ? (
          <span className="fsdb-record-mark is-lg">
            <Icon record={record} size={78} />
          </span>
        ) : (
          <span className="fsdb-record-mark is-lg" data-icon={idleTableIconKind(tableIcon)} />
        )}
      </button>
      {open && anchor ? (
        <RecordEmojiBoard
          anchor={anchor}
          onPick={(next) => {
            onChange(normalizeRecordEmoji(next))
            setOpen(false)
            setAnchor(null)
          }}
          onClear={() => {
            onChange('')
            setOpen(false)
            setAnchor(null)
          }}
          onClose={() => {
            setOpen(false)
            setAnchor(null)
          }}
        />
      ) : null}
    </span>
  )
}

function RecordPaneMenu({
  record,
  Tools,
  onDelete,
  deleteLabel,
  share,
  shareLabel,
}: {
  record: DbRecord
  Tools?: CollectionChrome['DetailTools']
  onDelete?: () => void
  deleteLabel: string
  share?: ReactNode
  shareLabel?: string
}) {
  const [shareItem, setShareItem] = useState<HTMLElement | null>(null)
  const close = () => {
    setShareItem(null)
    dismissInspectorPaneMenu()
  }
  return (
    <>
      {onDelete ? (
        <button
          type="button"
          role="menuitem"
          className="fsdb-detail-more-item is-danger"
          data-testid="fsdb-detail-delete"
          onClick={() => {
            close()
            onDelete()
          }}
        >
          <TrashGlyph aria-hidden className="size-4" />
          {deleteLabel}
        </button>
      ) : null}
      {share ? (
        <button
          type="button"
          role="menuitem"
          className="fsdb-detail-more-item"
          aria-haspopup="dialog"
          aria-expanded={Boolean(shareItem)}
          data-testid="fsdb-detail-share"
          onClick={(event) => {
            const btn = event.currentTarget
            setShareItem((prev) => (prev ? null : btn))
          }}
        >
          <ShareIcon aria-hidden />
          {shareLabel || '分享'}
          <ChevronLeftIcon aria-hidden className="fsdb-detail-more-caret" />
        </button>
      ) : null}
      {Tools ? <Tools record={record} onDone={close} /> : null}
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
          inside={(node) => Boolean(shareItem.contains(node))}
        >
          {share}
        </AnchorMenu>
      ) : null}
    </>
  )
}

export function RecordDetail({
  selected,
  schema,
  chrome,
  draft,
  detailBody,
  detailBodyStatus = 'ready',
  detailBodyError,
  onRetryBody,
  labelOf,
  renderCell,
  setDraft,
  writeOne,
  writePatch,
  tableIcon,
  onOpenRecord,
  onPrev,
  onNext,
  canPrev,
  canNext,
  headingOutline = true,
  actionProperty,
  share,
  collectionPath,
  recordKind = 'record',
  onDelete,
  readOnly = false,
  inspectorPaneId,
  visibleColumns,
  onVisibleColumns,
}: {
  selected: DbRecord
  schema: CollectionSchema
  chrome?: CollectionChrome
  draft: Record<string, string>
  detailBody: unknown
  detailBodyStatus?: 'loading' | 'ready' | 'failed'
  detailBodyError?: string
  onRetryBody?: () => void
  labelOf: (row: DbRecord) => string
  renderCell: (row: DbRecord, key: string, field: FieldSpec) => ReactNode
  setDraft: Dispatch<SetStateAction<Record<string, string>>>
  writeOne: (row: DbRecord, key: string, field: FieldSpec, raw: string) => Promise<unknown> | void
  writePatch: (row: DbRecord, patch: Record<string, unknown>) => Promise<unknown> | void
  tableIcon?: string
  onOpenRecord?: (recordId: string, collection?: string) => void
  onPrev?: () => void
  onNext?: () => void
  canPrev?: boolean
  canNext?: boolean
  headingOutline?: boolean
  actionProperty?: ReactNode
  share?: ReactNode
  collectionPath?: string
  recordKind?: string
  onDelete?: () => void
  readOnly?: boolean
  inspectorPaneId?: string
  visibleColumns?: string[]
  onVisibleColumns?: (keys: string[]) => void
}) {
  const title = labelOf(selected)
  const recordPath = recordSourcePath(collectionPath, selected.id)
  const propPick = (key: string, field?: FieldSpec, text?: string) =>
    fieldPickAttrs(recordKind, selected.id, key, {
      label: field?.label ?? key,
      title,
      path: recordPath,
      text,
    })
  const mainRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onTitle = () => {
      const go = () => focusRecordTitleNear(mainRef.current)
      go()
      requestAnimationFrame(go)
    }
    window.addEventListener(FOCUS_RECORD_TITLE, onTitle)
    return () => window.removeEventListener(FOCUS_RECORD_TITLE, onTitle)
  }, [])

  const paneMenu = (
    <RecordPaneMenu
      record={selected}
      Tools={readOnly ? undefined : chrome?.DetailTools}
      onDelete={!readOnly && onDelete ? onDelete : undefined}
      deleteLabel={collectionPath === '/pages' ? '删除页面' : '删除记录'}
      share={share}
      shareLabel={collectionPath === '/pages' ? '分享页面' : '分享记录'}
    />
  )

  const [tagOpen, setTagOpen] = useState(false)
  const [visiblePropertyKeys, setVisiblePropertyKeys] = useState<string[] | null>(null)
  const [outlineOn, setOutlineOn] = useState(headingOutline)
  const visibleColumnsKey = visibleColumns?.join('\0') ?? ''
  useEffect(() => {
    setTagOpen(false)
    setVisiblePropertyKeys(visibleColumnsKey ? visibleColumnsKey.split('\0') : null)
    setOutlineOn(headingOutline)
  }, [selected.id, headingOutline, visibleColumnsKey])
  useEffect(() => {
    const onOutline = () => setOutlineOn((prev) => !prev)
    window.addEventListener('biu:page-outline', onOutline)
    return () => window.removeEventListener('biu:page-outline', onOutline)
  }, [])

  const propertyEntries = Object.entries(schema.fields)
    .filter(([key, field]) => {
      if (key === 'id' || key === 'emoji' || key === schema.labelField) return false
      if (key === contentFieldKey(schema) && resolveFieldType(field) === 'file') return false
      if (chrome?.panes?.some((pane) => pane.id === key)) return false
      if (key === 'fields' && collectionPath === TAGS_COLLECTION_PATH && String(selected.id).includes('::')) return false
      const kind = resolveFieldType(field)
      if (kind === 'tag' && !field.writable) return false
      if (field.computed && !fieldHasValue(field, selected[key])) return false
      if (visiblePropertyKeys && !visiblePropertyKeys.includes(key)) return false
      return true
    })
    .sort(([keyA, a], [keyB, b]) => {
      const fold = (key: string, field: FieldSpec) =>
        resolveFieldType(field) === 'tag' || (key === 'fields' && collectionPath === TAGS_COLLECTION_PATH)
      return Number(fold(keyA, a)) - Number(fold(keyB, b))
    })

  return (
<div className="fsdb-detail-stage">
          <div className="fsdb-detail-screen" role="main" aria-label="记录详情">
            <div className="fsdb-detail-split">
              <div className="fsdb-detail-main" ref={mainRef} data-testid="fsdb-detail-main">
                <PageBanner
                  value={selected.banner}
                  writable={!readOnly}
                  path={collectionPath ? `${collectionPath}/${selected.id}` : undefined}
                  title={labelOf(selected)}
                  onChange={(next) => {
                    void Promise.resolve(writePatch(selected, { banner: next })).then(() => {
                      window.dispatchEvent(new Event('fsdb:change'))
                    })
                  }}
                />
                <div className="fsdb-detail-icon-slot">
                <DetailTitleIcon
                  emoji={recordPreviewEmoji(selected)}
                  tableIcon={tableIcon}
                  label={labelOf(selected)}
                  record={selected}
                  Icon={chrome?.Icon}
                  onChange={(next) => {
                    void Promise.resolve(writePatch(selected, { emoji: next })).then(() => {
                      window.dispatchEvent(new Event('fsdb:change'))
                    })
                  }}
                  locked={readOnly}
                />
                </div>
                <div className="fsdb-detail-title-row">
                <div
                  className="fsdb-detail-title-block"
                  {...(schema.labelField
                    ? propPick(schema.labelField, schema.fields[schema.labelField], title)
                    : {})}
                >
                {schema.labelField && schema.fields[schema.labelField]?.writable && !readOnly ? (
                  <h1 className="fsdb-detail-title">
                    <LocalText
                      as="textarea"
                      className="fsdb-detail-title-input"
                      value={draft[schema.labelField] ?? ''}
                      autoSize
                      onKeyDown={(event) => {
                        const el = event.currentTarget
                        if (!(el instanceof HTMLTextAreaElement)) return
                        if (event.nativeEvent.isComposing) return
                        if (!shouldLeaveTitleForContent(event.key, event.shiftKey, el.value, el.selectionEnd)) return
                        event.preventDefault()
                        window.dispatchEvent(new Event(FOCUS_RECORD_CONTENT))
                      }}
                      onCommit={(raw) => {
                        const next = raw.trim()
                        setDraft((prev) => ({ ...prev, [schema.labelField!]: next }))
                        if (next && next !== String(selected[schema.labelField!] ?? '')) {
                          void writeOne(selected, schema.labelField!, schema.fields[schema.labelField!]!, next)
                        }
                      }}
                    />
                  </h1>
                ) : (
                  <h1 className="fsdb-detail-title">{labelOf(selected)}</h1>
                )}
                </div>
                </div>
                {chrome?.DetailBar ? (
                  <chrome.DetailBar
                    record={selected}
                    schema={schema}
                    collectionPath={collectionPath}
                    visiblePropertyKeys={visiblePropertyKeys ?? undefined}
                    onVisiblePropertyKeys={(next) => {
                      setVisiblePropertyKeys(next)
                      onVisibleColumns?.(next)
                    }}
                    onRetry={onRetryBody}
                    configMenu={paneMenu}
                  />
                ) : null}
                <div className="fsdb-detail-aside">
                  <table className="tasks-table is-wrap">
                    <thead>
                      <tr>
                        <th>
                          <span className="tasks-th">
                            <span className="tasks-th-ico">
                              <FieldGlyph kind="string" />
                            </span>
                            属性名
                          </span>
                        </th>
                        <th>
                          <span className="tasks-th">
                            <span className="tasks-th-ico">
                              <FieldGlyph kind="string" />
                            </span>
                            属性值
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                  {!visiblePropertyKeys || visiblePropertyKeys.includes('id') ? (
                  <tr className="fsdb-prop" {...propPick('id', { type: 'string', label: 'ID' }, selected.id)}>
                    <td>
                    <span className="fsdb-proprow-k">
                      <HashtagIcon aria-hidden className="size-[14px]" />
                      ID
                    </span>
                    </td>
                    <td>
                    <span className="fsdb-detail-id" title={selected.id}>
                      {selected.id}
                    </span>
                    </td>
                  </tr>
                  ) : null}
                  {propertyEntries.map(([key, field]) => {
                    const kind = resolveFieldType(field)
                    const facet = kind === 'tag'
                    const packFields = key === 'fields' && collectionPath === TAGS_COLLECTION_PATH
                    const fold = facet || packFields
                    return (
                      <PropertyRow
                        key={key}
                        table
                        field={field}
                        fieldKey={key}
                        collapsible={fold}
                        expanded={fold ? tagOpen : undefined}
                        onToggle={fold ? () => setTagOpen((open) => !open) : undefined}
                        pick={propPick(key, field, packFields ? undefined : formatField(field, selected[key]))}
                      >
                        <div className={fold ? 'fsdb-prop-val is-schema' : 'fsdb-prop-val'} title={packFields ? undefined : formatField(field, selected[key])}>
                          {packFields ? (
                            <TagPackEditor tagId={selected.id} />
                          ) : (
                            renderCell(selected, key, field)
                          )}
                        </div>
                      </PropertyRow>
                    )
                  })}
                  {actionProperty ? (
                    <PropertyRow table field={{ type: 'action', label: '动作' }} fieldKey="actions">
                      <div className="fsdb-prop-val is-actions">{actionProperty}</div>
                    </PropertyRow>
                  ) : null}
                    </tbody>
                  </table>
                </div>
                {renderDetailPanes(chrome?.panes?.filter((pane) => pane.place === 'properties'), selected, onOpenRecord, 'fsdb-detail-prop-panes')}
                {contentFieldKey(schema) && schema.fields[contentFieldKey(schema)!] ? (() => {
                  const key = contentFieldKey(schema)!
                  const spec = schema.fields[key]!
                  const ContentView = chrome?.Content
                  if (ContentView) {
                    return (
                      <div className="fsdb-fileview">
                        <ContentView
                          record={selected}
                          field={key}
                          spec={spec}
                          value={detailBody}
                          writable={Boolean(spec.writable) && !readOnly && detailBodyStatus === 'ready'}
                          path={collectionPath ? `${collectionPath}/${selected.id}` : undefined}
                          status={detailBodyStatus}
                          onRetry={onRetryBody}
                          onChange={(next) => void writePatch(selected, { [key]: next })}
                        />
                      </div>
                    )
                  }
                  if (detailBodyStatus === 'loading') return <PageContentLoading />
                  if (detailBodyStatus === 'failed') {
                    return <PageContentFailed error={detailBodyError} onRetry={onRetryBody} />
                  }
                  if (spec.writable) {
                    const saved =
                      typeof detailBody === 'string' || detailBody == null
                        ? String(detailBody ?? '')
                        : JSON.stringify(detailBody, null, 2)
                    return (
                      <LocalText
                        as="textarea"
                        className="fsdb-detail-doc"
                        value={draft[key] ?? saved}
                        rows={12}
                        placeholder=""
                        onKeyDown={(event) => {
                          const el = event.currentTarget
                          if (!(el instanceof HTMLTextAreaElement)) return
                          if (
                            !shouldLeaveContentForTitle(
                              event.key,
                              {
                                shiftKey: event.shiftKey,
                                altKey: event.altKey,
                                metaKey: event.metaKey,
                                ctrlKey: event.ctrlKey,
                                isComposing: event.nativeEvent.isComposing,
                              },
                              el.selectionStart ?? 0,
                              el.selectionStart === el.selectionEnd,
                              0,
                            )
                          )
                            return
                          event.preventDefault()
                          if (!focusRecordTitleNear(el)) {
                            window.dispatchEvent(new Event(FOCUS_RECORD_TITLE))
                          }
                        }}
                        onCommit={(next) => {
                          setDraft((prev) => ({ ...prev, [key]: next }))
                          if (next !== saved) void writeOne(selected, key, spec, next)
                        }}
                      />
                    )
                  }
                  return (
                    <div className="fsdb-fileview">
                      <FilePreview value={detailBody} />
                    </div>
                  )
                })() : null}
                {renderDetailPanes(chrome?.panes?.filter((pane) => pane.place !== 'properties'), selected, onOpenRecord, 'fsdb-detail-extras')}
                {chrome?.Board ? <chrome.Board record={selected} openRecord={onOpenRecord} /> : null}
              </div>
            </div>
          </div>
          <HeadingOutline enabled={outlineOn} />
          {onPrev || onNext ? (
            <nav className="fsdb-detail-float-nav" aria-label="按视图顺序切换记录">
              <button
                type="button"
                className="fsdb-detail-float-btn"
                title="上一条"
                aria-label="上一条"
                disabled={!canPrev}
                onClick={onPrev}
              >
                <ChevronUpIcon aria-hidden />
              </button>
              <button
                type="button"
                className="fsdb-detail-float-btn"
                title="下一条"
                aria-label="下一条"
                disabled={!canNext}
                onClick={onNext}
              >
                <ChevronDownIcon aria-hidden />
              </button>
            </nav>
          ) : null}
        </div>
  )
}
