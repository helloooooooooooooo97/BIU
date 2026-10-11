const collaborationColumnKeys = new Set(['shareScope', 'shareRole'])

export function workspaceColumnsForLocation<T extends { key: string }>(columns: T[], localData: boolean) {
  if (!localData) return columns
  return columns.filter((column) => !collaborationColumnKeys.has(column.key))
}
