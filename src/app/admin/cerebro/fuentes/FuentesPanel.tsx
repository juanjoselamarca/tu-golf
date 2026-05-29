'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { KnowledgeSourceRow } from '@/lib/cerebro/knowledge-sources'

type Props = { initialSources: KnowledgeSourceRow[] }

const STATUS_STYLES: Record<string, string> = {
  ready: 'bg-emerald-100 text-emerald-800',
  ingesting: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  unavailable: 'bg-red-100 text-red-800',
  stale: 'bg-orange-100 text-orange-800',
  pending: 'bg-neutral-100 text-neutral-700',
}

export function FuentesPanel({ initialSources }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reindex(slug: string) {
    setBusy(slug)
    setError(null)
    try {
      const res = await fetch(`/api/admin/cerebro/sources/${slug}/reindex`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al re-indexar')
    } finally {
      setBusy(null)
    }
  }

  if (initialSources.length === 0) {
    return (
      <p className="rounded-md bg-neutral-50 p-4 text-sm text-neutral-600">
        No hay fuentes registradas todavía. Agregá filas vía{' '}
        <code>POST /api/admin/cerebro/sources</code> o el script de ingesta.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Slug</th>
              <th className="px-3 py-2 font-medium">Título</th>
              <th className="px-3 py-2 font-medium">Block</th>
              <th className="px-3 py-2 font-medium">Jurisdicción</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 text-right font-medium">Chunks</th>
              <th className="px-3 py-2 text-right font-medium">Costo USD</th>
              <th className="px-3 py-2 font-medium">Último ingest</th>
              <th className="px-3 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {initialSources.map((s) => (
              <tr key={s.id} className="hover:bg-neutral-50">
                <td className="px-3 py-2 font-mono text-xs">{s.slug}</td>
                <td className="px-3 py-2">{s.title}</td>
                <td className="px-3 py-2">{s.block_key}</td>
                <td className="px-3 py-2">{s.jurisdiction}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLES[s.status] ?? STATUS_STYLES.pending
                    }`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.chunk_count}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  ${Number(s.ingest_cost_usd).toFixed(4)}
                </td>
                <td className="px-3 py-2 text-neutral-500">
                  {s.ingested_at ? new Date(s.ingested_at).toLocaleString('es-CL') : '—'}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => reindex(s.slug)}
                    disabled={busy === s.slug}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
                  >
                    {busy === s.slug ? 'Marcando…' : 'Re-indexar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
