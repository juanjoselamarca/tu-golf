import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importRound } from '@/lib/import-round'
import * as resolveCourseModule from '@/lib/resolve-course'

vi.mock('@/lib/resolve-course')

function mockSupabase(opts: { courseId?: string; existingHoles?: Array<{ numero: number; par: number }>; profileIndice?: number; insertId?: string }) {
  const mock: any = {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { indice: opts.profileIndice ?? null }, error: null }) }) }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        }
      }
      if (table === 'course_holes') {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: opts.existingHoles ?? null, error: null }) }) }),
        }
      }
      if (table === 'courses') {
        return {
          select: () => ({ eq: () => ({ limit: async () => ({ data: opts.courseId ? [{ id: opts.courseId }] : null, error: null }) }) }),
        }
      }
      if (table === 'historical_rounds') {
        return {
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: opts.insertId ?? 'inserted-id' }, error: null }) }) }),
          select: () => ({ eq: async () => ({ count: 0, error: null }) }),
        }
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }
    }),
  }
  return mock
}

describe('importRound — integración con resolveCourse', () => {
  beforeEach(() => {
    vi.mocked(resolveCourseModule.resolveCourse).mockReset()
  })

  it('persiste par_per_hole desde input cuando viene del OCR', async () => {
    vi.mocked(resolveCourseModule.resolveCourse).mockResolvedValue({
      courseId: 'course-123',
      courseCreated: false,
      holesPopulated: false,
      matchScore: 0.95,
      warnings: [],
    })

    const supabase = mockSupabase({})

    const result = await importRound(supabase as any, {
      userId: 'user-1',
      courseName: 'Los Leones',
      parPerHole: { '1': 4, '2': 4, '3': 3, '4': 5, '5': 4, '6': 3, '7': 4, '8': 4, '9': 5, '10': 4, '11': 3, '12': 4, '13': 4, '14': 3, '15': 4, '16': 4, '17': 5, '18': 5 },
      scores: [4,4,3,5,4,3,4,4,5,4,3,4,4,3,4,4,5,5],
      playedAt: '2026-05-13',
      source: 'photo_scan',
    })

    expect(result.success).toBe(true)
  })

  it('llama resolveCourse cuando courseId no viene en input', async () => {
    vi.mocked(resolveCourseModule.resolveCourse).mockResolvedValue({
      courseId: 'resolved-id',
      courseCreated: false,
      holesPopulated: false,
      matchScore: 0.9,
      warnings: [],
    })

    const supabase = mockSupabase({})
    await importRound(supabase as any, {
      userId: 'user-1',
      courseName: 'Cancha X',
      scores: [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
      playedAt: '2026-05-13',
      source: 'manual',
    })

    expect(resolveCourseModule.resolveCourse).toHaveBeenCalledWith(
      expect.objectContaining({ courseName: 'Cancha X' })
    )
  })

  it('no llama resolveCourse cuando courseId ya viene en input', async () => {
    const supabase = mockSupabase({ existingHoles: [] })
    await importRound(supabase as any, {
      userId: 'user-1',
      courseId: 'predefined-id',
      courseName: 'Cancha X',
      scores: [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
      playedAt: '2026-05-13',
      source: 'manual',
    })

    expect(resolveCourseModule.resolveCourse).not.toHaveBeenCalled()
  })
})
