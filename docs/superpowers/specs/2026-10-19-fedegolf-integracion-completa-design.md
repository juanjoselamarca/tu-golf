# Integración FedeGolf completa — diseño

**Fecha:** 19-oct-2026 · **Dueño:** Claude (CTO) · **PM:** Juanjo · **Estado:** diseño aprobado en brainstorming

## Objetivo

Que cada usuario de Golfers+ tenga su cuenta FedeGolf vinculada y que esa integración **no falle nunca**:
índice oficial siempre al día, aviso cuando cambia, perfil autocompletado, índice verificado en torneos,
proyección "¿qué necesito para bajar?", tendencia del índice y sus tarjetas oficiales en el historial.

Hoy: 1 cuenta vinculada de 48 perfiles; la vinculación solo existe en `/perfil`.

## Hallazgos que motivan el diseño (mapeo 18-oct)

Bugs vivos (Fase 0):

| # | Bug | Dónde | Efecto |
|---|-----|-------|--------|
| B1 | Cualquier throw del login (incluido fedegolf.cl caído/lento) marca `activo=false` y responde 401 | `api/fedegolf/sync-indice/route.ts:94-102` | Un corte de FedeGolf desvincula en silencio a todos los que abran la app |
| B2 | `fedegolfGetIndice` sin try/catch propio | `sync-indice/route.ts:106` | 500 en vez de fail-soft |
| B3 | Ningún `fetch` a fedegolf.cl tiene timeout | `src/lib/fedegolf/*` | Requests colgadas hasta el límite de la función |
| B4 | `page-login.ts` no valida el status del login | `src/lib/fedegolf/page-login.ts:84-85` | Clave incorrecta devuelve cookie "válida"; tarjetas fallan opacas |
| B5 | `.single()` sobre `fedegolf_credentials` sin fila → 406 | `sync-indice:27`, `sync-tarjetas:36`, `tarjetas:39` | Ruido en logs (visto con usuario real 16-oct) |
| B6 | `FedegolfSync` (montado en `layout.tsx`) dispara ambos syncs en cada carga para todo usuario logueado | `components/FedegolfSync.tsx:29,53` | 47 de 48 usuarios hacen 2 requests inútiles por visita |
| B7 | Rate limit de vincular en memoria | `api/fedegolf/vincular/route.ts:23` | No limita nada en Vercel (instancias múltiples) |

Hallazgo de arquitectura: el índice oficial es **público por RUT** (`get_indice_rut`, sin login). La clave solo
es necesaria para (a) probar identidad al vincular y (b) leer las ~20 tarjetas.

## Principios

1. **"FedeGolf no responde" ≠ "credenciales inválidas".** Solo un rechazo explícito de credenciales cambia el
   estado de la vinculación; un error transitorio se reintenta y nunca se le muestra al usuario como su culpa.
2. **El índice se sincroniza en el servidor, por RUT, sin login.** El cliente nunca más sincroniza en cada visita.
3. **Nunca pisar lo que el usuario escribió** (autocompletar = fill-if-null).
4. **Solo lectura sobre FedeGolf.** Golfers+ nunca escribe en fedegolf.cl.
5. **Un concepto, una fuente:** un solo cliente FedeGolf con timeout/clasificación de errores; un solo componente
   "Conecta FedeGolf"; un solo estado de vinculación.

## Modelo de estado de la vinculación

`fedegolf_credentials` gana un estado explícito en vez de `activo` booleano:

- `vinculada` — credenciales probadas, sync al día.
- `requiere_reconexion` — FedeGolf rechazó la clave (cambió en fedegolf.cl). La sync de **índice sigue funcionando**
  (es por RUT); solo las tarjetas quedan pausadas. UI: aviso discreto "Reconecta FedeGolf para ver tus tarjetas".
- Errores transitorios se registran en `ultimo_error` / `ultimo_error_at` + `captureError()` sin cambiar el estado.

Además: `rut` normalizado guardado cifrado (ya existe `rut_encrypted`) — el cron lo descifra server-side.

## Fases

Cada fase = 1 PR mergeable que entrega valor solo. Zona crítica (índice/handicap/torneos/migraciones) → revisión
`revisor-fable` obligatoria.

### Fase 0 — Arreglar lo roto (B1–B7)
- Cliente FedeGolf canónico (`src/lib/fedegolf/http.ts`): `fetch` con `AbortSignal.timeout` (8 s), y error tipado
  `FedegolfError { kind: 'credenciales' | 'no_disponible' | 'respuesta_inesperada' }`. Todos los llamados lo usan.
- `sync-indice`: solo `kind==='credenciales'` cambia estado; el resto → fail-soft 200 con valor cacheado.
- `page-login`: validar status/redirect del login → `credenciales` si rechaza.
- `.single()` → `.maybeSingle()` en las 3 rutas; sin fila = 204/no-op.
- `FedegolfSync`: no hace nada si el usuario no está vinculado (el estado viene del server; cero requests).
- Rate limit de vincular persistente (tabla o mecanismo de rate limit ya existente en el repo; grep antes).
- Tests: cada `kind` de error → comportamiento esperado; regresión B1 (FedeGolf caído no desvincula).

### Fase 1 — Sync server-side + avisos
- Ruta `POST /api/cron/fedegolf-indices` protegida por secret, llamada por pg_cron (patrón `keep-warm-cron.sql`)
  1×/día en horario de baja carga. Procesa vinculados en lotes con concurrencia acotada (≤3) y pausa entre lotes;
  idempotente; registra resumen (procesados/cambiados/fallidos).
