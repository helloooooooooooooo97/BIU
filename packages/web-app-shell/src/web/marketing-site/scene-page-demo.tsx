import { useState } from 'react'

export type DemoMetric = { label: string; value: string; hint?: string }
export type DemoCalcItem = { id: string; label: string; price: number; note: string; defaultOn?: boolean }

export type DemoBlock =
  | {
      kind: 'metrics'
      plugin: string
      custom?: boolean
      title: string
      items: DemoMetric[]
    }
  | {
      kind: 'table'
      plugin: string
      custom?: boolean
      title: string
      columns: string[]
      rows: string[][]
    }
  | {
      kind: 'checklist'
      plugin: string
      custom?: boolean
      title: string
      items: { label: string; meta: string; done?: boolean }[]
    }
  | {
      kind: 'code'
      plugin: string
      custom?: boolean
      title: string
      lang: string
      code: string
      output: string
    }
  | {
      kind: 'timeline'
      plugin: string
      custom?: boolean
      title: string
      tracks: { name: string; segments: { label: string; span: number }[] }[]
    }
  | {
      kind: 'calculator'
      plugin: string
      custom?: boolean
      title: string
      unit: string
      currency: string
      items: DemoCalcItem[]
    }

export type DemoPageSpec = {
  title: string
  badge: string
  props: [string, string][]
  intro: string
  blocks: DemoBlock[]
  aiPrompt: string
}

export type SceneDemoLabels = {
  demoBadge: string
  shareLabel: string
  customBadge: string
  builtInBadge: string
  totalLabel: string
  aiLabel: string
}

function InteractiveCalculator({
  block,
  totalLabel,
}: {
  block: Extract<DemoBlock, { kind: 'calculator' }>
  totalLabel: string
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    block.items.filter((item) => item.defaultOn !== false).map((item) => item.id),
  )
  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }
  const total = block.items
    .filter((item) => selected.includes(item.id))
    .reduce((sum, item) => sum + item.price, 0)

  return (
    <div className="site-dp-calc">
      <div className="site-dp-calc-list">
        {block.items.map((item) => {
          const on = selected.includes(item.id)
          return (
            <button
              type="button"
              key={item.id}
              className={on ? 'site-dp-calc-item is-on' : 'site-dp-calc-item'}
              aria-pressed={on}
              onClick={() => toggle(item.id)}
            >
              <span>
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </span>
              <em>{block.currency}{item.price.toLocaleString('en-US')}</em>
            </button>
          )
        })}
      </div>
      <div className="site-dp-calc-total">
        <span>{totalLabel}</span>
        <strong>{block.currency}{total.toLocaleString('en-US')} {block.unit}</strong>
      </div>
    </div>
  )
}

function InteractiveChecklist({ block }: { block: Extract<DemoBlock, { kind: 'checklist' }> }) {
  const [checked, setChecked] = useState<boolean[]>(() => block.items.map((item) => Boolean(item.done)))
  const toggle = (idx: number) => {
    setChecked((prev) => prev.map((v, i) => (i === idx ? !v : v)))
  }

  return (
    <ul className="site-dp-checklist">
      {block.items.map((item, idx) => (
        <li key={item.label} className={checked[idx] ? 'is-done' : ''}>
          <button type="button" aria-pressed={checked[idx]} onClick={() => toggle(idx)}>
            <span className="site-dp-check-box" aria-hidden>{checked[idx] ? '✓' : ''}</span>
            <span className="site-dp-check-label">{item.label}</span>
            <small>{item.meta}</small>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ScenePageDemo({
  spec,
  labels,
}: {
  spec: DemoPageSpec
  labels: SceneDemoLabels
}) {
  return (
    <div className="site-demo-page" aria-label={spec.title}>
      <div className="site-dp-chrome">
        <div className="site-dp-dots" aria-hidden>
          <span /><span /><span />
        </div>
        <span className="site-dp-path">BIU / {spec.badge}</span>
        <span className="site-dp-share">{labels.shareLabel}</span>
      </div>

      <div className="site-dp-body">
        <div className="site-dp-head">
          <span className="site-dp-eyebrow">{labels.demoBadge}</span>
          <h3>{spec.title}</h3>
          <dl className="site-dp-props">
            {spec.props.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="site-dp-intro">{spec.intro}</p>
        </div>

        <div className="site-dp-blocks">
          {spec.blocks.map((block) => (
            <section key={block.title} className="site-dp-block">
              <header className="site-dp-block-head">
                <strong>{block.title}</strong>
                <span className={block.custom ? 'site-dp-plugin-tag is-custom' : 'site-dp-plugin-tag'}>
                  {block.plugin} · {block.custom ? labels.customBadge : labels.builtInBadge}
                </span>
              </header>

              {block.kind === 'metrics' ? (
                <div className="site-dp-metrics">
                  {block.items.map((item) => (
                    <div key={item.label} className="site-dp-metric">
                      <small>{item.label}</small>
                      <strong>{item.value}</strong>
                      {item.hint ? <span>{item.hint}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {block.kind === 'table' ? (
                <div className="site-dp-table-wrap">
                  <table className="site-dp-table">
                    <thead>
                      <tr>
                        {block.columns.map((col) => <th key={col}>{col}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, idx) => (
                        <tr key={idx}>
                          {row.map((cell, cIdx) => <td key={cIdx}>{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {block.kind === 'checklist' ? <InteractiveChecklist block={block} /> : null}

              {block.kind === 'code' ? (
                <div className="site-dp-code">
                  <pre><code>{block.code}</code></pre>
                  <div className="site-dp-code-out">
                    <span>{block.lang}</span>
                    <code>{block.output}</code>
                  </div>
                </div>
              ) : null}

              {block.kind === 'timeline' ? (
                <div className="site-dp-timeline">
                  {block.tracks.map((track) => (
                    <div key={track.name} className="site-dp-track">
                      <span className="site-dp-track-name">{track.name}</span>
                      <div className="site-dp-track-bars">
                        {track.segments.map((seg) => (
                          <span key={seg.label} style={{ flexGrow: seg.span }}>{seg.label}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {block.kind === 'calculator' ? (
                <InteractiveCalculator block={block} totalLabel={labels.totalLabel} />
              ) : null}
            </section>
          ))}
        </div>

        <div className="site-dp-ai">
          <span>{labels.aiLabel}</span>
          <p>{spec.aiPrompt}</p>
        </div>
      </div>
    </div>
  )
}
