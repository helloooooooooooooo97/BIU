/** 数据侧栏占位：固定高度骨架条，不复刻真实分组结构。 */
export function DataSidebarShell() {
  return (
    <div className="fsdb-views flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-label="数据">
      <div className="fsdb-views-full min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        <div className="mt-2 space-y-2">
          <div className="mx-1 h-8 rounded-md bg-(--biu-color-bg-muted)" />
          <div className="mx-1 h-8 rounded-md bg-(--biu-color-bg-muted)" />
          <div className="mx-1 h-8 rounded-md bg-(--biu-color-bg-muted)" />
          <div className="mx-1 h-8 rounded-md bg-(--biu-color-bg-muted)" />
        </div>
      </div>
    </div>
  )
}
