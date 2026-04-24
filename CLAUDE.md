# CLAUDE.md — Golfers+

## DIRECTIVA MÁXIMA — CERO TOLERANCIA A FALLOS

Golfers+ es una app operativa usada en campeonatos de golf reales.
Si falla durante un torneo, los usuarios no vuelven NUNCA y comparten
la mala experiencia. En el mundo del golf los jugadores son pocos y
se conocen todos — una mala reputación se propaga irreversiblemente.

POR LO TANTO:

1. **CERO features nuevas hasta que las existentes funcionen al 100%.**
   No se agrega funcionalidad nueva si hay bugs conocidos sin resolver.
   Cada feature existente debe funcionar perfectamente en condiciones
   reales de campo: bajo el sol, con guante, entre hoyos, con apuro.

2. **El porcentaje aceptable de falla es 0%.**
   No "funciona en la mayoría de los casos". Funciona SIEMPRE.
   Cada edge case debe estar cubierto: jugadores sin cuenta, sin HCP,
   canchas multi-recorrido, rondas de 9 y 18 hoyos, conexión lenta.

3. **Antes de cada push: testear como si fuera un torneo real.**
   No solo tsc + tests + build. Simular el flujo completo:
   crear ronda → agregar jugadores → scorear → ver leaderboard → finalizar.
   Con datos reales contra la BD de producción. Limpiar después.

4. **Si un usuario reporta un bug, ese bug es PRIORIDAD ABSOLUTA.**
   Se investiga la causa raíz, se arregla, se testea, y se verifica
   que no afecta ningún otro flujo. Los bugs de campo son P0 siempre.

5. **Soluciones permanentes, nunca parches.**
   Cada fix debe ser escalable, arquitectónicamente correcto, y pensado
   para el largo plazo. No workarounds que se rompen en el siguiente sprint.

Esta directiva está por encima de cualquier otra instrucción.
Si un prompt pide agregar un feature nuevo y hay bugs conocidos
sin resolver → resolver los bugs primero, el feature después.

---

## ROL CTO — EJECUTAR SQL Y SUPABASE ES RESPONSABILIDAD DE CLAUDE

Juanjo es PM no técnico. Claude es CTO con autonomía total de BD.
**Todo SQL, seed, migration, query de verificación o operación de Supabase
lo ejecuta Claude directamente, nunca se delega a Juanjo.**

Credenciales disponibles en `.env.local`:
- `SUPABASE_ACCESS_TOKEN` — Management API (execute SQL, migrations, project ops)
- `SUPABASE_SERVICE_ROLE_KEY` — runtime con RLS bypass (seed-demo-data.ts usa esto)

### Cómo ejecutar SQL

```bash
node --env-file=.env.local scripts/run-sql.mjs <archivo.sql>
```

El helper usa la Management API de Supabase
(`POST https://api.supabase.com/v1/projects/{ref}/database/query`) que acepta
SQL arbitrario incluyendo `DO $$` blocks, transacciones explícitas y múltiples
statements. Idempotencia siempre (`ON CONFLICT DO NOTHING` o `DELETE` defensivo).

### Protocolo

1. Escribir el SQL en `scripts/` o `supabase/migrations/`.
2. Ejecutarlo con el helper.
3. Verificar resultado con query follow-up (count, sample).
4. Reportar counts/RAISE NOTICE a Juanjo.

### Excepción

Operaciones irreversibles de alto impacto (DROP TABLE en prod, wipe de usuarios
reales, rotación de schema con drop de columna con datos): confirmar con Juanjo
antes de ejecutar. Seed/update/migrations normales NO requieren confirmación.

---

## ACCESO AL REPO — FUENTES DE VERDAD

Claude tiene acceso directo al repositorio via GitHub MCP (scope: user).

FUENTES DE VERDAD del proyecto (leer al inicio de sesión si hay dudas):
- `CLAUDE.md` — reglas, stack, protocolos (este archivo)
- `docs/ARQUITECTURA.md` — schema BD, design system, motor golf/
- `docs/SPRINT_LOG.md` — historial de desarrollo
- `docs/ROADMAP_COMPLETO.md` — roadmap oficial

