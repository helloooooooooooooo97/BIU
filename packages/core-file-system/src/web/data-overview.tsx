import { useSyncExternalStore } from 'react'
import type { CollectionInfo, FieldType } from '@biu/type-file-system'
import { DataSidebarShell } from './data-sidebar-shell.tsx'
import { isIndexCollection, isSystemCollection, sortDataCollections } from './database-path.ts'
import { FieldGlyph } from './fsdb-cells.tsx'
import { ensureFsdbStyle } from './fsdb-style.ts'
import { getPagePrefs, subscribePageWidth } from './page-width.ts'
import { idleTableIconKind } from './table-glyph.tsx'

function groupLabel(path: string) {
  if (isSystemCollection(path)) return '系统数据'
  if (isIndexCollection(path)) return '索引数据'
  return '用户数据'
}

const COLUMNS: Array<{ key: string; label: string; kind: FieldType; pin?: boolean }> = [
  { key: 'title', label: '表', kind: 'string', pin: true },
  { key: 'group', label: '分组', kind: 'select' },
  { key: 'path', label: '路径', kind: 'string' },
  { key: 'blurb', label: '说明', kind: 'string' },
]

export function DataOverview({
  tables,
  onOpenTable,
}: {
  tables: CollectionInfo[]
  onOpenTable: (path: string) => void
}) {
  ensureFsdbStyle()
  const wide = useSyncExternalStore(subscribePageWidth, () => getPagePrefs().wide, () => false)
  const { user, index, system } = sortDataCollections(tables)
  const rows = [...user, ...index, ...system]
  return (
    <div className={`fsdb-page tasks-root${wide ? ' is-full-width' : ''}`} data-testid="fsdb-data-overview">
      <DataSidebarShell tables={tables} collectionPath="" title="数据" />
      <div className="fsdb-right">
        <div className="fsdb-right-body">
          <div className="app-pane-in">
            <div className="tasks-main fsdb-main">
              <div className="fsdb-detail-icon-slot">
                <span className="fsdb-detail-title-icon" aria-hidden>
                  <span className="fsdb-record-mark is-lg" data-icon="table" />
                </span>
              </div>
              <div className="fsdb-detail-title-row">
                <div className="fsdb-detail-title-block">
                  <h1 className="fsdb-detail-title">数据</h1>
                </div>
              </div>
              <div className="tasks-toolbar">
                <div className="tasks-toolbar-left" />
                <div className="tasks-toolbar-right" />
              </div>
              <div className="fsdb-workspace">
                <div className="fsdb-stage">
                  <div className="tasks-table-wrap">
                    <table className="tasks-table is-cols-fixed is-truncate">
                      <thead>
                        <tr>
                          {COLUMNS.map((col) => (
                            <th key={col.key} className={col.pin ? 'is-pin-col' : undefined}>
                              <span className="tasks-th">
                                <span className="tasks-th-ico">
                                  <FieldGlyph kind={col.kind} />
                                </span>
                                {col.label}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length ? (
                          rows.map((table) => (
                            <tr key={table.path} onClick={() => onOpenTable(table.path)}>
                              <td className="is-pin-col">
                                <span className="fsdb-title-host">
                                  <span
                                    className="fsdb-record-mark is-sm"
                                    data-icon={idleTableIconKind(table.view?.icon)}
                                    aria-hidden
                                  />
                                  <span className="fsdb-title-text">{table.view?.title ?? table.label ?? table.path}</span>
                                </span>
                              </td>
                              <td>
                                <span className="fsdb-cell">{groupLabel(table.path)}</span>
                              </td>
                              <td>
                                <span className="fsdb-cell">{table.path}</span>
                              </td>
                              <td>
                                <span className="fsdb-cell">{table.view?.blurb ?? ''}</span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={COLUMNS.length}>
                              <span className="fsdb-cell">还没有登记的数据表</span>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
