import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowsUpDownIcon,
  CheckIcon,
  ChevronRightIcon,
  EyeSlashIcon,
  FunnelIcon,
  InformationCircleIcon,
  Squares2X2Icon,
} from '@heroicons/react/16/solid'
import { computeFloatingPosition } from '@biu/biu-ui/floating-position'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import type { CollectionSchemaPack, FieldSpec, FieldType } from '@biu/type-file-system'
import {
  summaryOpLabel,
  summaryOpsForKind,
  type ColumnSummaryOp,
} from './column-summary.ts'
import { parseTagFlatColumnKey, tagColumnHeadLabel } from './fields.ts'
import { FieldGlyph } from './fsdb-cells.tsx'
import { persistTags, tagFieldLabelOk } from './tag-catalog.ts'

export type ColumnHeaderMenuTarget = {
  col: {
    key: string
    field: FieldSpec
    kind: FieldType
    packId?: string
    packLabel?: string
  }
  rect: DOMRect
  mode: 'header' | 'summary'
}

export type ColumnHeaderMenuProps = {
  target: ColumnHeaderMenuTarget
  tagCatalog: CollectionSchemaPack[]
  isTitle: boolean
  canHide: boolean
  canSort: boolean
  canFilter: boolean
  canGroup: boolean
  activeSortDir: 'asc' | 'desc' | null
  activeGrouped: boolean
  freezeTitle: boolean
  summaryOp: ColumnSummaryOp
  onClose: () => void
  onFilter: (colKey: string) => void
  onSort: (colKey: string, dir: 'asc' | 'desc' | null) => void
  onGroup: (colKey: string) => void
  onSummary: (colKey: string, op: ColumnSummaryOp) => void
  onToggleFreeze: () => void
  onHide: (colKey: string) => void
}