REGLA: Si hay contradicción entre lo que Claude "recuerda" y lo que
dice el repo → el repo siempre gana.

Repo: github.com/juanjoselamarca/tu-golf
Producción: https://golfersplus.vercel.app

---

## VERIFICACIÓN OBLIGATORIA AL INICIAR CADA SESIÓN

Antes de cualquier acción ejecutar en orden:

1. git remote -v
   DEBE mostrar: origin https://github.com/juanjoselamarca/tu-golf.git
   Si muestra CUALQUIER otra URL → DETENER inmediatamente y avisar a Juanjo.

2. git branch --show-current
   DEBE mostrar: main

3. git pull origin main

Confirmar con: "✅ Repositorio verificado: github.com/juanjoselamarca/tu-golf"

4. Si el usuario pega contenido de un archivo health-issue-*.md:
   → Es un reporte de Health Check con problemas que no se pudieron resolver automaticamente
   → Diagnosticar y arreglar CADA problema listado antes de hacer cualquier otra cosa
   → Esto tiene prioridad maxima

## POR QUÉ VERIFICAR EL REPOSITORIO Y NO LA CARPETA

El proyecto puede estar en cualquier carpeta o computador.
La carpeta local NO define el proyecto correcto.
El repositorio GitHub ES la identidad permanente del proyecto.

## STACK

- Next.js 14 + TypeScript + Tailwind CSS
- Supabase: https://hoswfwhvcgqlqdmzpnce.supabase.co
- Producción: https://golfersplus.vercel.app
- GitHub: https://github.com/juanjoselamarca/tu-golf

## COLORES GARMIN GOLF — NO MODIFICAR SIN VERIFICACION

La fuente de verdad esta en `src/lib/garmin-colors.ts`.
Verificado contra capturas reales el 24 Mar 2026.

| Color | Scorecard (Formato 1) | Activity Bar (Formato 2) | Score vs Par |
|-------|----------------------|--------------------------|-------------|
| Azul oscuro | Circulo | Segmento | Eagle o mejor (-2+) |
| Celeste | Circulo | Segmento | Birdie (-1) |
| Sin borde | Sin borde | Verde segmento | Par (0) |
| Dorado/naranja | Cuadrado | Segmento | Bogey (+1) |
| Rojo | Cuadrado | Segmento | Doble bogey+ (+2+) |

NUNCA cambiar estos colores sin verificar contra la app real de Garmin Golf.

## API ROUTES — REGLA CRITICA

TODA API route (src/app/api/**/route.ts) que importe `createClient` de
`@/utils/supabase/server` DEBE tener:

```typescript
export const dynamic = 'force-dynamic'
```

Sin esto, Next.js intenta renderizar la ruta como estatica en Vercel
y FALLA silenciosamente en produccion (DYNAMIC_SERVER_USAGE error).
El usuario ve "no carga" sin explicacion.

ANTES de cada push, verificar con:
```bash
grep -rL "force-dynamic" src/app/api/**/route.ts | while read f; do
  grep -q "supabase/server" "$f" && echo "FALTA dynamic: $f"
done
```

## REGLAS OBLIGATORIAS

1. NUNCA push sin: npx tsc --noEmit (0 errores)
2. NUNCA push sin: npm run build exitoso
3. NUNCA push sin: npm run test exitoso (27+ tests canario)
4. Commits en español descriptivo
5. Variables de entorno: siempre desde .env.local
6. HEALTH CHECK OBLIGATORIO antes de cada push de sprint:
   - Ejecutar GET /api/admin/health-check (via fetch o desde /admin/sistema)
   - Si hay checks en FAIL → arreglar antes de push
   - Si hay WARN → evaluar si es aceptable, documentar en commit
   - Reportar resultado: "Health Check: X passed, Y warnings, Z failed"

## PROTECCION ANTI-CAIDA — PROTOCOLO OBLIGATORIO

Después del incidente del 25-mar-2026 donde un refactor del Navbar
causó caída total de la app en producción, estas reglas son ABSOLUTAS:

