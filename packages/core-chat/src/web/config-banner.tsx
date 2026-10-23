import { useEffect, useState } from 'react'
import type { SlotProps } from '@biu/web-slots'
import { getChatConfig } from './chat-config.ts'
import { ModelConfigDialog } from './model-config-dialog.tsx'

/** 未配置 API Key 时在对话区提示，避免用户以为模型「没响应」。 */
export function ChatConfigBanner(_props: SlotProps) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

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
    window.addEventListener('biu:chat-config-changed', load)
    return () => {
      cancelled = true
      window.removeEventListener('biu:chat-config-changed', load)
    }
  }, [])

  if (configured !== false) return null

  return (
    <>
      <div className="chat-config-banner" role="status">
        尚未配置 API KEY：消息会本地回声，不会调用模型。
        <button
          type="button"
          className="chat-config-banner-action"
          onClick={() => setConfigOpen(true)}
        >
          点击配置模型的API KEY
        </button>
        。
      </div>
      <ModelConfigDialog open={configOpen} onClose={() => setConfigOpen(false)} />
    </>
  )
}
