import { afterEach, describe, expect, it } from 'vitest'
import {
  collectDroppedFilePaths,
  fileAbsolutePath,
  isAbsoluteFilePath,
  pathFromFileUrl,
  pathsFromUriList,
} from './drop-file-paths.ts'

function fileWithPath(name: string, path: string, type = 'text/plain') {
  const file = new File([new Uint8Array(4)], name, { type })
  Object.defineProperty(file, 'path', { value: path })
  return file
}

afterEach(() => {
  delete (window as unknown as { biuBrowser?: unknown }).biuBrowser
})

describe('isAbsoluteFilePath', () => {
  it('accepts posix, windows, and UNC paths', () => {
    expect(isAbsoluteFilePath('/Users/ada/notes.txt')).toBe(true)
    expect(isAbsoluteFilePath('C:\\Users\\ada\\notes.txt')).toBe(true)
    expect(isAbsoluteFilePath('D:/tmp/a.pdf')).toBe(true)
    expect(isAbsoluteFilePath('\\\\server\\share\\a.txt')).toBe(true)
  })

  it('rejects relative names', () => {
    expect(isAbsoluteFilePath('notes.txt')).toBe(false)
    expect(isAbsoluteFilePath('./notes.txt')).toBe(false)
    expect(isAbsoluteFilePath('')).toBe(false)
  })
})

describe('pathFromFileUrl', () => {
  it('decodes posix and windows file URLs', () => {
    expect(pathFromFileUrl('file:///Users/ada/my%20file.pdf')).toBe('/Users/ada/my file.pdf')
    expect(pathFromFileUrl('file:///C:/Users/ada/a.txt')).toBe('C:/Users/ada/a.txt')
  })
})

describe('collectDroppedFilePaths', () => {
  it('reads Electron File.path and skips files without a path', () => {
    const withPath = fileWithPath('notes.txt', '/tmp/notes.txt')
    const image = new File([new Uint8Array(8)], 'shot.png', { type: 'image/png' })
    expect(collectDroppedFilePaths([withPath, image])).toEqual(['/tmp/notes.txt'])
    expect(fileAbsolutePath(image)).toBe('')
  })

  it('keeps sequential files and dedupes the same path', () => {
    const a = fileWithPath('a.txt', '/tmp/a.txt')
    const b = fileWithPath('b.txt', '/tmp/b.txt')
    const again = fileWithPath('a-copy.txt', '/tmp/a.txt')
    expect(collectDroppedFilePaths([a, b, again])).toEqual(['/tmp/a.txt', '/tmp/b.txt'])
  })

  it('uses the Electron pathForFile bridge when File.path is missing', () => {
    const file = new File([new Uint8Array(4)], 'from-bridge.pdf', { type: 'application/pdf' })
    ;(window as unknown as { biuBrowser: { pathForFile: (item: File) => string } }).biuBrowser = {
      pathForFile: (item) => (item === file ? '/Users/ada/from-bridge.pdf' : ''),
    }
    expect(collectDroppedFilePaths([file])).toEqual(['/Users/ada/from-bridge.pdf'])
  })

  it('parses file:// lines from the uri-list', () => {
    expect(pathsFromUriList('file:///tmp/one.txt\n#comment\nfile:///tmp/two.txt')).toEqual([
      '/tmp/one.txt',
      '/tmp/two.txt',
    ])
    expect(
      collectDroppedFilePaths([], { uriList: 'file:///tmp/dragged.md' }),
    ).toEqual(['/tmp/dragged.md'])
  })

  it('does not read file bytes', () => {
    const file = fileWithPath('secret.bin', '/tmp/secret.bin', 'application/octet-stream')
    const paths = collectDroppedFilePaths([file])
    expect(paths).toEqual(['/tmp/secret.bin'])
    expect(file.size).toBe(4)
  })
})
