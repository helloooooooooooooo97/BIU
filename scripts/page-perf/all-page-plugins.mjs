/** 已安装的页面块插件：种一页、写一块/插件、判断全部块视图就绪。 */

export const ALL_PLUGINS_PAGE_TITLE = '全插件页'

function flag(value) {
  return value === true || value === 'true'
}

function rowTags(row) {
  const raw = row?.tags
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
  if (typeof raw === 'string') {
    return raw
      .split(/[,\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  }
  return []
}

export function installedPagePluginsFromRows(rows) {
  const out = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const row = raw
    if (!flag(row.installed) || !flag(row.hasWeb) || !flag(row.headless)) continue
    if (!rowTags(row).includes('page')) continue
    const id = String(row.id ?? '').trim()
    if (!id) continue
    const label = String(row.title ?? row.name ?? '').trim() || id
    out.push({ id, label, hint: String(row.blurb ?? '').trim() })
  }
  return out
}

export function kindFromPluginId(id) {
  const raw = String(id || '').trim()
  return raw.replace(/^page-/, '') || raw
}

export function fenceForInstalledPlugin(plugin, index) {
  const id = `all${String(index + 1).padStart(2, '0')}`
  const kind = kindFromPluginId(plugin.id)
  if (kind === 'html' || plugin.id.includes('html')) {
    return `:::pageBlock {kind=html plugin=${plugin.id} id=${id}}\n<p>${plugin.label}</p>\n:::`
  }
  return `:::pageBlock {kind=${kind} plugin=${plugin.id} id=${id}}\n{ "title": ${JSON.stringify(plugin.label)} }\n:::`
}

export function markdownForAllPlugins(plugins) {
  const fences = plugins.map((plugin, index) => fenceForInstalledPlugin(plugin, index))
  return `# ${ALL_PLUGINS_PAGE_TITLE}\n\n${fences.join('\n\n')}\n`
}

export function allPluginsPageReady(snap, expected) {
  const want = Math.max(0, Number(expected) || 0)
  const blocks = Number(snap?.blocks) || 0
  const views = Array.isArray(snap?.views) ? snap.views.filter(Boolean).length : 0
  const loading = Array.isArray(snap?.loading) ? snap.loading.length : 0
  return want > 0 && blocks >= want && views >= want && loading === 0
}
