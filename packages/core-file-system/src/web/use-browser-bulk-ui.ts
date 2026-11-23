import { useCallback, useLayoutEffect, useState, type RefObject } from 'react'
import type { BrowserDialogState } from './browser-dialogs.tsx'

export interface BulkMenuBox {
  top: number
  left: number
}

export function computeBulkMenuBox(rect: { bottom: number; left: number }): BulkMenuBox {
  return { top: rect.bottom + 6, left: rect.left }
}

/**
 * Consolidates bulk selection, bulk edit dialog state, floating bulk-menu positioning,
 * search bar toggle, and transient notice banner state out of CollectionBrowser.
 */
export function useBrowserBulkUi(bulkMenuOpen: boolean, bulkRef: RefObject<HTMLDivElement | null>) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const [pickMode, setPickMode] = useState(false)
  const [dlg, setDlg] = useState<BrowserDialogState>(null)
  const [bulkEditKey, setBulkEditKey] = useState('')
  const [bulkEditRaw, setBulkEditRaw] = useState('')
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([])
  const [bulkMenuBox, setBulkMenuBox] = useState<BulkMenuBox>({ top: 0, left: 0 })

  const placeBulkMenu = useCallback(() => {
    const el = bulkRef.current
    if (!el) return
    setBulkMenuBox(computeBulkMenuBox(el.getBoundingClientRect()))
  }, [bulkRef])

  useLayoutEffect(() => {
    if (!bulkMenuOpen) return
    placeBulkMenu()
    window.addEventListener('resize', placeBulkMenu)
    window.addEventListener('scroll', placeBulkMenu, true)
    return () => {
      window.removeEventListener('resize', placeBulkMenu)
      window.removeEventListener('scroll', placeBulkMenu, true)
    }
  }, [bulkMenuOpen, placeBulkMenu])

  return {
    searchOpen,
    setSearchOpen,
    notice,
    setNotice,
    pickedIds,
    setPickedIds,
    pickMode,
    setPickMode,
    dlg,
    setDlg,
    bulkEditKey,
    setBulkEditKey,
    bulkEditRaw,
    setBulkEditRaw,
    bulkTagIds,
    setBulkTagIds,
    bulkMenuBox,
    setBulkMenuBox,
  }
}
