import { useEffect, useState } from 'react'
import type { SlotProps } from '@biu/web-slots'
import { getChatConfig } from './chat-config.ts'

/** 未配置 API Key 时在对话区提示，避免用户以为模型「没响应」。 */
export function ChatConfigBanner(_props: SlotProps) {
  const [configured, setConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getChatConfig<{ configured?: boolean }>()
        if (!cancelled) setConfigured(data == null ? null : Boolean(data.configured))
      } catch {
        if (!cancelled) setConfigured(null)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  if (configured !== false) return null

  return (
    <div className="chat-config-banner" role="status">
      尚未配置 API Key：消息会本地回声，不会调用模型。点击输入框旁的{' '}
      <button
        type="button"
        className="chat-config-banner-action"
        onClick={() => window.dispatchEvent(new CustomEvent('biu:open-model-config'))}
      >
        ＋ 配置模型
      </button>
      。
    </div>
  )
}
