export type TableEditPatch = Record<string, unknown>
export type TableEditEntry = {
  key: string
  patch: TableEditPatch
  read: () => Promise<TableEditPatch>
  write: (patch: TableEditPatch) => Promise<TableEditPatch>
}
type Edit = {
  key: string
  before: TableEditPatch
  after: TableEditPatch
  write: (patch: TableEditPatch) => Promise<TableEditPatch>
}
type HistoryStep = Edit[]

function copy<T>(value: T): T {
  return structuredClone(value)
}

function pick(record: TableEditPatch, keys: string[], fallback?: TableEditPatch): TableEditPatch {
  return Object.fromEntries(keys.map(key => [key, copy(record[key] === undefined ? fallback?.[key] ?? null : record[key])]))
}

/** One history per table instance. Serialize saves and replay; only successful writes move the stacks. */
export class TableEditHistory {
  private undoStack: HistoryStep[] = []
  private redoStack: HistoryStep[] = []
  private tail: Promise<unknown> = Promise.resolve()
  private pendingEdits = 0

  constructor(private readonly limit = 100) {}

  get canUndo() { return this.undoStack.length > 0 || this.pendingEdits > 0 }
  get canRedo() { return this.redoStack.length > 0 }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.catch(() => undefined).then(task)
    this.tail = run
    return run
  }

  edit(key: string, patch: TableEditPatch, read: () => Promise<TableEditPatch>, write: Edit['write']) {
    return this.editBatch([{ key, patch, read, write }])
  }

  /** Apply multiple record patches as one atomic undo/redo step. */
  editBatch(entries: TableEditEntry[]) {
    if (!entries.length) return Promise.resolve()
    const cloned = entries.map((entry) => ({
      ...entry,
      patch: copy(entry.patch),
    }))
    this.pendingEdits++
    return this.enqueue(async () => {
      const recorded: Edit[] = []
      let firstError: unknown = null
      for (const entry of cloned) {
        const keys = Object.keys(entry.patch)
        if (!keys.length) continue
        try {
          // Read at execution time, so fast consecutive changes use the last saved value.
          const before = pick(await entry.read(), keys)
          const saved = await entry.write(copy(entry.patch))
          const after = pick(saved, keys, entry.patch)
          if (JSON.stringify(before) === JSON.stringify(after)) continue
          recorded.push({ key: entry.key, before, after, write: entry.write })
        } catch (err) {
          if (firstError === null) firstError = err
        }
      }
      if (recorded.length) {
        this.undoStack.push(recorded)
        if (this.undoStack.length > this.limit) this.undoStack.shift()
        this.redoStack = []
      }
      if (firstError !== null) throw firstError
    }).finally(() => { this.pendingEdits-- })
  }

  undo() {
    return this.enqueue(async () => {
      const step = this.undoStack.at(-1)
      if (!step) return
      for (let i = step.length - 1; i >= 0; i -= 1) {
        const edit = step[i]!
        await edit.write(copy(edit.before))
      }
      this.undoStack.pop()
      this.redoStack.push(step)
    })
  }

  redo() {
    return this.enqueue(async () => {
      const step = this.redoStack.at(-1)
      if (!step) return
      for (const edit of step) {
        await edit.write(copy(edit.after))
      }
      this.redoStack.pop()
      this.undoStack.push(step)
    })
  }

  /** Deleting a record does not become an undo action or leave edits targeting a deleted record. */
  forget(key: string) {
    return this.enqueue(async () => {
      this.undoStack = this.undoStack
        .map((step) => step.filter((edit) => edit.key !== key))
        .filter((step) => step.length > 0)
      this.redoStack = this.redoStack
        .map((step) => step.filter((edit) => edit.key !== key))
        .filter((step) => step.length > 0)
    })
  }
}

export function tableEditHistoryKey(event: {
  key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean
}): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return null
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !event.shiftKey) return 'redo'
  return null
}

/** Mac 用 ⌘，其它系统用 Ctrl。文本框里这个组合留给浏览器自己撤销输入。 */
export function tableNativeUndoModifier(event: { ctrlKey: boolean; metaKey: boolean }, apple: boolean) {
  return apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

/**
 * 单元格浮层挂在表格外，而且带 dialog 角色。
 * 编辑中、关掉浮层后焦点回到页面空白处，都仍算这张表的撤销。
 * 其它输入框（例如页面外的文本框）不抢走系统撤销。
 */
export function tableEditHistoryOwned(input: {
  inCellPop: boolean
  cellPopOpen: boolean
  inThisTable: boolean
  foreignPage: boolean
  foreignEditor: boolean
  inDialog: boolean
  nativeField: boolean
  nativeUndoModifier: boolean
  hasCell: boolean
}) {
  if (input.nativeField && input.nativeUndoModifier) return false
  if (input.inCellPop) return input.cellPopOpen
  if (input.inDialog) return false
  if (input.inThisTable) return true
  if (input.foreignPage || input.foreignEditor || input.nativeField) return false
  return input.hasCell
}
