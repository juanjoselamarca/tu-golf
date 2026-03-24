'use client'
import { useState } from 'react'
import { adminColors, adminFonts, adminCard } from './admin-tokens'

interface ProjectionSliderProps {
  totalUsers: number
}

export function ProjectionSlider({ totalUsers }: ProjectionSliderProps) {
  const [conversionPct, setConversionPct] = useState(5)
  const [price, setPrice] = useState(10)

  const proUsers = Math.round(totalUsers * conversionPct / 100)
  const mrr = proUsers * price
  const arr = mrr * 12

  // Costs estimate (all free tier for now)
  const supabaseCost = 0
  const vercelCost = 0
  const claudeCost = Math.round(proUsers * 0.5) // ~$0.50 per pro user/month estimate
  const totalCost = supabaseCost + vercelCost + claudeCost
  const profit = mrr - totalCost

  return (
    <div style={{ ...adminCard }}>
      <span style={{ ...adminFonts.label, display: 'block', marginBottom: '16px' }}>SIMULADOR DE PROYECCIONES</span>

      {/* Conversion slider */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ ...adminFonts.body, fontSize: '13px' }}>Conversion rate</span>
          <span style={{ ...adminFonts.kpiSmall, fontSize: '1.1rem' }}>{conversionPct}%</span>
        </div>
        <input type="range" min={1} max={20} value={conversionPct}
          onChange={e => setConversionPct(+e.target.value)}
          style={{ width: '100%', accentColor: adminColors.gold }}
        />
      </div>

      {/* Price slider */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ ...adminFonts.body, fontSize: '13px' }}>Precio mensual</span>
          <span style={{ ...adminFonts.kpiSmall, fontSize: '1.1rem' }}>${price}</span>
        </div>
        <input type="range" min={5} max={20} value={price}
          onChange={e => setPrice(+e.target.value)}
          style={{ width: '100%', accentColor: adminColors.gold }}
        />
      </div>

      {/* Results */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px',
        padding: '16px', background: adminColors.bg, borderRadius: '8px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...adminFonts.kpiSmall }}>${mrr.toLocaleString()}</div>
          <div style={adminFonts.label}>MRR</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...adminFonts.kpiSmall }}>${arr.toLocaleString()}</div>
          <div style={adminFonts.label}>ARR</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...adminFonts.kpiSmall, color: profit >= 0 ? adminColors.green : adminColors.red }}>
            ${profit.toLocaleString()}
          </div>
          <div style={adminFonts.label}>PROFIT/MES</div>
        </div>
      </div>

      <div style={{ marginTop: '12px', ...adminFonts.mono, fontSize: '10px', textAlign: 'center' }}>
        {proUsers} usuarios Pro de {totalUsers} totales | Costos est. ${totalCost}/mes
      </div>
    </div>
  )
}
