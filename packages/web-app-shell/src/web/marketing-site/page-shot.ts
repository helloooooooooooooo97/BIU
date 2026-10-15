import { sitePath } from './site-base.ts'

/** 把当前官网页收成一张长图并下载。html-to-image 只在点击时加载。 */

const MAX_EDGE = 16000
/** 印花格子是 42px。截一条格子整数倍的竖条再往下平铺，接缝才对得上。 */
const PRINT_STRIP = 42 * 12

export function pageShotName(pathname: string) {
  const slug = pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || 'home'
  return `biu-${slug}.png`
}

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to generate image'))
    }
    image.src = url
  })
}

export async function downloadPageLongImage(root: HTMLElement = document.querySelector('.site') as HTMLElement) {
  if (!root) throw new Error('Page not found')
  root.classList.add('is-capturing')
  const revealed = [...root.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-visible)')]
  for (const node of revealed) node.classList.add('is-visible')
  const print = root.querySelector<HTMLElement>('.site-print')
  const printStyle = print?.getAttribute('style') ?? ''
  if (print) {
    print.style.setProperty('--print-shift', '0px')
    print.style.position = 'absolute'
    print.style.top = '0'
    print.style.left = '0'
    print.style.right = '0'
    print.style.bottom = 'auto'
    print.style.height = `${PRINT_STRIP}px`
    print.style.overflow = 'hidden'
  }
  try {
    const { toBlob } = await import('html-to-image')
    const pixelRatio = Math.max(1, Math.min(2, MAX_EDGE / Math.max(root.scrollWidth, root.scrollHeight)))
    // 印花 SVG 放进整页长图时只画得出最上面一屏，所以先截一条能平铺的，再垫在页面下面。
    const stripBlob = print ? await toBlob(print, { pixelRatio, backgroundColor: 'transparent' }) : null
    if (print) print.style.visibility = 'hidden'
    const pageBlob = await toBlob(root, { pixelRatio, backgroundColor: 'transparent' })
    if (!pageBlob) throw new Error('Failed to generate image')
    const page = await loadImage(pageBlob)
    const canvas = document.createElement('canvas')
    canvas.width = page.width
    canvas.height = page.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to generate image')
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (stripBlob) {
      const strip = await loadImage(stripBlob)
      for (let y = 0; y < canvas.height; y += strip.height) ctx.drawImage(strip, 0, y)
    }
    ctx.drawImage(page, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Failed to generate image')
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = pageShotName(sitePath(location.pathname))
    link.click()
    URL.revokeObjectURL(url)
  } finally {
    if (print) print.setAttribute('style', printStyle)
    for (const node of revealed) node.classList.remove('is-visible')
    root.classList.remove('is-capturing')
  }
}
