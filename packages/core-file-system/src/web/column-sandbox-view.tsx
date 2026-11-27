import React, { Component, memo, type ReactNode } from 'react'
import { BoundedMap } from '@biu/biu-ui/cache'
import type { FieldType } from '@biu/type-file-system'
import { hasForbiddenModuleSyntax, stripReactImports, transpileSandboxJsx } from './sandbox-compile.ts'
import { savedViewRecordPath } from '../paths.ts'
import {
  activeColumnSandboxItem,
  defaultColumnSandboxCode,
  normalizeColumnViews,
  resolveColumnSandboxItems,
  type ColumnSandboxItem,
  type ColumnSandboxProps,
  type ColumnViewConfig,
} from './column-sandbox-model.ts'

export {
  activeColumnSandboxItem,
  defaultColumnSandboxCode,
  normalizeColumnViews,
  resolveColumnSandboxItems,
  type ColumnSandboxItem,
  type ColumnSandboxProps,
  type ColumnViewConfig,
}

type CompiledSandbox =
  | { ok: true; Component: React.ComponentType<ColumnSandboxProps> }
  | { ok: false; error: string }

const COMPILE_CACHE_MAX = 80
const COMPILE_CACHE = new BoundedMap<string, CompiledSandbox>(COMPILE_CACHE_MAX)

export function compileColumnSandbox(source: string): CompiledSandbox {
  const text = String(source ?? '').trim()
  if (!text) return { ok: false, error: '代码为空' }
  const cached = COMPILE_CACHE.get(text)
  if (cached) return cached

  const save = (res: CompiledSandbox) => {
    COMPILE_CACHE.set(text, res)
    return res
  }

  if (hasForbiddenModuleSyntax(text, false)) {
    return save({ ok: false, error: '不允许 import/require 外部模块' })
  }
  try {
    const stripped = stripReactImports(text)
      .replace(/export\s+default\s+function\s+([A-Za-z0-9_$]*)\s*\(/g, 'const __Cell = function $1(')
      .replace(/export\s+default\s+/g, 'const __Cell = ')
    if (hasForbiddenModuleSyntax(stripped, true)) {
      return save({ ok: false, error: '不允许 import/require 外部模块' })
    }
    const js = transpileSandboxJsx(stripped, 'column-sandbox.tsx')
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function(
      'React',
      'useState',
      'useMemo',
      'useEffect',
      'useRef',
      `${js}\nreturn typeof __Cell !== 'undefined' ? __Cell : (typeof Cell !== 'undefined' ? Cell : (typeof App !== 'undefined' ? App : null));`,
    )
    const Comp = factory(React, React.useState, React.useMemo, React.useEffect, React.useRef)
    if (typeof Comp !== 'function') {
      return save({ ok: false, error: '需要 export default function Cell({ value, row })' })
    }
    return save({ ok: true, Component: Comp as React.ComponentType<ColumnSandboxProps> })
  } catch (err) {
    return save({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

class SandboxCellBoundary extends Component<
  { code: string; children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null }

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || '渲染异常' }
  }

  componentDidUpdate(prevProps: { code: string }) {
    if (prevProps.code !== this.props.code && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <span className="fsdb-col-sandbox-err" title={this.state.error}>
          视图错误
        </span>
      )
    }
    return this.props.children
  }
}

export const ColumnSandboxCell = memo(function ColumnSandboxCell({
  code,
  value,
  row,
  columnKey,
  label,
  kind,
}: ColumnSandboxProps & { code: string }) {
  const compiled = compileColumnSandbox(code)
  if (!compiled.ok) {
    return (
      <span className="fsdb-col-sandbox-err" title={compiled.error}>
        视图语法错
      </span>
    )
  }
  const Comp = compiled.Component
  return (
    <SandboxCellBoundary code={code}>
      <Comp value={value} row={row} columnKey={columnKey} label={label} kind={kind} />
    </SandboxCellBoundary>
  )
})

export function askAgentEditColumnSandbox(opts: {
  collectionPath: string
  viewId: string | null
  viewName?: string
  columnKey: string
  columnLabel: string
  kind: FieldType
  sandbox: ColumnSandboxItem
  tagPackId?: string
  tagFieldKey?: string
}) {
  const tagPath = opts.tagPackId ? `/tags/${opts.tagPackId}` : ''
  const viewPath = opts.viewId ? savedViewRecordPath(opts.collectionPath, opts.viewId) : ''
  const targetHint = tagPath && opts.tagFieldKey
    ? `请先 db_read path="${tagPath}" 读取标签定义，然后用 db_update path="${tagPath}" 只更新 fields 中 key="${opts.tagFieldKey}" 的 views 数组里 id="${opts.sandbox.id}"（${opts.sandbox.name}）的 code 字段（保留其他字段和视图不变）。`
    : viewPath
      ? `请先 db_read path="${viewPath}" 读取当前视图的 columnViews，然后用 db_update path="${viewPath}" 只更新 columnViews["${opts.columnKey}"] 里 id="${opts.sandbox.id}"（${opts.sandbox.name}）的 code 字段（保留其他列与视图配置不变）。`
      : `请帮我修改列「${opts.columnLabel}」（key: ${opts.columnKey}）的属性沙箱视图「${opts.sandbox.name}」的 JSX 代码。`
  const draft = `请帮我优化表格列「${opts.columnLabel}」（类型：${opts.kind}）的属性沙箱视图「${opts.sandbox.name}」的展示样式。先听我描述想要的展示效果。\n${targetHint}\n组件签名：export default function Cell({ value, row, columnKey, label, kind })，不需要 import（React Hooks 可直接使用）。当前代码：\n\`\`\`jsx\n${opts.sandbox.code}\n\`\`\``
  void import('@biu/core-pick/web').then((mod) => {
    mod.getPick()?.attach(
      [
        {
          kind: 'record',
          id: opts.tagPackId ?? opts.viewId ?? opts.columnKey,
          path: tagPath || viewPath || opts.collectionPath,
          label: `${opts.columnLabel} · ${opts.sandbox.name}`,
          title: opts.viewName ? `${opts.viewName} / ${opts.columnLabel}` : opts.columnLabel,
          route: typeof window === 'undefined' ? '' : window.location.pathname,
        },
      ],
      { text: draft },
    )
  })
}
