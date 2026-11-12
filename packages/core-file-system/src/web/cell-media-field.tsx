import { useEffect, useRef, useState } from 'react'
import { Image } from '@biu/biu-ui'
import { ArrowUpTrayIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { asAttachmentList, asHttpHref, asImageSrcList, commitAttachments } from '@biu/type-file-system'
import { LocalText } from './controls.tsx'
import {
  AttachmentFile,
  collectClipboardFiles,
  collectClipboardImages,
  commitImages,
  pasteTargetIsField,
  documentLogicalName,
  recordResourcePath,
  uniqueFiles,
  uploadDbAsset,
  uploadDbDocument,
} from './cell-media.tsx'

function isFileListKind(kind: 'image' | 'attachment' | 'url' | 'document') {
  return kind === 'attachment' || kind === 'document'
}

export function MediaField({
  kind,
  value,
  collectionPath,
  recordId,
  fieldKey,
  compact = false,
  onCommit,
}: {
  kind: 'image' | 'attachment' | 'url' | 'document'
  value: unknown
  collectionPath?: string
  recordId?: string
  fieldKey?: string
  compact?: boolean
  onCommit: (next: unknown) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const takeFilesRef = useRef<(picked: File[]) => Promise<void>>(async () => {})
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const images = kind === 'image' ? asImageSrcList(value) : []
  const imagesRef = useRef(images)
  imagesRef.current = images
  const files = isFileListKind(kind) ? asAttachmentList(value) : []
  const filesRef = useRef(files)
  filesRef.current = files
  const href = kind === 'url' ? asHttpHref(value) : ''

  async function takeFiles(picked: File[]) {
    setError('')
    try {
      if (kind === 'url') return
      const files = kind === 'image' ? picked.filter((item) => item.type.startsWith('image/')) : picked
      if (kind === 'image' && !files.length) throw new Error('请选择图片')
      if (isFileListKind(kind) && !files.length) throw new Error('请选择文件')
      const addedImages: string[] = []
      const addedFiles: Array<{ name: string; href: string; bytes?: number }> = []
      const path = recordResourcePath(collectionPath, recordId)
      for (const item of files) {
        if (kind === 'document') {
          const logical = documentLogicalName(recordId ?? '', fieldKey ?? 'doc', item.name, filesRef.current)
          const written = await uploadDbDocument(item, path, logical)
          addedFiles.push({ name: item.name || written.name, href: written.href, bytes: item.size })
        } else {
          const written = await uploadDbAsset(item, path)
          if (kind === 'image') addedImages.push(written.href)
          else addedFiles.push({ name: item.name || written.name, href: written.href, bytes: item.size })
        }
      }
      if (kind === 'image') commitImages([...imagesRef.current, ...addedImages], onCommit)
      else {
        const next = [...filesRef.current]
        for (const file of addedFiles) {
          const at = next.findIndex((item) => item.name === file.name)
          if (at >= 0) next[at] = file
          else next.push(file)
        }
        onCommit(commitAttachments(next))
      }
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
    }
  }

  takeFilesRef.current = takeFiles

  useEffect(() => {
    if (kind !== 'image' && !isFileListKind(kind)) return
    const onPaste = (event: ClipboardEvent) => {
      if (pasteTargetIsField(event.target)) return
      const next = kind === 'image' ? collectClipboardImages(event.clipboardData) : collectClipboardFiles(event.clipboardData)
      if (!next.length) return
      event.preventDefault()
      void takeFilesRef.current(next)
    }
    document.addEventListener('paste', onPaste, true)
    return () => document.removeEventListener('paste', onPaste, true)
  }, [kind])

  function dropFiles(transfer: DataTransfer | null | undefined) {
    const next = uniqueFiles(Array.from(transfer?.files ?? []))
    if (next.length) void takeFiles(next)
  }

  if (kind === 'url') {
    return (
      <LocalText className="fsdb-plain-input" value={href} placeholder="https://" onCommit={(next) => onCommit(next.trim())} />
    )
  }

  const label = kind === 'image' ? '上传图片' : kind === 'document' ? '上传文档' : '上传附件'

  return (
    <div
      className={`fsdb-media-field${compact ? ' is-compact' : ''} is-stack${isFileListKind(kind) ? ' is-files' : ' is-image'}`}
      tabIndex={0}
      title={error || undefined}
    >
      {kind === 'image' && images.length ? (
        <Image.PreviewGroup>
        <span className="fsdb-media-thumbs">
          {images.map((src, index) => (
            <span key={`${src}-${index}`} className="fsdb-media-thumb">
              <Image className="fsdb-media-preview" src={src} alt="" width={56} height={56} preview={{ mask: false }} />
              <button
                type="button"
                className="fsdb-media-remove"
                aria-label="移除图片"
                onClick={() => commitImages(images.filter((_, i) => i !== index), onCommit)}
              >
                <XMarkIcon aria-hidden className="size-3" />
              </button>
            </span>
          ))}
        </span>
        </Image.PreviewGroup>
      ) : null}
      {isFileListKind(kind) && files.length ? (
        <span className="fsdb-files">
          {files.map((item, index) => (
            <AttachmentFile
              key={`${item.href}-${index}`}
              file={item}
              kind={kind === 'document' ? 'document' : 'attachment'}
              onRemove={() => onCommit(commitAttachments(files.filter((_, i) => i !== index)))}
            />
          ))}
        </span>
      ) : null}
      <button
        type="button"
        className={`fsdb-media-drop${isFileListKind(kind) ? ' is-files' : ''}${dragOver ? ' is-over' : ''}`}
        aria-label={label}
        title={label}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setDragOver(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setDragOver(false)
          dropFiles(event.dataTransfer)
        }}
      >
        <span className="fsdb-media-pick is-upload">
          <ArrowUpTrayIcon aria-hidden className="size-[16px]" />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={kind === 'image' || isFileListKind(kind)}
        accept={kind === 'image' ? 'image/*' : undefined}
        onChange={(event) => {
          const next = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (next.length) void takeFiles(next)
        }}
      />
      {error ? <p className="fsdb-media-error">{error}</p> : null}
    </div>
  )
}
