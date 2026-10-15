import { createContext, useContext } from 'react'

export type SiteLocale = 'en' | 'zh'

export const SITE_LOCALE_KEY = 'biu.site.locale'

export type SiteLocaleValue = {
  locale: SiteLocale
  setLocale: (locale: SiteLocale) => void
  toggleLocale: () => void
}

export const SiteLocaleContext = createContext<SiteLocaleValue>({
  locale: 'en',
  setLocale: () => {},
  toggleLocale: () => {},
})

export function readSiteLocale(): SiteLocale {
  if (typeof window === 'undefined') return 'en'
  try {
    return window.localStorage.getItem(SITE_LOCALE_KEY) === 'zh' ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

export function saveSiteLocale(locale: SiteLocale) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SITE_LOCALE_KEY, locale)
  } catch {
    // Private browsing may make localStorage unavailable.
  }
}

export function useSiteLocale(): SiteLocaleValue {
  return useContext(SiteLocaleContext)
}
