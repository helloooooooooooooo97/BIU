import { afterEach, describe, expect, it, vi } from 'vitest'
import { filePickFromUpload, filesNeedingUpload, MAX_COMPOSER_UPLOAD_BYTES, uploadComposerFile } from './upload-composer-file.ts'

function fileWithPath(name: string, path: string, type = 'text/plain') {
  const file = new File([new Uint8Array(4)], name, { type })
  Object.defineProperty(file, 'path', { value: path })
  return file
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('filesNeedingUpload', () => {
  it('skips local paths and images, keeps browser files', () => {
    const local = fileWithPath('notes.txt', '/tmp/notes.txt')
    const shot = new File([new Uint8Array(8)], 'shot.png', { type: 'image/png' })
    const pdf = new File([new Uint8Array(8)], 'spec.pdf', { type: 'application/pdf' })
    expect(filesNeedingUpload([local, shot, pdf])).toEqual([pdf])
  })
})

describe('uploadComposerFile', () => {
  it('POSTs bytes to session artifacts and returns the saved path', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ path: '/tmp/.biu/artifacts/s1/spec.pdf' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File([new Uint8Array([1, 2, 3])], 'spec.pdf', { type: 'application/pdf' })
    await expect(uploadComposerFile('s1', file)).resolves.toBe('/tmp/.biu/artifacts/s1/spec.pdf')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/agents/s1/artifacts?name=spec.pdf')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(file)
  })

  it('rejects files larger than 32MB before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const huge = new File([new Uint8Array(4)], 'huge.bin', { type: 'application/octet-stream' })
    Object.defineProperty(huge, 'size', { value: MAX_COMPOSER_UPLOAD_BYTES + 1 })
    await expect(uploadComposerFile('s1', huge)).rejects.toThrow(/文件太大/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('filePickFromUpload', () => {
  it('keeps the original filename on the chip', () => {
    const file = new File([new Uint8Array(2)], '季度报告.pdf', { type: 'application/pdf' })
    const ref = filePickFromUpload('/tmp/.biu/artifacts/s1/_______.pdf', file, '/agents/s1')
    expect(ref?.kind).toBe('file')
    expect(ref?.label).toBe('季度报告.pdf')
    expect(ref?.path).toBe('/tmp/.biu/artifacts/s1/_______.pdf')
  })
})
