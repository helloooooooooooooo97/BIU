import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { mkdir, readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { currentAccountId, currentRequestWorkspaceId, dataHome } from './data-dir.ts'

export const CLOUD_VIRTUAL_ROOT = '/workspace'

export type CloudFolderEntry = {
  name: string
  path: string
  hasGit: boolean
  updatedAt: number
}

export type CloudFolderListing = {
  current: string
  parent: string | null
  folders: CloudFolderEntry[]
}

export type ResolvedCloudFolder = {
  physical: string
  logical: string
  rel: string
  name: string
}

export function requireWorkspaceSegment(id: string): string {
  const safe = String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safe) throw new Error('workspace scope is required in cloud runtime')
  return safe
}

export function requireAccountSegment(id: string): string {
  const safe = String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safe) throw new Error('account scope is required in cloud runtime')
  return safe
}

/**
 * 云端个人工作区根目录：按 (workspaceId, accountId) 双重物理隔离。
 * 同空间不同成员的磁盘目录完全互不可见；缺少任一租户上下文时 fail-closed 抛错。
 */
export function cloudUserWorkRoot(
  workspaceId = currentRequestWorkspaceId(),
  accountId = currentAccountId(),
  home = dataHome(),
): string {
  const ws = requireWorkspaceSegment(workspaceId)
  const acc = requireAccountSegment(accountId)
  const dir = resolve(home, 'workspaces', ws, 'users', acc, 'work')
  mkdirSync(dir, { recursive: true })
  return dir
}

