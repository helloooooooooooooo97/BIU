import {
  CodeBracketIcon,
  DocumentTextIcon,
  EyeSlashIcon,
  ListBulletIcon,
  QueueListIcon,
  Squares2X2Icon,
  TableCellsIcon,
} from '@heroicons/react/16/solid'
import type { ViewCatalogIcon } from './view-catalog.ts'

export function ViewCatalogGlyph({
  icon,
  className = 'tasks-viewdd-item-ico',
}: {
  icon?: ViewCatalogIcon
  className?: string
}) {
  if (icon === 'outline') return <ListBulletIcon aria-hidden className={className} />
  if (icon === 'table') return <TableCellsIcon aria-hidden className={className} />
  if (icon === 'source') return <CodeBracketIcon aria-hidden className={className} />
  if (icon === 'hidden') return <EyeSlashIcon aria-hidden className={className} />
  if (icon === 'sandbox') return <Squares2X2Icon aria-hidden className={className} />
  if (icon === 'layout') return <Squares2X2Icon aria-hidden className={className} />
  if (icon === 'props') return <QueueListIcon aria-hidden className={className} />
  return <DocumentTextIcon aria-hidden className={className} />
}
