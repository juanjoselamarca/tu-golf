/**
 * Form para agregar una ronda manual al historial.
 * Estado interno via useAddRoundForm hook.
 */
'use client'

import { CANCHAS_CHILE, MONTHS, TEES, YEARS, cardStyle, inputBase } from '../lib/constants'
import { cellBg, computeStats, formatOv } from '../lib/helpers'
import type { UseAddRoundFormResult } from '../hooks/useAddRoundForm'

interface Props {
  form: UseAddRoundFormResult
}

export function AddRoundForm({ form }: Props) {
  const {
    courseName, setCourseName,
    teeColor,   setTeeColor,
    day,   setDay,
    month, setMonth,
    year,  setYear,
    scores, setScores,
    notes,   setNotes,
    saving,
    totalGross,
    handleSave,
  } = form

  const formStats = computeStats(scores)

  return (
    <form
      onSubmit={handleSave}
      style={{
        ...cardStyle,
        background: 'var(--bg-surface)',
        border: '1px solid rgba(196,153,42,0.2)',
        padding: '28px 20px',
        marginBottom: '24px',
      }}
    >
      {/* Live preview */}
      <div style={{
        background: 'rgba(196,153,42,0.06)',
        border: '1px solid rgba(196,153,42,0.2)',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '24px',
        borderLeft: '3px solid #c4992a',
      }}>
        <div style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '16px',
          color: 'var(--text)',
          marginBottom: '4px',
        }}>
          {courseName || 'Tu cancha'}
          {teeColor && <span style={{ fontSize: '12px', color: 'var(--text-2)', marginLeft: '8px' }}>&#183; Tee {teeColor}</span>}
        </div>
        {formStats && totalGross != null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
            <span style={{
              fontFamily: '"Playfair Display", serif',
              fontSize: '2rem',
              color: 'var(--text)',
              fontWeight: 700,
            }}>
              {totalGross}
            </span>
            <span style={{
              fontSize: '13px', fontWeight: 700,
              padding: '3px 10px', borderRadius: '12px',
              background: formStats.overUnder <= 0 ? 'rgba(196,153,42,0.2)' : 'rgba(220,38,38,0.15)',
              color: formStats.overUnder <= 0 ? '#c4992a' : '#f87171',
            }}>
              {formatOv(formStats.overUnder)} par
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
              {formStats.birdies > 0 && `🐦 ${formStats.birdies} `}
              {formStats.bogeys  > 0 && `📌 ${formStats.bogeys} `}
              {formStats.doubles > 0 && `🔴 ${formStats.doubles}`}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '4px' }}>Ingresa tus scores hoyo a hoyo...</div>
        )}
        {formStats && (
          <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '6px' }}>
            Total: {formStats.total} &#183; {formatOv(formStats.overUnder)} &#183; {formStats.birdies} birdies &#183; {formStats.pars} pares &#183; {formStats.bogeys} bogeys
          </div>
        )}
      </div>

      {/* Cancha + Tee */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px' }}>Cancha *</label>
          <select required value={courseName} onChange={e => setCourseName(e.target.value)}
            style={{ ...inputBase, cursor: 'pointer' }}>
            <option value="">— Seleccionar cancha —</option>
            {CANCHAS_CHILE.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px' }}>Tees</label>
          <select value={teeColor} onChange={e => setTeeColor(e.target.value)}
            style={{ ...inputBase, cursor: 'pointer', width: '110px' }}>
            <option value="">—</option>
            {TEES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Fecha */}
      <div style={{ marginBottom: '18px' }}>
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px' }}>Fecha *</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select value={day} onChange={e => setDay(e.target.value)} style={{ ...inputBase, width: '70px', cursor: 'pointer' }}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputBase, flex: 1, cursor: 'pointer' }}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(e.target.value)} style={{ ...inputBase, width: '90px', cursor: 'pointer' }}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Scores por hoyo */}
      <div style={{ marginBottom: '18px' }}>
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '8px' }}>
          Scores por hoyo (par 4 asumido)
        </label>
        {(['Front 9', 'Back 9'] as const).map((half, halfIdx) => (
          <div key={half} style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '5px' }}>{half}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '5px' }}>
              {Array.from({ length: 9 }, (_, j) => {
                const idx = halfIdx * 9 + j
                const val = scores[idx]
                return (
                  <div key={idx} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', color: 'var(--text-2)', marginBottom: '3px' }}>H{idx + 1}</div>
                    <input
                      type="number" min={1} max={19} inputMode="numeric"
                      placeholder="—"
                      value={val ?? ''}
                      onChange={e => {
                        const n = parseInt(e.target.value)
                        setScores(prev => {
                          const next = [...prev]
                          next[idx] = isNaN(n) || n < 1 || n > 20 ? null : n
                          return next
                        })
                      }}
                      style={{
                        width: '100%', ...cellBg(val),
                        border: '1px solid rgba(122,143,168,0.15)',
                        borderRadius: '6px', padding: '7px 2px',
                        fontSize: '16px', fontWeight: 600, textAlign: 'center',
                        outline: 'none', appearance: 'textfield' as const,
                        boxSizing: 'border-box' as const, minHeight: '44px',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = '#c4992a')}
                      onBlur={e  => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.15)')}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Notas */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '5px' }}>Notas (opcional)</label>
        <textarea
          placeholder="¿Algo memorable de esta ronda?"
          value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          style={{ ...inputBase, resize: 'vertical', minHeight: '58px' }}
          onFocus={e => (e.currentTarget.style.borderColor = '#c4992a')}
          onBlur={e  => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
        />
      </div>

      {/* Save button */}
      <div>
        <button
          type="submit"
          disabled={saving || !courseName}
          style={{
            width: '100%', height: '54px',
            background: saving || !courseName ? 'rgba(196,153,42,0.4)' : '#c4992a',
            color: 'var(--brand-dark)',
            fontWeight: 700, fontSize: '16px',
            borderRadius: '10px', border: 'none',
            cursor: saving || !courseName ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Guardando...' : 'Guardar y ver mi análisis →'}
        </button>
        <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-2)', marginTop: '8px' }}>
          🐯 tAIger+ analizará esta ronda automáticamente
        </div>
      </div>
    </form>
  )
}
