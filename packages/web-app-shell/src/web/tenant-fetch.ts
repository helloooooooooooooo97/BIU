import { readStorageString, removeStorageKey, writeStorageString } from '@biu/biu-ui/client-storage'

export const WORKSPACE_KEY = 'biu.workspaceId'

export function readWorkspaceId() {
  return readStorageString(WORKSPACE_KEY, 'session') || readStorageString(WORKSPACE_KEY, 'local') || ''
}

export function writeSessionWorkspaceId(id: string) {
  if (!id) return
  writeStorageString(WORKSPACE_KEY, id, { area: 'session' })
}

export function writeWorkspaceId(id: string) {
  if (!id) return
  writeStorageString(WORKSPACE_KEY, id, { area: 'session' })
  writeStorageString(WORKSPACE_KEY, id, { area: 'local' })
}

export function clearWorkspaceId() {
  removeStorageKey(WORKSPACE_KEY, 'session')
  removeStorageKey(WORKSPACE_KEY, 'local')
}
