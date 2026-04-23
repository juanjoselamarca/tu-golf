# ADR-001 — Supabase como backend

**Estado**: Aceptado
**Fecha**: 2026-03-17 (estimado — primeros commits del repo)

## Contexto

Golfers+ necesita:
- Autenticación de usuarios (email + social providers)
- Base de datos relacional (torneos, jugadores, scores, rondas)
- Row-level security para aislar datos por usuario
- Realtime para espectadores viendo leaderboards en vivo
- Storage para fotos (scorecards, avatars)

Alternativas consideradas:
- **Firebase**: NoSQL, realtime bueno, pero schema rígido para queries relacionales complejas (leaderboards con joins)
- **Backend custom (Express + Postgres + Redis)**: máximo control pero 10× más trabajo
- **Hasura + Postgres**: GraphQL + Postgres, curva de aprendizaje mayor
- **Supabase**: Postgres con RLS nativo, auth integrado, realtime vía logical replication, SDK JS maduro

## Decisión

**Supabase** es el backend principal.

Proyecto: `hoswfwhvcgqlqdmzpnce`
URL: https://hoswfwhvcgqlqdmzpnce.supabase.co
Access via:
- `@supabase/ssr` para SSR/API routes (con cookies)
- `@supabase/supabase-js` para admin client (service role)

## Consecuencias

### Positivas
- Schema SQL full — joins, views, funciones Postgres se usan (matching jugador/usuario, stats agregadas)
- RLS como primera línea de seguridad — un bug de API route no expone datos si RLS está bien
- Auth sin código custom — sólo orquestación
- Dashboard visual — útil para debug y ops
- Costo predecible en tier gratuito/pro

### Negativas
- **Lock-in moderado**: migrar a otro Postgres es posible pero auth + RLS + realtime requieren reescritura
- **Latencia variable**: single-region (US East típicamente) — no ideal para usuarios en Chile (~200ms RTT)
- **Límites del tier**: free tier tiene restricciones de conexiones y storage que se notan rápido
- **Debugging de RLS**: cuando una policy bloquea incorrectamente, el error es críptico. Ver `docs/archive/` para los fixes históricos.

### Mitigaciones
- `src/utils/supabase/server.ts` y `src/lib/supabase/` consolidan el acceso
- `src/lib/supabaseAdmin.ts` usa service role SOLO cuando RLS debe bypassearse (con justificación escrita)
- Tests canario validan conectividad (`src/__tests__/canary-stability.test.ts`)

## Cuándo reconsiderar

- Si Supabase limita performance de leaderboards en >1000 usuarios concurrentes
- Si costos superan ~$100 USD/mes en tier producción
- Si hay downtime >2× al año que afecte torneos

Decisión: **mantener Supabase hasta que alguna de esas señales aparezca**.
