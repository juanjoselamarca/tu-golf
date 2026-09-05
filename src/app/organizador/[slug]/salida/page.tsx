'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'
import { SITE_DOMAIN } from '@/lib/site-url'
import { createClient } from '@/lib/supabase'
import { copyToClipboard } from '@/lib/clipboard'

interface Group {
  name: string
  tee_time: string | null
  players: Array<{ name: string; handicap: number | null }>
}

export default function HojaSalidaPage() {
  const params = useParams()
  const slug = params.slug as string
  const [tournament, setTournament] = useState<{ name: string; course_name: string; date_start: string; format: string; tees: string; hole_count: number } | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: t } = await supabase
        .from('tournaments')
        .select('id, name, course_name, date_start, format, tees, hole_count')
        .eq('slug', slug)
        .single()
      if (!t) { setLoading(false); return }
      setTournament(t)

      const { data: tGroups } = await supabase
        .from('tournament_groups')
        .select('name, tee_time, tournament_group_players(player_id, players(profiles(name, indice)))')
        .eq('tournament_id', t.id)
        .order('sort_order')

      if (tGroups && tGroups.length > 0) {
        setGroups(tGroups.map((g: Record<string, unknown>) => ({
          name: g.name as string,
          tee_time: g.tee_time as string | null,
          players: ((g.tournament_group_players as Array<Record<string, unknown>>) || []).map((gp: Record<string, unknown>) => ({
            name: ((gp.players as Record<string, unknown>)?.profiles as Record<string, unknown>)?.name as string || 'Jugador',
            handicap: ((gp.players as Record<string, unknown>)?.profiles as Record<string, unknown>)?.indice as number | null,
          })),
        })))
      } else {
        // Fallback: show players without groups
        const { data: players } = await supabase
          .from('players')
          .select('profiles(name, indice)')
          .eq('tournament_id', t.id)
          .eq('status', 'approved')

        if (players && players.length > 0) {
          setGroups([{
            name: 'Todos los jugadores',
            tee_time: null,
            players: players.map((p: Record<string, unknown>) => ({
              name: (p.profiles as Record<string, unknown>)?.name as string || 'Jugador',
              handicap: (p.profiles as Record<string, unknown>)?.indice as number | null,
            })),
          }])
        }
      }
      setLoading(false)
    }
    load()
  }, [slug])

  const generateText = () => {
    if (!tournament) return ''
    const lines: string[] = []
    lines.push(tournament.name.toUpperCase())
    lines.push(`${tournament.course_name} · ${tournament.hole_count}H · Tees ${tournament.tees}`)
    const dateStr = tournament.date_start ? new Date(tournament.date_start + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''
    if (dateStr) lines.push(dateStr)
    lines.push('')

    for (const g of groups) {
      const time = g.tee_time ? new Date(g.tee_time).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''
      lines.push(`${time ? time + '  ' : ''}${g.name}`)
      for (const p of g.players) {
        lines.push(`  ${p.name}${p.handicap != null ? ` (${p.handicap})` : ''}`)
      }
      lines.push('')
    }
    lines.push(`Golfers+ · ${SITE_DOMAIN}`)
    return lines.join('\n')
  }

  const handleCopy = async () => {
    if (await copyToClipboard(generateText())) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleShare = async () => {
    const text = generateText()
    if (navigator.share) {
      try { await navigator.share({ title: tournament?.name || 'Hoja de salida', text }) } catch {}
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
    }
  }

  if (loading) return <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LoadingSkeleton lines={4} /></div>
  if (!tournament) return <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>Torneo no encontrado</div>

  const handlePrint = () => window.print()

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 100px' }}>
      {/* Print stylesheet */}
      <style>{`
        @media print {
          nav, footer, [data-no-print] { display: none !important; }
          body { background: white !important; color: black !important; font-family: 'Georgia', serif !important; font-size: 12pt !important; }
          * { color-adjust: exact; -webkit-print-color-adjust: exact; }
          [data-print-header] { display: block !important; text-align: center; margin-bottom: 16pt; padding-bottom: 8pt; border-bottom: 1pt solid #ccc; }
          [data-print-group] { break-inside: avoid; page-break-inside: avoid; margin-bottom: 12pt; border: 1pt solid #ddd !important; border-radius: 0 !important; background: white !important; }
          [data-print-group] span, [data-print-group] div { color: black !important; }
        }
        @media not print {
          [data-print-header] { display: none !important; }
        }
      `}</style>

      {/* Print-only header */}
      <div data-print-header="">
        <h1 style={{ margin: '0 0 4px', fontSize: '18pt', fontWeight: 700 }}>{tournament.name}</h1>
        <p style={{ margin: 0, fontSize: '11pt' }}>
          {tournament.course_name} &middot; {tournament.hole_count}H &middot; Tees {tournament.tees}
        </p>
        {tournament.date_start && (
          <p style={{ margin: '4px 0 0', fontSize: '10pt' }}>
            {new Date(tournament.date_start + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
      </div>

      <Link href={`/organizador/${slug}/jugadores`} data-no-print="" style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none', marginBottom: '16px', display: 'inline-block' }}>&larr; Volver</Link>

      {/* Header */}
      <div style={{ marginBottom: '24px' }} data-no-print="">
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{tournament.name}</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-2)', margin: 0 }}>
          {tournament.course_name} &middot; {tournament.hole_count}H &middot; Tees {tournament.tees}
        </p>
        {tournament.date_start && (
          <p style={{ fontSize: '12px', margin: '4px 0 0', color: 'var(--text-3)' }}>
            {new Date(tournament.date_start + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }} data-no-print="">
        <button onClick={handleCopy} style={{
          flex: 1, padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', border: 'none',
          background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(196,153,42,0.12)',
          color: copied ? 'var(--status-live-fg)' : 'var(--brand-on-bg)',
        }}>
          {copied ? '✓ Copiado' : 'Copiar texto'}
        </button>
        <button onClick={handlePrint} style={{
          flex: 1, padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', border: 'none',
          background: 'rgba(196,153,42,0.12)',
          color: 'var(--brand-on-bg)',
        }}>
          Imprimir
        </button>
        <button onClick={handleShare} style={{
          flex: 1, padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', border: 'none',
          background: 'var(--brand)', color: '#070d18',
        }}>
          Compartir
        </button>
      </div>

      {/* Groups */}
      {groups.map((g, i) => (
        <div key={i} data-print-group="" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.12)', borderRadius: '14px', padding: '16px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{g.name}</span>
            {g.tee_time && (
              <span style={{ fontSize: '13px', color: 'var(--brand-on-bg)', fontFamily: 'var(--font-dm-mono, "DM Mono", monospace)' }}>
                {new Date(g.tee_time).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {g.players.map((p, j) => (
            <div key={j} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: j > 0 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: '14px', color: 'var(--text)' }}>{p.name}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-2)', fontFamily: '"DM Mono", monospace' }}>
                {p.handicap != null ? p.handicap.toFixed(1) : '—'}
              </span>
            </div>
          ))}
        </div>
      ))}

      {groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-2)' }}>
          No hay grupos armados aún. Crea grupos desde la gestión de jugadores.
        </div>
      )}
    </div>
  )
}
