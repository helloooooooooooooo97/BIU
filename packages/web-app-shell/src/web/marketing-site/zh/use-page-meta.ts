import { useEffect } from 'react'
import { asset } from './site-base.ts'

export type PageMeta = {
  title: string
  description: string
  /** 用于 og:url / canonical 的路径，如 /pricing */
  path: string
  image?: string
}

const SITE_NAME = 'BIU'
const DEFAULT_IMAGE = '/og-image.png'

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function setLink(rel: string, href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!tag) {
    tag = document.createElement('link')
    tag.setAttribute('rel', rel)
    document.head.appendChild(tag)
  }
  tag.setAttribute('href', href)
}

/**
 * 为当前页面写入独立 title / description / og / canonical。
 * 规划 §7.2：原先 index.html 的 title 写死，多页后必须每页独立。
 */
export function usePageMeta({ title, description, path, image }: PageMeta) {
  useEffect(() => {
    const fullTitle = title === SITE_NAME ? title : `${title} · ${SITE_NAME}`
    const url = typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString()
    const ogImage = typeof window === 'undefined' ? (image ?? DEFAULT_IMAGE) : new URL(asset(image ?? DEFAULT_IMAGE), window.location.origin).toString()

    document.title = fullTitle
    setMeta('name', 'description', description)
    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:image', ogImage)
    setMeta('property', 'og:site_name', SITE_NAME)
    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', fullTitle)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:image', ogImage)
    setLink('canonical', url)
  }, [title, description, path, image])
}