export function ColumnHeaderMenu({
  target,
  tagCatalog,
  isTitle,
  canHide,
  canSort,
  canFilter,
  canGroup,
  activeSortDir,
  activeGrouped,
  freezeTitle,
  summaryOp,
  onClose,
  onFilter,
  onSort,
  onGroup,
  onSummary,
  onToggleFreeze,
  onHide,
}: ColumnHeaderMenuProps) {
  const { col, rect, mode } = target
  const flat = parseTagFlatColumnKey(col.key)
  const tagPack = flat ? tagCatalog.find((pack) => pack.id === flat.packId) : undefined
  const tagField = flat && tagPack ? tagPack.fields.find((item) => item.key === flat.fieldKey) : undefined
  const editableTagField = Boolean(tagPack && tagField)

  const initialName = tagColumnHeadLabel(col)
  const initialDesc = String(tagField?.description ?? col.field.description ?? '').trim()

  const [nameDraft, setNameDraft] = useState(initialName)
  const [nameError, setNameError] = useState('')
  const [descDraft, setDescDraft] = useState(initialDesc)
  const [descOpen, setDescOpen] = useState(Boolean(initialDesc))
  const [sub, setSub] = useState<'sort' | 'calculate' | null>(mode === 'summary' ? 'calculate' : null)

  const popRef = useRef<HTMLDivElement>(null)
  const descInputRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: rect.left,
    top: rect.bottom + 4,
  })

  useEffect(() => {
    setNameDraft(initialName)
    setNameError('')
    setDescDraft(initialDesc)
    setDescOpen(Boolean(initialDesc))
    setSub(mode === 'summary' ? 'calculate' : null)
  }, [col.key, initialDesc, initialName, mode])

  useLayoutEffect(() => {
    const el = popRef.current
    if (!el) return
    const next = computeFloatingPosition({
      anchor: rect,
      floating: { width: el.offsetWidth || 236, height: el.offsetHeight || 260 },
      placement: mode === 'summary' ? 'top-start' : 'bottom-start',
      offset: 4,
      padding: 8,
    })
    setPos({ left: next.left, top: next.top })
  }, [descOpen, mode, rect, sub])

  function commitTagMeta() {
    if (!tagPack || !tagField) return
    const nextLabel = nameDraft.trim()
    const nextDesc = descDraft.trim()
    const labelChanged = Boolean(nextLabel && nextLabel !== (tagField.label ?? tagField.key))
    const descChanged = nextDesc !== String(tagField.description ?? '').trim()
    if (!labelChanged && !descChanged) return
    if (labelChanged) {
      const others = tagPack.fields.filter((item) => item.key !== tagField.key)
      if (!tagFieldLabelOk(nextLabel, others.map((item) => item.label ?? item.key))) {
        setNameError('不能与系统字段或已有属性重名')
        return
      }
    }
    setNameError('')
    void persistTags([
      {
        ...tagPack,
        fields: tagPack.fields.map((row) => {
          if (row.key !== tagField.key) return row
          const updated = { ...row }
          if (labelChanged) updated.label = nextLabel
          if (nextDesc) updated.description = nextDesc
          else delete updated.description
          return updated
        }),
      },
    ])
  }

  const summaryOptions = summaryOpsForKind(col.kind)
  const showInfoButton = editableTagField || Boolean(initialDesc)

  const menu = (
    <HeadlessDismiss
      onDismiss={() => {
        commitTagMeta()
        onClose()
      }}
      insideRef={popRef}
    >
      <div
        ref={popRef}
        className="fsdb-col-menu"
        data-testid="fsdb-col-header-menu"
        style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: overlayZ(1) }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {mode === 'summary' ? (
          <div className="fsdb-col-menu-list" role="menu" aria-label="列统计方式">
            <div className="fsdb-col-menu-subhead">{initialName} · 统计</div>
            {summaryOptions.map((item) => {
              const active = summaryOp === item.op
              return (
                <button
                  key={item.op}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={`fsdb-col-menu-item${active ? ' is-on' : ''}`}
                  onClick={() => {
                    onSummary(col.key, item.op)
                    onClose()
                  }}
                >
                  <span className="fsdb-col-menu-item-label">{item.label}</span>
                  {active ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check" /> : null}
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <div className="fsdb-col-menu-head">
              <div className="fsdb-col-menu-namebox">
                <span className="fsdb-col-menu-glyph" aria-hidden>
                  <FieldGlyph kind={col.kind} />
                </span>
                {editableTagField ? (
                  <input
                    className="fsdb-col-menu-nameinput"
                    value={nameDraft}
                    aria-label="属性名称"
                    onChange={(event) => {
                      setNameDraft(event.target.value)
                      if (nameError) setNameError('')
                    }}
                    onBlur={commitTagMeta}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitTagMeta()
                        ;(event.currentTarget as HTMLInputElement).blur()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setNameDraft(initialName)
                        onClose()
                      }
                    }}
                  />
                ) : (
                  <span className="fsdb-col-menu-nametext">{initialName}</span>
                )}
                {showInfoButton ? (
                  <button
                    type="button"
                    className={`fsdb-col-menu-info${descOpen ? ' is-on' : ''}`}
                    aria-label={descOpen ? '收起属性说明' : '查看或编辑属性说明'}
                    aria-pressed={descOpen}
                    data-dock-tip="属性说明"
                    onClick={() => {
                      const next = !descOpen
                      setDescOpen(next)
                      if (next && editableTagField) {
                        requestAnimationFrame(() => descInputRef.current?.focus())
                      }
                    }}
                  >
                    <InformationCircleIcon aria-hidden className="size-4" />
                  </button>
                ) : null}
              </div>
              {nameError ? <div className="fsdb-col-menu-err">{nameError}</div> : null}
              {descOpen ? (
                editableTagField ? (
                  <input
                    ref={descInputRef}
                    className="fsdb-col-menu-descinput"
                    value={descDraft}
                    placeholder="添加属性说明..."
                    aria-label="属性说明"
                    onChange={(event) => setDescDraft(event.target.value)}
                    onBlur={commitTagMeta}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitTagMeta()
                        ;(event.currentTarget as HTMLInputElement).blur()
                      }
                    }}
                  />
                ) : initialDesc ? (
                  <div className="fsdb-col-menu-desctext">{initialDesc}</div>
                ) : null
              ) : null}
            </div>

            <div className="fsdb-col-menu-sep" />

            <div className="fsdb-col-menu-list" role="menu">
              {canFilter ? (
                <button
                  type="button"
                  role="menuitem"
                  className="fsdb-col-menu-item"
                  onClick={() => {
                    commitTagMeta()
                    onFilter(col.key)
                    onClose()
                  }}
                >
                  <FunnelIcon aria-hidden className="size-3.5 fsdb-col-menu-ico" />
                  <span className="fsdb-col-menu-item-label">筛选</span>
                </button>
              ) : null}

              {canSort ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    aria-expanded={sub === 'sort'}
                    className={`fsdb-col-menu-item${sub === 'sort' || activeSortDir ? ' is-on' : ''}`}
                    onClick={() => setSub((prev) => (prev === 'sort' ? null : 'sort'))}
                  >
                    <ArrowsUpDownIcon aria-hidden className="size-3.5 fsdb-col-menu-ico" />
                    <span className="fsdb-col-menu-item-label">排序</span>
                    {activeSortDir ? (
                      <span className="fsdb-col-menu-meta">{activeSortDir === 'asc' ? '升序' : '降序'}</span>
                    ) : null}
                    <ChevronRightIcon
                      aria-hidden
                      className={`size-3.5 fsdb-col-menu-chev sidebar-chevron${sub === 'sort' ? ' is-open' : ''}`}
                    />
                  </button>
                  {sub === 'sort' ? (
                    <div className="fsdb-col-menu-sub">
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={activeSortDir === 'asc'}
                        className={`fsdb-col-menu-item${activeSortDir === 'asc' ? ' is-on' : ''}`}
                        onClick={() => {
                          onSort(col.key, 'asc')
                          onClose()
                        }}
                      >
                        <span className="fsdb-col-menu-item-label">升序</span>
                        {activeSortDir === 'asc' ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check" /> : null}
                      </button>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={activeSortDir === 'desc'}
                        className={`fsdb-col-menu-item${activeSortDir === 'desc' ? ' is-on' : ''}`}
                        onClick={() => {
                          onSort(col.key, 'desc')
                          onClose()
                        }}
                      >
                        <span className="fsdb-col-menu-item-label">降序</span>
                        {activeSortDir === 'desc' ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check" /> : null}
                      </button>
                      {activeSortDir ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="fsdb-col-menu-item"
                          onClick={() => {
                            onSort(col.key, null)
                            onClose()
                          }}
                        >
                          <span className="fsdb-col-menu-item-label">清除排序</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              {canGroup ? (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={activeGrouped}
                  className={`fsdb-col-menu-item${activeGrouped ? ' is-on' : ''}`}
                  onClick={() => {
                    onGroup(col.key)
                    onClose()
                  }}
                >
                  <Squares2X2Icon aria-hidden className="size-3.5 fsdb-col-menu-ico" />
                  <span className="fsdb-col-menu-item-label">分组</span>
                  {activeGrouped ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check" /> : null}
                </button>
              ) : null}

              <button
                type="button"
                role="menuitem"
                aria-expanded={sub === 'calculate'}
                className={`fsdb-col-menu-item${sub === 'calculate' || summaryOp !== 'none' ? ' is-on' : ''}`}
                onClick={() => setSub((prev) => (prev === 'calculate' ? null : 'calculate'))}
              >
                <span className="fsdb-col-menu-sigma" aria-hidden>Σ</span>
                <span className="fsdb-col-menu-item-label">统计</span>
                {summaryOp !== 'none' ? (
                  <span className="fsdb-col-menu-meta">{summaryOpLabel(summaryOp)}</span>
                ) : null}
                <ChevronRightIcon
                  aria-hidden
                  className={`size-3.5 fsdb-col-menu-chev sidebar-chevron${sub === 'calculate' ? ' is-open' : ''}`}
                />
              </button>
              {sub === 'calculate' ? (
                <div className="fsdb-col-menu-sub">
                  {summaryOptions.map((item) => {
                    const active = summaryOp === item.op
                    return (
                      <button
                        key={item.op}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        className={`fsdb-col-menu-item${active ? ' is-on' : ''}`}
                        onClick={() => {
                          onSummary(col.key, item.op)
                          onClose()
                        }}
                      >
                        <span className="fsdb-col-menu-item-label">{item.label}</span>
                        {active ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check" /> : null}
                      </button>
                    )
                  })}
                </div>
              ) : null}

              {isTitle ? (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={freezeTitle}
                  className={`fsdb-col-menu-item${freezeTitle ? ' is-on' : ''}`}
                  onClick={() => {
                    onToggleFreeze()
                    onClose()
                  }}
                >
                  <span className="fsdb-col-menu-pin" aria-hidden>📌</span>
                  <span className="fsdb-col-menu-item-label">{freezeTitle ? '取消冻结列' : '冻结此列'}</span>
                  {freezeTitle ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check" /> : null}
                </button>
              ) : null}

              {canHide ? (
                <>
                  <div className="fsdb-col-menu-sep" />
                  <button
                    type="button"
                    role="menuitem"
                    className="fsdb-col-menu-item"
                    onClick={() => {
                      onHide(col.key)
                      onClose()
                    }}
                  >
                    <EyeSlashIcon aria-hidden className="size-3.5 fsdb-col-menu-ico" />
                    <span className="fsdb-col-menu-item-label">隐藏此列</span>
                  </button>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    </HeadlessDismiss>
  )

  const portal = overlayPortalRoot()
  return portal ? createPortal(menu, portal) : null
}
