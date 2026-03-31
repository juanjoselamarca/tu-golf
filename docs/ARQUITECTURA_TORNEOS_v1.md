# ARQUITECTURA TORNEOS + MODALIDADES DE JUEGO
## Golfers+ · Diseño CTO · v1.0 · 31 marzo 2026

---

## VISIÓN

Un torneo en Golfers+ es una colección de grupos jugando simultáneamente,
donde cada grupo funciona como una ronda autónoma que alimenta un
leaderboard centralizado en tiempo real.

El organizador tiene control total. Los jugadores marcan su score desde
el celular. Los espectadores ven el drama en vivo por WhatsApp.

---

## PRINCIPIO ARQUITECTÓNICO

**Un solo motor de scoring para todo.** No sistemas paralelos.

Hoy existen dos sistemas: `hole_scores` (torneos) y `ronda_libre_jugadores.scores` JSONB (rondas libres). Esto causa duplicación de lógica, bugs diferentes en cada flujo, y complejidad innecesaria.

**Decisión:** El motor de ronda libre (que funciona bien en campo) se convierte en la base universal. Los torneos son una capa de orquestación encima.

---

## FORMATOS DE JUEGO

### Individual (afecta stats del jugador)
| Formato | Scoring | Handicap en scorecard | Leaderboard |
|---------|---------|----------------------|-------------|
| Stroke Play Gross | Gross total | No se muestra | Menor gross gana |
| Stroke Play Neto | Gross - HCP total | HCP total en header | Menor neto gana |
| Stableford | Puntos por hoyo (neto) | Golpes recibidos por hoyo | Mayor puntos gana |
| Match Play | Holes ganados/perdidos | Diferencia de HCP distribuida por SI | Up/Down/AS |

### Equipo (NO afecta stats individuales)
| Formato | Scoring | Handicap | Leaderboard |
|---------|---------|----------|-------------|
| Best Ball (2 o 4) | Mejor score del equipo por hoyo | Individual por jugador | Mejor score equipo |
| Scramble (2 o 4) | Score único del equipo | % del HCP combinado (regla local) | Menor score equipo |
| Foursomes (alternate shot) | Score único de la pareja | HCP combinado / 2 | Menor score pareja |
| Chapman/Pinehurst | Variante de foursomes | HCP combinado × 0.6 menor + 0.4 mayor | Menor score pareja |

### Reglas de desempate (countback USGA)
1. Back 9 (hoyos 10-18): menor score
2. Back 6 (hoyos 13-18): menor score
3. Back 3 (hoyos 16-18): menor score
4. Hoyo 18: menor score
5. Si persiste: card-off hoyo a hoyo desde el 1

---

## PREMIOS ESTÁNDAR DE TORNEOS CHILENOS

La mayoría de torneos de club en Chile premian:
- 1° y 2° Gross (mejor score bruto)
- 1° y 2° Neto (mejor score con handicap)
- Best Gross del día (si hay muchas categorías)
- Premios por categoría (Cat A: HCP 0-12, Cat B: 12-24, Cat C: 24-36)
- Premios especiales: Longest drive, Closest to pin, Hole in one

Esto implica que **SIEMPRE se calculan tanto gross como neto**, sin importar el formato principal.

---

## FASE 1 — Arreglar lo que hay (Sprint inmediato)

### Objetivo: Que funcione impecable en campo para Prueba 2

#### 1.1 Fixes de UX críticos

**Espectador sin login:**
- Eliminar auth modal para vista de leaderboard
- Permitir lectura sin crear cuenta
- CTA de registro sutil después de 8s o scroll

**Share con contexto:**
- "Juan tiró 82 (+10) en Los Leones — Seguí en vivo" en vez de genérico
- Incluir score, cancha, y vs par en el texto compartido

**GWI explicado:**
- Tooltip en cada leaderboard: "GWI = tu probabilidad de ganar esta ronda"
- Link a /indices para más detalle

**Handicap visible según formato:**
- Stroke Play Gross: no mostrar HCP en scorecard
- Stroke Play Neto: mostrar HCP total en header de scorecard
- Stableford: mostrar golpes recibidos por hoyo junto al par

#### 1.2 Admin puede editar scores

En la vista de admin/organizador:
- Tap en cualquier score → editar inline
- Se guarda en score_audit_log con razón
- El jugador no puede editar lo que el admin cambió

