import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

function readShareUiSource() {
  return [
    './authz-api.ts',
    './share-popover.tsx',
    './share-workspace-access.tsx',
    './share-controls.tsx',
    './share-chain-detail.tsx',
  ]
    .map((file) => readFileSync(resolve(import.meta.dirname, file), 'utf8'))
    .join('\n')
}

test('share panel does not load or show resource counts', () => {
  const src = readShareUiSource()
  const host =
    readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, '../host/access-policy.ts'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, '../host/http-routes.ts'), 'utf8')
  const getShares = host.slice(host.indexOf("GET', '/api/db/shares'"), host.indexOf("POST', '/api/db/shares'"))
  assert.doesNotMatch(src, /shareStatsLine|fsdb-share-resources|ShareResourceStats/)
  assert.doesNotMatch(getShares, /sharePreviewOf|buildShareSnapshot|resources/)
})

test('share panel copies link and password together, without a separate pin copy', () => {
  const src = readShareUiSource()
  assert.match(src, /shareClipboardText/)
  assert.match(src, /开启并复制/)
  assert.match(src, /复制时会同时包含链接和密码/)
  assert.match(src, /换一组后即可连同链接一起复制/)
  assert.match(src, /role="switch"/)
  assert.doesNotMatch(src, /copyText\(pin/)
  assert.doesNotMatch(src, /setCopied\('pin'\)/)
  assert.doesNotMatch(src, /复制链接和密码/)
})

test('share setting patches stay quiet and do not emit a database reload', () => {
  const src = readShareUiSource()
  const host =
    readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, '../host/access-policy.ts'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, '../host/http-routes.ts'), 'utf8')
  assert.match(src, /quiet: true/)
  assert.match(src, /flagsOnly: true/)
  const sharesPost = host.slice(host.indexOf("POST', '/api/db/shares'"), host.indexOf("GET', '/api/share/:token'"))
  assert.doesNotMatch(sharesPost, /database\/change/)
})

