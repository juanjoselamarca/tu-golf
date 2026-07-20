# Levantamiento UX — flujo de inscripción a torneo (invitado)

**Fecha:** 20-jul-2026
**Alcance:** desde que el organizador copia el link hasta que el jugador queda inscrito.
**Estado:** los 3 P0 se cerraron en PR #271. El resto queda para la auditoría de UX,
que **no se ejecuta hasta que el live scorer pase su gate** (decisión 20-jul: el
scorer es el cimiento; ver `project_encrucijada_estrategica_jul2026`).

---

## El flujo, tal como existe

```
Organizador  →  TournamentInvitationCard.tsx:37  copia link crudo
                https://golfersplus.vercel.app/torneo/<slug>/unirse
                       ↓ (WhatsApp)
Invitado     →  /torneo/[slug]/unirse  (418 LOC, estilos 100% inline)
                       ↓ sin sesión (NO hay muro: la ruta es pública)
                /login?next=…  →  /register?next=…  →  /auth/callback  →  vuelve
                       ↓ con sesión
                POST /api/torneos/[slug]/inscribirse → RPC enroll_player (atómico)
```

**Un solo camino self-service.** No existe `/t/[codigo]`, `/inscripcion` ni
`/campeonato/*`. La escritura ya está consolidada: los tres caminos de alta
(self-service, organizador-registrado, organizador-invitado) convergen en
`enrollPlayer()` → RPC `enroll_player`, con cupo atómico bajo `FOR UPDATE`
(#253/#260/#261). **El motor no es el problema.**

## Cerrado en PR #271

| # | Hallazgo | Fix |
|---|---|---|
| P0-1 | `generateMetadata` pedía `tournament_players`, tabla inexistente → PGRST200 → **todo** link compartido caía a "Torneo — Golfers+" | `players(id)` + `tournamentStatusLabel()` canónico |
| P0-2 | Los dos `fetch` de `/unirse` sin `try/catch` → UI colgada para siempre sin señal | `fetchJsonConTimeout` (12s, cubre headers **y** cuerpo) + estado de reintento |
| P0-3 | Slug inexistente → leaderboard demo hardcodeado con nombres inventados | `notFound()`, y `fetchTournamentBySlug` distingue PGRST116 de error transitorio |

Verificado en prod: título y descripción reales con conteo de jugadores; slug
falso devuelve 404 sin nombres demo.

---

## Pendiente para la auditoría (ordenado por daño)

### 1. El código del torneo no tiene dónde escribirse
`tournaments.codigo` se muestra en **tres** superficies con botón de copiar
(`TournamentInvitationCard`, pantalla de éxito de `/unirse`, vista TV "Código
para unirse") y **no existe ninguna pantalla donde tipearlo**. El organizador lo
dicta en el primer tee y el jugador no tiene dónde meterlo.

**Decisión de producto pendiente (Juanjo):** o se construye la pantalla de
ingreso por código, o se saca el código de la UI del jugador. Hoy es una promesa
sin destino.

### 2. El registro está sepultado para el público que más lo necesita
El CTA de `/unirse:327` dice "Iniciar sesión para inscribirme", pero el público
dominante de una invitación es gente **sin cuenta**. `/login` se titula
"Bienvenido a Golfers+" y el link a `/register` está en la línea 214, después de
Google, email, password y "olvidé mi clave". El `next` se preserva bien por toda
la cadena — el problema es la jerarquía, no el cableado.

Además el copy de `login/page.tsx:135` para este caso dice *"Para anotar tu score
en el torneo, inicia sesión"*: el usuario viene a inscribirse, no a anotar.

### 3. El cupo no cruza a la UI porque no cruza a los datos
`joinFlow.ts:77` **no selecciona `max_players`**, y `JoinInfoTournament` no tiene
campo de cupo. `tournamentCapacity()` existe (`enrollPlayer.ts:93`) y **ninguna
ruta del jugador la llama**. El jugador ve un botón habilitado en un torneo
lleno, lo aprieta, y recibe un 409 cuyo mensaje está escrito para otra persona:
*"Amplía el cupo máximo del torneo para agregar más."* No puede hacer eso.

Es el único estado terminal sin tratamiento propio, y contradice el principio
que el archivo declara en `unirse/page.tsx:361` ("estado honesto en vez de un
botón que falla").

### 4. Deja inscribirse sin índice
`unirse/page.tsx:299`: si `profile.indice == null` muestra "Sin índice
registrado" y el botón sigue activo. Ese jugador entra sin handicap → el neto
del torneo queda corrupto. Y es el caso **garantizado** del usuario que acaba de
registrarse desde la invitación. Ahí debería ir el CTA de vincular FedeGolf.

### 5. No es un formulario — es un botón
No pide tee (contra `feedback_tee_por_jugador`), ni categoría, ni confirmación
de índice. Y no hay forma de retirarse una vez inscrito.

### 6. Deuda estructural de la pantalla
- 418 LOC con `style={{}}` inline; `#c4992a` hardcodeado 6 veces, más `#f87171`
  y `#22c55e`. Sin tokens → el modo color sistémico no aplica acá.
- `formatLabel()` redefinido local (`:21`) existiendo el canónico en `rules.ts`,
  y sólo cubre 5 formatos: **falta `foursome`**, que cae al `|| format` y
  muestra el string crudo.
- `TournamentInvitationCard` copia un link pelado en vez de usar
  `buildOrganizerShare()` (`src/golf/share/payload.ts:78`), que está escrito,
  **testeado con una URL `/torneo/x/unirse`**, y desconectado — sólo lo consume
  `ShareMenu` de ronda libre. Tres fuentes para un concepto.
- Copy sin tildes en la tarjeta del organizador: "invitacion", "Codigo".

### 7. `PUBLIC_STATUSES` duplicado
La lista `['open','in_progress','closed','published']` está literal en
`join-info/route.ts:34` y en `joinFlow.ts:20`. Si cambia una y no la otra, el
usuario anónimo y el autenticado ven torneos distintos.

---

## Nota sobre torneos `draft` y el preview

`generateMetadata` usa el cliente RLS-bound, así que un torneo `draft` (14 de 21
en prod al 20-jul) sigue cayendo al metadata genérico. **Es correcto y no se va
a cambiar:** que un borrador no exponga cancha, fecha y jugadores a cualquiera
con el link es RLS funcionando. El organizador comparte cuando abre
inscripciones, y `open` sí es público.