#### 1.3 Scoring de torneo responsive

El grid de 9 columnas no funciona en mobile. Alternativas:
- Mobile: vista hoyo a hoyo (como ronda libre)
- Tablet: grid de 9 con scroll horizontal
- Desktop: grid completo

---

## FASE 2 — Torneo conectado a rondas (Sprint siguiente)

### Objetivo: Un torneo crea grupos que son rondas vinculadas

#### 2.1 Modelo de datos

```sql
-- Nuevo: tabla de grupos dentro de un torneo
CREATE TABLE tournament_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,              -- "Grupo 1", "Salida 8:00"
  tee_time TIMESTAMPTZ,           -- hora de salida
  ronda_libre_id UUID REFERENCES rondas_libres(id),  -- link a la ronda
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nuevo: jugador pertenece a un grupo
CREATE TABLE tournament_group_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES tournament_groups(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  jugador_ronda_id UUID REFERENCES ronda_libre_jugadores(id), -- link al jugador en la ronda
  UNIQUE(group_id, player_id)
);
```

#### 2.2 Flujo de creación de torneo

```
1. Organizador crea torneo (nombre, cancha, fecha, formato)
2. Organizador inscribe jugadores (pegar lista, código, manual)
3. Organizador arma grupos (auto por HCP o manual)
4. Al armar cada grupo → se crea una ronda_libre vinculada
5. Cada jugador del grupo aparece en esa ronda_libre
6. El link de scoring es el de la ronda_libre (no uno nuevo)
7. Los scores suben a la ronda_libre Y al leaderboard del torneo
```

#### 2.3 Leaderboard centralizado

El leaderboard del torneo agrega los scores de todas las rondas libres vinculadas:
- Query: tournament_groups → rondas_libres → ronda_libre_jugadores.scores
- Calcula gross, neto, stableford para cada jugador
- Ordena según formato del torneo
- Aplica desempate por countback si hay empate
- Se actualiza en tiempo real (polling 15s)

#### 2.4 Inscripción por código

```
Organizador genera código: "COPA2026"
Jugador abre golfersplus.vercel.app/torneo/unirse
Pega el código → ve el torneo → confirma inscripción
El organizador aprueba (o auto-aprueba)
```

#### 2.5 Vinculación a perfiles

Flag en tournament: `afecta_estadisticas: boolean`
- true (individual): al finalizar, scores → historical_rounds → CPI/índice
- false (equipos): scores se guardan pero no afectan stats individuales

---

## FASE 3 — Admin power tools + formatos avanzados

### Objetivo: Control total del organizador + todos los formatos

#### 3.1 Panel de admin en vivo

Vista dedicada `/organizador/[slug]/live`:
- Dashboard con TODOS los grupos
- Progreso: "Grupo A: hoyo 12 / Grupo B: hoyo 8"
- Tap en cualquier jugador → panel lateral:
  - Editar score de cualquier hoyo
  - Editar handicap
  - Mover a otro grupo
  - Marcar como retirado
  - Ver historial de cambios
- Alertas: "Grupo D lleva 20 min sin registrar"
- Log de cambios: "Admin cambió score de Juan H7: 6→5 (15:32)"

#### 3.2 Edición de variables del torneo en vivo

El admin puede cambiar en vivo:
- Nombres de jugadores (errores de tipeo)
- Handicap de cualquier jugador
- Hora de salida de un grupo
- Composición de grupos (mover jugador)
- Formato (si cambió a último minuto)
- Agregar jugador de emergencia

Cada cambio se logea con timestamp y razón.

#### 3.3 Formatos de equipo

**Best Ball:**
- Grupo de 2 o 4 jugadores = 1 equipo
- Cada uno juega su bola
- Se toma el MEJOR score del equipo por hoyo
- Handicap: individual (cada jugador recibe sus golpes)
- El score del equipo sube al leaderboard
- Los scores individuales NO afectan CPI/índice

**Scramble:**
- Todos tiran desde el mejor tiro del equipo
- Score único por equipo
- Handicap: % del combinado (configurable por admin)
  - 2 jugadores: 35% del menor + 15% del mayor
  - 4 jugadores: 25/20/15/10% (regla USGA)
- Un solo jugador marca el score del equipo

**Match Play:**
- 1 vs 1 o 2 vs 2
- Score por hoyo: ganado/perdido/empatado
- Diferencia de handicap entre jugadores
- Golpes distribuidos por stroke index
- El leaderboard muestra "3&2", "1UP", "AS"

