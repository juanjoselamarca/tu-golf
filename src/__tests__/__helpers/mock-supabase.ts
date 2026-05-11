import { vi } from 'vitest';

export interface MockTableResponses {
  [table: string]: {
    data: unknown;
    error?: unknown;
  };
}

/**
 * Builder fluido para mockear @supabase/supabase-js client.
 *
 * Compartido entre tests de API routes + libs server-side.
 * Cada tabla devuelve la misma response sin importar la chain de filtros —
 * suficiente para tests unitarios. Para escenarios con múltiples queries
 * a la misma tabla con outputs distintos, el test individual override.
 */
export function mockSupabase(
  responses: MockTableResponses,
  user: { id: string } | null = { id: 'u1' },
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn((table: string) => {
      const response = responses[table] ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      const methods = [
        'select', 'eq', 'in', 'not', 'gte', 'lte', 'gt', 'lt',
        'order', 'limit', 'update', 'insert', 'delete', 'upsert',
      ];
      methods.forEach((m) => {
        chain[m] = vi.fn().mockReturnValue(chain);
      });
      chain.maybeSingle = vi.fn().mockResolvedValue(response);
      chain.single = vi.fn().mockResolvedValue(response);
      chain.then = (resolve: (r: unknown) => unknown) => resolve(response);
      return chain;
    }),
  };
}
