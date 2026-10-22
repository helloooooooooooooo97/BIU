import { ArrowPathIcon } from '@heroicons/react/16/solid'

export function PageContentLoading() {
  return (
    <div className="fsdb-content-loading" data-testid="page-content-loading" aria-busy="true" aria-live="polite">
      <ArrowPathIcon className="fsdb-content-loading-icon" width={22} height={22} aria-hidden />
      <span className="sr-only">正在加载正文</span>
    </div>
  )
}

export function PageContentFailed({
  error,
  onRetry,
}: {
  error?: string
  onRetry?: () => void
}) {
  return (
    <div className="fsdb-content-failed" data-testid="page-content-failed" role="alert">
      <p>{error?.trim() || '正文加载失败'}</p>
      {onRetry ? (
        <button type="button" className="fsdb-content-retry" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  )
}
