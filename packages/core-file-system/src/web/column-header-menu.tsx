import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowsUpDownIcon,
  CalculatorIcon,
  CheckIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  CodeBracketSquareIcon,
  EyeSlashIcon,
  FunnelIcon,
  InformationCircleIcon,
  LockClosedIcon,
  PlusIcon,
  SparklesIcon,
  Squares2X2Icon,
  TrashIcon,
} from '@heroicons/react/16/solid'
import { computeFloatingPosition } from '@biu/biu-ui/floating-position'
import { overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import type { CollectionSchemaPack, FieldSpec, FieldType } from '@biu/type-file-system'
import {
  summaryOpLabel,
  summaryOpsForKind,
  type ColumnSummaryOp,
} from './column-summary.ts'
import {
  askAgentEditColumnSandbox,
  compileColumnSandbox,
  defaultColumnSandboxCode,
  type ColumnSandboxItem,
  type ColumnViewConfig,
} from './column-sandbox-view.tsx'
import { parseTagFlatColumnKey, tagColumnHeadLabel } from './fields.ts'
import { FieldGlyph } from './fsdb-cells.tsx'
import { persistTags, tagFieldLabelOk } from './tag-catalog.ts'

const HostSourceEditor = lazy(() =>
  import('./host-source-editor.tsx').then((m) => ({ default: m.HostSourceEditor })),
)

export type ColumnHeaderMenuTarget = {
  col: {
    key: string
    field: FieldSpec
    kind: FieldType
    packId?: string
    packLabel?: string
  }
  rect: DOMRect
  anchorEl?: HTMLElement | null
  mode: 'header' | 'summary'
}

export type ColumnHeaderMenuProps = {
  target: ColumnHeaderMenuTarget
  collectionPath: string
  activeViewId: string | null
  activeViewName?: string
  tagCatalog: CollectionSchemaPack[]
  isTitle: boolean
  canHide: boolean
  canSort: boolean
  canFilter: boolean
  canGroup: boolean
  activeSortDir: 'asc' | 'desc' | null
  activeGrouped: boolean
  isFrozenEdge: boolean
  summaryOp: ColumnSummaryOp
  columnView?: ColumnViewConfig
  onClose: () => void
  onFilter: (colKey: string) => void
  onSort: (colKey: string, dir: 'asc' | 'desc' | null) => void
  onGroup: (colKey: string) => void
  onSummary: (colKey: string, op: ColumnSummaryOp) => void
  onChangeColumnView: (colKey: string, next: ColumnViewConfig | undefined) => void
  onToggleFreeze: () => void
  onHide: (colKey: string) => void
}

export function ColumnHeaderMenu({
  target,
  collectionPath,
  activeViewId,
  activeViewName,
  tagCatalog,
  isTitle,
  canHide,
  canSort,
  canFilter,
  canGroup,
  activeSortDir,
  activeGrouped,
  isFrozenEdge,
  summaryOp,
  columnView,
  onClose,
  onFilter,
  onSort,
  onGroup,
  onSummary,
  onChangeColumnView,
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
  const [sub, setSub] = useState<'sort' | 'calculate' | 'views' | null>(mode === 'summary' ? 'calculate' : null)
  const [editingSandboxId, setEditingSandboxId] = useState<string | null>(null)
  const [codeDraft, setCodeDraft] = useState('')

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

  const dismissRef = useRef<() => void>(() => undefined)
  dismissRef.current = () => {
    commitTagMeta()
    onClose()
  }

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const hit = event.target instanceof Node ? event.target : null
      if (!hit) return
      if (popRef.current?.contains(hit)) return
      if (target.anchorEl?.contains(hit)) return
      dismissRef.current()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key !== 'Escape') return
      event.preventDefault()
      dismissRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [target.anchorEl])

  const summaryOptions = summaryOpsForKind(col.kind)
  const showInfoButton = editableTagField || Boolean(initialDesc)

  const viewItems = columnView?.items ?? []
  const activeViewKey = columnView?.activeId ?? 'default'
  const activeSandbox = activeViewKey !== 'default' ? viewItems.find((item) => item.id === activeViewKey) ?? null : null
  const editingSandbox = editingSandboxId ? viewItems.find((item) => item.id === editingSandboxId) ?? null : null
  const compileCheck = editingSandbox ? compileColumnSandbox(codeDraft) : null

  function selectSandboxView(nextId: string) {
    if (!viewItems.length) {
      onChangeColumnView(col.key, undefined)
      return
    }
    onChangeColumnView(col.key, { activeId: nextId, items: viewItems })
  }

  function addSandboxView() {
    const id = `sv-${Date.now().toString(36)}`
    const name = `沙箱视图 ${viewItems.length + 1}`
    const code = defaultColumnSandboxCode({ key: col.key, label: initialName, kind: col.kind })
    const created: ColumnSandboxItem = { id, name, code }
    onChangeColumnView(col.key, { activeId: id, items: [...viewItems, created] })
  }

  function removeSandboxView(id: string) {
    const rest = viewItems.filter((item) => item.id !== id)
    if (editingSandboxId === id) setEditingSandboxId(null)
    if (!rest.length) {
      onChangeColumnView(col.key, undefined)
      return
    }
    const nextActive = activeViewKey === id ? 'default' : activeViewKey
    onChangeColumnView(col.key, { activeId: nextActive, items: rest })
  }

  function saveSandboxCode(id: string, nextCode: string) {
    onChangeColumnView(col.key, {
      activeId: activeViewKey,
      items: viewItems.map((item) => (item.id === id ? { ...item, code: nextCode } : item)),
    })
  }

  const menu = (
      <div
        ref={popRef}
        className={`fsdb-col-menu${editingSandbox ? ' is-wide' : ''}`}
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
                      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
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
                      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
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
                  <div className={`fsdb-inline-fold${sub === 'sort' ? ' is-open' : ''}`} aria-hidden={sub !== 'sort'}>
                    <div className="fsdb-inline-fold-inner">
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
                    </div>
                  </div>
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
                <CalculatorIcon aria-hidden className="size-3.5 fsdb-col-menu-ico" />
                <span className="fsdb-col-menu-item-label">统计</span>
                {summaryOp !== 'none' ? (
                  <span className="fsdb-col-menu-meta">{summaryOpLabel(summaryOp)}</span>
                ) : null}
                <ChevronRightIcon
                  aria-hidden
                  className={`size-3.5 fsdb-col-menu-chev sidebar-chevron${sub === 'calculate' ? ' is-open' : ''}`}
                />
              </button>
              <div className={`fsdb-inline-fold${sub === 'calculate' ? ' is-open' : ''}`} aria-hidden={sub !== 'calculate'}>
                <div className="fsdb-inline-fold-inner">
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
                </div>
              </div>

              {!isTitle ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    aria-expanded={sub === 'views'}
                    className={`fsdb-col-menu-item${sub === 'views' || activeSandbox ? ' is-on' : ''}`}
                    onClick={() => setSub((prev) => (prev === 'views' ? null : 'views'))}
                  >
                    <CodeBracketSquareIcon aria-hidden className="size-3.5 fsdb-col-menu-ico" />
                    <span className="fsdb-col-menu-item-label">属性视图</span>
                    <span className="fsdb-col-menu-meta">{activeSandbox ? activeSandbox.name : '默认视图'}</span>
                    <ChevronRightIcon
                      aria-hidden
                      className={`size-3.5 fsdb-col-menu-chev sidebar-chevron${sub === 'views' ? ' is-open' : ''}`}
                    />
                  </button>
                  <div className={`fsdb-inline-fold${sub === 'views' ? ' is-open' : ''}`} aria-hidden={sub !== 'views'}>
                    <div className="fsdb-inline-fold-inner">
                      <div className="fsdb-col-menu-sub fsdb-col-view-sub">
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={activeViewKey === 'default'}
                          className={`fsdb-col-menu-item${activeViewKey === 'default' ? ' is-on' : ''}`}
                          onClick={() => selectSandboxView('default')}
                        >
                          <span className="fsdb-col-menu-item-label">默认视图</span>
                          {activeViewKey === 'default' ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check" /> : null}
                        </button>
                        {viewItems.map((item) => {
                          const active = activeViewKey === item.id
                          const editing = editingSandboxId === item.id
                          return (
                            <div key={item.id} className="fsdb-col-view-entry">
                              <div className={`fsdb-col-view-row${active ? ' is-on' : ''}`}>
                                <button
                                  type="button"
                                  role="menuitemradio"
                                  aria-checked={active}
                                  className="fsdb-col-view-pick"
                                  onClick={() => selectSandboxView(item.id)}
                                >
                                  <span className="fsdb-col-menu-item-label">{item.name}</span>
                                  {active ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check" /> : null}
                                </button>
                                <div className="fsdb-col-view-acts">
                                  <button
                                    type="button"
                                    className="fsdb-col-view-act"
                                    aria-label={`让 Agent 修改 ${item.name}`}
                                    data-dock-tip="让 Agent 修改"
                                    onClick={() => {
                                      askAgentEditColumnSandbox({
                                        collectionPath,
                                        viewId: activeViewId,
                                        viewName: activeViewName,
                                        columnKey: col.key,
                                        columnLabel: initialName,
                                        kind: col.kind,
                                        sandbox: item,
                                      })
                                      onClose()
                                    }}
                                  >
                                    <SparklesIcon aria-hidden className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    className={`fsdb-col-view-act${editing ? ' is-on' : ''}`}
                                    aria-label={`编辑 ${item.name} 代码`}
                                    data-dock-tip={editing ? '收起代码' : '编辑代码'}
                                    onClick={() => {
                                      if (editing) {
                                        setEditingSandboxId(null)
                                      } else {
                                        setEditingSandboxId(item.id)
                                        setCodeDraft(item.code)
                                      }
                                    }}
                                  >
                                    <CodeBracketIcon aria-hidden className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    className="fsdb-col-view-act is-danger"
                                    aria-label={`删除 ${item.name}`}
                                    data-dock-tip="删除"
                                    onClick={() => removeSandboxView(item.id)}
                                  >
                                    <TrashIcon aria-hidden className="size-3.5" />
                                  </button>
                                </div>
                              </div>
                              {editing ? (
                                <div className="fsdb-col-view-editor">
                                  <div className="fsdb-col-view-cm">
                                    <Suspense fallback={<div className="fsdb-col-view-loading">加载编辑器…</div>}>
                                      <HostSourceEditor
                                        key={item.id}
                                        value={codeDraft}
                                        writable
                                        language="javascript"
                                        testId="fsdb-col-sandbox-editor"
                                        onChange={(nextCode) => {
                                          setCodeDraft(nextCode)
                                          saveSandboxCode(item.id, nextCode)
                                        }}
                                      />
                                    </Suspense>
                                  </div>
                                  <div className="fsdb-col-view-status">
                                    {compileCheck?.ok ? (
                                      <span className="fsdb-col-view-ok">编译正常 · 已实时应用</span>
                                    ) : (
                                      <span className="fsdb-col-view-fail" title={compileCheck?.error}>
                                        {compileCheck?.error || '编译失败'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                        <button
                          type="button"
                          role="menuitem"
                          className="fsdb-col-menu-item fsdb-col-view-add"
                          data-testid="fsdb-col-sandbox-add"
                          onClick={addSandboxView}
                        >
                          <PlusIcon aria-hidden className="size-3.5 fsdb-col-menu-ico" />
                          <span className="fsdb-col-menu-item-label">添加沙箱视图</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}

              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={isFrozenEdge}
                className={`fsdb-col-menu-item${isFrozenEdge ? ' is-on' : ''}`}
                onClick={() => {
                  onToggleFreeze()
                  onClose()
                }}
              >
                <LockClosedIcon aria-hidden className="size-3.5 fsdb-col-menu-ico" />
                <span className="fsdb-col-menu-item-label">
                  {isFrozenEdge ? '取消冻结' : isTitle ? '冻结此列' : '冻结至此列'}
                </span>
                {isFrozenEdge ? <CheckIcon aria-hidden className="size-3.5 fsdb-col-menu-check" /> : null}
              </button>

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
  )

  const portal = overlayPortalRoot()
  return portal ? createPortal(menu, portal) : null
}
