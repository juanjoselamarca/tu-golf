/**
 * Cliente admin de Supabase falso para los tests de src/lib/push.
 *
 * Graba cada operación (tabla, verbo, filtros, payload) y delega la respuesta
 * a un `responder` del test. Es un builder encadenable y "thenable": `await
 * admin.from('t').delete().eq('a', 1)` resuelve con lo que devuelva el responder.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type FakeVerb = 'select' | 'update' | 'delete' | 'upsert' | 'insert'

export interface FakeOp {
  table: string
  verb: FakeVerb
  columns?: string
  selectOptions?: { count?: string; head?: boolean }
  filters: Array<[op: 'eq' | 'neq' | 'in', column: string, value: unknown]>
  payload?: unknown
  upsertOptions?: unknown
  limit?: number
  /** `.single()` / `.maybeSingle()` al final de la cadena. */
  single?: 'single' | 'maybeSingle'
}

export interface FakeResponse { data?: unknown; error?: { message: string } | null; count?: number | null }

export type FakeResponder = (op: FakeOp) => FakeResponse | undefined

function makeChain(op: FakeOp, responder: FakeResponder, ops: FakeOp[]) {
  const resolve = (): FakeResponse => {
    ops.push(op)
    const res = responder(op) ?? {}
    return { data: res.data ?? (op.single ? null : []), error: res.error ?? null, count: res.count ?? null }
  }
  const chain: Record<string, unknown> = {
    // Lectura si es el primer verbo; "returning" si viene tras update/upsert/insert.
    select(columns?: string, options?: { count?: string; head?: boolean }) {
      op.columns = columns
      op.selectOptions = options
      return chain
    },
    update(payload: unknown) { op.verb = 'update'; op.payload = payload; return chain },
    upsert(payload: unknown, options?: unknown) { op.verb = 'upsert'; op.payload = payload; op.upsertOptions = options; return chain },
    insert(payload: unknown) { op.verb = 'insert'; op.payload = payload; return chain },
    delete() { op.verb = 'delete'; return chain },
    eq(column: string, value: unknown) { op.filters.push(['eq', column, value]); return chain },
    neq(column: string, value: unknown) { op.filters.push(['neq', column, value]); return chain },
    in(column: string, value: unknown) { op.filters.push(['in', column, value]); return chain },
    limit(n: number) { op.limit = n; return chain },
    maybeSingle() { op.single = 'maybeSingle'; return Promise.resolve(resolve()) },
    single() { op.single = 'single'; return Promise.resolve(resolve()) },
    then(onFulfilled: (v: FakeResponse) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(resolve()).then(onFulfilled, onRejected)
    },
  }
  return chain
}

export function createFakeAdmin(responder: FakeResponder = () => undefined): { admin: SupabaseClient; ops: FakeOp[] } {
  const ops: FakeOp[] = []
  const admin = {
    from(table: string) {
      return makeChain({ table, verb: 'select', filters: [] }, responder, ops)
    },
  }
  return { admin: admin as unknown as SupabaseClient, ops }
}

/** Valor del filtro `column` (primer match) de una operación grabada. */
export function filterValue(op: FakeOp, column: string): unknown {
  return op.filters.find(f => f[1] === column)?.[2]
}

/** Operaciones grabadas sobre una tabla con un verbo dado. */
export function opsOf(ops: FakeOp[], table: string, verb: FakeVerb): FakeOp[] {
  return ops.filter(o => o.table === table && o.verb === verb)
}
