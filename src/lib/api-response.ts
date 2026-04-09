import { NextResponse } from 'next/server'

/**
 * Formato estándar de respuestas API de Golfers+
 *
 * Éxito:  { ok: true, data: T, meta?: { total, page, limit } }
 * Error:  { ok: false, error: string, code?: string }
 */

export interface ApiMeta {
  total?: number
  page?: number
  limit?: number
}

export interface ApiSuccessResponse<T = unknown> {
  ok: true
  data: T
  meta?: ApiMeta
}

export interface ApiErrorResponse {
  ok: false
  error: string
  code?: string
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse

export function apiOk<T>(data: T, meta?: ApiMeta): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({ ok: true as const, data, ...(meta && { meta }) })
}

export function apiError(error: string, status: number, code?: string): NextResponse<ApiErrorResponse> {
  return NextResponse.json({ ok: false as const, error, ...(code && { code }) }, { status })
}
