import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { Button, Input, overlayPortalRoot, overlayZ } from '@biu/biu-ui'
import { apiFetch } from '@biu/biu-ui/api-client'
import type { ProjectViewService } from '@biu/web-slots/project-view'

type CloudFolderItem = {
  name: string
  path: string
  hasGit: boolean
  updatedAt: number
}

type CloudFolderListing = {
  current: string
  parent: string | null
  folders: CloudFolderItem[]
}

const CLOUD_ROOT = '/workspace'

function breadcrumbsFor(logicalPath: string): Array<{ label: string; path: string }> {
  const clean = logicalPath.trim().replace(/^\/+|\/+$/g, '')
  if (!clean || clean === 'workspace') {
    return [{ label: '个人工作区', path: CLOUD_ROOT }]
  }
  const rest = clean.startsWith('workspace/') ? clean.slice('workspace/'.length) : clean
  const segments = rest.split('/').filter(Boolean)
  const out: Array<{ label: string; path: string }> = [{ label: '个人工作区', path: CLOUD_ROOT }]
  let acc = CLOUD_ROOT
  for (const seg of segments) {
    acc = `${acc}/${seg}`
    out.push({ label: seg, path: acc })
  }
  return out
}

function labelForPath(logicalPath: string): string {
  if (!logicalPath || logicalPath === CLOUD_ROOT) return '个人工作区'
  const parts = logicalPath.split('/').filter(Boolean)
  return parts.at(-1) || '个人工作区'
}

function initialBrowsePath(boundPath?: string): string {
  if (!boundPath || boundPath === CLOUD_ROOT || !boundPath.startsWith(`${CLOUD_ROOT}/`)) return CLOUD_ROOT
  const idx = boundPath.lastIndexOf('/')
  return idx > CLOUD_ROOT.length ? boundPath.slice(0, idx) : CLOUD_ROOT
}

