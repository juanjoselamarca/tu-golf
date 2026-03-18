// Reference seed script — requires manual execution with proper auth setup
// The demo data is served via /api/demo/players instead

import { createAdminClient } from '../lib/supabaseAdmin'

const DEMO_PLAYERS = [
  { id:'10000000-0000-0000-0000-000000000001', name:'Carlos Méndez', indice:2, pais:'CL' },
  { id:'10000000-0000-0000-0000-000000000002', name:'Roberto Silva', indice:4, pais:'AR' },
  { id:'10000000-0000-0000-0000-000000000003', name:'Andrés Torres', indice:1, pais:'CO' },
  { id:'10000000-0000-0000-0000-000000000004', name:'Felipe García', indice:6, pais:'CL' },
  { id:'10000000-0000-0000-0000-000000000005', name:'Miguel Ríos', indice:3, pais:'PE' },
  { id:'10000000-0000-0000-0000-000000000006', name:'Sebastián López', indice:5, pais:'UY' },
  { id:'10000000-0000-0000-0000-000000000007', name:'Diego Vargas', indice:7, pais:'CL' },
  { id:'10000000-0000-0000-0000-000000000008', name:'Martín Pérez', indice:8, pais:'AR' },
  { id:'10000000-0000-0000-0000-000000000009', name:'Alejandro Cruz', indice:9, pais:'CO' },
  { id:'10000000-0000-0000-0000-000000000010', name:'Valentina Mora', indice:12, pais:'CL' },
]

console.log('Demo players:', DEMO_PLAYERS.length)
console.log('Use /api/demo/players for hardcoded demo data')