test('share panel uses a compact settings section and custom toggles', () => {
  const src = readShareUiSource()
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(src, /公开链接设置/)
  assert.match(src, /fsdb-share-toggle/)
  assert.match(css, /\.fsdb-share-panel\{[^}]*width:min\(380px/)
  assert.match(css, /\.fsdb-share-panel\{[^}]*background:var\(--biu-color-bg-popover\)/)
  assert.doesNotMatch(css, /\.fsdb-share-panel\{[^}]*background:var\(--biu-color-surface/)
  assert.match(css, /\.fsdb-share-panel\.is-embedded\{position:static\}/)
  assert.match(css, /\.fsdb-share-toggle\.is-on/)
  assert.match(css, /\.fsdb-share-link-row/)
  assert.match(css, /\.fsdb-share-invite-row\{[^}]*grid-template-columns:minmax\(0,1fr\) 78px 52px/)
})

test('open share panel sits above the table toolbar', () => {
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(css, /\.fsdb-page \.tasks-toolbar\{[^}]*z-index:50/)
  assert.match(css, /\.fsdb-right \.chat-view-header:has\(\.fsdb-share-panel\)[\s\S]{0,80}\{[^}]*z-index:var\(--biu-z-dropdown\)/)
})

test('permission column opens the same kind of chain as data scope', () => {
  const src = readShareUiSource()
  const labelSrc = readFileSync(resolve(import.meta.dirname, './share-scope-label.tsx'), 'utf8')
  const browser =
    readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, './browser-cell-renderer.tsx'), 'utf8')
  const detailSrc = readFileSync(resolve(import.meta.dirname, './share-chain-detail.tsx'), 'utf8')
  const authzApiSrc = readFileSync(resolve(import.meta.dirname, './authz-api.ts'), 'utf8')
  assert.match(detailSrc, /aria-label="我的权限"/)
  assert.match(authzApiSrc, /\/api\/db\/access-explain/)
  assert.match(detailSrc, /fetchAccessExplanation\(/)
  assert.match(detailSrc, /fsdb-scope-tree/)
  assert.match(detailSrc, /当前生效/)
  assert.doesNotMatch(detailSrc, /取最宽|取较高/)
  assert.match(src, /data-testid="fsdb-role-tag"/)
  assert.match(labelSrc, /export function ShareRoleLabel/)
  assert.match(browser, /key === 'shareRole'/)
  assert.match(browser, /<ShareRoleDetail/)
  assert.match(browser, /fallback=\{<ShareRoleLabel label=\{props\.label\} \/>\}/)
  assert.doesNotMatch(browser, /if \(localData\) return <span>\{String\(row\[key\]/)
  const hook = detailSrc.slice(detailSrc.indexOf('function useAccessExplanation'), detailSrc.indexOf('export function ShareScopeDetail'))
  assert.ok(hook.indexOf('if (!open)') >= 0)
  assert.ok(hook.indexOf('if (!open)') < hook.indexOf('fetchAccessExplanation('))
  assert.doesNotMatch(detailSrc, /\/api\/account\/access/)
})

test('private records grant workspace members and member views from unified search and edit roles inline', () => {
  const src = readShareUiSource()
  assert.match(src, /搜索空间成员或成员视图/)
  assert.match(src, /inline\s*\n\s*value=\{[^}]*row\.role/)
  assert.match(src, /isAgentReadOnly/)
  assert.match(src, /代理分享仅开放聊天记录（只读）/)
  const sidebarSrc = readFileSync(resolve(import.meta.dirname, './data-sidebar.tsx'), 'utf8')
  assert.match(sidebarSrc, /sidebar-collection-kind-/)
  assert.match(sidebarSrc, /ShieldCheckIcon/)
  assert.match(sidebarSrc, /LinkIcon/)
  assert.match(sidebarSrc, /纯私人数据 · 仅自己可见/)
  assert.match(src, /调整 \$\{row\.name\} 的权限/)
  assert.match(src, /renderShareAvatar\(row\.id \|\| row\.name, row\.avatar, \{ extraClass: 'is-sm', size: 26 \}\)/)
  assert.match(src, /<AiAvatar seed=/)
  assert.match(src, /String\(row\.title \?\? ''\)\.trim\(\) \|\| String\(row\.name \?\? ''\)\.trim\(\) \|\| email/)
  assert.match(src, /columns: \['title', 'name', 'avatar', 'email', 'role', 'membershipKind'\]/)
  assert.doesNotMatch(src, /由我授权/)
  assert.match(src, /row\.canEdit !== false/)
  assert.match(src, /row\.canRevoke !== false/)
  assert.match(src, /revoke\('member_view', row\.id\)/)
  assert.match(src, /\/api\/db\/member-views/)
  assert.doesNotMatch(src, /\/api\/account\/groups|VIEW_ROLE_OPTIONS|inheritedInternal/)
  const dismissSrc = readFileSync(resolve(import.meta.dirname, '../../../biu-ui/src/headless-dismiss.tsx'), 'utf8')
  assert.match(dismissSrc, /\.fsdb-share-select-menu/)
})

test('share panel separates public sharing from internal and external collaboration', () => {
  const src = readShareUiSource()
  const accountHost = readFileSync(resolve(import.meta.dirname, '../../../host-account/src/host/index.ts'), 'utf8')
  const databaseHost =
    readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, '../host/http-routes.ts'), 'utf8')
  assert.match(src, /公开分享/)
  assert.match(src, /邀请协作/)
  assert.match(src, /export \{ ShareScopeLabel[, }]/ )
  assert.match(readFileSync(resolve(import.meta.dirname, './share-scope-label.tsx'), 'utf8'), /export function ShareScopeLabel/)
  assert.match(readFileSync(resolve(import.meta.dirname, './share-scope-label.tsx'), 'utf8'), /UserGroupIcon/)
  assert.doesNotMatch(readFileSync(resolve(import.meta.dirname, './share-scope-label.tsx'), 'utf8'), /ShareIcon/)
  assert.match(src, /export function ShareScopeDetail/)
  assert.match(src, /可见范围/)
  assert.match(src, /fsdb-scope-sections/)
  assert.match(src, /<ScopeMark scope=\{chip\} \/>/)
  assert.doesNotMatch(src, /ScopeMark scope=\{label \|\| scope\}/)
  assert.match(src, /内部协作者/)
  assert.match(src, /外部协作者/)
  assert.match(src, /collaboratorKind/)
  assert.match(src, /data-testid="fsdb-share-member-search"/)
  assert.match(src, /path: WORKSPACE_MEMBERS_COLLECTION_PATH/)
  assert.match(src, /role="combobox"/)
  assert.match(src, /method: 'DELETE'/)
  assert.match(accountHost, /DELETE', '\/api\/account\/access'/)
  assert.match(databaseHost, /externallySharedRecords/)
  assert.match(databaseHost, /collab:/)
})

test('table titles do not show a cloud mark', () => {
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const databaseHost =
    readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, '../host/http-routes.ts'), 'utf8')
  assert.doesNotMatch(browser, /aria-label="云端"/)
  assert.doesNotMatch(browser, /row\.remote === true/)
  assert.doesNotMatch(databaseHost, /remote: true/)
})

