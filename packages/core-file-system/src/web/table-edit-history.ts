export type TableEditPatch = Record<string, unknown>
type Edit = {
  key: string
  before: TableEditPatch
  after: TableEditPatch
  write: (patch: TableEditPatch) => Promise<TableEditPatch>
}

function copy<T>(value: T): T {
  return structuredClone(value)
}

function pick(record: TableEditPatch, keys: string[], fallback?: TableEditPatch): TableEditPatch {
  return Object.fromEntries(keys.map(key => [key, copy(record[key] === undefined ? fallback?.[key] ?? null : record[key])]))
}

/** One history per table instance. Serialize saves and replay; only successful writes move the stacks. */
export class TableEditHistory {
  private undoStack: Edit[] = []
  private redoStack: Edit[] = []
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
    const requested = copy(patch)
    this.pendingEdits++
    return this.enqueue(async () => {
      const keys = Object.keys(requested)
      // Read at execution time, so fast consecutive changes use the last saved value.
      const before = pick(await read(), keys)
      const saved = await write(copy(requested))
      const after = pick(saved, keys, requested)
      if (JSON.stringify(before) === JSON.stringify(after)) return
      this.undoStack.push({ key, before, after, write })
      if (this.undoStack.length > this.limit) this.undoStack.shift()
      this.redoStack = []
    }).finally(() => { this.pendingEdits-- })
  }

  undo() {
    return this.enqueue(async () => {
      const edit = this.undoStack.at(-1)
      if (!edit) return
      await edit.write(copy(edit.before))
      this.undoStack.pop()
      this.redoStack.push(edit)
    })
  }

  redo() {
    return this.enqueue(async () => {
      const edit = this.redoStack.at(-1)
      if (!edit) return
      await edit.write(copy(edit.after))
      this.redoStack.pop()
      this.undoStack.push(edit)
    })
  }

  /** Deleting a record does not become an undo action or leave edits targeting a deleted record. */
  forget(key: string) {
    return this.enqueue(async () => {
      this.undoStack = this.undoStack.filter(edit => edit.key !== key)
      this.redoStack = this.redoStack.filter(edit => edit.key !== key)
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