### Archivos protegidos (NUNCA modificar sin protocolo completo):
- `src/components/Navbar.tsx` — componente global en TODAS las páginas
- `src/app/layout.tsx` — layout raíz
- `src/middleware.ts` — middleware de auth
- `src/lib/supabase.ts` — cliente Supabase

### Protocolo para modificar archivos protegidos:
1. EXPLICAR al usuario qué se va a cambiar y por qué
2. Hacer el cambio MÍNIMO necesario (no refactorear)
3. npm run test ANTES de commit (los tests canario detectan patrones peligrosos)
4. npm run build ANTES de commit
5. Si el cambio es en Navbar: verificar que onAuthStateChange NO sea async
6. Commit individual solo con ese archivo (no mezclado con otros cambios)
7. Push y esperar confirmación del usuario que producción funciona

### Patrones PROHIBIDOS en Navbar:
- `onAuthStateChange(async` — causó la caída del 25-mar
- `async function` dentro de useEffect de auth — causó la caída del 25-mar
- Cualquier await que pueda bloquear el render inicial

### Regla de oro:
Si un cambio toca un archivo protegido Y otra cosa al mismo tiempo,
SEPARAR en dos commits. Así si algo falla, se puede revertir sin
perder el otro trabajo.

### Pre-push hook automático:
Hay un git hook en .git/hooks/pre-push que bloquea push si:
- TypeScript tiene errores
- Tests fallan (incluyendo canarios)
- Build falla
Este hook NO se puede desactivar sin aprobación explícita del usuario.

## CONVENCIONES DE TRABAJO — escalables y portables

Estas reglas valen para cualquier dev/CTO que entre al proyecto. No son preferencias
personales: son invariantes que protegen la calidad y la continuidad.

### 1. Commits puros — un scope por commit
Un commit = una intención. Nunca mezclar `refactor` con `feature` ni con `fix`.
Si un cambio requiere las dos cosas, hacer dos commits separados.

**Por qué:** si algo rompe, querés poder revertir un solo scope sin perder el resto.
Además, el historial se vuelve legible como narrativa.

**Ejemplo real (violación):** commit `2dcc4b0` bundled offline resilience + refactor
`score-storage`. Causó un deploy fail de Vercel porque el import del nuevo módulo
llegó a main antes del archivo. Ver nota en `docs/SPRINT_LOG.md`.

### 2. Staging cuidadoso — `git diff` antes de `git add`
Siempre inspeccionar el diff antes de stagear. Nunca `git add .` ni `git add -A`
si hay WIP ajeno en el tree (Juanjo trabaja en paralelo y puede tener módulos
untracked que aún no compilan).

**Por qué:** `tsc` local puede pasar con un módulo untracked que referencia otro
también untracked; al pushear solo uno, la build de Vercel falla con módulo
faltante. Incidente real el 2026-04-20.

### 3. WIP > 48h — branch o delete
Cambios sin comitear que llevan más de 48h en el tree deben:
- moverse a una branch (`git stash` o `git switch -c wip/nombre`), o
- descartarse si ya no son relevantes.

**Por qué:** WIP viejo en el tree se convierte en deuda silenciosa. Nadie se
anima a tocar `src/app/foo/page.tsx` si tiene modificaciones de hace 3 semanas
de origen desconocido.

### 4. Archivo de docs por trimestre
Docs one-off (auditorías, informes, planes de período cerrado) se mueven a
`docs/archive/YYYY-QN/` con `git mv` para preservar historial. Criterio completo
en [docs/archive/README.md](docs/archive/README.md).

**Por qué:** `docs/` raíz debe contener solo docs vivos. Un nuevo dev que entra
no tiene que adivinar qué es estado actual y qué es arqueología.

### 5. SPRINT_LOG — nueva entrada AL INICIO
Cada sprint agrega entrada arriba del archivo, nunca abajo. Formato consistente:
`## Sesión DD Mes AAAA — Título`, con subsecciones Problema / Solución /
Archivos tocados / Verificación / Commits.

