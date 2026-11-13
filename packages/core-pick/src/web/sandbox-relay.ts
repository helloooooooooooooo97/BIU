export const SANDBOX_PICK_EVENT = 'biu:sandbox-pick'

/** 沙箱内部自己报命中，外面只收结果。 */
export function bindSandboxPickRelay(root: ParentNode & EventTarget) {
  const onPointer = (event: Event) => {
    if (!(event instanceof PointerEvent)) return
    if (typeof document === 'undefined' || !document.documentElement.classList.contains('pick-mode')) return
    let stamp: HTMLElement | null = null
    for (const node of event.composedPath()) {
      if (!(node instanceof HTMLElement)) continue
      if (node.getAttribute('data-biu-kind') === 'sandbox' || node.hasAttribute('data-sandbox-pick')) {
        stamp = node
        break
      }
      if (node.hasAttribute('data-sandbox')) break
    }
    if (!stamp) return
    stamp.dispatchEvent(
      new CustomEvent(SANDBOX_PICK_EVENT, {
        bubbles: true,
        composed: true,
        detail: { el: stamp, type: event.type },
      }),
    )
  }
  root.addEventListener('pointermove', onPointer, true)
  root.addEventListener('pointerup', onPointer, true)
  return () => {
    root.removeEventListener('pointermove', onPointer, true)
    root.removeEventListener('pointerup', onPointer, true)
  }
}