test('device workspace keeps LAN links but hides collaboration and cloud publishing', () => {
  const src = readShareUiSource()
  const browser =
    readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, './browser-cell-renderer.tsx'), 'utf8')
  const databaseHost =
    readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, '../host/http-routes.ts'), 'utf8')
  const sharesPost = databaseHost.slice(databaseHost.indexOf("POST', '/api/db/shares'"), databaseHost.indexOf("GET', '/api/share/:token'"))
  assert.match(src, /localOnly \? '局域网分享' : '公开分享'/)
  assert.match(src, /!localOnly && target\.recordId/)
  assert.match(src, /同一局域网/)
  assert.match(browser, /localOnly=\{localData\}/)
  assert.match(browser, /localOnly=\{localKnown \? localData : null\}/)
  assert.match(browser, /if \(key === 'shareScope'\)/)
  assert.match(browser, /if \(key === 'shareRole'\)/)
  assert.doesNotMatch(browser, /if \(surface === 'table'\) return <ShareScopeLabel/)
  assert.match(databaseHost, /activeDataLocation\(\) === 'cloud'/)
  assert.doesNotMatch(databaseHost, /publishToCloud/)
  assert.doesNotMatch(sharesPost, /localIds/)
  assert.doesNotMatch(sharesPost, /body.enabled !== false/)
  assert.match(databaseHost, /GET', '\/api\/db\/shares'/)
})

