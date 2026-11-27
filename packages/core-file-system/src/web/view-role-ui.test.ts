import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { canDeleteSavedView, canEditSavedView, normalizeViewRole } from '../shared/saved-view.ts'
import { mergeSavedViewLists, savedViewFromRecord } from './view-storage.ts'
import { SavedViewsStore } from '../host/saved-views.ts'

describe('view role permissions & UI guards', () => {
  it('maps viewRole to edit/delete capabilities accurately', () => {
    assert.equal(normalizeViewRole('owner'), 'owner')
    assert.equal(normalizeViewRole('manager'), 'manager')
    assert.equal(normalizeViewRole('editor'), 'editor')
    assert.equal(normalizeViewRole('commenter'), 'commenter')
    assert.equal(normalizeViewRole('viewer'), 'viewer')
    assert.equal(normalizeViewRole('invalid'), undefined)

    assert.equal(canEditSavedView({ viewRole: 'owner' }), true)
    assert.equal(canEditSavedView({ viewRole: 'manager' }), true)
    assert.equal(canEditSavedView({ viewRole: 'editor' }), true)
    assert.equal(canEditSavedView({ viewRole: 'commenter' }), false)
    assert.equal(canEditSavedView({ viewRole: 'viewer' }), false)
    assert.equal(canEditSavedView({}), true)

    assert.equal(canDeleteSavedView({ viewRole: 'owner' }), true)
    assert.equal(canDeleteSavedView({ viewRole: 'manager' }), true)
    assert.equal(canDeleteSavedView({ viewRole: 'editor' }), false)
    assert.equal(canDeleteSavedView({ viewRole: 'commenter' }), false)
    assert.equal(canDeleteSavedView({ viewRole: 'viewer' }), false)
    assert.equal(canDeleteSavedView({}), true)
  })

  it('propagates and updates viewRole through savedViewFromRecord and mergeSavedViewLists', () => {
    const v1 = savedViewFromRecord({
      viewId: 'v-1',
      title: '测试视图',
      mode: 'table',
      viewRole: 'viewer',
      updatedAt: 1000,
    })
    assert.equal(v1?.viewRole, 'viewer')

    const v2 = savedViewFromRecord({
      viewId: 'v-1',
      title: '测试视图',
      mode: 'table',
      viewRole: 'editor',
      updatedAt: 1000,
    })
    const merged = mergeSavedViewLists([v1!], [v2!])
    assert.equal(merged[0]?.viewRole, 'editor')
  })

  it('SavedViewsStore.rows emits viewRole resolved by policyGuard.viewRoleFor', () => {
    const store = new SavedViewsStore()
    store.open(':memory:')
    store.setWorkspaceResolver(() => 'ws-1')
    store.setPolicyGuard({
      canSeeView: () => true,
      viewRoleFor: (_ws, _col, view, accountId) => {
        if (view.createdBy === accountId) return 'owner'
        return view.id === 'v-edit' ? 'editor' : 'viewer'
      },
    })
    store.applyPatch('/pages', {
      upsert: [
        { id: 'v-edit', name: '编辑视图', createdBy: 'acc-a', accessMode: 'private' },
        { id: 'v-read', name: '查看视图', createdBy: 'acc-a', accessMode: 'private' },
      ],
    }, 'acc-a', 'ws-1')

    const rows = store.rows([{ id: 'pages', path: '/pages', label: '页面', kind: 'collection', view: { title: '页面' } } as never], 'acc-b', 'ws-1')
    assert.equal(rows.find((r) => r.viewId === 'v-edit')?.viewRole, 'editor')
    assert.equal(rows.find((r) => r.viewId === 'v-read')?.viewRole, 'viewer')
  })

  it('enforces viewRole across toolbar H1, ViewSettingsMenu, ViewOrderMenu, CRUD, SharePopover, and /api/db/shares', () => {
    const toolbarSrc = readFileSync(resolve(import.meta.dirname, './browser-toolbar.tsx'), 'utf8')
    const settingsSrc = readFileSync(resolve(import.meta.dirname, './view-settings-menu.tsx'), 'utf8')
    const orderSrc = readFileSync(resolve(import.meta.dirname, './view-order-menu.tsx'), 'utf8')
    const crudSrc = readFileSync(resolve(import.meta.dirname, './use-browser-view-crud.ts'), 'utf8')
    const shareSrc = readFileSync(resolve(import.meta.dirname, './share-popover.tsx'), 'utf8')
    const routesSrc = readFileSync(resolve(import.meta.dirname, '../host/http-routes.ts'), 'utf8')

    // H1 view title only renders editable input when canEditSavedView(activeView)
    assert.match(toolbarSrc, /activeView && canEditSavedView\(activeView\)/)
    // ViewSettingsMenu uses canEditSavedView & canManageSavedView and omits permission/lock rows
    assert.match(settingsSrc, /canEditSavedView\(activeView\)/)
    assert.match(settingsSrc, /canManageSavedView\(activeView\)/)
    assert.doesNotMatch(settingsSrc, /fsdb-vset-share-row|fsdb-vset-lock-row/)
    // ViewOrderMenu gates delete per view via canDeleteSavedView(view) and last workspace view protection
    assert.match(orderSrc, /canRemove=\{canRemove && canDeleteSavedView\(view\) && canRemoveCollectionView\(views, view\)\}/)
    // CRUD keeps viewer edits local-only without server POST or localStorage pollution
    assert.match(crudSrc, /if \(!externalViews && !canEditSavedView\(current\)\)/)
    assert.match(crudSrc, /if \(!externalViews && !canEditSavedView\(target\)\) return/)
    assert.match(crudSrc, /if \(!canDeleteSavedView\(view\)\) return/)
    // SharePopover only handles record sharing (no dead view-sharing branches)
    assert.doesNotMatch(shareSrc, /VIEW_ROLE_OPTIONS|hidePublicTab|inheritedInternal/)
    // POST /api/db/shares only allows record shares
    assert.match(routesSrc, /body\.kind !== 'record'/)
  })
})
