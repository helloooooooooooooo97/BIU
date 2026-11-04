import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn 惯例：合并 Tailwind class，后写的盖过前面的冲突项。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