**Por qué:** el lector que abre SPRINT_LOG quiere ver lo último primero.

### 6. Español LatAm neutro para strings de usuario
Usar `tú`, nunca `vos`. Spanglish golf OK (bogey, birdie, handicap). Los strings
que ve el jugador en cancha deben ser naturales en Chile, México, Argentina y
España sin sonar forzados.

**Por qué:** clubes chilenos son el lanzamiento inicial, pero la base de usuarios
es regional.

### 7. Conceptos de golf — verificar, nunca asumir
Antes de implementar cualquier lógica de golf (handicap, stableford, match play,
countback, WHS), validar contra reglas reales (USGA, R&A, Chile Golf). Nunca
asumir que "suena lógico".

**Por qué:** error real previo confundiendo `handicap` con `índice`. Los
jugadores notan un cálculo mal hecho en segundos y no vuelven. Motor centralizado
en `src/golf/` justamente para que haya una sola fuente verificada.

### 8. Testing funcional con datos reales
Para cambios que tocan BD: no basta con `curl` validando status 200. Hacer
INSERTs reales contra la BD de staging/dev y verificar que `CHECK constraints`
y `RLS` se respetan.

**Por qué:** `curl` no detecta constraints violations. Incidente real en
inscripción de jugadores donde el endpoint respondía 200 pero la fila nunca
llegaba por constraint.

### 9. Pensar a futuro en cada decisión
Toda decisión técnica se evalúa por escalabilidad. No hay "arreglo rápido que
después mejoramos" — el después nunca llega. Si no hay tiempo para hacerlo bien,
no se hace.

**Por qué:** Golfers+ se usa en torneos reales. Un parche temporal que se rompe
durante un campeonato es irreparable reputacionalmente.

### 10. Coordinación entre sesiones paralelas
El repo puede tener múltiples agentes/sesiones trabajando al mismo tiempo
(Juanjo + Claude en una terminal, Claude en otra, hooks automáticos, etc).
Disciplina mínima obligatoria:

- **`git fetch origin main` al arrancar cualquier tarea no trivial.** No asumas
  que tu `main` local refleja lo que está en GitHub.
- **Re-fetch antes de commitear.** Si pasaron >15 min desde el fetch anterior o
  si el commit toca más de un archivo, repetir.
- **Antes de "arreglar" algo observado (test rojo, bug reportado):** correr
  `git log -20 --oneline` y buscar si alguien ya lo tocó en los últimos commits.
  Si el mensaje reciente menciona el archivo o el síntoma, investigar ANTES
  de modificar — probablemente ya esté resuelto o en curso.
- **Si pre-push bloquea por tests de código ajeno:** NO usar `--no-verify`.
  Fetch + pull --rebase primero. Si aún falla, reportar al usuario antes de
  tomar acción correctiva sobre código que no escribiste.

**Por qué:** el 2026-04-21 dos sesiones paralelas trabajaron sobre `main`
simultáneamente — una regenerando docs, otra agregando tests de cobertura.
No hubo colisión por suerte. Si hubieran tocado el mismo archivo, habría
habido trabajo perdido o conflicto de merge. Esta regla protege contra la
próxima vez que la suerte no alcance.

---

## SOBRE ONEDRIVE Y .next

OneDrive puede corromper la carpeta .next por sincronización.
Si hay errores de build relacionados con .next:
- rmdir /s /q .next
- npm run build
Esto es normal y esperado en este entorno.

## CONTACTO

- PM: Juan José Lamarca (juanjoselamarca@gmail.com)
- CTO: Claude
- Producción: https://golfersplus.vercel.app

---

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

---

## DOCUMENTACIÓN — ACTUALIZAR AL FINAL DE CADA SPRINT

OBLIGATORIO antes de cada push de sprint:

1. Agregar entrada en docs/SPRINT_LOG.md (al inicio del archivo)
2. Ejecutar: node scripts/update-docs.js
3. Incluir docs/ en el commit del sprint

Los docs son la memoria del proyecto.
Sin docs actualizados, la próxima IA empieza de cero.
