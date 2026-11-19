import { afterEach, expect, test, vi } from 'vitest'
import { fitToolbarTools } from './toolbar-overflow.ts'

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })

test.each(['fsdb-refresh-wrap', 'tasks-refresh'])('tools disappear from the right and return when the toolbar grows (%s)', (refreshClass) => {
  const toolbar = document.createElement('div')
  toolbar.style.columnGap = '12px'
  toolbar.innerHTML = `
    <div class="tasks-toolbar-left"></div>
    <div class="tasks-toolbar-right" style="column-gap:2px">
      <div class="tasks-search-wrap"></div>
      <div class="tasks-sort-wrap"></div>
      <div class="tasks-filter-btn-wrap"></div>
      <div class="${refreshClass}"></div>
      <div class="fsdb-create-group"></div>
    </div>`
  document.body.append(toolbar)
  let availableWidth = 340
  let titleWidth = 120
  Object.defineProperty(toolbar, 'clientWidth', { get: () => availableWidth })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this === toolbar ? availableWidth
      : this.classList.contains('tasks-toolbar-left') ? Math.min(titleWidth, parseFloat(this.style.maxWidth) || titleWidth)
      : this.classList.contains('fsdb-create-group') ? 70 : 30
    return { left: 0, right: width, width, top: 0, bottom: 32, height: 32, x: 0, y: 0, toJSON() {} }
  })
  const hidden = () => [...toolbar.querySelectorAll('[data-toolbar-hidden]')].map((node) => node.className)
  fitToolbarTools(toolbar)
  expect(hidden()).toEqual([])

  availableWidth = 270
  fitToolbarTools(toolbar)
  expect(hidden()).toEqual(['tasks-filter-btn-wrap', refreshClass])

  titleWidth = 160
  fitToolbarTools(toolbar)
  expect(hidden()).toEqual(['tasks-search-wrap', 'tasks-sort-wrap', 'tasks-filter-btn-wrap', refreshClass])
  expect(toolbar.querySelector('.fsdb-create-group')!.hasAttribute('data-toolbar-hidden')).toBe(false)

  availableWidth = 400
  fitToolbarTools(toolbar)
  expect(hidden()).toEqual([])
})
