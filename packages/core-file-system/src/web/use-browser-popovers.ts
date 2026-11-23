import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

export type BrowserPopoverId =
  | 'view'
  | 'mode'
  | 'sort'
  | 'columns'
  | 'filter'
  | 'config'
  | 'group'
  | 'layout'
  | 'bulk'
  | 'createScope'
  | 'createType'

export function nextPopoverState(
  current: BrowserPopoverId | null,
  target: BrowserPopoverId,
  next: SetStateAction<boolean>,
): BrowserPopoverId | null {
  const isCurrentlyOpen = current === target
  const wantOpen = typeof next === 'function' ? next(isCurrentlyOpen) : next
  if (wantOpen) return target
  return isCurrentlyOpen ? null : current
}

export function togglePopoverState(
  current: BrowserPopoverId | null,
  target: BrowserPopoverId,
): BrowserPopoverId | null {
  return current === target ? null : target
}

/**
 * Consolidates 11 mutually-exclusive toolbar/creation popover booleans into a single
 * `openMenu` state while exposing stable `Dispatch<SetStateAction<boolean>>` adapters.
 */
export function useBrowserPopovers() {
  const [openMenu, setOpenMenu] = useState<BrowserPopoverId | null>(null)

  const toggleMenu = useCallback((which: BrowserPopoverId) => {
    setOpenMenu((prev) => togglePopoverState(prev, which))
  }, [])

  const closeAllMenus = useCallback(() => {
    setOpenMenu(null)
  }, [])

  const makeSetter = (id: BrowserPopoverId): Dispatch<SetStateAction<boolean>> =>
    useCallback(
      (next: SetStateAction<boolean>) => {
        setOpenMenu((prev) => nextPopoverState(prev, id, next))
      },
      [id],
    )

  const setViewMenuOpen = makeSetter('view')
  const setModeMenuOpen = makeSetter('mode')
  const setSortMenuOpen = makeSetter('sort')
  const setColumnMenuOpen = makeSetter('columns')
  const setFilterOpen = makeSetter('filter')
  const setConfigOpen = makeSetter('config')
  const setGroupOpen = makeSetter('group')
  const setLayoutOpen = makeSetter('layout')
  const setBulkMenuOpen = makeSetter('bulk')
  const setCreateScopeOpen = makeSetter('createScope')
  const setCreateTypeOpen = makeSetter('createType')

  return {
    openMenu,
    toggleMenu,
    closeAllMenus,
    viewMenuOpen: openMenu === 'view',
    setViewMenuOpen,
    modeMenuOpen: openMenu === 'mode',
    setModeMenuOpen,
    sortMenuOpen: openMenu === 'sort',
    setSortMenuOpen,
    columnMenuOpen: openMenu === 'columns',
    setColumnMenuOpen,
    filterOpen: openMenu === 'filter',
    setFilterOpen,
    configOpen: openMenu === 'config',
    setConfigOpen,
    groupOpen: openMenu === 'group',
    setGroupOpen,
    layoutOpen: openMenu === 'layout',
    setLayoutOpen,
    bulkMenuOpen: openMenu === 'bulk',
    setBulkMenuOpen,
    createScopeOpen: openMenu === 'createScope',
    setCreateScopeOpen,
    createTypeOpen: openMenu === 'createType',
    setCreateTypeOpen,
  }
}
