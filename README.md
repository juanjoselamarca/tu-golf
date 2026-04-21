# Golfers+

Live scoring para torneos amateur de golf · https://golfersplus.vercel.app

Next.js 14 · TypeScript · Tailwind · Supabase · Vercel

> **¿Primer día en el proyecto?** Empezá por [docs/ONBOARDING.md](docs/ONBOARDING.md) — ruta de lectura ordenada, ~45 min para estar operativo.

---

## Documentación

Este README es solo el punto de entrada. La documentación viva está en `docs/`:

| Documento | Para qué sirve |
|-----------|----------------|
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Ruta de lectura para devs nuevos (45 min). **Si es tu primer día, empezá aquí.** |
| [docs/ESTADO_ACTUAL.md](docs/ESTADO_ACTUAL.md) | Snapshot del último deploy (auto-generado). |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Stack, schema BD completo, motor `src/golf/`, design system |
| [docs/ROADMAP_COMPLETO.md](docs/ROADMAP_COMPLETO.md) | Qué viene después |
| [docs/SPRINT_LOG.md](docs/SPRINT_LOG.md) | Historial de sprints (entrada nueva al inicio) |
| [docs/SQL_PENDIENTE.md](docs/SQL_PENDIENTE.md) | Migraciones SQL sin aplicar en Supabase |
| [docs/TAIGER_SYSTEM_PROMPT.md](docs/TAIGER_SYSTEM_PROMPT.md) | Prompt del coach IA tAIger+ |
| [docs/GWI_MODELO.md](docs/GWI_MODELO.md) | Modelo de probabilidades de ganar |
| [docs/archive/](docs/archive/) | Auditorías y docs históricos (no son estado actual) |

Si hay contradicción entre lo que recuerdes y lo que dice el repo → el repo gana.

---

## Antes de trabajar — verificar el repo

**Por qué:** el proyecto puede estar en cualquier carpeta o computador, pero el repo GitHub es la identidad permanente. La ruta local puede mentir (fork viejo, clon accidental, carpeta renombrada). El remote no.

```bash
git remote -v               # debe mostrar github.com/juanjoselamarca/tu-golf.git
git branch --show-current   # debe mostrar main
git pull origin main        # sincronizar antes de tocar nada
```

Si el remote no es `juanjoselamarca/tu-golf` → detener y avisar antes de hacer cualquier cambio.

Protocolo completo y reglas para Claude/agentes: [CLAUDE.md](CLAUDE.md).

---

## Gotchas del schema de BD

Errores frecuentes al escribir queries. La fuente de verdad completa está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md#regla-crítica--nombres-de-columnas-en-bd).

**Nombres de columnas en español** (no traducir al inglés por instinto):

| Tabla | Columna correcta | Error típico |
|-------|------------------|--------------|
| `course_holes` | `numero` | ~~`hole_number`~~ |
| `courses` | `nombre`, `ciudad`, `pais` | ~~`name`~~ |
| `profiles` | `role` | ~~`rol`~~ |
| `rondas_libres` | `estado`: `'en_curso' \| 'finalizada'` | ~~`'in_progress'`~~, ~~`'closed'`~~ |

**Regla de persistencia del scoring:** siempre guardar `gross_score` + `net_score` + `points` en BD. El `modo_juego` solo afecta qué se muestra, no qué se guarda.

---

## Desarrollo local

```bash
npm install
npm run dev           # http://localhost:3000
npm run test          # vitest (1000+ tests)
npx tsc --noEmit      # typecheck
npm run build         # verifica antes de push
```

Variables de entorno en `.env.local` (no comitear). Referencia: `.env.example`.

**Si `npm run build` falla con `EINVAL` en `.next/`:** es OneDrive sincronizando. `rm -rf .next && npm run build` lo resuelve.

---

## Antes de push — obligatorio

Hay un `pre-push` hook en `.git/hooks/` que bloquea si cualquiera de estos falla:

- `npx tsc --noEmit` (0 errores)
- `npm run test` (incluye tests canario que detectan patrones peligrosos)
- `npm run build`

Comando combinado: `/pre-push` (skill de Claude Code).

Archivos protegidos que nunca se modifican sin protocolo explícito (ver [CLAUDE.md](CLAUDE.md#proteccion-anti-caida)):
`src/components/Navbar.tsx` · `src/app/layout.tsx` · `src/middleware.ts` · `src/lib/supabase.ts`.

---

## Contacto

- PM: Juan José Lamarca — juanjoselamarca@gmail.com
- Producción: https://golfersplus.vercel.app
