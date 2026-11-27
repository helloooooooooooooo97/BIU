import { apiFetch } from '@biu/biu-ui/api-client'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowTopRightOnSquareIcon,
  BuildingStorefrontIcon,
  DocumentDuplicateIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PuzzlePieceIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { chromeIcon } from './chrome-icon.ts'

export type StoreCategory = 'mcp' | 'skills' | 'plugins' | 'templates'
type StoreScopeTab = 'installed' | 'marketplace'

type StoreRecordItem = {
  id: string
  title: string
  description: string
  status?: string
  enabled?: boolean
  builtin?: boolean
}

const STORE_CATEGORIES: Array<{
  key: StoreCategory
  label: string
  collectionPath: string | null
  description: string
  Icon: typeof LinkIcon
}> = [
  {
    key: 'mcp',
    label: 'MCP',
    collectionPath: '/mcp',
    description: '个人连接配置与凭证仅自己可见；商店上架仅分发脱敏连接模板，安装后深拷贝为个人副本。',
    Icon: LinkIcon,
  },
  {
    key: 'skills',
    label: '技能',
    collectionPath: '/skills',
    description: '可复用的 Agent 工作流与规范包；安装后深拷贝到本地副本，独立演进、不受原包撤回影响。',
    Icon: SparklesIcon,
  },
  {
    key: 'plugins',
    label: '插件',
    collectionPath: '/plugins',
    description: '扩展界面与工具能力；从商店安装后独立运行，仅管理员可下架商店条目。',
    Icon: PuzzlePieceIcon,
  },
  {
    key: 'templates',
    label: '模板',
    collectionPath: null,
    description: '页面与工作区模板库；从商店安装会深拷贝生成你的新内容，不会改动原模板。',
    Icon: DocumentDuplicateIcon,
  },
]

function normalizeRecord(raw: Record<string, unknown>): StoreRecordItem | null {
  const id = String(raw.id ?? '').trim()
  if (!id) return null
  const title =
    String(raw.title ?? raw.name ?? raw.serverName ?? raw.id ?? '').trim() || id
  const description = String(
    raw.description ?? raw.summary ?? raw.url ?? raw.command ?? '',
  ).trim()
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : undefined
  const builtin = typeof raw.builtin === 'boolean' ? raw.builtin : undefined
  const status = typeof raw.status === 'string' && raw.status.trim() ? raw.status.trim() : undefined
  return { id, title, description, status, enabled, builtin }
}

