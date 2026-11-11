import { isLivePreview } from './active.ts'

const KEY = /^(keydown|keyup|keypress)$/i

function wrapListener(
  real: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject,
  live: () => boolean,
  store: WeakMap<EventListenerOrEventListenerObject, EventListener>,
) {
  if (!KEY.test(type)) return listener
  const prev = store.get(listener)
  if (prev) return prev
  const gated: EventListener = (event) => {
    if (!live()) return
    if (typeof listener === 'function') return listener.call(real, event)
    return listener.handleEvent(event)
  }
  store.set(listener, gated)
  return gated
}

function gateTarget<T extends object>(real: T, live: () => boolean): T {
  const add = (real as EventTarget).addEventListener?.bind(real)
  const remove = (real as EventTarget).removeEventListener?.bind(real)
  const store = new WeakMap<EventListenerOrEventListenerObject, EventListener>()
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'addEventListener' && add) {
        return (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
          if (!listener) return add(type, listener as EventListener, options)
          return add(type, wrapListener(real as EventTarget, type, listener, live, store), options)
        }
      }
      if (prop === 'removeEventListener' && remove) {
        return (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) => {
          if (!listener) return remove(type, listener as EventListener, options)
          return remove(type, store.get(listener) ?? listener, options)
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  })
}

export function sandboxGlobals(preview: HTMLElement | null) {
  const live = () => isLivePreview(preview)
  const documentView = gateTarget(document, live)
  const windowView = gateTarget(window, live)
  const windowWithDoc = new Proxy(windowView, {
    get(target, prop, receiver) {
      if (prop === 'document') return documentView
      if (prop === 'window' || prop === 'self' || prop === 'globalThis') return receiver
      return Reflect.get(target, prop, receiver)
    },
  })
  return { window: windowWithDoc, document: documentView, globalThis: windowWithDoc, self: windowWithDoc }
}
