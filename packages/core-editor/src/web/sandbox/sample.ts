export const SANDBOX_SAMPLE = `export default function App() {
  const [count, setCount] = React.useState(0)
  return (
    <div style={{
      padding: 20,
      fontFamily: 'var(--biu-font-sans, system-ui, sans-serif)',
      color: 'var(--biu-color-text)',
      background: 'var(--biu-color-surface, var(--biu-color-bg))',
      borderRadius: 'var(--biu-radius-lg, 12px)',
      border: 'var(--biu-stroke-width, 1px) solid color-mix(in srgb, var(--biu-color-text) 10%, transparent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Sandbox</div>
        <div style={{ fontSize: 12, color: 'var(--biu-color-text-muted)', marginTop: 2 }}>
          Edit JSX to build an interactive block.
        </div>
      </div>
      <button
        type="button"
        onClick={() => setCount((n) => n + 1)}
        style={{
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid color-mix(in srgb, var(--biu-color-text) 16%, transparent)',
          background: 'transparent',
          color: 'inherit',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Count: {count}
      </button>
    </div>
  )
}
`
