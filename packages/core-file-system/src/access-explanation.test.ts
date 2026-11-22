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

test('view grants for other users appear in visibility audience but never leak into myAccess', () => {
  const result = buildAccessExplanation({
    collection: '/tasks',
    recordId: 't1',
    recordTitle: '接口联调',
    tableLabel: '任务',
    localOnly: false,
    record: { id: 't1', title: '接口联调', status: '公开' },
    dataViews: [
      { id: 'v-public', name: '对外看板', filters: { status: '公开' } },
    ],
    memberViews: [
      { id: 'mv-ext', name: '外部客户', filters: { membershipKind: 'external' } },
    ],
    access: {
      scope: 'personal',
      ownerId: 'u-alice',
      people: [
        { id: 'u-alice', name: 'Alice', role: 'owner', memberKind: 'member' },
        { id: 'u-bob', name: 'Bob', role: 'viewer', memberKind: 'member' },
      ],
      groups: [],
      memberViews: [],
      viewGrants: [
        {
          viewId: 'v-public',
          subjectType: 'member_view',
          subjectId: 'mv-ext',
          role: 'manager',
          name: 'mv-ext',
          memberKind: 'external',
          matchesActor: false,
        },
      ],
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
  assert.equal(result.audience.fromViews.length, 1)
  assert.equal(result.audience.fromViews[0]?.viewName, '对外看板')
  assert.equal(result.audience.fromViews[0]?.subjectName, '外部客户')
  // Bob 的个人权限不受别人（外部客户）视图上的 manager 授权污染
  assert.equal(result.myAccess.effectiveRole, 'viewer')
  assert.equal(result.myAccess.paths.length, 1)
  assert.equal(result.myAccess.paths[0]?.kind, 'direct')
})

test('multi-level inheritance chain resolves real ancestor titles and ranks primary vs secondary paths', () => {
  const result = buildAccessExplanation({
    collection: '/pages',
    recordId: 'p-leaf',
    recordTitle: '登录页设计',
    tableLabel: '页面',
    localOnly: false,
    record: { id: 'p-leaf', title: '登录页设计', category: '前端' },
    dataViews: [
      { id: 'v-fe', name: '前端文档', filters: { category: '前端' } },
    ],
    memberViews: [
      { id: 'mv-dev', name: '研发部', filters: { department: 'dev' } },
    ],
    recordTitles: {
      '/pages\tp-root': '项目 A',
      '/pages\tp-mid': '需求池',
      '/pages\tp-leaf': '登录页设计',
    },
    access: {
      scope: 'personal',
      ownerId: 'u-alice',
      people: [],
      groups: [],
      memberViews: [],
      viewGrants: [
        {
          viewId: 'v-fe',
          subjectType: 'member_view',
          subjectId: 'mv-dev',
          role: 'viewer',
          name: 'mv-dev',
          memberKind: 'member',
          matchesActor: true,
        },
      ],
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
          detail: '通过成员视图授权',
          role: 'editor',
          source: 'view-grant',
        },
      ],
      inheritance: {
        mode: 'inherit',
        ancestors: [
          {
            collection: '/pages',
            recordId: 'p-root',
            scope: 'workspace',
            ownerId: 'u-alice',
            people: [],
            groups: [],
            memberViews: [{ id: 'mv-dev', role: 'editor' }],
          },
          {
            collection: '/pages',
            recordId: 'p-mid',
            scope: 'personal',
            ownerId: 'u-alice',
            people: [],
            groups: [],
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

  assert.equal(result.myAccess.effectiveRole, 'editor')
  assert.equal(result.myAccess.primarySummary, '继承自上级「项目 A」')
  assert.equal(result.myAccess.paths.length, 2)

  const primary = result.myAccess.paths[0]!
  assert.equal(primary.isPrimary, true)
  assert.equal(primary.kind, 'inherited')
  assert.deepEqual(
    primary.chain?.map((n) => n.title),
    ['项目 A', '需求池', '登录页设计'],
  )
  assert.equal(primary.chain?.[0]?.note, '通过成员视图授权')
  assert.equal(primary.chain?.[1]?.note, '继承上级权限')
  assert.equal(primary.chain?.[2]?.note, '继承上级权限')

  const secondary = result.myAccess.paths[1]!
  assert.equal(secondary.isPrimary, false)
  assert.equal(secondary.kind, 'data_view')
  assert.equal(secondary.title, '视图「前端文档」')
  assert.equal(secondary.reason, '你属于成员视图「研发部」')
})
