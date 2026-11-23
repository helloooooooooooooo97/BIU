import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  normalizeSchemaValue,
  type CollectionActionInfo,
  type CollectionInfo,
  type CollectionSchema,
  type CollectionSchemaPack,
  type DbRecord,
  type FieldSpec,
} from '@biu/type-file-system'
import { matchListFilterRecord, seedRecordFromViewFilters, type FilterGroup } from '../query-logic.ts'
import type { BrowserDialogState } from './browser-dialogs.tsx'
import {
  forgetListCache,
  overlayListedRow,
  publishDeletedRowsToTrash,
  publishListedMutation,
} from './browser-list-cache.ts'
import { createdRowGroupKey, placeCreatedRow } from './group-insert.ts'
import { setViaDataCrumbs } from './data-chrome.ts'
import { PAGES_COLLECTION_PATH, TRASH_COLLECTION_PATH } from './database-path.ts'
import { HttpError, invalidateListReads, readJson } from './db-client.ts'
import {
  parentFieldKey,
  parseTagFlatColumnKey,
  patchTagFlatValue,
  tagSourceKey,
  type GroupBucket,
} from './fields.ts'
import { parseFieldValue } from './fsdb-cells.tsx'
import { ENABLE_PAGE_BLOCK_PLUGIN_EVENT } from './fsdb-events.ts'
import { seedGroupRecord } from './group-create.ts'
import { rememberInspectorWorkingView, showRecordInInspector } from './inspector-db-route.ts'
import type { KeyedSerialQueue, PendingFieldPatchTracker } from './record-write-queue.ts'
import type { TableEditHistory } from './table-edit-history.ts'
import { persistCollapsedGroups } from './view-storage.ts'

export type BrowserMutationsOptions = {
  collectionPath: string
  dataPath: string
  dataPathRef: MutableRefObject<string>
  title: string
  embed: boolean
  isDataOverview: boolean
  canCreate: boolean
  schema?: CollectionSchema
  schemaRef: MutableRefObject<CollectionSchema | undefined>
  bodyKey: string | null
  items: DbRecord[]
  itemsRef: MutableRefObject<DbRecord[]>
  setItems: Dispatch<SetStateAction<DbRecord[]>>
  totalRef: MutableRefObject<number>
  setTotal: Dispatch<SetStateAction<number>>
  detailId: string | null
  detailIdRef: MutableRefObject<string | null>
  detailRowRef: MutableRefObject<DbRecord | null>
  setDetailRow: Dispatch<SetStateAction<DbRecord | null>>
  setDetailBody: Dispatch<SetStateAction<unknown>>
  setDetailBodyStatus: Dispatch<SetStateAction<'loading' | 'failed' | 'ready'>>
  setDetailBodyError: Dispatch<SetStateAction<string>>
  activeViewId: string | null
  activeViewIdRef: MutableRefObject<string | null>
  routeViewId?: string
  groupBy: string
  groupByRef: MutableRefObject<string>
  grouped: GroupBucket[]
  setGroupBuckets: Dispatch<SetStateAction<GroupBucket[]>>
  setGroupPages: Dispatch<SetStateAction<Record<string, number>>>
  setCollapsedGroups: Dispatch<SetStateAction<Record<string, boolean>>>
  setCollapsed: Dispatch<SetStateAction<Record<string, boolean>>>
  setTreeKidsByParent: Dispatch<SetStateAction<Record<string, DbRecord[]>>>
  catalogLocks: Record<string, string>
  filterTree: FilterGroup
  queryFiltersRef: MutableRefObject<Record<string, unknown>>
  tagCatalog: CollectionSchemaPack[]
  tagCatalogRef: MutableRefObject<CollectionSchemaPack[]>
  createScope: 'personal' | 'workspace' | 'shared' | 'local'
  createTypeTable?: CollectionInfo
  overviewCreateTables: CollectionInfo[]
  pickedIds: string[]
  setPickedIds: Dispatch<SetStateAction<string[]>>
  actingRef: MutableRefObject<boolean>
  setActing: Dispatch<SetStateAction<boolean>>
  creatingGroupsRef: MutableRefObject<Set<string>>
  setCreatingGroup: Dispatch<SetStateAction<string | null>>
  confirmedCreates: MutableRefObject<Set<string>>
  quietUntil: MutableRefObject<number>
  contentGen: MutableRefObject<number>
  contentVersions: MutableRefObject<Map<string, number>>
  contentWriteQueueRef: MutableRefObject<KeyedSerialQueue | null>
  fieldWriteQueueRef: MutableRefObject<KeyedSerialQueue | null>
  pendingFieldTrackerRef: MutableRefObject<PendingFieldPatchTracker | null>
  tableEditHistory: TableEditHistory
  setDlg: Dispatch<SetStateAction<BrowserDialogState | null>>
  setError: Dispatch<SetStateAction<string>>
  sourceRecordPath: (row?: DbRecord | null, id?: string) => string
  sourceDeleteTarget: (row?: DbRecord | null) => { path: string; id: string }
  applyPendingDetailPatches: (row: DbRecord) => DbRecord
  mapListedRecords: (map: (row: DbRecord) => DbRecord) => void
  dropListedRecords: (ids: string[], opts?: { keepHistory?: boolean }) => void
  announceListChange: (keepCache?: boolean, noticePath?: string) => void
  reload: (opts?: { force?: boolean; reuseGroups?: boolean }) => Promise<boolean>
  loadTreeKids: (parentId: string, force?: boolean) => Promise<void> | void
  landCreatedTitleCell: (rowId: string) => void
  onCloseRecord?: () => void
}

