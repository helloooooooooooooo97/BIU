import { useEffect, useMemo, useState } from 'react'
import { ArrowPathIcon, CpuChipIcon, UserIcon } from '@heroicons/react/16/solid'
import { resolveSessionMascot, SidebarMascot } from '@biu/public-mascot'
import { asPerson, asPersonList, personKey, type PersonValue } from '@biu/type-file-system'
import { PickOption, PickPanel } from '@biu/database-ui/search'
import { listCollection } from './db-client.ts'
import { showRecordInInspector } from './inspector-db-route.ts'
import { useWorkspaceProfile } from '@biu/biu-ui/use-workspace-profile'
import { profileDisplayName } from '@biu/biu-ui/workspace-profile'

type ChatPerson = {
  id: string
  name: string
  mascot?: { shape: string; color: string; eye?: number }
}

type MemberPerson = {
  id: string
  name: string
  email: string
}

let agentsInflight: Promise<ChatPerson[]> | null = null
let agentsListed: ChatPerson[] | null = null
let agentsListedAt = 0
const AGENTS_TTL_MS = 8000

let membersInflight: Promise<MemberPerson[]> | null = null
let membersListed: MemberPerson[] | null = null
let membersListedAt = 0
const MEMBERS_TTL_MS = 8000

export function personInspectTarget(person: PersonValue): { collection: string; recordId: string } | null {
  if (person.kind === 'agent') {
    const recordId = String(person.sessionId ?? '').trim()
    return recordId ? { collection: '/agents', recordId } : null
  }
  if (person.kind === 'user') {
    const recordId = String(person.accountId ?? '').trim()
    return recordId ? { collection: '/workspace-members', recordId } : null
  }
  return null
}

function openPersonInInspector(person: PersonValue) {
  const target = personInspectTarget(person)
  if (!target) return
  showRecordInInspector(target.collection, target.recordId)
}

export async function loadAgents(): Promise<ChatPerson[]> {
  if (agentsListed && Date.now() - agentsListedAt < AGENTS_TTL_MS) return agentsListed
  if (agentsInflight) return agentsInflight
  const request = listCollection({
    path: '/agents',
    limit: 500,
    sortField: 'updatedAt',
    sortDir: 'desc',
    columns: ['title', 'mascot'],
  })
    .then((page) => {
      const rows = page.items
        .filter((item) => typeof item?.id === 'string' && item.id)
        .map((item) => {
          const id = String(item.id)
          const mascot =
            item.mascot && typeof item.mascot === 'object' && !Array.isArray(item.mascot)
              ? (item.mascot as ChatPerson['mascot'])
              : undefined
          return {
            id,
            name: String(item.title ?? '').trim() || id.slice(0, 8),
            ...(mascot ? { mascot } : {}),
          }
        })
      agentsListed = rows
      agentsListedAt = Date.now()
      return rows
    })
    .finally(() => {
      agentsInflight = null
    })
  agentsInflight = request
  return request
}

export async function loadMembers(): Promise<MemberPerson[]> {
  if (membersListed && Date.now() - membersListedAt < MEMBERS_TTL_MS) return membersListed
  if (membersInflight) return membersInflight
  const request = listCollection({
    path: '/workspace-members',
    limit: 500,
    sortField: 'title',
    sortDir: 'asc',
    columns: ['title', 'name', 'email'],
  })
    .then((page) => {
      const rows = page.items
        .filter((item) => typeof item?.id === 'string' && item.id)
        .map((item) => {
          const id = String(item.id)
          const email = String(item.email ?? '').trim()
          const name = String(item.name ?? item.title ?? '').trim() || email || id.slice(0, 8)
          return { id, name, email }
        })
      membersListed = rows
      membersListedAt = Date.now()
      return rows
    })
    .catch(() => {
      membersListed = []
      membersListedAt = Date.now()
      return []
    })
    .finally(() => {
      membersInflight = null
    })
  membersInflight = request
  return request
}

