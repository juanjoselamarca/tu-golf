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

**Vitest también requiere config especial** por el mismo motivo: `pool: 'vmThreads'` obligatorio en `vitest.config.mts` para evitar errores de paths con espacios. Ya está configurado, no tocar.

---

## Cómo ejecutar SQL contra Supabase

**Lecturas:** `scripts/run-sql.mjs` corre una consulta `SELECT`/`WITH` por archivo vía `exec_sql`, en una transacción de solo lectura con la service key. Cada consulta tiene un techo de 8 s. Postgres rechaza cualquier escritura.

```bash
node --env-file=.env.local scripts/run-sql.mjs <archivo.sql>
```

**Escrituras (schema, permisos o datos):** solo como migración en `supabase/migrations/`, dentro de un PR. Tras el merge, el workflow `migraciones-prod` la aplica con la CLI de Supabase cuando Max o Juanjo aprueban el deploy. Después corre los canarios de prod y guarda la huella del esquema. Cada noche, `prod-canarios` compara prod con esa huella: un cambio hecho por fuera de una migración aparece como deriva y avisa por Telegram. Una deriva aceptada se fija re-corriendo `migraciones-prod` a mano.

**`supabase/schema.sql`:** el esquema que dejan todas las migraciones (tablas, columnas, RLS, policies y privilegios), generado. Para saber qué hay, se lee ahí y no en las migraciones. Toda migración lo trae regenerado en el mismo PR con `node scripts/ci/esquema.mjs` (necesita Docker y el CLI de Supabase). El check `esquema` falla si no coincide; sin Docker, el artifact `schema-sql` de ese check trae el archivo correcto.

**Privado por defecto:** desde `20261014030000_privado_por_defecto.sql`, toda tabla, vista, secuencia o función que crea una migración nace sin permisos para anon y authenticated. La misma migración otorga lo que la app usa (`GRANT SELECT ON public.x TO authenticated`, `GRANT EXECUTE ON FUNCTION public.f(int) TO authenticated`) o declara el objeto privado (`REVOKE ALL ON ... FROM PUBLIC, anon, authenticated`). Lo exige `canary-privado-por-defecto.test.ts`, también en un `CREATE OR REPLACE`. Una columna `serial` necesita además `GRANT USAGE ON SEQUENCE`; identity y uuid no.

**Migración antes que el código que la usa:** Vercel publica el código apenas se mergea, pero la migración se aplica después (cuando se aprueba `migraciones-prod`). Si un PR trae una columna, tabla o función nueva junto con el código que la lee, ese código falla en prod durante el intervalo. Va en dos PRs: primero la migración aditiva sola (merge → aprobar → aplicada), después el código. Si el código debe convivir con prod sin migrar, que tolere la ausencia explícitamente.

**Una migración mergeada no se edita, borra ni renombra:** el cambio va en una migración NUEVA. `verify-db-schema` (pre-push) lo bloquea siempre, sin mirar si prod ya la aplicó (sin origin/main legible solo avisa: `git fetch origin main`): una que espera aprobación aplicaría la versión vieja si se aprueba esa corrida. Única salida, solo para una migración que FALLÓ al aplicarse: `PERMITIR_TOCAR_MIGRACION=<version>` (varias con coma), solo en la línea del push y nunca en `.env.local` (si está ahí, verify la ignora y avisa). El push lo comprueba contra prod y exime solo si `supabase_migrations.schema_migrations` se lee bien (hace falta `.env.local`) y NO registra esa versión. Que la corrida haya fallado no basta, porque el workflow también falla después de un `db push` exitoso (en la huella o en los canarios). Si prod la registra, o no se pudo leer, bloquea igual. Con las corridas: rechaza las pendientes y no hagas Re-run de ninguna corrida anterior al merge, tampoco la que falló; tras el merge aprueba la corrida que dispara el merge (o Run workflow desde main).

**Respaldo en GitHub (no se puede saltar con `--no-verify`):** el check "Migraciones mergeadas intactas" (`.github/workflows/migraciones-inmutables.yml`, con `pull_request_target`: corre siempre el YAML y el script `scripts/ci/migraciones-inmutables.mjs` de main, sin ejecutar código del PR) compara el merge del PR con su base exacta y falla si deja una migración de main editada, borrada o renombrada, o si agrega una con una versión que main ya usa (o un nombre que main ya trae con otro contenido). Lo mismo corre en `migraciones-prod.yml` antes del `db push` (`before..sha`; sin `before`, como en Run workflow, pasa con aviso). Entró en vigor al mergear #665. Salida, solo para la migración editada o borrada que FALLÓ al aplicarse: la etiqueta `permitir-tocar-migracion:<version>`, que la pone Juanjo tras comprobarlo en `supabase_migrations.schema_migrations` (el check se re-corre solo al ponerla). Es convención, no control: GitHub deja ponerla a cualquiera con permiso de triage, incluidos los agentes. Ningún agente la pone, ni de día ni de noche (a diferencia de `fable-reviewed`, que de día el hilo principal pone tras un APROBADO); a un agente nocturno que la ponga lo detiene la regla `auto-label-migracion` de `scripts/ceo/failure.mjs`. Un renombre que conserva la versión no se salva con la etiqueta: la versión repetida no tiene salida.

**Idempotencia siempre:** `ON CONFLICT DO NOTHING`, `IF NOT EXISTS`, o `DELETE` defensivo previo. Nunca dejar un script que rompa si se corre dos veces.

**Requiere confirmación de Juanjo antes del PR:** operaciones irreversibles de alto impacto (DROP TABLE en prod con datos, wipe de usuarios reales, alter column con drop de datos). El resto de las migraciones solo pasa por la revisión del PR y la aprobación del workflow.

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
