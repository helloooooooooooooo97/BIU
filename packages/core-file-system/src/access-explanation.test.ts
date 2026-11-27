import assert from 'node:assert/strict'
import { test } from 'vitest'
import { buildAccessExplanation } from './access-explanation.ts'

test('local workspace with LAN link reports clean summary without contradictory rows', () => {
  const result = buildAccessExplanation({
    collection: '/pages',
    recordId: 'p1',
    recordTitle: '周报',
    localOnly: true,
    fallbackRole: 'owner',
    publicShares: [
      { kind: 'record', collection: '/pages', recordId: 'p1' },
    ],
  })

  assert.equal(result.visibility.scope, 'shared')
  assert.equal(result.visibility.summary, '已开启局域网分享')
  assert.equal(result.audience.publicLinks.length, 1)
  assert.equal(result.audience.publicLinks[0]?.kind, 'record')
  assert.equal(result.audience.publicLinks[0]?.lanOnly, true)
  assert.equal(result.myAccess.effectiveRole, 'owner')
  assert.equal(result.myAccess.primarySummary, '你是这条内容的创建者')
  assert.equal(result.myAccess.paths.length, 1)
  assert.equal(result.myAccess.paths[0]?.kind, 'ownership')
})

test('builtin plugin explanation returns shared visibility and viewer role', () => {
  const result = buildAccessExplanation({
    collection: '/plugins',
    recordId: 'core-page',
    builtin: true,
    localOnly: false,
  })

  assert.equal(result.visibility.scope, 'shared')
  assert.equal(result.myAccess.effectiveRole, 'viewer')
  assert.equal(result.myAccess.paths[0]?.title, '内置插件')
})

test('external collaborator appears in visibility audience without overriding actor direct role', () => {
  const result = buildAccessExplanation({
    collection: '/tasks',
    recordId: 't1',
    recordTitle: '接口联调',
    tableLabel: '任务',
    localOnly: false,
    access: {
      scope: 'personal',
      ownerId: 'u-alice',
      people: [
        { id: 'u-alice', name: 'Alice', role: 'owner', memberKind: 'member' },
        { id: 'u-bob', name: 'Bob', role: 'viewer', memberKind: 'member' },
        { id: 'u-ext', name: '外部客户', role: 'manager', memberKind: 'external' },
      ],
      memberViews: [],
      roleChain: [
        {
          id: 'ws\t/tasks\tt1',
          collection: '/tasks',
          recordId: 't1',
          title: '这条内容',
          detail: '直接授权给你',
          role: 'viewer',
          source: 'direct-grant',
        },
      ],
      inheritance: { mode: 'custom', ancestors: [] },
    },
  })

  assert.equal(result.visibility.scope, 'shared')
  assert.equal(result.audience.direct.some((item) => item.subjectName === '外部客户' && item.audienceKind === 'external'), true)
  assert.equal(result.myAccess.effectiveRole, 'viewer')
  assert.equal(result.myAccess.paths.length, 1)
  assert.equal(result.myAccess.paths[0]?.kind, 'direct')
})

test('multi-level inheritance chain resolves real ancestor titles and member view grants', () => {
  const result = buildAccessExplanation({
    collection: '/pages',
    recordId: 'p-leaf',
    recordTitle: '登录页设计',
    tableLabel: '页面',
    localOnly: false,
    recordTitles: {
      '/pages\tp-root': '项目 A',
      '/pages\tp-mid': '需求池',
      '/pages\tp-leaf': '登录页设计',
    },
    access: {
      scope: 'personal',
      ownerId: 'u-alice',
      people: [],
      memberViews: [],
      roleChain: [
        {
          id: 'ws\t/pages\tp-leaf',
          collection: '/pages',
          recordId: 'p-leaf',
          title: '这条内容',
          detail: '继承上级权限',
          role: 'editor',
          source: 'inherited',
        },
        {
          id: 'ws\t/pages\tp-mid',
          collection: '/pages',
          recordId: 'p-mid',
          title: '上一级内容',
          detail: '继承上级权限',
          role: 'editor',
          source: 'inherited',
        },
        {
          id: 'ws\t/pages\tp-root',
          collection: '/pages',
          recordId: 'p-root',
          title: '上一级内容',
          detail: '通过锁定成员视图授权',
          role: 'editor',
          source: 'member-view-grant',
        },
      ],
      inheritance: {
        mode: 'inherit',
        ancestors: [
          {
            collection: '/pages',
            recordId: 'p-root',
            scope: 'shared',
            ownerId: 'u-alice',
            people: [],
            memberViews: [{ id: 'mv-dev', name: '研发部', role: 'editor' }],
          },
          {
            collection: '/pages',
            recordId: 'p-mid',
            scope: 'personal',
            ownerId: 'u-alice',
            people: [],
            memberViews: [],
          },
        ],
      },
    },
  })

  assert.equal(result.inheritance.mode, 'inherit')
  assert.deepEqual(
    result.inheritance.ancestors.map((a) => a.title),
    ['项目 A', '需求池'],
  )
  assert.equal(result.audience.inherited[0]?.sourceTitle, '项目 A')
  assert.equal(result.audience.inherited[0]?.subjectName, '研发部')
  assert.equal(result.audience.inherited[0]?.subjectType, 'member_view')

  assert.equal(result.myAccess.effectiveRole, 'editor')
  assert.equal(result.myAccess.primarySummary, '继承自上级「项目 A」')
  assert.equal(result.myAccess.paths.length, 1)

  const primary = result.myAccess.paths[0]!
  assert.equal(primary.isPrimary, true)
  assert.equal(primary.kind, 'inherited')
  assert.deepEqual(
    primary.chain?.map((n) => n.title),
    ['项目 A', '需求池', '登录页设计'],
  )
  assert.equal(primary.chain?.[0]?.note, '通过锁定成员视图授权')
  assert.equal(primary.chain?.[1]?.note, '继承上级权限')
  assert.equal(primary.chain?.[2]?.note, '继承上级权限')
})

