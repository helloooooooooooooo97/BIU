import { useEffect, useState } from 'react'
import { ArrowPathIcon, CpuChipIcon, UserIcon } from '@heroicons/react/16/solid'
import { resolveSessionMascot, SidebarMascot } from '@biu/public-mascot'
import { asPerson, asPersonList, personKey, type PersonValue } from '@biu/type-file-system'
import { listCollection } from './db-client.ts'
import { useWorkspaceProfile } from '@biu/biu-ui/use-workspace-profile'
import { profileDisplayName } from '@biu/biu-ui/workspace-profile'

type ChatPerson = {
  id: string
  name: string
  mascot?: { shape: string; color: string; eye?: number }
}

const USER: PersonValue = { kind: 'user', name: '用户' }
const SYSTEM: PersonValue = { kind: 'system', name: '系统' }

let agentsInflight: Promise<ChatPerson[]> | null = null
let agentsListed: ChatPerson[] | null = null
let agentsListedAt = 0
const AGENTS_TTL_MS = 8000

export async function loadAgents(): Promise<ChatPerson[]> {
  if (agentsListed && Date.now() - agentsListedAt < AGENTS_TTL_MS) return agentsListed
  if (agentsInflight) return agentsInflight
  const request = listCollection({
    path: '/sessions',
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
  const [people, setPeople] = useState<ChatPerson[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void loadAgents()
      .then((rows) => {
        if (!cancelled) setPeople(rows)
      })
      .catch(() => {
        if (!cancelled) setPeople([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function pick(next: PersonValue) {
    onChange(next)
    onPicked?.()
  }

  return (
    <div className="fsdb-person-pick">
      <button
        type="button"
        className={`fsdb-person-option${selected === 'user' ? ' is-selected' : ''}`}
        onClick={() => pick(USER)}
      >
        <span className="fsdb-person-avatar" aria-hidden>
          <UserIcon className="size-[14px]" />
        </span>
        <span className="fsdb-person-name">{profileDisplayName()}</span>
      </button>
      <button
        type="button"
        className={`fsdb-person-option${selected === 'system' ? ' is-selected' : ''}`}
        onClick={() => pick(SYSTEM)}
      >
        <span className="fsdb-person-avatar" aria-hidden>
          <CpuChipIcon className="size-[14px]" />
        </span>
        <span className="fsdb-person-name">系统</span>
      </button>
      {people.map((person) => (
        <button
          type="button"
          key={person.id}
          className={`fsdb-person-option${selected === person.id ? ' is-selected' : ''}`}
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
        </button>
      ))}
      {loading ? (
        <div className="fsdb-person-loading">
          <ArrowPathIcon className="size-[14px] fsdb-spin" aria-hidden />
          加载会话…
        </div>
      ) : null}
    </div>
  )
}
