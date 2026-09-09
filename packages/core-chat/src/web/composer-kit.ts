import StarterKit from '@tiptap/starter-kit'
import { pageMention } from '@biu/core-editor/mention'
import { PickChipNode } from './composer-pick-node.tsx'

/** 输入栏：纯段落 + pick 芯片 + 与正文同一套 @mention。 */
export function composerDocExtensions() {
  return [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      bold: false,
      italic: false,
      strike: false,
      code: false,
      link: false,
      underline: false,
    }),
    PickChipNode,
    pageMention,
  ]
}