#### 3.4 Inscripción masiva

**Pegar lista:**
```
Textarea: "Juan Pérez 12.4
Carlos López 18.2
María Silva 8.1"
→ App parsea: nombre + handicap
→ Preview: 3 jugadores detectados
→ Confirmar
```

**Repetir torneo anterior:**
- "Copiar jugadores de Copa Club Febrero 2026"
- Muestra lista, admin quita/agrega
- Handicaps se actualizan automáticamente desde perfiles

**Código de invitación:**
- Admin genera "COPA2026"
- Comparte por WhatsApp al grupo del club
- Cada jugador se inscribe solo
- Admin ve inscripciones y aprueba

#### 3.5 Hoja de salida

Vista imprimible/compartible:
```
COPA CLUB LOS LEONES 2026
Stroke Play Neto · 18 Hoyos · Tees Azules

08:00  Grupo 1: J. Pérez (12.4) · C. López (18.2) · M. Silva (8.1) · R. Torres (15.0)
08:10  Grupo 2: A. Díaz (10.5) · F. García (22.1) · P. Ruiz (14.3) · L. Mora (19.8)
08:20  Grupo 3: ...
```

Botón: "Compartir por WhatsApp" / "Copiar" / "Imprimir"

#### 3.6 Reglas de golf en BD

```sql
CREATE TABLE golf_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL,        -- 'format', 'handicap', 'tiebreak', 'scoring'
  rule_key TEXT NOT NULL UNIQUE, -- 'stableford_points', 'countback_order', etc.
  rule_data JSONB NOT NULL,      -- la regla completa
  description TEXT,
  source TEXT,                   -- 'USGA', 'R&A', 'WHS', 'local'
  version TEXT DEFAULT '2024',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ejemplos:
INSERT INTO golf_rules (category, rule_key, rule_data, source) VALUES
('scoring', 'stableford_points', '{"albatross":5,"eagle":4,"birdie":3,"par":2,"bogey":1,"double_plus":0}', 'USGA'),
('tiebreak', 'countback_order', '["back_9","back_6","back_3","hole_18","hole_by_hole"]', 'USGA'),
('handicap', 'course_handicap_formula', '{"formula":"index * slope / 113","round":"nearest_integer"}', 'WHS'),
('handicap', 'stroke_allocation', '{"method":"stroke_index","max_per_hole":2,"extra_start_from":1}', 'WHS'),
('format', 'scramble_handicap_2p', '{"lower":0.35,"higher":0.15}', 'USGA'),
('format', 'scramble_handicap_4p', '{"1st":0.25,"2nd":0.20,"3rd":0.15,"4th":0.10}', 'USGA'),
('format', 'foursomes_handicap', '{"formula":"(player_a + player_b) / 2","round":"nearest_0.5"}', 'WHS'),
('format', 'match_play_strokes', '{"method":"difference_distributed_by_SI"}', 'USGA');
```

---

## FASE 4 — Experiencia premium

### Objetivo: Lo que diferencia a Golfers+ de cualquier otra app

#### 4.1 Tarjetas de score compartibles

Después de cada ronda (libre o torneo):
- Tarjeta visual generada automáticamente
- Incluye: jugador, score, cancha, fecha, CPI, ranking
- Diseño premium (dark, gold, tipografía Playfair)
- Botón "Compartir en WhatsApp" con imagen adjunta
- Para torneos: tarjeta con ranking final y premios

#### 4.2 Resultados post-torneo con tAIger+

Al finalizar un torneo:
- tAIger+ analiza la ronda del jugador automáticamente
- "Tu CPI subió de 39 a 44 después de este torneo"
- "Detectamos que mejoraste 1.2 strokes en par 3 vs tu promedio"
- Push notification: "Tu análisis del torneo está listo"

#### 4.3 Premios automáticos

El sistema detecta y muestra:
- 1° y 2° Gross / Neto (por categoría si aplica)
- Best gross del día
- Longest drive (si se trackea)
- Closest to pin (si se trackea)
- Hoyo en uno (detectado automáticamente)
- Mejor vuelta back nine
- Mayor mejora vs handicap

#### 4.4 Historial de torneos del jugador