export function PersonFace({ value, empty = '' }: { value: unknown; empty?: string }) {
  const profile = useWorkspaceProfile()
  const people = asPersonList(value)

  if (!people.length) {
    return empty ? (
      <span className="fsdb-person is-empty">
        <UserIcon aria-hidden className="size-[14px]" />
        {empty}
      </span>
    ) : null
  }

  return (
    <span className="fsdb-person-list">
      {people.map((person) => {
        const liveUser = person.kind === 'user' && (person.name === '用户' || person.name === profile.name)
        const label = (liveUser ? profileDisplayName(profile) : person.name) || empty
        const body = (
          <>
            {person.kind === 'agent' && (person.sessionId || person.mascot) ? (
              <span className="fsdb-person-face" aria-hidden>
                <SidebarMascot
                  size={18}
                  sessionId={person.sessionId || person.name}
                  identity={resolveSessionMascot(person.sessionId || person.name, person.mascot)}
                  title={label || person.sessionId}
                />
              </span>
            ) : liveUser && profile.avatar ? (
              <img className="fsdb-person-photo" src={profile.avatar} alt="" />
            ) : (
              <span className="fsdb-person-avatar" aria-hidden>
                {person.kind === 'system' ? <CpuChipIcon className="size-[14px]" /> : <UserIcon className="size-[14px]" />}
              </span>
            )}
            {label ? <span className="fsdb-person-name">{label}</span> : null}
          </>
        )
        if (person.url) {
          return (
            <a
              key={personKey(person) || person.name}
              className="fsdb-person is-link"
              href={person.url}
              title={label || undefined}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
            >
              {body}
            </a>
          )
        }
        const inspect = personInspectTarget(person)
        if (inspect) {
          return (
            <button
              key={personKey(person) || person.name}
              type="button"
              className="fsdb-person is-link"
              title={label ? `在右侧打开 ${label}` : '在右侧打开'}
              onClick={(event) => {
                event.stopPropagation()
                openPersonInInspector(person)
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {body}
            </button>
          )
        }
        return (
          <span key={personKey(person) || person.name} className="fsdb-person" title={label || undefined}>
            {body}
          </span>
        )
      })}
    </span>
  )
}

export function PersonPickPanel({
  value,
  onChange,
  onPicked,
}: {
  value: unknown
  onChange: (next: PersonValue) => void
  onPicked?: () => void
}) {
  const current = asPerson(value)
  const selected = personKey(current)
  const [members, setMembers] = useState<MemberPerson[]>([])
  const [people, setPeople] = useState<ChatPerson[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void Promise.all([loadMembers(), loadAgents()])
      .then(([nextMembers, nextAgents]) => {
        if (cancelled) return
        setMembers(nextMembers)
        setPeople(nextAgents)
      })
      .catch(() => {
        if (cancelled) return
        setMembers([])
        setPeople([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const q = query.trim().toLowerCase()
  const visibleMembers = useMemo(
    () =>
      members.filter(
        (item) =>
          !q ||
          item.name.toLowerCase().includes(q) ||
          item.email.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q),
      ),
    [members, q],
  )
  const visibleAgents = useMemo(
    () =>
      people.filter(
        (item) => !q || item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q),
      ),
    [people, q],
  )

  function pick(next: PersonValue) {
    onChange(next)
    onPicked?.()
  }

  function pickFirst() {
    const member = visibleMembers[0]
    if (member) {
      pick({ kind: 'user', name: member.name, accountId: member.id })
      return
    }
    const agent = visibleAgents[0]
    if (agent) {
      pick({
        kind: 'agent',
        name: agent.name,
        sessionId: agent.id,
        ...(agent.mascot ? { mascot: agent.mascot } : {}),
      })
    }
  }

  return (
    <PickPanel
      className="fsdb-person-pick"
      query={query}
      onQuery={setQuery}
      placeholder="搜索成员或代理"
      onEnter={pickFirst}
      empty={
        loading ? (
          <div className="fsdb-person-loading">
            <ArrowPathIcon className="size-[14px] fsdb-spin" aria-hidden />
            加载成员和代理…
          </div>
        ) : !visibleMembers.length && !visibleAgents.length ? (
          <div className="fsdb-person-loading">没有匹配的成员或代理</div>
        ) : null
      }
    >
      {visibleMembers.map((member) => (
        <PickOption
          key={`user:${member.id}`}
          className="fsdb-person-option"
          selected={selected === `user:${member.id}`}
          onClick={() => pick({ kind: 'user', name: member.name, accountId: member.id })}
        >
          <span className="fsdb-person-avatar" aria-hidden>
            <UserIcon className="size-[14px]" />
          </span>
          <span className="fsdb-person-name">{member.name}</span>
        </PickOption>
      ))}
      {visibleAgents.map((person) => (
        <PickOption
          key={person.id}
          className="fsdb-person-option"
          selected={selected === person.id}
          onClick={() =>
            pick({
              kind: 'agent',
              name: person.name,
              sessionId: person.id,
              ...(person.mascot ? { mascot: person.mascot } : {}),
            })
          }
        >
          <span className="fsdb-person-face" aria-hidden>
            <SidebarMascot
              size={18}
              sessionId={person.id}
              identity={resolveSessionMascot(person.id, person.mascot)}
              title={person.name}
            />
          </span>
          <span className="fsdb-person-name">{person.name}</span>
        </PickOption>
      ))}
    </PickPanel>
  )
}
