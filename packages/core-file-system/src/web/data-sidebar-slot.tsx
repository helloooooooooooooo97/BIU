import type { SlotProps } from '@biu/types/slots'
import { DataSidebar } from './data-sidebar.tsx'
import { DataSidebarShell } from './data-sidebar-shell.tsx'
import { useDataSidebarLive } from './data-sidebar-host.ts'

export function DataSidebarSlot(_props?: SlotProps) {
  const live = useDataSidebarLive()
  if (!live) return <DataSidebarShell />
  return <DataSidebar framed {...live} />
}
