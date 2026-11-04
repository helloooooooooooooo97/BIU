/** 只在 Agent 表面（/ 或 /agents/...）才把 URL 收成会话路由；模块页保持当前路径。 */
export function shouldNavigateToSession(pathname: string, sessionId: string) {
  if (!sessionId) return false
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === `/agents/${sessionId}` || path.startsWith(`/agents/${sessionId}/`)) return false
  return path === '/' || path === '/agents' || path.startsWith('/agents/')
}
