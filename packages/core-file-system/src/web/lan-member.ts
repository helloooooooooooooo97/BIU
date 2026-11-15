export const LAN_MEMBER_KEY = 'biu.lan-member'

function newLanMemberId() {
  const webCrypto = globalThis.crypto as Crypto | undefined
  if (webCrypto && typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID()
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`.slice(0, 32)
}

/** 局域网分享访客身份：本机浏览器生成并保存在 localStorage 的随机码。 */
export function readLanMemberId() {
  if (typeof localStorage === 'undefined') return ''
  let id = localStorage.getItem(LAN_MEMBER_KEY) ?? ''
  if (!/^[0-9a-zA-Z._-]{8,80}$/.test(id)) {
    id = newLanMemberId()
    localStorage.setItem(LAN_MEMBER_KEY, id)
  }
  return id
}