export function createBrowserMutations(opts: BrowserMutationsOptions) {
  const {
    collectionPath,
    dataPath,
    dataPathRef,
    title,
    embed,
    isDataOverview,
    canCreate,
    schema,
    schemaRef,
    bodyKey,
    items,
    itemsRef,
    setItems,
    totalRef,
    setTotal,
    detailId,
    detailIdRef,
    detailRowRef,
    setDetailRow,
    setDetailBody,
    setDetailBodyStatus,
    setDetailBodyError,
    activeViewId,
    activeViewIdRef,
    routeViewId,
    groupBy,
    groupByRef,
    grouped,
    setGroupBuckets,
    setGroupPages,
    setCollapsedGroups,
    setCollapsed,
    setTreeKidsByParent,
    catalogLocks,
    filterTree,
    queryFiltersRef,
    tagCatalog,
    tagCatalogRef,
    createScope,
    createTypeTable,
    overviewCreateTables,
    pickedIds,
    setPickedIds,
    actingRef,
    setActing,
    creatingGroupsRef,
    setCreatingGroup,
    confirmedCreates,
    quietUntil,
    contentGen,
    contentVersions,
    contentWriteQueueRef,
    fieldWriteQueueRef,
    pendingFieldTrackerRef,
    tableEditHistory,
    setDlg,
    setError,
    sourceRecordPath,
    sourceDeleteTarget,
    applyPendingDetailPatches,
    mapListedRecords,
    dropListedRecords,
    announceListChange,
    reload,
    loadTreeKids,
    landCreatedTitleCell,
    onCloseRecord,
  } = opts

  async function executeAction(row: DbRecord, action: CollectionActionInfo) {
    if (actingRef.current) return
    actingRef.current = true
    setActing(true)
    const sourceId = String(row.sourceId ?? '').trim()
    const actionPath = sourceRecordPath(row, row.id)
    try {
      const cornerSessionId =
        typeof document === 'undefined'
          ? ''
          : String(document.querySelector('[data-testid="brand-corner-mascot"]')?.getAttribute('data-session-id') ?? '').trim()
      await readJson('/api/db/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: actionPath,
          action: action.id,
          ...(action.id === 'deliver' && cornerSessionId ? { args: { sessionId: cornerSessionId, wait: false } } : {}),
        }),
      })
      if (action.id === 'start') {
        window.dispatchEvent(new CustomEvent(ENABLE_PAGE_BLOCK_PLUGIN_EVENT, { detail: { plugin: sourceId || String(row.id) } }))
      }
      announceListChange()
      quietUntil.current = 0
      await reload({ force: true })
    } catch (err) {
      setDlg({ kind: 'alert', title: `${action.label}失败`, body: String(err) })
      quietUntil.current = 0
      await reload({ force: true })
    } finally {
      actingRef.current = false
      setActing(false)
    }
  }

  async function writePatch(row: DbRecord, content: Record<string, unknown>) {
    const keys = Object.keys(content)
    try {
      quietUntil.current = Date.now() + 800
      if (bodyKey && keys.length === 1 && keys[0] === bodyKey && schema?.fields[bodyKey]?.type === 'file') {
        const path = sourceRecordPath(row, row.id)
        const value = content[bodyKey]
        contentGen.current += 1
        const queue = contentWriteQueueRef.current!
        await queue.enqueue(path, async (gen) => {
          try {
            const data = await readJson<{ value?: unknown; version?: number; updatedAt?: number }>('/api/db/content', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                path,
                value,
                version: contentVersions.current.get(path),
              }),
            })
            if (Number.isInteger(data.version)) contentVersions.current.set(path, data.version!)
            if (detailIdRef.current === row.id && queue.isLatest(path, gen)) {
              setDetailBody(data.value ?? value)
              setDetailBodyStatus('ready')
              setDetailBodyError('')
            }
            const touched = Number(data.updatedAt)
            const stamp = Number.isFinite(touched) && touched > 0 ? touched : Date.now()
            const mergeTime = (item: DbRecord) => (item.id === row.id ? { ...item, updatedAt: stamp } : item)
            mapListedRecords(mergeTime)
            setDetailRow((prev) => (prev?.id === row.id ? mergeTime(prev) : prev))
            publishListedMutation({ path: dataPath, op: 'patch', row: { id: row.id, updatedAt: stamp }, groupBy })
            announceListChange(true, path)
          } catch (error) {
            if (!(error instanceof HttpError) || error.status !== 409) throw error
            const latest = await readJson<{ value?: unknown; version?: number }>(`/api/db/content?path=${encodeURIComponent(path)}`)
            if (Number.isInteger(latest.version)) contentVersions.current.set(path, latest.version!)
            if (detailIdRef.current === row.id) {
              setDetailBody(latest.value ?? null)
              setDetailBodyStatus('ready')
              setDetailBodyError('')
            }
          }
        })
        const field = schema?.fields[bodyKey]
        if (field && field.type !== 'file') {
          const stored = value && typeof value === 'object' ? JSON.stringify(value) : value
          const merge = (item: DbRecord) => (item.id === row.id ? { ...item, [bodyKey]: stored } : item)
          mapListedRecords(merge)
          setDetailRow((prev) => (prev?.id === row.id ? merge(prev) : prev))
        }
        return
      }
      const path = `${dataPath}/${row.id}`
      const beforeRow =
        itemsRef.current.find((item) => item.id === row.id) ??
        (detailRowRef.current?.id === row.id ? detailRowRef.current : null) ??
        row
      const releasePending = pendingFieldTrackerRef.current!.track(row.id, content)
      if (dataPathRef.current === dataPath) {
        setDetailRow((prev) => (prev?.id === row.id ? overlayListedRow(prev, { ...prev, ...content }) : prev))
      }
      try {
        await fieldWriteQueueRef.current!.enqueue(path, async () => {
          await tableEditHistory.edit(
            path,
            content,
            async () => {
              const listed = itemsRef.current.find((item) => item.id === row.id)
              return listed ?? beforeRow
            },
            async (patch) => {
              if (dataPathRef.current === dataPath) {
                setDetailRow((prev) => (prev?.id === row.id ? overlayListedRow(prev, { ...prev, ...patch }) : prev))
              }
              const data = await readJson<{ value?: DbRecord }>('/api/db/update', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ path, content: patch }),
              })
              const next = data.value
              if (!next) throw new Error('保存失败：服务端没有返回记录')
              if (dataPathRef.current === dataPath) {
                const displayed = next.id === row.id ? next : overlayListedRow(row, { ...next, id: row.id })
                const merge = (item: DbRecord) => (item.id === row.id ? overlayListedRow(item, displayed) : item)
                const merged = overlayListedRow(itemsRef.current.find((item) => item.id === row.id) ?? row, displayed)
                const stillMatches = matchListFilterRecord(merged, queryFiltersRef.current, schemaRef.current, tagCatalogRef.current)
                if (stillMatches) {
                  mapListedRecords(merge)
                } else {
                  dropListedRecords([row.id], { keepHistory: true })
                }
                releasePending()
                const protectedDisplay = applyPendingDetailPatches(displayed)
                setDetailRow((prev) => (prev?.id === row.id ? overlayListedRow(prev, protectedDisplay) : prev))
                publishListedMutation({ path: dataPath, op: 'patch', row: displayed, groupBy: groupByRef.current })
                announceListChange(stillMatches, path)
                quietUntil.current = Date.now() + 800
              } else {
                forgetListCache(dataPath)
                invalidateListReads()
              }
              return next
            },
          )
        })
      } finally {
        releasePending()
      }
    } catch (err) {
      if (dataPathRef.current !== dataPath) return
      quietUntil.current = 0
      const denied =
        (err instanceof HttpError && err.status === 403) ||
        /\bpermission denied\b/i.test(String(err instanceof Error ? err.message : err))
      const contentOnly = Boolean(bodyKey && keys.length === 1 && keys[0] === bodyKey)
      if (denied && contentOnly) return
      setError(String(err))
    }
  }

  async function insertCreatedRecord(
    targetPath: string,
    fields: Record<string, unknown>,
    targetTable?: { path: string; label?: string; view?: { title?: string; icon?: string } | null },
    scope: typeof createScope = createScope,
  ) {
    try {
      const data = await readJson<{ items?: Array<{ value?: DbRecord }> }>('/api/db/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: targetPath,
          records: [fields],
          scope,
        }),
      })
      const created = data.items?.[0]?.value
      const sourceId = created?.id
      if (!created || !sourceId) {
        setError('没有写入')
        return
      }
      const parentField = parentFieldKey(schemaRef.current)
      const parentId = parentField ? String(fields[parentField] ?? created[parentField] ?? '').trim() : ''
      const stamped = targetTable
        ? {
            ...created,
            id: `${String(targetTable.path).replace(/^\//, '')}::${sourceId}`,
            title: String(created.title ?? sourceId),
            table: targetTable.view?.title ?? targetTable.label ?? targetTable.path.replace(/^\//, ''),
            tablePath: targetTable.path,
            tableIcon: targetTable.view?.icon,
            sourceId,
          }
        : created
      const value =
        parentField && parentId && (stamped[parentField] == null || stamped[parentField] === '')
          ? { ...stamped, [parentField]: parentId }
          : stamped
      const id = value.id
      confirmedCreates.current.add(id)
      const nextItems = [value, ...itemsRef.current.filter((item) => item.id !== id)]
      itemsRef.current = nextItems
      setItems(nextItems)
      totalRef.current += 1
      setTotal(totalRef.current)
      setGroupBuckets((prev) => placeCreatedRow(prev, value, groupBy, schemaRef.current, tagCatalog, parentId))
      if (groupBy) {
        const createdGroupKey = createdRowGroupKey(value, groupBy, schemaRef.current, tagCatalog)
        if (createdGroupKey) {
          setCollapsedGroups((prev) => {
            if (!prev[createdGroupKey]) return prev
            const next = { ...prev, [createdGroupKey]: false }
            persistCollapsedGroups(collectionPath, activeViewId ?? routeViewId ?? '', groupBy, next)
            return next
          })
          setGroupPages((prev) => (prev[createdGroupKey] ? { ...prev, [createdGroupKey]: 0 } : prev))
        }
      }
      if (parentId) {
        setCollapsed((prev) => ({ ...prev, [parentId]: false }))
        setTreeKidsByParent((prev) => ({
          ...prev,
          [parentId]: [value, ...(prev[parentId] ?? []).filter((row) => row.id !== id)],
        }))
        void loadTreeKids(parentId, true)
      }
      publishListedMutation({
        path: dataPath,
        op: 'create',
        row: value,
        groupBy,
        viewId: activeViewIdRef.current,
        total: totalRef.current,
      })
      announceListChange()
      quietUntil.current = Date.now() + 2000
      if (isDataOverview && !embed) setViaDataCrumbs(true, activeViewId ?? undefined)
      if (activeViewId && !isDataOverview) rememberInspectorWorkingView(targetPath, activeViewId)
      window.setTimeout(() => {
        if (!embed) showRecordInInspector(targetPath, sourceId, isDataOverview ? undefined : activeViewId)
        landCreatedTitleCell(String(id))
      }, 0)
      return value
    } catch (err) {
      setError(String(err))
    }
  }

  async function createChildRecord(parent: DbRecord) {
    if (!canCreate) return
    const parentId = String(parent.sourceId ?? parent.id ?? '').trim()
    if (!parentId) return
    const targetPath = isDataOverview
      ? String(parent.tablePath ?? createTypeTable?.path ?? PAGES_COLLECTION_PATH)
      : dataPath
    const targetTable = isDataOverview
      ? overviewCreateTables.find((table) => table.path === targetPath) ?? {
          path: targetPath,
          label: targetPath.replace(/^\//, ''),
        }
      : undefined
    const field = parentFieldKey(schema) || 'parentId'
    const fields: Record<string, unknown> = {
      ...seedRecordFromViewFilters(catalogLocks, undefined, schema),
      [field]: parentId,
    }
    const groupedBy = String(groupBy ?? '').trim()
    const groupedField = groupedBy ? schema?.fields?.[groupedBy] : undefined
    if (
      groupedBy &&
      groupedField?.writable &&
      !groupedField.computed &&
      parent[groupedBy] != null &&
      parent[groupedBy] !== ''
    ) {
      fields[groupedBy] = parent[groupedBy]
    }
    await insertCreatedRecord(targetPath, fields, targetTable)
  }

  function groupCreateSeed(groupKey: string) {
    const bucket = grouped.find((item) => (item.key || 'unset') === groupKey)
    if (!bucket) return null
    const base = seedRecordFromViewFilters(catalogLocks, filterTree, schema)
    if (groupBy === 'shareScope' && ['私人', '空间', '共享'].includes(bucket.key)) return base
    if (isDataOverview && (groupBy === 'table' || groupBy === 'tablePath')) {
      return overviewCreateTables.some((table) =>
        groupBy === 'tablePath' ? table.path === bucket.key : (table.view?.title ?? table.label) === bucket.key,
      )
        ? base
        : null
    }
    return seedGroupRecord(base, groupBy, bucket.key, schema, tagCatalog, bucket.rows[0])
  }

  async function createInGroup(groupKey: string) {
    if (!canCreate || creatingGroupsRef.current.size) return
    const fields = groupCreateSeed(groupKey)
    if (!fields) return
    creatingGroupsRef.current.add(groupKey)
    setCreatingGroup(groupKey)
    try {
      const bucket = grouped.find((item) => (item.key || 'unset') === groupKey)
      const targetTable =
        isDataOverview && (groupBy === 'table' || groupBy === 'tablePath')
          ? overviewCreateTables.find((table) =>
              groupBy === 'tablePath' ? table.path === bucket?.key : (table.view?.title ?? table.label) === bucket?.key,
            )
          : isDataOverview
            ? createTypeTable
            : undefined
      const targetPath = targetTable?.path ?? dataPath
      const scope =
        groupBy === 'shareScope'
          ? ({ 私人: 'personal', 空间: 'workspace', 共享: 'shared' } as const)[bucket?.key as '私人' | '空间' | '共享']
          : undefined
      const created = await insertCreatedRecord(targetPath, fields, targetTable, scope)
      if (!created) return
      setCollapsedGroups((prev) => {
        const next = { ...prev, [groupKey]: false }
        persistCollapsedGroups(collectionPath, activeViewId ?? routeViewId ?? '', groupBy, next)
        return next
      })
      setGroupPages((prev) => ({ ...prev, [groupKey]: 0 }))
    } finally {
      creatingGroupsRef.current.delete(groupKey)
      setCreatingGroup(null)
    }
  }

  async function createRecord() {
    if (!canCreate) return
    const targetPath = isDataOverview ? createTypeTable?.path || PAGES_COLLECTION_PATH : dataPath
    const targetTable = isDataOverview
      ? createTypeTable ?? { path: targetPath, label: targetPath.replace(/^\//, '') }
      : undefined
    await insertCreatedRecord(targetPath, seedRecordFromViewFilters(catalogLocks, filterTree, schema), targetTable)
  }

  async function executeDeleteRecord(row: DbRecord) {
    try {
      const target = sourceDeleteTarget(row)
      if (dataPath === TRASH_COLLECTION_PATH) {
        await readJson('/api/db/action', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: `${dataPath}/${row.id}`, action: 'delete' }),
        })
      } else {
        await readJson('/api/db/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: target.path, ids: [target.id] }),
        })
      }
      if (!embed) onCloseRecord?.()
      dropListedRecords([String(row.id)])
      publishListedMutation({
        path: dataPath,
        op: 'remove',
        ids: [String(row.id)],
        viewId: activeViewIdRef.current,
        total: totalRef.current,
      })
      if (dataPath !== TRASH_COLLECTION_PATH) {
        publishDeletedRowsToTrash(target.path, [{ ...row, id: target.id }], title)
      }
      announceListChange()
      quietUntil.current = 0
      await reload({ force: true })
    } catch (err) {
      setError(String(err))
    }
  }

  async function executeDeleteRecords(ids: string[]) {
    try {
      const rowsById = new Map(itemsRef.current.map((item) => [String(item.id), item]))
      if (dataPath === TRASH_COLLECTION_PATH) {
        await Promise.all(
          ids.map((id) =>
            readJson('/api/db/action', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ path: `${dataPath}/${id}`, action: 'delete' }),
            }),
          ),
        )
      } else {
        const groupedTargets = new Map<string, string[]>()
        for (const id of ids) {
          const row = rowsById.get(String(id))
          const target = sourceDeleteTarget(row ?? { id })
          const bucket = groupedTargets.get(target.path) ?? []
          bucket.push(target.id)
          groupedTargets.set(target.path, bucket)
        }
        await Promise.all(
          [...groupedTargets].map(([path, sourceIds]) =>
            readJson('/api/db/delete', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ path, ids: sourceIds }),
            }),
          ),
        )
      }
      const gone = new Set(ids.map(String))
      if (!embed && detailId && gone.has(String(detailId))) onCloseRecord?.()
      const deletedRows = itemsRef.current.filter((row) => gone.has(String(row.id)))
      setPickedIds([])
      dropListedRecords(ids)
      publishListedMutation({
        path: dataPath,
        op: 'remove',
        ids: ids.map(String),
        viewId: activeViewIdRef.current,
        total: totalRef.current,
      })
      if (dataPath !== TRASH_COLLECTION_PATH) {
        const byTable = new Map<string, DbRecord[]>()
        for (const row of deletedRows) {
          const target = sourceDeleteTarget(row)
          const bucket = byTable.get(target.path) ?? []
          bucket.push({ ...row, id: target.id })
          byTable.set(target.path, bucket)
        }
        for (const [path, rows] of byTable) publishDeletedRowsToTrash(path, rows, title)
      }
      announceListChange()
      quietUntil.current = 0
      await reload({ force: true })
    } catch (err) {
      setError(String(err))
      quietUntil.current = 0
      await reload({ force: true })
    }
  }

  async function exportPicked() {
    const ids = pickedIds.filter(Boolean)
    if (!ids.length) return
    try {
      const { zipMarkdownPack, contentToMarkdown, markdownFileName, recordToMarkdown } = await import('./export-markdown.ts')
      const rowsById = new Map(items.map((row) => [row.id, row]))
      const files: Array<{ name: string; text: string }> = []
      for (const id of ids) {
        const listed = rowsById.get(id)
        const path = `${dataPath}/${id}`
        const rec = await readJson<{ value?: Record<string, unknown> }>(`/api/db/read?path=${encodeURIComponent(path)}`).catch(() => ({ value: listed }))
        const content = await readJson<{ value?: unknown }>(`/api/db/content?path=${encodeURIComponent(path)}`).catch(() => ({
          value: listed && bodyKey ? listed[bodyKey] : '',
        }))
        const row = { ...(listed ?? { id }), ...(rec.value ?? {}), id }
        files.push({
          name: markdownFileName(row),
          text: recordToMarkdown(row, contentToMarkdown(content.value), bodyKey),
        })
      }
      const blob = zipMarkdownPack(files)
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = `${title || 'records'}.zip`
      link.click()
      URL.revokeObjectURL(href)
    } catch (err) {
      setError(String(err))
    }
  }

  async function executeBulkEdit(ids: string[], key: string, raw: string) {
    const field = schema?.fields[key]
    if (!field) return
    const idSet = new Set(ids)
    const rows = items.filter((row) => idSet.has(row.id))
    const parsed = parseFieldValue(field, raw)
    try {
      for (const row of rows) await writePatch(row, { [key]: parsed })
      setPickedIds([])
    } catch (err) {
      setError(String(err))
    }
  }

  async function executeBulkTag(ids: string[], addTags: string[]) {
    if (!addTags.length) return
    const idSet = new Set(ids)
    const rows = items.filter((row) => idSet.has(row.id))
    try {
      for (const row of rows) {
        const current = normalizeSchemaValue(row.tag)
        const tags = [...current.tags]
        for (const id of addTags) if (!tags.includes(id)) tags.push(id)
        await writePatch(row, { tag: { tags, values: current.values } })
      }
      setPickedIds([])
    } catch (err) {
      setError(String(err))
    }
  }

  async function writeOne(row: DbRecord, key: string, field: FieldSpec, raw: string) {
    await writePatch(row, { [key]: parseFieldValue(field, raw) })
  }

  function writeCellValue(row: DbRecord, key: string, field: FieldSpec, next: unknown) {
    const flat = parseTagFlatColumnKey(key)
    if (flat && schema) {
      const source = tagSourceKey(schema)
      void writePatch(row, { [source]: patchTagFlatValue(row, key, next, source) })
      return
    }
    void writePatch(row, { [key]: next })
  }

  async function writeBatchCellValues(
    mutations: Array<{ row: DbRecord; key: string; field: FieldSpec; value: unknown }>,
  ) {
    if (!mutations.length) return
    const activeSchema = schemaRef.current ?? schema
    const source = activeSchema ? tagSourceKey(activeSchema) : 'tag'
    const byRow = new Map<string, { row: DbRecord; content: Record<string, unknown> }>()

    for (const item of mutations) {
      const id = item.row.id
      let bucket = byRow.get(id)
      if (!bucket) {
        const latest =
          itemsRef.current.find((rec) => rec.id === id) ??
          (detailRowRef.current?.id === id ? detailRowRef.current : null) ??
          item.row
        bucket = { row: latest, content: {} }
        byRow.set(id, bucket)
      }
      const flat = parseTagFlatColumnKey(item.key)
      if (flat && activeSchema) {
        const baseRow: DbRecord = Object.prototype.hasOwnProperty.call(bucket.content, source)
          ? { ...bucket.row, [source]: bucket.content[source] }
          : bucket.row
        bucket.content[source] = patchTagFlatValue(baseRow, item.key, item.value, source)
      } else {
        bucket.content[item.key] = item.value
      }
    }

    const groupedEntries = Array.from(byRow.values()).filter((entry) => Object.keys(entry.content).length > 0)
    if (!groupedEntries.length) return

    const releases: Array<() => void> = []
    try {
      quietUntil.current = Date.now() + 800
      for (const { row, content } of groupedEntries) {
        releases.push(pendingFieldTrackerRef.current!.track(row.id, content))
        if (dataPathRef.current === dataPath) {
          setDetailRow((prev) => (prev?.id === row.id ? overlayListedRow(prev, { ...prev, ...content }) : prev))
        }
      }

      await tableEditHistory.editBatch(
        groupedEntries.map(({ row, content }) => {
          const path = `${dataPath}/${row.id}`
          const beforeRow = row
          return {
            key: path,
            patch: content,
            read: async () => itemsRef.current.find((item) => item.id === row.id) ?? beforeRow,
            write: async (patch) => {
              if (dataPathRef.current === dataPath) {
                setDetailRow((prev) => (prev?.id === row.id ? overlayListedRow(prev, { ...prev, ...patch }) : prev))
              }
              const data = await readJson<{ value?: DbRecord }>('/api/db/update', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ path, content: patch }),
              })
              const next = data.value
              if (!next) throw new Error('保存失败：服务端没有返回记录')
              if (dataPathRef.current === dataPath) {
                const displayed = next.id === row.id ? next : overlayListedRow(row, { ...next, id: row.id })
                const merge = (item: DbRecord) => (item.id === row.id ? overlayListedRow(item, displayed) : item)
                const merged = overlayListedRow(itemsRef.current.find((item) => item.id === row.id) ?? row, displayed)
                const stillMatches = matchListFilterRecord(merged, queryFiltersRef.current, schemaRef.current, tagCatalogRef.current)
                if (stillMatches) {
                  mapListedRecords(merge)
                } else {
                  dropListedRecords([row.id], { keepHistory: true })
                }
                const protectedDisplay = applyPendingDetailPatches(displayed)
                setDetailRow((prev) => (prev?.id === row.id ? overlayListedRow(prev, protectedDisplay) : prev))
                publishListedMutation({ path: dataPath, op: 'patch', row: displayed, groupBy: groupByRef.current })
                announceListChange(stillMatches, path)
                quietUntil.current = Date.now() + 800
              } else {
                forgetListCache(dataPath)
                invalidateListReads()
              }
              return next
            },
          }
        }),
      )
    } catch (err) {
      if (dataPathRef.current !== dataPath) return
      quietUntil.current = 0
      setError(String(err))
    } finally {
      for (const release of releases) release()
    }
  }

  return {
    executeAction,
    writePatch,
    insertCreatedRecord,
    createChildRecord,
    groupCreateSeed,
    createInGroup,
    createRecord,
    executeDeleteRecord,
    executeDeleteRecords,
    exportPicked,
    executeBulkEdit,
    executeBulkTag,
    writeOne,
    writeCellValue,
    writeBatchCellValues,
  }
}
