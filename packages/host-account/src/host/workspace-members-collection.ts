import { currentAccountId } from '@biu/host-plugin-loader/data-dir'
import {
  recordBuiltinValues,
  type CollectionListQuery,
  type CollectionSpec,
  type DbRecord,
} from '@biu/type-file-system'
import type { CollabStore } from './store.ts'

export const WORKSPACE_MEMBERS_COLLECTION_PATH = '/workspace-members'

type MemberRow = {
  id: string
  name: string
  display_name: string
  avatar?: string
  email: string
  role: string
  member_kind: 'member' | 'external' | 'guest'
  created_at: number
  last_active_at?: number
  status?: 'online' | 'active' | 'expired'
}

function asRecord(row: MemberRow): DbRecord {
  const lastActiveAt = row.last_active_at ?? row.created_at
  const nickname = row.display_name.trim() || row.name.trim() || row.email
  return {
    id: row.id,
    title: nickname,
    avatar: row.avatar ?? '',
    email: row.email,
    role: row.role,
    status: row.status ?? 'active',
    membershipKind: row.member_kind,
    lastActiveAt,
    joinedAt: row.created_at,
    ...recordBuiltinValues({ createdAt: row.created_at, updatedAt: lastActiveAt }),
  }
}

export function workspaceMembersCollection(
  store: CollabStore,
  collaborativeWorkspace: (workspaceId: string) => boolean = () => true,
  exposeView = true,
): CollectionSpec {
  const rows = () => {
    const workspaceId = store.activeWorkspaceId()
    if (!workspaceId) return []
    return store.currentMembers().map(asRecord)
  }
  const list = async (query?: CollectionListQuery) => {
    let items = rows()
    if (query?.ids?.length) {
      const wanted = new Set(query.ids)
      items = items.filter((row) => wanted.has(row.id))
    }
    const q = query?.q?.trim().toLowerCase() ?? ''
    if (q) {
      items = items.filter((row) => `${row.title} ${row.email} ${row.role}`.toLowerCase().includes(q))
    }
    return items
  }
  const identity = () => {
    const actorId = currentAccountId()
    const workspaceId = store.activeWorkspaceId()
    if (!actorId || !workspaceId) throw new Error('permission denied: UNAUTHENTICATED')
    return { actorId, workspaceId, collaborative: collaborativeWorkspace(workspaceId) }
  }
  return {
    id: 'workspace-members',
    path: WORKSPACE_MEMBERS_COLLECTION_PATH,
    label: '成员',
    ...(exposeView ? { view: {
      moduleId: 'workspace-members-db',
      route: '/db-workspace-members',
      title: '成员',
      inspector: true,
      blurb:
        '当前工作区成员目录。db_list 查看成员；Owner 可用 db_update 将 role 限定为 owner|admin|member|viewer；Owner/Admin 可用 db_create 邀请、db_delete 移除其有权管理的成员。viewer 只能查看获准的数据，不能创建或编辑。修改标签等元数据不会改变角色。',
      order: 18,
      icon: 'users',
    } } : {}),
    records: { update: true, create: true, delete: true, allocateId: false },
    schema: {
      columns: ['title', 'email', 'role', 'status', 'membershipKind', 'lastActiveAt', 'joinedAt'],
      fields: {
        title: { type: 'string', label: '空间昵称' },
        avatar: { type: 'string', label: '头像' },
        email: { type: 'string', label: '登录邮箱' },
        role: {
          type: 'select',
          label: '角色',
          enum: ['owner', 'admin', 'member', 'viewer'],
          enumLabels: { owner: '所有者', admin: '管理者', member: '编辑者', viewer: '查看者' },
          writable: true,
        },
        status: {
          type: 'select',
          label: '状态',
          enum: ['online', 'active', 'expired'],
          enumLabels: { online: '在线', active: '正常', expired: '已过期' },
        },
        membershipKind: {
          type: 'select',
          label: '成员类型',
          enum: ['member', 'external', 'guest'],
          enumLabels: { member: '空间成员', external: '外部成员', guest: '临时访客' },
        },
        lastActiveAt: { type: 'datetime', label: '最近活跃', sortable: true },
        joinedAt: { type: 'datetime', label: '加入时间', sortable: true },
      },
    },
    actions: [
      {
        id: 'invite',
        label: '邀请成员',
        description:
          '按登录邮箱把已注册账号加入当前工作区。path 固定用 /workspace-members/invite，args: { email: "member@example.com" }。',
        for: 'agent',
        placement: [],
        allowMissing: true,
        requiredAction: 'resource:create',
        parameters: {
          type: 'object',
          properties: { email: { type: 'string', description: '待加入成员的登录邮箱' } },
          required: ['email'],
        },
        run: (_id, _record, args = {}) => {
          const { actorId, workspaceId, collaborative } = identity()
          if (!collaborative) throw new Error('本机空间不提供邮箱邀请，局域网访问者会自动出现在成员列表')
          return store.addMemberByEmail(actorId, workspaceId, String(args.email ?? ''))
        },
      },
    ],
    list,
    get: async (id) => rows().find((row) => row.id === id) ?? null,
    create: async (records) => {
      const { actorId, workspaceId, collaborative } = identity()
      if (!collaborative) throw new Error('本机空间不提供邮箱邀请，局域网访问者会自动出现在成员列表')
      const created: DbRecord[] = []
      for (const record of records) {
        const email = String(record.email ?? '').trim()
        const members = store.addMemberByEmail(actorId, workspaceId, email)
        const member = members.find((row) => row.email === email.toLowerCase())
        if (!member) throw new Error('member was not created')
        created.push(asRecord(member))
      }
      return created
    },
    update: async (id, patch) => {
      const { actorId, workspaceId, collaborative } = identity()
      if (!collaborative) throw new Error('本机空间不能改成员角色')
      if (!('role' in patch)) {
        const current = rows().find((row) => row.id === id)
        if (!current) throw new Error('member not found')
        return current
      }
      const role = String(patch.role ?? '')
      if (role !== 'owner' && role !== 'admin' && role !== 'member' && role !== 'viewer') {
        throw new Error('role must be owner, admin, member or viewer')
      }
      return asRecord(store.updateMemberRole(actorId, workspaceId, id, role))
    },
    remove: async (query) => {
      const { actorId, workspaceId } = identity()
      const ids = query.ids ?? []
      for (const id of ids) store.removeMember(actorId, workspaceId, id)
      return ids
    },
  }
}