test('buildAccessExplanation propagates ancestor public links when inheriting and stays orthogonal to personal scope', () => {
  const inherited = buildAccessExplanation({
    collection: '/pages',
    recordId: 'child-1',
    recordTitle: '需求文档',
    localOnly: false,
    publicShares: [{ kind: 'record', collection: '/pages', recordId: 'parent-1' }],
    recordTitles: {
      '/pages\tparent-1': '项目总览',
      '/pages\tchild-1': '需求文档',
    },
    access: {
      scope: 'personal',
      ownerId: 'u-ada',
      people: [],
      memberViews: [],
      roleChain: [{ id: 'own', title: '这条内容', detail: '你是创建者', role: 'owner', source: 'ownership' }],
      inheritance: {
        mode: 'inherit',
        ancestors: [
          {
            collection: '/pages',
            recordId: 'parent-1',
            title: '项目总览',
            scope: 'personal',
            ownerId: 'u-ada',
            people: [],
            memberViews: [],
          },
        ],
      },
    },
  })

  // Public link is orthogonal to internal 3-state scope: remains 'personal' with hasExternal=true
  assert.equal(inherited.visibility.scope, 'personal')
  assert.equal(inherited.visibility.hasExternal, true)
  assert.equal(inherited.audience.publicLinks.length, 1)
  assert.deepEqual(inherited.audience.publicLinks[0]?.inheritedFrom, {
    collection: '/pages',
    recordId: 'parent-1',
    title: '项目总览',
  })

  // Detached (mode='custom') child does NOT inherit parent's public link
  const detached = buildAccessExplanation({
    collection: '/pages',
    recordId: 'child-secret',
    recordTitle: '内部报价',
    localOnly: false,
    publicShares: [{ kind: 'record', collection: '/pages', recordId: 'parent-1' }],
    access: {
      scope: 'personal',
      ownerId: 'u-ada',
      people: [],
      memberViews: [],
      roleChain: [{ id: 'own', title: '这条内容', detail: '你是创建者', role: 'owner', source: 'ownership' }],
      inheritance: {
        mode: 'custom',
        ancestors: [],
      },
    },
  })
  assert.equal(detached.visibility.scope, 'personal')
  assert.equal(detached.visibility.hasExternal, false)
  assert.equal(detached.audience.publicLinks.length, 0)
})

test('buildAccessExplanation honors memberDefaultRole and keeps workspace_members even when ancestor also has direct grants', () => {
  const result = buildAccessExplanation({
    collection: '/pages',
    recordId: 'child-ws',
    recordTitle: '子页',
    localOnly: false,
    access: {
      scope: 'workspace',
      memberDefaultRole: 'viewer',
      ownerId: 'u-ada',
      people: [],
      memberViews: [],
      roleChain: [{ id: 'own', title: '这条内容', detail: '你是创建者', role: 'owner', source: 'ownership' }],
      inheritance: {
        mode: 'inherit',
        ancestors: [
          {
            collection: '/pages',
            recordId: 'parent-ws',
            title: '空间父页',
            scope: 'workspace',
            memberDefaultRole: 'viewer',
            ownerId: 'u-ada',
            people: [
              { id: 'u-ada', name: 'Ada', role: 'owner', memberKind: 'member' },
              { id: 'u-bob', name: 'Bob', role: 'editor', memberKind: 'member' },
            ],
            memberViews: [],
          },
        ],
      },
    },
  })

  const wsEntry = result.audience.inherited.find((item) => item.subjectType === 'workspace_members')
  assert.ok(wsEntry, 'workspace_members must not be dropped when ancestor also has direct grants')
  assert.equal(wsEntry?.role, 'viewer')

  const directWs = buildAccessExplanation({
    collection: '/pages',
    recordId: 'direct-ws',
    recordTitle: '只读空间页',
    localOnly: false,
    access: {
      scope: 'workspace',
      memberDefaultRole: 'viewer',
      ownerId: 'u-ada',
      people: [],
      memberViews: [],
      roleChain: [{ id: 'own', title: '这条内容', detail: '你是创建者', role: 'owner', source: 'ownership' }],
      inheritance: { mode: 'custom', ancestors: [] },
    },
  })
  const directWsEntry = directWs.audience.direct.find((item) => item.subjectType === 'workspace_members')
  assert.equal(directWsEntry?.role, 'viewer')
})
