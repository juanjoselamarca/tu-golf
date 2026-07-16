# Convenciones técnicas — Golfers+

Reglas técnicas específicas que tienen consecuencias graves si se violan. Detalle expandido de lo que `CLAUDE.md` solo menciona.

---

## Colores Garmin Golf — NO modificar sin verificación

Fuente de verdad: `src/lib/garmin-colors.ts`. Verificado contra capturas reales el 24-mar-2026.

| Color | Scorecard (Formato 1) | Activity Bar (Formato 2) | Score vs Par |
|-------|----------------------|--------------------------|--------------|
| Azul oscuro | Círculo | Segmento | Eagle o mejor (-2+) |
| Celeste | Círculo | Segmento | Birdie (-1) |
| Sin borde | Sin borde | Verde segmento | Par (0) |
| Dorado/naranja | Cuadrado | Segmento | Bogey (+1) |
| Rojo | Cuadrado | Segmento | Doble bogey+ (+2+) |

**Regla:** NUNCA cambiar estos colores sin verificar contra la app real de Garmin Golf. Los usuarios premium del mercado chileno conocen Garmin de memoria.

---

## API Routes — `force-dynamic` obligatorio cuando importan Supabase server

TODA API route (`src/app/api/**/route.ts`) que importe `createClient` de `@/utils/supabase/server` DEBE tener:

```typescript
export const dynamic = 'force-dynamic'
```

**Por qué:** sin esto, Next.js intenta renderizar la ruta como estática en Vercel y FALLA silenciosamente en producción (`DYNAMIC_SERVER_USAGE` error). El usuario ve "no carga" sin explicación.

**Verificación antes de cada push** (incluido en `/pre-push`):

```bash
grep -rL "force-dynamic" src/app/api/**/route.ts | while read f; do
  grep -q "supabase/server" "$f" && echo "FALTA dynamic: $f"
done
```

---

## OneDrive y `.next`

OneDrive sincroniza la carpeta `.next` y a veces la corrompe a mitad de build. Si hay errores de build relacionados:

```powershell
Remove-Item -Recurse -Force .next
npm run build
```

Es normal y esperado en este entorno (Windows + OneDrive). No es un bug del código.

**Vitest también requiere config especial** por el mismo motivo: `pool: 'vmThreads'` obligatorio en `vitest.config.ts` para evitar errores de paths con espacios. Ya está configurado, no tocar.

---

## Cómo ejecutar SQL contra Supabase

Helper único: `scripts/run-sql.mjs`. Usa la Management API que acepta SQL arbitrario incluido `DO $$` blocks, transacciones explícitas y múltiples statements.

```bash
node --env-file=.env.local scripts/run-sql.mjs <archivo.sql>
```

**Protocolo:**

1. Escribir el SQL en `scripts/` (one-off) o `supabase/migrations/` (permanente).
2. Ejecutar con el helper.
3. Verificar el resultado con query follow-up (count, sample).
4. Reportar counts/RAISE NOTICE a Juanjo.

**Idempotencia siempre:** `ON CONFLICT DO NOTHING`, `IF NOT EXISTS`, o `DELETE` defensivo previo. Nunca dejar un script que rompa si se corre dos veces.

**Excepción que requiere confirmación de Juanjo:** operaciones irreversibles de alto impacto (DROP TABLE en prod con datos, wipe de usuarios reales, alter column con drop de datos). Seed/update/migrations normales NO requieren confirmación.

---

## Pre-push hook automático

Existe un hook en `.git/hooks/pre-push` que bloquea push si:
- TypeScript tiene errores
- Tests fallan (incluye canarios)
- Build falla

Este hook NO se puede desactivar sin aprobación explícita de Juanjo. Si pre-push bloquea por tests de código ajeno (otra sesión trabajó en paralelo), `git fetch + pull --rebase` antes de saltar el hook.

## Keep-warm — evitar cold starts (pg_cron, no GitHub Actions)

En Vercel Hobby la función escala a cero con tráfico bajo y la primera visita paga un cold start (~1s de pantalla blanca), justo cuando se demuestra la app. Para evitarlo, un job **pg_cron en Supabase** (`keep-warm-golfers`) pinguea `/api/keep-warm` cada 2 min vía pg_net.

**Por qué NO GitHub Actions:** su scheduler estrangula los cron de repos de bajo tráfico — corría cada 1-3h en vez de cada 5 min (medido 16-jul-2026), así que no mantenía nada caliente. Supabase sí respeta el schedule. El workflow `keep-warm.yml` quedó solo como `workflow_dispatch` (ping manual de respaldo).

**Fuente de verdad / re-provisión:** `scripts/keep-warm-cron.sql` (idempotente). Verificar con `select * from cron.job where jobname='keep-warm-golfers'` y `select status_code from net._http_response order by created desc limit 5`.
