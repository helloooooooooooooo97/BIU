/** 把当前官网页收成一张长图并下载。html-to-image 只在点击时加载。 */

const MAX_EDGE = 16000

export function pageShotName(pathname: string) {
  const slug = pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || 'home'
  return `biu-${slug}.png`
}

export async function downloadPageLongImage(root: HTMLElement = document.querySelector('.site') as HTMLElement) {
  if (!root) throw new Error('找不到页面')
  root.classList.add('is-capturing')
  const revealed = [...root.querySelectorAll('[data-reveal]:not(.is-visible)')]
  for (const node of revealed) node.classList.add('is-visible')
  try {
    const { toBlob } = await import('html-to-image')
    const pixelRatio = Math.min(2, MAX_EDGE / Math.max(root.scrollWidth, root.scrollHeight))
    const blob = await toBlob(root, {
      pixelRatio: Math.max(1, pixelRatio),
      cacheBust: true,
      backgroundColor: '#000000',
    })
    if (!blob) throw new Error('生成失败')
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = pageShotName(location.pathname)
    link.click()
    URL.revokeObjectURL(url)
  } finally {
    for (const node of revealed) node.classList.remove('is-visible')
    root.classList.remove('is-capturing')
  }
}
