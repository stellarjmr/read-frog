import { atom } from "jotai"

const EMPTY_TAB_URLS = ["about:blank", "about:newtab", "safari://newtab", "favorites://"]

const EXTENSION_URLS = ["safari-web-extension://"]

export function isIgnoreUrl(url: string): boolean {
  return EMPTY_TAB_URLS.some((u) => url.includes(u)) || EXTENSION_URLS.some((u) => url.includes(u))
}

export const isIgnoreTabAtom = atom<boolean>(false)
