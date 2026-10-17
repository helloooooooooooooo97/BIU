export const PAGE_BLOCK_IDLE_MIN_PX = 200
export const PAGE_BLOCK_IDLE_ROOT_MARGIN = '160px'

type MountFn = () => void

let pending: MountFn[] = []
let timer = 0

export function resetPageBlockIdleQueue() {
  pending = []
  if (timer) clearTimeout(timer)
  timer = 0
}

function flush() {
  timer = 0
  const next = pending.shift()
  if (!next) return
  next()
  if (pending.length) timer = setTimeout(flush, 0)
}

/** Mount at most one plugin View per macrotask so 9 blocks do not share one long task. */
export function schedulePageBlockMount(fn: MountFn) {
  pending.push(fn)
  if (timer) return
  timer = setTimeout(flush, 0)
}

export function pageBlockIdleQueueSize() {
  return pending.length
}
