/** Embedded tag collection sheets share an API path, but not the tag list cache. */
export function collectionListCachePath(path: string, sheet: boolean, filters: Record<string, unknown>) {
  if (!sheet) return path
  const scope = Object.keys(filters).sort().map(key => [key, filters[key]])
  return `${path}\0sheet:${JSON.stringify(scope)}`
}