En el perfil del jugador:
- Lista de torneos jugados con resultado
- Evolución de handicap por torneo
- Mejor torneo, peor torneo, promedio
- Comparación con otros jugadores del mismo nivel

#### 4.5 Desempate automático por countback

Si dos jugadores empatan en el leaderboard:
1. Compara back 9 (hoyos 10-18)
2. Si persiste: back 6 (13-18)
3. Si persiste: back 3 (16-18)
4. Si persiste: hoyo 18
5. Si persiste: card-off hoyo por hoyo desde 1

El leaderboard muestra: "1° Juan Pérez -2 (countback)" automáticamente.

#### 4.6 Modo espectador premium

Para espectadores del torneo:
- Leaderboard en tiempo real sin login
- Notificaciones push: "Eagle en hoyo 7!"
- Seguir a un jugador específico
- Timeline de eventos del torneo
- Stats del torneo actualizadas en vivo
- Compartir momento: "Juan acaba de tomar el liderato"

---

## MIGRACIÓN: Cómo pasar del estado actual al nuevo

### Paso 1: NO romper nada
- Ronda libre sigue funcionando exactamente igual
- Torneos existentes siguen funcionando
- Solo se agrega funcionalidad nueva

### Paso 2: Crear tablas nuevas
- tournament_groups
- tournament_group_players
- golf_rules

### Paso 3: Conectar torneo → rondas libres
- Al crear grupo en torneo → crear ronda_libre vinculada
- Los jugadores del grupo aparecen en la ronda_libre
- El scoring usa el motor de ronda libre
- El leaderboard del torneo agrega todas las rondas

### Paso 4: Migrar datos existentes
- Torneos existentes: crear rondas_libres retroactivas
- hole_scores → ronda_libre_jugadores.scores (migration script)
- Mantener backward compatibility

---

## SCORECARD: Cómo se ve según formato

### Stroke Play Gross
```
HOYO  1   2   3   4   5   6   7   8   9  OUT
PAR   4   3   5   4   4   3   4   5   4   36
SI    7  15   3  11   1  17   5   9  13
JJL   5   3   6   4   5   3   4   6   5   41
      Bo  Par Bo  Par Bo  Par Par Bo  Bo   +5
```

### Stroke Play Neto (HCP 14)
```
HOYO  1   2   3   4   5   6   7   8   9  OUT
PAR   4   3   5   4   4   3   4   5   4   36
SI    7  15   3  11   1  17   5   9  13
*     *       *   *   *       *   *   *     ← golpes recibidos
JJL   5   3   6   4   5   3   4   6   5   41
NET   4   3   5   3   4   3   3   5   4   34
      Par Par Par Bir Par Par Bir Par Par  -2
```

### Stableford (HCP 14)
```
HOYO  1   2   3   4   5   6   7   8   9  OUT
PAR   4   3   5   4   4   3   4   5   4   36
SI    7  15   3  11   1  17   5   9  13
*     *       *   *   *       *   *   *     ← golpes recibidos
JJL   5   3   6   4   5   3   4   6   5   41
PTS   2   2   2   3   2   2   3   2   2   20
```

---

## TIPOS DE USUARIO Y SUS NECESIDADES

### Organizador (50-65 años, WhatsApp expert, no tech)
- Crear torneo en 2 minutos (wizard simple)
- Inscribir 20+ jugadores sin dolor (pegar lista, código)
- Ver leaderboard en vivo desde el celular
- Corregir errores sin llamar a nadie
- Compartir resultados por WhatsApp al terminar
- Imprimir hoja de salida

### Jugador (30-50 años, en la cancha, celular en mano)
- Marcar score en 3 segundos (tap tap tap)
- Ver su posición en el leaderboard
- Saber cuántos golpes recibe en cada hoyo (stableford)
- Ver su GWI subir y bajar
- Recibir celebración por birdie/eagle
- Compartir su tarjeta al terminar

### Admin de grupo (el que lleva la tarjeta del cuarto)
- Marcar score de 2-4 jugadores hoyo a hoyo
- Mismo flujo que ronda libre grupo
- Los scores suben al torneo automáticamente

### Espectador (recibe link de WhatsApp)
- Ver leaderboard sin crear cuenta
- Entender quién va ganando
- Recibir notificaciones de momentos clave
- Compartir a otros amigos

---

*v1.0 — 31 marzo 2026*
*Diseño: Claude (CTO) · Revisión pendiente: Juanjo (PM)*
