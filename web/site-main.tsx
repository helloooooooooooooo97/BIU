import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './style.css'
import { MarketingSite } from '../packages/web-app-shell/src/web/marketing-site/index.tsx'
import { SITE_BASE } from '../packages/web-app-shell/src/web/marketing-site/site-base.ts'

const el = document.querySelector<HTMLElement>('#app')
if (!el) throw new Error('#app missing')

const noop = () => {}

createRoot(el).render(
  <StrictMode>
    <BrowserRouter basename={SITE_BASE.replace(/\/$/, '') || undefined}>
      <MarketingSite login={false} onLogin={noop} onStart={noop} />
    </BrowserRouter>
  </StrictMode>,
)
