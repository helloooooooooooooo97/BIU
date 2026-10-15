import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SiteChrome, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

export type AuthMode = 'login' | 'register'

export type AuthPanelProps = {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onSubmit: (credentials: { email: string; password: string }) => Promise<void>
  /** 交给外层展示的附加错误（如网络错误由外层判定） */
  externalError?: string
  workspaceInvite?: boolean
}

const MIN_PASSWORD = 6

/** 密码强度：注册时实时校验（P0-14 第 12 项）。 */
function passwordStrength(value: string): { level: 0 | 1 | 2 | 3; label: string } {
  if (value.length === 0) return { level: 0, label: '' }
  let score = 0
  if (value.length >= MIN_PASSWORD) score += 1
  if (value.length >= 10) score += 1
  if (/[A-Za-z]/.test(value) && /\d/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1
  const level = Math.min(3, score) as 0 | 1 | 2 | 3
  return { level, label: ['太短', '偏弱', '可用', '很强'][level] ?? '' }
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/**
 * 登录 / 注册表单。
 * 规划 §4.13 的 14 项修复都在这里：
 *  - autoFocus / 邮箱 type=email / autoComplete 语义
 *  - 提交 loading 态 / 密码显示切换 / 密码强度实时校验
 *  - 错误区分网络与后端 / 验证态骨架屏
 */
export function AuthPanel({
  mode,
  onModeChange,
  onSubmit,
  externalError,
  workspaceInvite,
}: AuthPanelProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)

  // P0-14 第 6 项：autoFocus
  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  useEffect(() => {
    setError('')
  }, [mode])

  const strength = passwordStrength(password)
  const emailReady = isEmail(email)
  const passwordReady = mode === 'login' ? password.length > 0 : password.length >= MIN_PASSWORD
  // 只在提交中禁用按钮：其余情况允许点击，以便给出「为什么不能提交」的具体原因。
  const canSubmit = !submitting

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!emailReady) {
      setError('请填写有效的邮箱地址')
      return
    }
    if (!passwordReady) {
      setError(mode === 'register' ? `密码至少 ${MIN_PASSWORD} 位` : '请填写密码')
      return
    }
    setSubmitting(true) // P0-14 第 7 项：loading 态
    setError('')
    try {
      await onSubmit({ email: email.trim(), password })
    } catch (err) {
      // P0-14 第 9 项：区分网络错误与后端错误
      const message = err instanceof Error ? err.message : String(err)
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      if (offline || /fetch|network|Failed to fetch/i.test(message)) {
        setError('网络连接不可用，请检查网络后重试')
      } else {
        setError(message || (mode === 'register' ? '注册失败' : '登录失败'))
      }
      setSubmitting(false)
      return
    }
    // 成功后组件会被外层卸载（token 生效），无需重置 submitting
  }

  const switchMode = () => onModeChange(mode === 'login' ? 'register' : 'login')

  return (
    <form
      className="auth-panel"
      onSubmit={submit}
      /* noValidate：交给下面的中文校验，避免浏览器原生气泡用系统语言打断体验 */
      noValidate
      data-testid={mode === 'register' ? 'auth-register' : 'auth-login'}
    >
      {/* 顶栏已有品牌和回官网的入口，这里只留表单；标题仅供读屏识别页面。 */}
      <h2 className="sr-only">{mode === 'register' ? '创建账号' : '登录'}</h2>
      {workspaceInvite ? <p className="auth-lead">登录或注册后加入这个空间。</p> : null}
      {externalError ? <p className="auth-error" role="alert">{externalError}</p> : null}
      {error ? <p className="auth-error" role="alert" data-testid="auth-error">{error}</p> : null}

      <label className="auth-label">
        邮箱
        <input
          ref={emailRef}
          className="auth-field"
          value={email}
          maxLength={80}
          placeholder="name@email.com"
          /* P0-14 第 3 项：登录也用 email 类型，做格式校验 */
          type="email"
          /* P0-14 第 4 项：autoComplete 语义正确 */
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          data-testid="auth-name"
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className="auth-label">
        密码
        <span className="auth-field-wrap">
          <input
            className="auth-field"
            /* P0-14 第 2 项：显示/隐藏切换 */
            type={showPassword ? 'text' : 'password'}
            value={password}
            placeholder={mode === 'register' ? `至少 ${MIN_PASSWORD} 位` : '密码'}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            data-testid="auth-password"
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            className="auth-reveal"
            aria-label={showPassword ? '隐藏密码' : '显示密码'}
            aria-pressed={showPassword}
            data-testid="auth-reveal"
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? '隐藏' : '显示'}
          </button>
        </span>
      </label>

      {/* P0-14 第 12 项：注册时密码强度实时校验 */}
      {mode === 'register' && password.length > 0 ? (
        <p className="auth-strength" data-level={strength.level} data-testid="auth-strength">
          <span className="auth-strength-bar" aria-hidden />
          密码强度：{strength.label}
          {password.length < MIN_PASSWORD ? `（还差 ${MIN_PASSWORD - password.length} 位）` : ''}
        </p>
      ) : null}

      <button type="submit" className="auth-go" disabled={!canSubmit} data-testid="auth-submit">
        {submitting ? (mode === 'register' ? '注册中…' : '登录中…') : mode === 'register' ? '注册' : '登录'}
      </button>

      <p className="auth-panel-footer">
        <button type="button" className="auth-switch" data-testid="auth-switch" onClick={switchMode}>
          {mode === 'register' ? '已有账号，去登录' : '没有账号，去注册'}
        </button>
      </p>
    </form>
  )
}

/** 独立的 /login 与 /signup 页面外壳。 */
export function MarketingAuth({
  mode,
  onModeChange,
  onSubmit,
  onLogin,
  onStart,
  workspaceInvite,
}: {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onSubmit: (credentials: { email: string; password: string }) => Promise<void>
  onLogin: SiteAction
  onStart: SiteAction
  workspaceInvite?: boolean
}) {
  usePageMeta({
    title: mode === 'register' ? '注册' : '登录',
    description:
      mode === 'register'
        ? '创建 BIU 账号，开始你的第一个空间。'
        : '登录 BIU，继续你的工作空间。',
    path: mode === 'register' ? '/signup' : '/login',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-auth">
        <AuthPanel
          mode={mode}
          onModeChange={onModeChange}
          onSubmit={onSubmit}
          workspaceInvite={workspaceInvite}
        />
      </section>
    </SiteChrome>
  )
}