- Por usuario: `get_indice_rut` → si cambió: `profiles.indice`, `indice_historial`, y notificación.
- Notificación: push server-side (extraer sender reutilizable de `/api/push/send`) + aviso in-app usando
  `aviso-indice.ts` (bajar se celebra, subir neutro). Email: interfaz lista, se activa cuando Resend esté configurado.
- `FedegolfSync` del cliente queda solo para tarjetas (con su cooldown 24 h) o se elimina si el cron cubre ambas.
- Respeta la regla "evento en vivo": el cron no corre si `evento-en-vivo` reporta gente jugando (carga sobre prod).

### Fase 2 — Que todos se vinculen
- Componente único `ConectaFedegolf` (form RUT + clave, mismo hook `useFedegolfVincular`), con variantes de
  presentación (paso de wizard / card / inline).
- Puntos de entrada: onboarding (`OnboardingWizard`: paso opcional antes del índice manual; si vincula, el índice
  manual se salta), inscripción a torneo, crear ronda libre, Mi Golf (mientras no esté vinculado).
- Copy (decisión de producto, se valida con Juanjo): beneficio + "solo leemos tu índice, nunca modificamos nada".
- Medición: evento analytics `fedegolf_vinculado` con origen (onboarding/torneo/ronda/mi-golf).

### Fase 3 — Usar todo su perfil
- Migración: `profiles.club_fedegolf` (texto) y lo que falte para fecha de nacimiento (ya se llena si es null).
- Al vincular y en cada sync con login: fill-if-null de nombre, club, fecha de nacimiento, género.
- El `name` del usuario solo se completa si es el default derivado del email.

### Fase 4 — Índice oficial en torneos
- Inscripción: campo **RUT opcional** para no vinculados → índice por `get_indice_rut` (dato público), marcado
  "Índice FedeGolf". Vinculados con clave → sello **"Verificado FedeGolf"**.
- Se guarda en la inscripción: `indice_inscripcion`, `indice_fuente` (`fedegolf_verificado` | `fedegolf_rut` |
  `manual`), `indice_fecha`.
- Índice **congelado** al inicio del torneo (snapshot); el handicap de juego usa el snapshot.
- Organizador: botón "Actualizar índices oficiales" (todos los inscritos con RUT, misma rutina con lotes de la Fase 1),
  bloqueado una vez iniciado el torneo. Vista de quién está verificado / por RUT / manual.
- RUT de terceros = dato personal: se guarda cifrado, solo lo usa el server, nunca se muestra completo.

### Fase 5 — "¿Qué necesito para bajar?"
- Función pura en `src/golf/` que, dadas las 20 tarjetas oficiales (diferenciales + fechas + `valeDoble`), calcula:
  qué tarjeta sale de la ventana con la próxima ronda, y el diferencial / score bruto (por cancha+tee elegidos) que
  baja el índice al menos 0,1.
- Debe reproducir exactamente el índice publicado por FedeGolf hoy (promedio simple de los 8 mejores, truncado,
  regla doble del campeonato) antes de proyectar. Si no lo reproduce para un usuario → no se muestra la proyección.
- Copy como estimación ("si FedeGolf mantiene su cálculo actual"). Verificación contra reglas WHS reales y la
  cuenta real de Juanjo.

### Fase 6 — Tendencia del índice
- Gráfico de `indice_historial` (fuente FedeGolf) en `/perfil`. Con <3 puntos: estado vacío explicativo.

### Fase 7 — Tarjetas en el historial
- Resolver de cancha en `capturar-tarjetas.ts` (match `clubCancha` + CR/slope contra el catálogo) → `course_id`.
- Visibles en el historial con marca "FedeGolf"; siguen `excluded_from_handicap=true` y fuera del índice Golfers
  (sin doble conteo). Decidir con el coach si las usa como contexto (solo lectura, sin hoyo a hoyo).
- Fail-soft: si el HTML de FedeGolf cambia, se detecta (parser devuelve 0 filas con status 200) → `captureError` +
  canario, nunca rompe la vista.

## Escala y operación

- Costo por usuario del cron = 1 request público. A 10.000 vinculados con concurrencia 3 y ~300 ms/request ≈ 17 min;
  si crece más, se reparte en ventanas horarias por hash de `user_id`.
- Canario semanal: login + índice + tarjetas con cuenta de prueba (detecta cambios en fedegolf.cl antes que los usuarios).
- Seguridad: la sal hardcodeada de `crypto.ts` se registra como deuda (cambiarla exige re-cifrar); no entra en este
  proyecto salvo que la revisión de seguridad lo pida.

## Fuera de alcance

- Escribir en FedeGolf (subir tarjetas). · Hoyo a hoyo de las tarjetas (FedeGolf no lo expone). · Email hasta que
  Resend esté activo.

## Criterios de éxito

- 0 desvinculaciones por errores transitorios (test + canario).
- 0 requests FedeGolf de usuarios no vinculados.
- Índice de todos los vinculados actualizado ≤24 h tras cambiar en FedeGolf, con aviso.
- Proyección "para bajar" reproduce el índice publicado al 0,1 en el 100 % de las cuentas donde se muestra.
- Tasa de vinculación medida por origen (meta a definir con Juanjo tras 2 semanas de datos).
