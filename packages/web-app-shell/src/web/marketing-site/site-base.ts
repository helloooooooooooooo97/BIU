/** 官网可能部署在子路径下（GitHub Pages 是 /biu/）：public 里的资源和路由都要带上这个前缀。 */
export const SITE_BASE: string = import.meta.env.BASE_URL ?? '/'

export function asset(path: string): string {
  return path.startsWith('/') ? `${SITE_BASE}${path.slice(1)}` : path
}

/** 去掉部署前缀后的站内路径，例如 /biu/pricing → /pricing。 */
export function sitePath(pathname: string): string {
  const prefix = SITE_BASE.replace(/\/$/, '')
  return prefix && pathname.startsWith(prefix) ? pathname.slice(prefix.length) || '/' : pathname
}
