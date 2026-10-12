const localOnlyHiddenColumnKeys = new Set(['shareRole'])

export function workspaceColumnsForLocation<T extends { key: string }>(columns: T[], localData: boolean) {
  if (!localData) return columns
  return columns.filter((column) => !localOnlyHiddenColumnKeys.has(column.key))
}
