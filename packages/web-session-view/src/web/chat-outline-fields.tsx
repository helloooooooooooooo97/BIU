import { memo, useSyncExternalStore } from 'react'
import {
  getChatOutlineFilter,
  setChatOutlineFilter,
  subscribeChatOutline,
  type ChatOutlineFilter,
} from './chat-outline.ts'

export const ChatOutlineFilterFields = memo(function ChatOutlineFilterFields() {
  const filter = useSyncExternalStore(subscribeChatOutline, getChatOutlineFilter, (): ChatOutlineFilter => 'user')
  return (
    <div className="scfg-row" data-testid="chat-outline-filter">
      <div className="scfg-row-copy">
        <span className="scfg-label">消息大纲</span>
        <span className="scfg-hint">控制右侧大纲显示的对话范围</span>
      </div>
      <div className="settings-cloud-tabs" role="radiogroup" aria-label="消息大纲">
        <button
          type="button"
          role="radio"
          aria-checked={filter === 'user'}
          className={`settings-cloud-tab${filter === 'user' ? ' is-active' : ''}`}
          onClick={() => setChatOutlineFilter('user')}
        >
          仅我发出的
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={filter === 'all'}
          className={`settings-cloud-tab${filter === 'all' ? ' is-active' : ''}`}
          onClick={() => setChatOutlineFilter('all')}
        >
          全部消息
        </button>
      </div>
    </div>
  )
})