export function CloudFolderPickerDialog({
  sessionId,
  currentProjectPath,
  busy,
  projectView,
  onClose,
}: {
  sessionId: string
  currentProjectPath?: string
  busy: boolean
  projectView: ProjectViewService
  onClose: () => void
}) {
  const [currentPath, setCurrentPath] = useState<string>(() => initialBrowsePath(currentProjectPath))
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [folders, setFolders] = useState<CloudFolderItem[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(() =>
    currentProjectPath && currentProjectPath.startsWith(CLOUD_ROOT) ? currentProjectPath : null,
  )
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  const loadFolders = useCallback(async (targetPath: string, selectAfter?: string | null) => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams({ path: targetPath })
      const res = await apiFetch(`/api/workspace/folders?${qs.toString()}`)
      const body = (await res.json().catch(() => ({}))) as Partial<CloudFolderListing> & { error?: string }
      if (!res.ok) throw new Error(body.error || `加载目录失败：${res.status}`)
      const nextCurrent = String(body.current || CLOUD_ROOT)
      setCurrentPath(nextCurrent)
      setParentPath(body.parent ?? null)
      setFolders(Array.isArray(body.folders) ? body.folders : [])
      if (selectAfter !== undefined) setSelectedPath(selectAfter)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFolders(initialBrowsePath(currentProjectPath))
  }, [currentProjectPath, loadFolders])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const crumbs = useMemo(() => breadcrumbsFor(currentPath), [currentPath])
  const bindTarget = selectedPath ?? currentPath

  const handleCreate = async () => {
    const trimmed = newName.trim()
    if (!trimmed || creating) return
    setCreating(true)
    setError('')
    try {
      const res = await apiFetch('/api/workspace/folders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentPath: currentPath, name: trimmed }),
      })
      const body = (await res.json().catch(() => ({}))) as { folder?: CloudFolderItem; error?: string }
      if (!res.ok || !body.folder) throw new Error(body.error || `新建文件夹失败：${res.status}`)
      setNewName('')
      await loadFolders(currentPath, body.folder.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const handleBind = async () => {
    setError('')
    try {
      await projectView.bindFolderForSession(sessionId, bindTarget)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleUnbind = async () => {
    setError('')
    try {
      await projectView.unbindFolder()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="biu-confirm-overlay"
      style={{ zIndex: overlayZ(260) }}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-folder-picker-title"
        data-testid="cloud-folder-picker"
        className="flex w-[min(460px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-(--biu-color-border) bg-(--biu-color-surface) text-(--biu-color-text) shadow-(--biu-shadow-md)"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-(--biu-color-border) px-4 py-3">
          <div className="min-w-0">
            <h2 id="cloud-folder-picker-title" className="text-[14px] font-semibold leading-5">
              选择云端项目文件夹
            </h2>
            <p className="mt-0.5 text-[12px] text-(--biu-color-text-muted)">
              个人隔离工作区目录，同空间其他成员不可见
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            className="grid size-7 shrink-0 place-items-center rounded-md border-0 bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-muted) hover:text-(--biu-color-text)"
            onClick={onClose}
          >
            <XMarkIcon className="size-4" aria-hidden />
          </button>
        </header>

        <div className="flex items-center gap-1.5 border-b border-(--biu-color-border) bg-(--biu-color-bg-subtle) px-3 py-2 text-[12px]">
          {parentPath ? (
            <button
              type="button"
              aria-label="返回上级"
              title="返回上级"
              className="grid size-6 shrink-0 place-items-center rounded border-0 bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-muted) hover:text-(--biu-color-text)"
              onClick={() => void loadFolders(parentPath, null)}
            >
              <ArrowLeftIcon className="size-3.5" aria-hidden />
            </button>
          ) : null}
          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" aria-label="目录路径">
            {crumbs.map((crumb, idx) => (
              <span key={crumb.path} className="flex shrink-0 items-center gap-0.5">
                {idx > 0 ? <ChevronRightIcon className="size-3 text-(--biu-color-text-subtle)" aria-hidden /> : null}
                <button
                  type="button"
                  className={`rounded px-1.5 py-0.5 border-0 bg-transparent text-[12px] hover:bg-(--biu-color-bg-muted) ${
                    idx === crumbs.length - 1 ? 'font-medium text-(--biu-color-text)' : 'text-(--biu-color-text-muted)'
                  }`}
                  onClick={() => void loadFolders(crumb.path, null)}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>
        </div>

        <div className="max-h-[260px] min-h-[160px] overflow-y-auto p-2" role="listbox" aria-label="云端文件夹列表">
          {loading ? (
            <div className="flex h-[140px] items-center justify-center text-[12px] text-(--biu-color-text-muted)">
              正在加载目录…
            </div>
          ) : folders.length === 0 ? (
            <div className="flex h-[140px] flex-col items-center justify-center gap-1 px-4 text-center text-[12px] text-(--biu-color-text-muted)">
              <FolderIcon className="size-6 opacity-40" aria-hidden />
              <span>当前目录还没有子文件夹</span>
              <span className="text-[11px] text-(--biu-color-text-subtle)">
                可在下方新建项目文件夹，或直接绑定「{labelForPath(currentPath)}」
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {folders.map((folder) => {
                const isSelected = selectedPath === folder.path
                const isBound = currentProjectPath === folder.path
                return (
                  <div
                    key={folder.path}
                    role="option"
                    aria-selected={isSelected}
                    data-testid={`cloud-folder-item-${folder.name}`}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                      isSelected
                        ? 'bg-(--biu-color-bg-muted) text-(--biu-color-text) ring-1 ring-(--biu-color-border)'
                        : 'text-(--biu-color-text) hover:bg-(--biu-color-bg-subtle)'
                    }`}
                    onClick={() => setSelectedPath(isSelected ? null : folder.path)}
                    onDoubleClick={() => void loadFolders(folder.path, null)}
                  >
                    <FolderIcon className="size-4 shrink-0 text-(--biu-color-text-muted)" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
                    {folder.hasGit ? (
                      <span className="rounded bg-(--biu-color-bg-muted) px-1.5 py-0.5 text-[10px] text-(--biu-color-text-muted)">
                        git
                      </span>
                    ) : null}
                    {isBound ? (
                      <span className="inline-flex items-center gap-0.5 text-[11px] text-(--biu-color-ink-blue)">
                        <CheckIcon className="size-3.5" aria-hidden />
                        当前绑定
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`进入 ${folder.name}`}
                      title={`进入 ${folder.name}`}
                      className="grid size-6 shrink-0 place-items-center rounded border-0 bg-transparent text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-muted) hover:text-(--biu-color-text)"
                      onClick={(event) => {
                        event.stopPropagation()
                        void loadFolders(folder.path, null)
                      }}
                    >
                      <ChevronRightIcon className="size-3.5" aria-hidden />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-(--biu-color-border) px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              placeholder="新建项目文件夹名称…"
              aria-label="新建项目文件夹名称"
              data-testid="cloud-folder-new-input"
              className="flex-1 text-[12px]"
              disabled={creating}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleCreate()
                }
              }}
            />
            <Button
              variant="secondary"
              disabled={!newName.trim() || creating}
              data-testid="cloud-folder-create-btn"
              onClick={() => void handleCreate()}
            >
              <FolderPlusIcon className="size-3.5" aria-hidden />
              <span>{creating ? '创建中…' : '新建'}</span>
            </Button>
          </div>
          {error ? (
            <p className="mt-2 text-[12px] text-(--biu-color-danger,#dc2626)" role="alert" data-testid="cloud-folder-error">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-(--biu-color-border) bg-(--biu-color-bg-subtle) px-4 py-2.5">
          <div>
            {currentProjectPath ? (
              <Button
                variant="secondary"
                disabled={busy}
                data-testid="cloud-folder-unbind-btn"
                onClick={() => void handleUnbind()}
              >
                解绑当前项目
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              取消
            </Button>
            <Button
              disabled={busy || loading}
              data-testid="cloud-folder-bind-btn"
              onClick={() => void handleBind()}
            >
              {busy ? '绑定中…' : `绑定「${labelForPath(bindTarget)}」`}
            </Button>
          </div>
        </footer>
      </section>
    </div>,
    overlayPortalRoot() ?? document.body,
  )
}