export function ShellStoreDialog({
  open,
  tab,
  onTabChange,
  onClose,
}: {
  open: boolean
  tab: StoreCategory
  onTabChange: (tab: StoreCategory) => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [scopeTab, setScopeTab] = useState<StoreScopeTab>('installed')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<StoreRecordItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const activeCategory = useMemo(
    () => STORE_CATEGORIES.find((item) => item.key === tab) ?? STORE_CATEGORIES[0],
    [tab],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    if (scopeTab !== 'installed' || !activeCategory.collectionPath) {
      setItems([])
      setLoading(false)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void apiFetch(
      `/api/db/list?path=${encodeURIComponent(activeCategory.collectionPath)}&limit=50`,
    )
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          items?: Array<Record<string, unknown>>
          error?: string
        }
        if (!res.ok) throw new Error(body.error || '无法读取已安装列表')
        if (cancelled) return
        const rows = (body.items ?? [])
          .map(normalizeRecord)
          .filter((item): item is StoreRecordItem => Boolean(item))
        setItems(rows)
      })
      .catch((err) => {
        if (cancelled) return
        setItems([])
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, scopeTab, activeCategory.collectionPath])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q),
    )
  }, [items, query])

  if (!open) return null

  return createPortal(
    <div
      className="biu-float-overlay"
      data-testid="store-dialog"
      onClick={onClose}
    >
      <div
        className="biu-float settings-float"
        role="dialog"
        aria-modal="true"
        aria-label="商店"
        onClick={(event) => event.stopPropagation()}
      >
        <nav className="settings-rail" aria-label="商店分类">
          <div className="settings-rail-group">
            <div className="settings-rail-heading">能力商店</div>
            <ul className="settings-rail-list">
              {STORE_CATEGORIES.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className={`settings-nav-btn${tab === item.key ? ' is-on' : ''}`}
                    data-testid={`store-nav-${item.key}`}
                    onClick={() => {
                      onTabChange(item.key)
                      setQuery('')
                    }}
                  >
                    <item.Icon {...chromeIcon} />
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="settings-body">
          <button
            type="button"
            className="biu-float-close settings-body-close"
            title="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            <XMarkIcon {...chromeIcon} />
          </button>

          <div className="settings-pane">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="settings-account-title flex items-center gap-2">
                  <BuildingStorefrontIcon className="size-4 shrink-0 text-(--biu-color-text-muted)" />
                  <span>{activeCategory.label}商店</span>
                </h3>
                <p className="mt-1 text-[12px] leading-5 text-(--biu-color-text-muted)">
                  {activeCategory.description}
                </p>
              </div>
              {activeCategory.collectionPath ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-(--biu-color-border) bg-transparent px-2.5 py-1 text-[12px] font-medium text-(--biu-color-text) hover:bg-(--biu-color-surface-subtle)"
                  data-testid="store-open-collection"
                  onClick={() => {
                    onClose()
                    navigate(`/database${activeCategory.collectionPath}`)
                  }}
                >
                  <span>管理列表</span>
                  <ArrowTopRightOnSquareIcon className="size-3.5 shrink-0" />
                </button>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-(--biu-color-border) pb-3">
              <div className="inline-flex rounded-md border border-(--biu-color-border) p-0.5" role="tablist" aria-label="商店来源">
                <button
                  type="button"
                  role="tab"
                  aria-selected={scopeTab === 'installed'}
                  data-testid="store-scope-installed"
                  className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    scopeTab === 'installed'
                      ? 'bg-(--biu-color-surface-subtle) text-(--biu-color-text)'
                      : 'text-(--biu-color-text-muted) hover:text-(--biu-color-text)'
                  }`}
                  onClick={() => setScopeTab('installed')}
                >
                  我的已安装
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={scopeTab === 'marketplace'}
                  data-testid="store-scope-marketplace"
                  className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    scopeTab === 'marketplace'
                      ? 'bg-(--biu-color-surface-subtle) text-(--biu-color-text)'
                      : 'text-(--biu-color-text-muted) hover:text-(--biu-color-text)'
                  }`}
                  onClick={() => setScopeTab('marketplace')}
                >
                  空间商店
                </button>
              </div>

              <label className="relative flex min-w-[180px] flex-1 max-w-[260px] items-center">
                <MagnifyingGlassIcon
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 size-3.5 text-(--biu-color-text-muted)"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`搜索${activeCategory.label}…`}
                  aria-label={`搜索${activeCategory.label}`}
                  className="w-full rounded-md border border-(--biu-color-border) bg-transparent py-1 pr-2.5 pl-8 text-[12px] text-(--biu-color-text) outline-none focus:border-(--biu-color-emphasis)"
                />
              </label>
            </div>

            {scopeTab === 'installed' ? (
              <div className="mt-4 space-y-2" data-testid="store-installed-list">
                {loading ? (
                  <div className="py-8 text-center text-[13px] text-(--biu-color-text-muted)">
                    正在加载已安装的{activeCategory.label}…
                  </div>
                ) : error ? (
                  <div className="rounded-lg border border-(--biu-color-border) p-4 text-[12px] text-(--biu-color-text-muted)">
                    {error}
                  </div>
                ) : !activeCategory.collectionPath ? (
                  <div className="rounded-lg border border-dashed border-(--biu-color-border) p-6 text-center">
                    <p className="text-[13px] font-medium text-(--biu-color-text)">还没有已保存的{activeCategory.label}</p>
                    <p className="mt-1 text-[12px] text-(--biu-color-text-muted)">
                      后续支持将页面或工作区打包为模板上架到空间商店，安装后深拷贝为独立内容。
                    </p>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-(--biu-color-border) p-6 text-center">
                    <p className="text-[13px] font-medium text-(--biu-color-text)">
                      {query.trim() ? `没有匹配的${activeCategory.label}` : `暂无已安装的${activeCategory.label}`}
                    </p>
                    <p className="mt-1 text-[12px] text-(--biu-color-text-muted)">
                      你可以前往「空间商店」浏览团队发布的{activeCategory.label}，或在管理列表中新建个人配置。
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {filteredItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex flex-col items-start gap-1.5 rounded-lg border border-(--biu-color-border) p-3 text-left transition-colors hover:bg-(--biu-color-surface-subtle)"
                        data-testid={`store-item-${item.id}`}
                        onClick={() => {
                          if (!activeCategory.collectionPath) return
                          onClose()
                          navigate(`/database${activeCategory.collectionPath}/${encodeURIComponent(item.id)}`)
                        }}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-medium text-(--biu-color-text)">
                            {item.title}
                          </span>
                          <span className="shrink-0 rounded-full border border-(--biu-color-border) px-2 py-0.5 text-[11px] text-(--biu-color-text-muted)">
                            {item.builtin
                              ? '内置'
                              : item.enabled === false
                                ? '已停用'
                                : item.status === 'error'
                                  ? '异常'
                                  : '已启用'}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-[12px] leading-4 text-(--biu-color-text-muted)">
                          {item.description || '无描述'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="mt-4 rounded-lg border border-dashed border-(--biu-color-border) p-6 text-center"
                data-testid="store-marketplace-pane"
              >
                <p className="text-[13px] font-medium text-(--biu-color-text)">
                  空间{activeCategory.label}商店暂无已上架条目
                </p>
                <p className="mt-1.5 text-[12px] leading-5 text-(--biu-color-text-muted)">
                  上架将发布一份脱敏快照到空间商店；成员安装后深拷贝到个人副本，独立演进且不可撤回，仅超级管理员可下架商店条目。
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
