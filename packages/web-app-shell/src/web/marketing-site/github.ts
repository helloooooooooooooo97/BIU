import { useEffect, useState } from 'react'

const REPO_API = 'https://api.github.com/repos/helloooooooooooooo97/biu'
const CACHE_KEY = 'biu.site.github.v1'
/** 未登录的 GitHub API 每小时只有 60 次，一个会话里只问一次就够。 */
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

function readCache(): GitHubStats | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; stats: GitHubStats }
    return Date.now() - parsed.at < CACHE_TTL ? parsed.stats : null
  } catch {
    return null
  }
}

function writeCache(stats: GitHubStats) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), stats }))
  } catch {
    /* 隐私模式下 sessionStorage 可能不可写 */
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
  if (cached) return Promise.resolve(cached)
  if (!canFetch()) return Promise.resolve({})
  pending ??= Promise.all([
    getJson<{ stargazers_count?: number }>(REPO_API),
    getJson<RawRelease>(`${REPO_API}/releases/latest`),
  ]).then(([repo, release]) => {
    const stats: GitHubStats = { stars: repo?.stargazers_count, release: release ? toRelease(release) : undefined }
    if (stats.stars !== undefined || stats.release) writeCache(stats)
    else pending = null
    return stats
  })
  return pending
}

export function useGitHubStats(): GitHubStats {
  const [stats, setStats] = useState<GitHubStats>(() => readCache() ?? {})
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
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

export async function loadReleases(limit = 20): Promise<Release[]> {
  if (!canFetch()) return []
  const list = await getJson<RawRelease[]>(`${REPO_API}/releases?per_page=${limit}`)
  return (list ?? []).map(toRelease).filter((item): item is Release => Boolean(item))
}
