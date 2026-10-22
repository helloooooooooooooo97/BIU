import { useEffect, useState } from 'react'

const REPO_API = 'https://api.github.com/repos/helloooooooooooooo97/biu'
export const GITHUB_CACHE_KEY = 'biu.site.github.v2'
/**
 * 未登录的 GitHub API 每个 IP 每小时只有 60 次，超了就 403。
 * 缓存放 localStorage 让所有标签页共用；过期或请求失败时仍显示上一次拿到的数，不让星标凭空消失。
 */
const CACHE_TTL = 60 * 60 * 1000

export type ReleaseAsset = { name: string; url: string }
export type Release = { tag: string; publishedAt: string; url: string; body: string; assets: ReleaseAsset[] }
export type GitHubStats = { stars?: number; release?: Release }

type RawRelease = {
  tag_name?: string
  name?: string
  published_at?: string
  html_url?: string
  body?: string
  assets?: Array<{ name: string; browser_download_url: string }>
}

export function toRelease(raw: RawRelease): Release | undefined {
  if (!raw?.tag_name) return undefined
  return {
    tag: raw.tag_name,
    publishedAt: raw.published_at ?? '',
    url: raw.html_url ?? '',
    body: raw.body ?? '',
    assets: (raw.assets ?? []).map((asset) => ({ name: asset.name, url: asset.browser_download_url })),
  }
}

/** jsdom 里不发真请求：测试不该依赖外网。 */
function canFetch() {
  if (typeof fetch !== 'function' || typeof navigator === 'undefined') return false
  return !/jsdom/i.test(navigator.userAgent)
}

type CacheEntry = { at: number; stats: GitHubStats }

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(GITHUB_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    return parsed && typeof parsed.at === 'number' && parsed.stats ? parsed : null
  } catch {
    return null
  }
}

function isFresh(entry: CacheEntry | null) {
  return Boolean(entry && Date.now() - entry.at < CACHE_TTL && entry.stats.stars !== undefined && entry.stats.release)
}

function writeCache(entry: CacheEntry) {
  try {
    localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify(entry))
  } catch {
    /* 隐私模式下 localStorage 可能不可写 */
  }
}

async function getJson<T>(url: string): Promise<T | undefined> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
    return response.ok ? ((await response.json()) as T) : undefined
  } catch {
    return undefined
  }
}

let pending: Promise<GitHubStats> | null = null

export function loadGitHubStats(): Promise<GitHubStats> {
  const cached = readCache()
  if (cached && isFresh(cached)) return Promise.resolve(cached.stats)
  if (!canFetch()) return Promise.resolve(cached?.stats ?? {})
  pending ??= Promise.all([
    getJson<{ stargazers_count?: number }>(REPO_API),
    getJson<RawRelease>(`${REPO_API}/releases/latest`),
  ]).then(([repo, release]) => {
    const complete = repo?.stargazers_count !== undefined && Boolean(release)
    const stats: GitHubStats = {
      stars: repo?.stargazers_count ?? cached?.stats.stars,
      release: release ? toRelease(release) : cached?.stats.release,
    }
    // 只拿到一半（多半是被限流）时保留旧时间戳，下次进页面再补，不把缺数据的结果当成新鲜缓存
    if (stats.stars !== undefined || stats.release) writeCache({ at: complete ? Date.now() : cached?.at ?? 0, stats })
    if (!complete) pending = null
    return stats
  })
  return pending
}

export function useGitHubStats(): GitHubStats {
  const [stats, setStats] = useState<GitHubStats>(() => readCache()?.stats ?? {})
  useEffect(() => {
    let cancelled = false
    void loadGitHubStats().then((next) => {
      if (!cancelled) setStats(next)
    })
    return () => { cancelled = true }
  }, [])
  return stats
}

export function formatStars(count: number) {
  if (count < 1000) return String(count)
  const k = count / 1000
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`
}

export function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}

export async function loadReleases(limit = 20): Promise<Release[]> {
  if (!canFetch()) return []
  const list = await getJson<RawRelease[]>(`${REPO_API}/releases?per_page=${limit}`)
  return (list ?? []).map(toRelease).filter((item): item is Release => Boolean(item))
}