function isInsideRoot(rootReal: string, targetReal: string): boolean {
  const rel = relative(rootReal, targetReal)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * 规范化云端项目文件夹的逻辑相对路径（相对于个人 work 根）。
 * 允许：`""`、`"."`、`"/workspace"`、`"/workspace/a/b"`、`"a/b"`；
 * 拒绝：宿主机绝对路径（如 `/etc`、`/Users/...`、`C:\...`）、`..` 穿越、空字符。
 */
export function normalizeCloudFolderRel(input: string): string {
  const raw = String(input ?? '').trim()
  if (!raw || raw === '.' || raw === CLOUD_VIRTUAL_ROOT || raw === `${CLOUD_VIRTUAL_ROOT}/`) return ''
  if (raw.includes('\0')) throw new Error('invalid cloud project path')
  const posix = raw.replace(/\\/g, '/')
  if (/^[A-Za-z]:/.test(posix)) {
    throw new Error('云端项目路径必须在 /workspace 内，不支持绑定宿主机路径')
  }
  let stripped = posix
  if (posix === CLOUD_VIRTUAL_ROOT || posix.startsWith(`${CLOUD_VIRTUAL_ROOT}/`)) {
    stripped = posix.slice(CLOUD_VIRTUAL_ROOT.length)
  } else if (posix.startsWith('/')) {
    throw new Error('云端项目路径必须在 /workspace 内，不支持绑定宿主机路径')
  }
  const parts = stripped.split('/').filter((seg) => seg.length > 0 && seg !== '.')
  for (const seg of parts) {
    if (seg === '..') throw new Error('云端项目路径不能越出个人工作区')
  }
  return parts.join('/')
}

export function formatCloudLogicalPath(rel: string): string {
  const clean = rel.replace(/^\/+|\/+$/g, '')
  return clean ? `${CLOUD_VIRTUAL_ROOT}/${clean}` : CLOUD_VIRTUAL_ROOT
}

/** 验证单个新建文件夹名称。 */
export function sanitizeCloudFolderName(name: string): string {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new Error('文件夹名称不能为空')
  if (trimmed.length > 100) throw new Error('文件夹名称过长（最多 100 个字符）')
  if (trimmed === '.' || trimmed === '..' || trimmed.startsWith('.')) {
    throw new Error('文件夹名称不能以 . 开头')
  }
  if (/[/\\:\0]/.test(trimmed) || /[\x00-\x1f]/.test(trimmed)) {
    throw new Error('文件夹名称不能包含路径分隔符或特殊控制字符')
  }
  return trimmed
}

/** 确保候选路径的已存在祖先均未通过软链逃逸 rootReal。 */
async function assertAncestorsInsideRoot(rootReal: string, candidate: string): Promise<void> {
  let cursor = candidate
  while (cursor !== rootReal) {
    if (existsSync(cursor)) {
      const real = await realpath(cursor)
      if (!isInsideRoot(rootReal, real)) {
        throw new Error('云端项目路径不能通过软链越出个人工作区')
      }
      return
    }
    const next = dirname(cursor)
    if (next === cursor) break
    cursor = next
  }
}

export async function resolveCloudFolderPhysical(
  root: string,
  logicalInput: string,
  opts: { create?: boolean } = {},
): Promise<ResolvedCloudFolder> {
  mkdirSync(root, { recursive: true })
  const rootReal = await realpath(root)
  const rel = normalizeCloudFolderRel(logicalInput)
  const candidate = rel ? resolve(rootReal, rel) : rootReal
  if (!isInsideRoot(rootReal, candidate)) {
    throw new Error('云端项目路径不能越出个人工作区')
  }
  if (opts.create) {
    await assertAncestorsInsideRoot(rootReal, candidate)
    await mkdir(candidate, { recursive: true })
  }
  let targetReal: string
  try {
    targetReal = await realpath(candidate)
  } catch {
    throw new Error(`云端项目文件夹不存在：${formatCloudLogicalPath(rel)}`)
  }
  if (!isInsideRoot(rootReal, targetReal)) {
    throw new Error('云端项目路径不能通过软链越出个人工作区')
  }
  const info = await stat(targetReal)
  if (!info.isDirectory()) {
    throw new Error(`云端项目路径不是文件夹：${formatCloudLogicalPath(rel)}`)
  }
  const canonicalRel = relative(rootReal, targetReal).split(sep).filter(Boolean).join('/')
  const logical = formatCloudLogicalPath(canonicalRel)
  const name = canonicalRel ? basename(targetReal) : 'workspace'
  return { physical: targetReal, logical, rel: canonicalRel, name }
}

/** 同步解析云端已绑定的项目目录（供 FsService.effectiveRoot 调用）；无效或越界时返回 null（fail-closed 回退个人根）。 */
export function resolveCloudProjectSync(root: string, logicalInput: string): string | null {
  try {
    if (!existsSync(root)) return null
    const rootReal = realpathSync(root)
    const rel = normalizeCloudFolderRel(logicalInput)
    if (!rel) return rootReal
    const candidate = resolve(rootReal, rel)
    if (!isInsideRoot(rootReal, candidate)) return null
    if (!existsSync(candidate)) return null
    const targetReal = realpathSync(candidate)
    if (!isInsideRoot(rootReal, targetReal)) return null
    if (!statSync(targetReal).isDirectory()) return null
    return targetReal
  } catch {
    return null
  }
}

export async function listCloudFolders(
  workspaceId = currentRequestWorkspaceId(),
  accountId = currentAccountId(),
  parentLogical = CLOUD_VIRTUAL_ROOT,
  home = dataHome(),
): Promise<CloudFolderListing> {
  const root = cloudUserWorkRoot(workspaceId, accountId, home)
  const rootReal = await realpath(root)
  const current = await resolveCloudFolderPhysical(rootReal, parentLogical)
  const entries = await readdir(current.physical, { withFileTypes: true })
  const folders: CloudFolderEntry[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const childPath = join(current.physical, entry.name)
    try {
      const childReal = await realpath(childPath)
      if (!isInsideRoot(rootReal, childReal)) continue
      const st = await stat(childReal)
      if (!st.isDirectory()) continue
      const childRel = relative(rootReal, childReal).split(sep).filter(Boolean).join('/')
      folders.push({
        name: entry.name,
        path: formatCloudLogicalPath(childRel),
        hasGit: existsSync(join(childReal, '.git')),
        updatedAt: Math.floor(st.mtimeMs),
      })
    } catch {
      /* skip unreadable or dangling symlinks */
    }
  }
  folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  const parentRel = current.rel ? (current.rel.includes('/') ? dirname(current.rel) : '') : null
  return {
    current: current.logical,
    parent: parentRel === null ? null : formatCloudLogicalPath(parentRel),
    folders,
  }
}

export async function createCloudFolder(
  workspaceId = currentRequestWorkspaceId(),
  accountId = currentAccountId(),
  parentLogical = CLOUD_VIRTUAL_ROOT,
  folderName: string,
  home = dataHome(),
): Promise<CloudFolderEntry> {
  const safeName = sanitizeCloudFolderName(folderName)
  const root = cloudUserWorkRoot(workspaceId, accountId, home)
  const parent = await resolveCloudFolderPhysical(root, parentLogical)
  const targetLogical = parent.rel ? `${parent.logical}/${safeName}` : `${CLOUD_VIRTUAL_ROOT}/${safeName}`
  const created = await resolveCloudFolderPhysical(root, targetLogical, { create: true })
  const st = await stat(created.physical)
  return {
    name: created.name,
    path: created.logical,
    hasGit: existsSync(join(created.physical, '.git')),
    updatedAt: Math.floor(st.mtimeMs),
  }
}
