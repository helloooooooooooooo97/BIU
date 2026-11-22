import { describe, expect, it } from 'vitest'
import { computeReorderedColumns } from './table-col-reorder.ts'

describe('computeReorderedColumns', () => {
  it('moves a regular column before or after another column', () => {
    expect(computeReorderedColumns(['title', 'actions', 'status', 'owner'], 'owner', 'status', 'before')).toEqual([
      'title',
      'actions',
      'owner',
      'status',
    ])
    expect(computeReorderedColumns(['title', 'actions', 'status', 'owner'], 'status', 'owner', 'after')).toEqual([
      'title',
      'actions',
      'owner',
      'status',
    ])
  })

  it('allows moving title and actions freely to any position', () => {
    expect(computeReorderedColumns(['title', 'actions', 'status', 'owner'], 'title', 'owner', 'after')).toEqual([
      'actions',
      'status',
      'owner',
      'title',
    ])
    expect(computeReorderedColumns(['title', 'actions', 'status', 'owner'], 'actions', 'title', 'before')).toEqual([
      'actions',
      'title',
      'status',
      'owner',
    ])
    expect(computeReorderedColumns(['title', 'actions', 'status', 'owner'], 'status', 'title', 'before')).toEqual([
      'status',
      'title',
      'actions',
      'owner',
    ])
  })

  it('returns null for no-op or invalid moves', () => {
    expect(computeReorderedColumns(['title', 'actions', 'status'], 'title', 'title', 'before')).toBeNull()
    expect(computeReorderedColumns(['title', 'actions', 'status'], 'title', 'actions', 'before')).toBeNull()
    expect(computeReorderedColumns(['title', 'actions', 'status'], 'actions', 'title', 'after')).toBeNull()
    expect(computeReorderedColumns(['title', 'actions', 'status'], 'missing', 'title', 'before')).toBeNull()
  })
})
