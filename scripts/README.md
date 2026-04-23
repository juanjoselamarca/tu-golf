# scripts/ — Utilidades de desarrollo y ops

Scripts que se ejecutan manualmente para tareas de mantenimiento, migración o testing. **No son parte del runtime de la app** — no se deployan a Vercel.

## Índice

| Script | Propósito | Uso típico |
|---|---|---|
| `run-audit.ts` | Runner de tests de auditoría (F1–F9) | `npm run audit` o `npm run audit:all` |
| `update-docs.js` | Regenera `docs/ESTADO_ACTUAL.md` desde el estado del repo | `node scripts/update-docs.js` al final de cada sprint |
| `e2e-ronda-libre.js` | Smoke test end-to-end de creación de ronda libre | Manual, cuando se modifica el wizard |
| `test-e2e-prod.mjs` | Smoke test contra producción | Manual post-deploy crítico |
| `test-e2e-torneo40.mjs` | Smoke test de torneo con 40 jugadores | Stress test pre-torneo grande |
| `fedegolf-sync.ts` | Sync manual de índices WHS desde FedeGolf | Si el sync automático falla |
| `migrate-019-brisas.js` | Migración one-off para cancha Brisas (ejemplo) | Ya ejecutado — referencia |
| `seed-demo-data.sql` | Seed de datos demo para dev | Manual en Supabase SQL editor |

## Reglas

### No ejecutar contra producción sin backup

Todos los scripts que modifican datos (`seed-*`, `migrate-*`, `fedegolf-sync`) deben:
1. Usar `.env.local` apuntando a Supabase producción SOLO con consciencia explícita
2. Preferir Supabase staging o copia de BD si existe
3. Hacer dump de la tabla afectada ANTES de correr

### Scripts de auditoría son seguros

`run-audit.ts` y `test-e2e-*.mjs` son read-only — no modifican BD. Pueden correrse libremente.

### Scripts de migración son one-shot

Los archivos `migrate-NNN-*.js` se archivan después de ejecutarse. No se re-corren. Nuevo cambio = nuevo script con número incremental.

## Cómo agregar un script nuevo

1. Nombre descriptivo: `<verbo>-<objeto>.<ext>` (ej: `sync-handicaps.ts`)
2. Shebang + comentario de propósito en las primeras líneas
3. Variables de entorno desde `.env.local` (usar `dotenv`)
4. Logs explicativos al usuario (qué hace, qué afecta)
5. Agregar entrada en este README
6. Si es destructivo: confirm prompt o flag `--yes` requerido

## Ejemplo de header estándar

```typescript
#!/usr/bin/env tsx
/**
 * sync-handicaps.ts — Sincroniza handicaps de profiles contra FedeGolf
 *
 * USO: npx tsx scripts/sync-handicaps.ts [--dry-run]
 * AFECTA: tabla profiles, columna indice
 * FUENTE: FedeGolf API (FEDEGOLF_API_KEY)
 *
 * Ejecutar manualmente cuando el cron automático falla.
 */
import 'dotenv/config'
// ...
```

## Scripts en `src/scripts/` (runtime)

Ojo: existe también `src/scripts/` que es diferente. Esos son scripts importables desde el código de la app (NO directos de CLI) — seed, simulación de user journey, etc. Eventualmente deberían moverse a `scripts/` raíz o a tests según naturaleza.