test('list permission column uses the same capsule and loads the chain on click', () => {
  const src = readShareUiSource()
  const labelSrc = readFileSync(resolve(import.meta.dirname, './share-scope-label.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  const browser =
    readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, './browser-cell-renderer.tsx'), 'utf8')
  assert.match(src, /data-testid="fsdb-role-tag"/)
  assert.match(labelSrc, /className=\{`fsdb-scope-tag is-\$\{accessTone\(label\)\}`\}/)
  assert.match(css, /\.fsdb-scope-tag\.is-manage[^{]*\{[^}]*--biu-tag:var\(--biu-color-ink-purple\)/)
  assert.match(css, /\.fsdb-scope-tag\.is-edit[^{]*\{[^}]*--biu-tag:var\(--biu-color-ink-green\)/)
  assert.match(css, /\.fsdb-scope-tag\.is-read[^{]*\{[^}]*--biu-tag:var\(--biu-color-ink-gray\)/)
  assert.match(css, /\.fsdb-scope-tag\{[^}]*color:var\(--biu-tag\)/)
  assert.doesNotMatch(css, /\.fsdb-scope-tag\.is-manage[^{]*\{[^}]*--biu-color-text:/)
  assert.doesNotMatch(css, /\.fsdb-scope-tag\.is-manage[^{]*\{[^}]*#2c2c2b/)
  assert.match(
    css,
    /\.fsdb-scope-tag\.is-shared,[\s\S]*?--biu-tag:var\(--biu-color-ink-blue\)/,
  )
  assert.doesNotMatch(css, /\.fsdb-scope-tag\.is-edit[^{]*\{[^}]*#2383e2/)
  assert.match(browser, /fallback=\{<ShareRoleLabel label=\{props\.label\} \/>\}/)
  assert.match(browser, /if \(key === 'shareScope'\)/)
  assert.match(browser, /if \(key === 'shareRole'\)/)
  assert.match(browser, /localOnly=\{localKnown \? localData : null\}/)
})

test('builtin plugins keep shared ownership in the scope chain', () => {
  const detailSrc = readFileSync(resolve(import.meta.dirname, './share-chain-detail.tsx'), 'utf8')
  const explainSrc = readFileSync(resolve(import.meta.dirname, '../access-explanation.ts'), 'utf8')
  const browser =
    readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, './browser-cell-renderer.tsx'), 'utf8')
  const detail = detailSrc.slice(detailSrc.indexOf('export function ShareScopeDetail'), detailSrc.indexOf('export function ShareRoleDetail'))
  assert.match(detail, /builtin = false/)
  assert.match(detail, /const shown = scopeTone\(label\)/)
  assert.match(detail, /className=\{`fsdb-scope-tag is-\$\{chip\}`\}/)
  assert.match(detailSrc, /if \(builtin\) \{/)
  assert.match(explainSrc, /title: '内置插件'/)
  assert.match(explainSrc, /scope: 'shared'/)
  assert.match(browser, /builtin=\{collectionPath === PLUGINS_COLLECTION_PATH && row\.builtin === true\}/)
})

test('list share column uses the same capsule and loads the chain on click', () => {
  const src = readShareUiSource()
  const labelSrc = readFileSync(resolve(import.meta.dirname, './share-scope-label.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  const browser =
    readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, './browser-cell-renderer.tsx'), 'utf8')
  const detailSrc = readFileSync(resolve(import.meta.dirname, './share-chain-detail.tsx'), 'utf8')
  const hook = detailSrc.slice(detailSrc.indexOf('function useAccessExplanation'), detailSrc.indexOf('export function ShareScopeDetail'))
  const openAt = hook.indexOf('if (!open)')
  const explainAt = hook.indexOf('fetchAccessExplanation(')
  assert.ok(openAt >= 0)
  assert.ok(openAt < explainAt)
  assert.match(src, /data-testid="fsdb-scope-tag"/)
  assert.match(labelSrc, /className=\{`fsdb-scope-tag is-\$\{scopeTone\(label\)\}`\}/)
  assert.doesNotMatch(browser, /groupBy === 'shareScope' \? <ShareScopeLabel/)
  assert.match(css, /\.fsdb-scope-tag\{[^}]*border-radius:var\(--biu-radius-sm\)/)
  assert.match(css, /\.fsdb-scope-tag\{[^}]*height:var\(--biu-space-5\)/)
  assert.match(
    css,
    /\.fsdb-scope-tag\.is-personal,\.fsdb-scope-pill\.is-personal,\.fsdb-scope-tag\.is-read,\.fsdb-scope-pill\.is-read\{--biu-tag:var\(--biu-color-ink-gray\)\}/,
  )
  assert.match(
    css,
    /\.fsdb-scope-tag\.is-workspace,[\s\S]*?--biu-tag:var\(--biu-color-ink-green\)/,
  )
  assert.doesNotMatch(css, /\.fsdb-scope-tag\.is-workspace\{[^}]*--biu-color-text/)
  assert.match(browser, /fallback=\{<ShareScopeLabel label=\{props\.label\} \/>\}/)
  assert.match(browser, /if \(key === 'shareScope'\)/)
  assert.match(browser, /if \(key === 'shareRole'\)/)
})

test('device share scope detail explains lan record links via unified access-explain endpoint', () => {
  const detailSrc = readFileSync(resolve(import.meta.dirname, './share-chain-detail.tsx'), 'utf8')
  const explainSrc = readFileSync(resolve(import.meta.dirname, '../access-explanation.ts'), 'utf8')
  const host =
    readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, '../host/access-policy.ts'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, '../host/http-routes.ts'), 'utf8')
  assert.match(detailSrc, /localOnly == null/)
  assert.match(detailSrc, /fetchAccessExplanation\(/)
  assert.match(readFileSync(resolve(import.meta.dirname, './authz-api.ts'), 'utf8'), /\/api\/db\/access-explain/)
  assert.doesNotMatch(detailSrc, /\/api\/account\/access/)
  assert.doesNotMatch(detailSrc, /未单独开链接|取最宽/)
  assert.match(explainSrc, /已开启局域网分享/)
  assert.match(host, /GET', '\/api\/db\/access-explain'/)
  assert.match(host, /this\.host\.deviceWorkspace\(\)/)
  assert.match(host, /enum: \['私人', '共享'\]/)
  assert.doesNotMatch(sharesPostOf(host), /markPublicView/)
})

test('device workspace access read answers locally instead of 404', () => {
  const src = readFileSync(resolve(process.cwd(), 'packages/host-account/src/host/index.ts'), 'utf8')
  const get = src.slice(src.indexOf("GET', '/api/account/access'"), src.indexOf("POST', '/api/account/access'"))
  const post = src.slice(src.indexOf("POST', '/api/account/access'"), src.indexOf("DELETE', '/api/account/access'"))
  assert.match(get, /workspaceLocation\(activeWorkspace\) !== 'cloud'/)
  assert.match(get, /local: true/)
  assert.doesNotMatch(get, /requireCollaborativeWorkspace/)
  assert.match(post, /requireCollaborativeWorkspace/)
})

function sharesPostOf(host: string) {
  return host.slice(host.indexOf("POST', '/api/db/shares'"), host.indexOf("GET', '/api/share/:token'"))
}

test('collaborator sections are stacked without a redundant popover heading', () => {
  const src = readShareUiSource()
  const internalAt = src.indexOf('<h3>内部协作者</h3>')
  const externalAt = src.indexOf('<h3>外部协作者</h3>')
  assert.ok(internalAt >= 0)
  assert.ok(externalAt > internalAt)
  assert.doesNotMatch(src, /<header className="fsdb-share-head">/)
  assert.doesNotMatch(src, /aria-label="协作者类型"/)
})

test('table share/role suspense fallbacks render capsule labels immediately without plain-text flash', () => {
  const renderer = readFileSync(resolve(import.meta.dirname, './browser-cell-renderer.tsx'), 'utf8')
  assert.match(renderer, /fallback=\{<ShareRoleLabel label=\{props\.label\} \/>\}/)
  assert.match(renderer, /fallback=\{<ShareScopeLabel label=\{props\.label\} \/>\}/)
  assert.doesNotMatch(renderer, /fallback=\{<span>\{props\.label\}<\/span>\}/)
})

test('share panel exposes inheritance toggle wired to PATCH /api/account/access', () => {
  const src = readShareUiSource()
  const accountHost = readFileSync(resolve(import.meta.dirname, '../../../host-account/src/host/index.ts'), 'utf8')
  assert.match(src, /testId="fsdb-share-inherit-toggle"/)
  assert.match(src, /继承上级权限/)
  assert.match(src, /method: 'PATCH'/)
  assert.match(src, /inheritanceMode/)
  assert.match(accountHost, /PATCH', '\/api\/account\/access'/)
})

test('ShareSelect calls useFloatingPosition with positional (anchor, menuRef, opts) arguments', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-controls.tsx'), 'utf8')
  const batchSrc = readFileSync(resolve(import.meta.dirname, './batch-share-dialog.tsx'), 'utf8')
  assert.match(src, /useFloatingPosition\(open \? triggerRef\.current : null,\s*menuRef,\s*\{/)
  assert.doesNotMatch(src, /useFloatingPosition\(\{\s*anchor:/)
  assert.match(batchSrc, /from '\.\/share-controls\.tsx'/)
  assert.doesNotMatch(batchSrc, /function BatchSelect/)
})

test('commenter role maps consistently, ShareButton checks inheritedShare & memberViews, and dead grantedBy code is removed', async () => {
  const popover = readShareUiSource()
  const labels = readFileSync(resolve(import.meta.dirname, '../shared/authz-labels.ts'), 'utf8')
  const { roleActionLabel, accessLabel } = await import('../shared/authz-labels.ts')
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  const accountHost = readFileSync(resolve(import.meta.dirname, '../../../host-account/src/host/index.ts'), 'utf8')

  assert.equal(roleActionLabel('commenter'), '可评论')
  assert.equal(roleActionLabel('评论'), '可评论')
  assert.equal(accessLabel('commenter'), '评论')
  assert.equal(accessLabel('评论'), '评论')
  assert.match(labels, /SHARE_ROLE_ENUM.*'评论'/)
  assert.match(css, /\.fsdb-scope-tag\.is-comment/)
  assert.match(popover, /if \(shareData\.share \|\| shareData\.inheritedShare\)/)
  assert.match(popover, /accessData\?\.memberViews\?\.length/)
  assert.doesNotMatch(popover, /accessData\?\.groups/)
  assert.doesNotMatch(popover, /grantedBy/)
  assert.doesNotMatch(accountHost, /'restricted'/)
  assert.match(accountHost, /无效的权限角色/)
})
