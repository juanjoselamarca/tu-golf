'use client'
import { useState } from 'react'
import type { CerebroWeight } from '@/lib/cerebro/weights'

type Props = { initialWeights: CerebroWeight[] }

export function SlidersPanel({ initialWeights }: Props) {
  const [weights, setWeights] = useState(initialWeights)
  const [saving, setSaving] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<unknown>(null)

  async function save(w: CerebroWeight) {
    setSaving(w.parameter_key)
    try {
      await fetch('/api/admin/cerebro/weights', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          parameter_type: w.parameter_type,
          parameter_key: w.parameter_key,
          new_weight: w.current_weight,
        }),
      })
    } finally {
      setSaving(null)
    }
  }

  async function testNow() {
    const r = await fetch('/api/admin/cerebro/test-now', { method: 'POST' })
    setTestResult(await r.json())
  }

  if (weights.length === 0) {
    return (
      <p className="rounded-md bg-neutral-50 p-4 text-sm text-neutral-600">
        No hay pesos seed todavía. Insertá filas en <code>cerebro_weights</code> para empezar.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {weights.map(w => (
        <div key={w.id} className="rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-medium">{w.parameter_key}</div>
              <div className="text-xs text-neutral-500">
                {w.parameter_type} · v{w.version} · source:{w.source}
              </div>
            </div>
            <div className="text-lg font-mono">{(w.current_weight * 100).toFixed(0)}%</div>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={w.current_weight}
            onChange={e =>
              setWeights(prev =>
                prev.map(p =>
                  p.id === w.id ? { ...p, current_weight: Number(e.target.value) } : p,
                ),
              )
            }
            onMouseUp={() => save(w)}
            onTouchEnd={() => save(w)}
            className="w-full"
            disabled={saving === w.parameter_key}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={testNow}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800"
      >
        Test ahora — invalida cache + muestra pesos vigentes
      </button>
      {testResult ? (
        <pre className="rounded-md bg-neutral-50 p-3 text-xs overflow-x-auto">
          {JSON.stringify(testResult, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}
