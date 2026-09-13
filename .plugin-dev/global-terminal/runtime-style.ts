const STYLE_ID = 'biu-xterm-runtime-style'

const CSS = `
.xterm {
  cursor: text;
  position: relative;
  user-select: none;
  -webkit-user-select: none;
}
.xterm.focus,
.xterm:focus {
  outline: none;
}
.xterm .xterm-helpers {
  position: absolute;
  top: 0;
  z-index: 5;
}
.xterm .xterm-helper-textarea {
  position: absolute !important;
  top: 0;
  left: -9999em;
  z-index: -5;
  width: 0;
  height: 0;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden;
  resize: none;
  border: 0 !important;
  outline: 0 !important;
  opacity: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  white-space: nowrap;
}
.xterm .composition-view {
  position: absolute;
  z-index: 1;
  display: none;
  color: #fff;
  background: #000;
  white-space: nowrap;
}
.xterm .composition-view.active {
  display: block;
}
.xterm .xterm-viewport {
  position: absolute;
  inset: 0;
  overflow-y: scroll;
  cursor: default;
  background: #111318;
}
.xterm .xterm-screen {
  position: relative;
}
.xterm .xterm-screen canvas {
  position: absolute;
  top: 0;
  left: 0;
}
.xterm-char-measure-element,
.xterm-width-cache-measure-container {
  position: absolute !important;
  top: 0 !important;
  left: -9999em !important;
  width: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
  visibility: hidden !important;
}
.xterm .xterm-accessibility:not(.debug),
.xterm .xterm-message {
  position: absolute;
  inset: 0;
  z-index: 10;
  color: transparent;
  pointer-events: none;
}
.xterm .live-region {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
`

/** Critical xterm layout cannot depend on runtime plugin CSS import order. */
export function ensureXtermRuntimeStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
