import { Fragment, type ReactNode } from 'react'

/**
 * 解析正文与小标题中的轻量行内标记：
 * - **加粗**
 * - *斜体*
 * - `行内代码`
 * - [1] 学术引用角标（渲染为右上角 sup，并锚点跳转至文末参考文献 #ref-1）
 */
export function renderInlineText(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[\d+\])/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={key++}>{renderInlineText(token.slice(2, -2))}</strong>)
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(<code key={key++} className="site-article-inline-code">{token.slice(1, -1)}</code>)
    } else if (token.startsWith('[') && token.endsWith(']')) {
      const num = token.slice(1, -1)
      nodes.push(
        <sup key={key++} className="site-article-cite">
          <a href={`#ref-${num}`} aria-label={`Reference ${num}`}>[{num}]</a>
        </sup>,
      )
    }
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

const CODE_TOKEN_PATTERN = new RegExp(
  [
    '(?<comment>(?:^|\\s)(?:#|--).*$)',
    '(?<directive>:::[a-zA-Z]*\\b|:::)',
    '(?<jsonKey>"(?:[^"\\\\]|\\\\.)*"(?=\\s*:))',
    '(?<string>"(?:[^"\\\\]|\\\\.)*")',
    '(?<path>\\/(?:pages|tasks|plugins|editor-blocks|components|v\\d+)[^\\s},]*)',
    '(?<cmd>\\b(?:db_list|db_read|db_update|db_create|db_action|on|if|then|else|end|put|into|go|to|answer|AND|OR|true|false|null|POST|GET|PUT|DELETE)\\b)',
    '(?<attr>\\b(?:kind|plugin|env|seats|rush|currency|slaDays|status|latencyMs|assertion|client|cohort|role|owner)(?==|:))',
    '(?<num>\\b\\d+(?:\\.\\d+)?(?:ms|s|%|T|B|M|K)?\\b)',
    '(?<op>(?:──▶|◀──|─+|→|←+|⇄|∩|├──|└──|│))',
  ].join('|'),
  'gm',
)

function highlightLine(line: string, lineKey: number): ReactNode {
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  CODE_TOKEN_PATTERN.lastIndex = 0
  while ((match = CODE_TOKEN_PATTERN.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index))
    }
    const groups = match.groups ?? {}
    let cls = ''
    if (groups.comment) cls = 'site-tok-comment'
    else if (groups.directive) cls = 'site-tok-directive'
    else if (groups.jsonKey || groups.attr) cls = 'site-tok-key'
    else if (groups.string) cls = 'site-tok-string'
    else if (groups.path) cls = 'site-tok-path'
    else if (groups.cmd) cls = 'site-tok-cmd'
    else if (groups.num) cls = 'site-tok-num'
    else if (groups.op) cls = 'site-tok-op'

    if (cls) {
      parts.push(<span key={key++} className={cls}>{match[0]}</span>)
    } else {
      parts.push(match[0])
    }
    lastIndex = CODE_TOKEN_PATTERN.lastIndex
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex))
  }

  return <span key={lineKey} className="site-code-line">{parts.length ? parts : '\n'}</span>
}

/** 面向博客代码块（命令、JSON、架构图、HyperTalk 等）的轻量语法高亮。 */
export function HighlightedCode({ code }: { code: string }) {
  const lines = code.split('\n')
  return (
    <pre className="site-article-code">
      <code>
        {lines.map((line, i) => (
          <Fragment key={i}>
            {highlightLine(line, i)}
            {i < lines.length - 1 ? '\n' : null}
          </Fragment>
        ))}
      </code>
    </pre>
  )
}
