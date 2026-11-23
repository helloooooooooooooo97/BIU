import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('PropertyRow description popover', () => {
  it('shows description via a right-aligned info icon button + HeadlessPopover instead of hovering the property name', () => {
    const row = readFileSync(resolve(import.meta.dirname, './property-row.tsx'), 'utf8')
    const schema = readFileSync(resolve(import.meta.dirname, './schema-field.tsx'), 'utf8')
    const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')

    // PropertyRow no longer attaches description hover tooltip to the property name
    expect(row).not.toContain('data-dock-tip')
    expect(row).not.toContain('title={desc')
    expect(row).toContain('HeadlessPopover')
    expect(row).toContain('InformationCircleIcon')
    expect(row).toContain('className={`fsdb-prop-desc-btn')
    expect(row).toContain('className="fsdb-prop-desc-pop"')
    expect(row).toContain('onPointerEnter')
    expect(row).toContain('aria-pressed={pinned}')

    // SchemaPropName also uses PropertyDescriptionPop instead of hovering the name
    expect(schema).toContain('PropertyDescriptionPop')
    expect(schema).not.toContain('data-dock-tip={desc')

    // CSS right-aligns the icon button inside the property name cell and styles the popover
    expect(css).toContain('.fsdb-detail-aside .fsdb-proprow-k{display:flex;width:100%}')
    expect(css).toMatch(/\.fsdb-prop-desc-btn\{[^}]*margin-left:auto/)
    expect(css).toMatch(/\.fsdb-prop-desc-pop\{[^}]*--biu-color-bg-popover/)

    // DockHoverTip suppresses and clears hover tips when a popover trigger is clicked or expanded
    const tip = readFileSync(resolve(import.meta.dirname, './browser-row-title.tsx'), 'utf8')
    expect(tip).toContain("el.getAttribute('aria-expanded') === 'true'")
    expect(tip).toContain("window.addEventListener('click', clear, true)")
    expect(tip).toContain('new MutationObserver(sync)')
  })
})
