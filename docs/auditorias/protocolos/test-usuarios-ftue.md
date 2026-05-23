# Protocolo de Test con Usuarios Reales — FTUE Torneo de Equipos

**Producto:** Golfers+ (golfersplus.vercel.app)
**Flujo bajo test:** Invitación → cuenta → torneo de equipos creado y listo para invitar jugadores
**Modalidad:** Think-aloud presencial, 3 a 5 participantes
**Duración por sesión:** 40 a 45 minutos
**Responsable de campo:** Juan José Lamarca (PM)
**Versión del protocolo:** 1.0 — 22 de mayo de 2026

> Imprimir este documento (orientación vertical, doble cara). Llevarlo al club junto con un lápiz, dos copias del consentimiento por participante y un cronómetro físico o el del celular.

---

## 0. Resumen ejecutivo para Juanjo

| Item | Detalle |
| --- | --- |
| Objetivo | Detectar fricciones del flujo FTUE para organizadores de torneo de equipos |
| Participantes | 3 a 5 golfistas chilenos, perfil organizador o invitado frecuente |
| Tarea principal | Crear un torneo de equipos de 8 personas para el sábado siguiente |
| Métricas | Time-on-task, errores críticos, help points, SUS, SEQ |
| Tiempo por sesión | 40–45 minutos máximo |
| Entregable | 1 reporte por sesión + 1 reporte síntesis (affinity mapping) |
| Saturación esperada | Después de 4 sesiones si los 3 primeros hallazgos clave se repiten |

Checklist el día del test (imprimir y tachar):

- [ ] Cargar este protocolo impreso
- [ ] Llevar 2 copias firmadas de consentimiento por participante
- [ ] Cargar app de grabación en mi celular (OBS o Loom en notebook + ManyCam o equivalente; ver §8)
- [ ] Probar el link de invitación 5 minutos antes (debe abrir limpio)
- [ ] Tener celular cargado al 80% mínimo
- [ ] Llevar agua, lápiz negro, post-its en blanco
- [ ] Tener WiFi del club confirmada o hotspot mío de respaldo

---

## 1. Briefing pre-sesión (script literal)

> **Importante:** Leer pausado, en voz natural. No improvisar las partes en cursiva, son las que protegen legalmente y reducen la ansiedad del participante.

### 1.1 Bienvenida (1 minuto)

> "Hola [Nombre], muchas gracias por dedicarme estos 45 minutos. Te invité porque estamos construyendo una app para organizar torneos de golf en clubes chilenos y necesito gente que juega de verdad, como vos, para ver qué funciona y qué no."

### 1.2 Aclaración clave (30 segundos, repetir mirando a los ojos)

> *"Quiero que tengas algo muy claro antes de empezar: hoy no te estoy evaluando a vos. Estoy evaluando la app. Si te trabás, no es porque vos hagas algo mal, es porque la app no fue lo suficientemente clara. Cada vez que algo te confunda, eso es información de oro para mí. Mientras más cosas raras encuentres, mejor para nosotros."*

### 1.3 Consentimiento (1 minuto)

> "Para poder usar lo que vea hoy necesito tu permiso. Te leo rápido:"

**Texto literal del consentimiento (también impreso para firma):**

> Acepto participar en una sesión de prueba de usabilidad de la app Golfers+. Entiendo que:
>
> 1. La sesión va a ser grabada en audio y video de la pantalla del celular. La grabación se usa solo para análisis interno del equipo de producto.
> 2. Mi nombre y datos personales se mantienen anónimos en el reporte. Si se cita algo que dije, se identifica con un código tipo "P1, P2, P3".
> 3. Puedo detener la sesión en cualquier momento sin dar explicación.
> 4. No recibo compensación monetaria. [Si aplica incentivo: "Recibo [X] como agradecimiento simbólico, no como pago por mi opinión."]
> 5. La grabación se borra 90 días después de terminado el proyecto de auditoría.
>
> Nombre: __________________________ Firma: __________________________
> Fecha: _____ / _____ / 2026

> "¿Lo firmamos? Si preferís consentimiento verbal grabado, también vale, lo decís a cámara antes de empezar."

### 1.4 Setup técnico (2 minutos)

> "Vamos a usar **tu propio celular**, no el mío. La razón es que conoces tu teclado, tu velocidad, tu manera de moverte. Si yo te paso el mío todo se siente raro y los resultados no sirven."
>
> "Conectate al WiFi del club, así no gastas datos. La red es [SSID], la clave [pass o pegada en sticker]."
>
> "Voy a grabar la pantalla de tu celular con [Loom / Reflector / scrcpy / cámara externa apuntando]. ¿Te parece bien?"

### 1.5 Mecánica think-aloud (1 minuto)

> "El truco de esta prueba se llama 'pensar en voz alta'. Mientras usas la app, contame qué estás pensando, qué estás buscando, qué te llama la atención, qué te molesta. No tienes que explicarme nada técnico, solo decir lo que se te pasa por la cabeza. Por ejemplo: 'estoy buscando un botón para crear torneo, no lo veo, voy a probar acá'."
>
> "Si te quedas en silencio más de 15 segundos te voy a preguntar 'qué estás pensando', no para apurarte, sino para entenderte."
>
> "Yo no te voy a ayudar a menos que te trabes completamente. Si me preguntas 'dónde está X', te voy a devolver la pregunta: '¿dónde crees que debería estar?'. No es para hacerte sentir mal, es para entender qué esperabas."

### 1.6 Confirmación final antes de empezar

> "¿Alguna duda antes de partir? ¿Listo? Empezamos cuando vos digas."

---

## 2. Tarea principal

> **Decir al participante en una sola frase, después de un trago de agua:**
>
> "Tu desafío: **organizar un torneo de equipos de 8 personas para el próximo sábado en tu club, usando esta app.** Yo solo te miro y tomo notas. Si te trabás, contame qué estás pensando."

Después mandar el link por WhatsApp **en ese momento, en vivo** (no antes), para replicar exactamente cómo va a llegar a un golfista real:

```
Link a enviar: https://golfersplus.vercel.app/invitacion/[token-de-test]
Mensaje WhatsApp sugerido: "Te paso esto para probar lo que te conté de los torneos. Abrilo y armá uno como si fuera de verdad."
```

**No** dar contexto extra. **No** decir "tenés que registrarte", "buscá el botón rojo", etc.

Arrancar el cronómetro cuando el participante hace tap al link.

---

## 3. Sub-tareas observables (checklist por sesión)

Para cada sub-tarea marcar con UN solo símbolo en la columna **Resultado**:

- ✅ **logrado solo** (sin ayuda, sin trabarse más de 15 segundos)
- 🟡 **logrado con ayuda** (Juanjo intervino con pista verbal o el participante preguntó y se le respondió)
- ❌ **abandonó / no logró** (se rindió o tomó camino equivocado sin darse cuenta)

| # | Sub-tarea | Resultado | Tiempo (mm:ss) | Cita verbatim relevante |
| --- | --- | --- | --- | --- |
| 1 | Recibir link y abrir la app | | | |
| 2 | Crear cuenta (email/Google/teléfono) | | | |
| 3 | Completar perfil mínimo (nombre, club, handicap) | | | |
| 4 | Encontrar la sección "organizar torneo" | | | |
| 5 | Configurar fecha del torneo | | | |
| 6 | Configurar lugar / cancha | | | |
| 7 | Configurar modalidad | | | |
| 8 | **Seleccionar modalidad de EQUIPOS (no individual)** | | | |
| 9 | Definir cantidad de equipos (2 equipos de 4, o lo que decida) | | | |
| 10 | Definir tamaño de cada equipo | | | |
| 11 | Llegar a la pantalla de invitar jugadores | | | |
| 12 | Confirmar que el torneo quedó creado y listo para compartir | | | |

**Notas del observador (escribir libre, frases cortas):**

```
_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________
```

---

## 4. Métricas cuantitativas

### 4.1 Time-on-task

| Métrica | Valor |
| --- | --- |
| Tiempo total (link → torneo creado) | mm:ss |
| Tiempo en sub-tarea más lenta | sub-tarea # ____ — mm:ss |
| Si abandonó: en qué sub-tarea | # ____ |

### 4.2 Errores críticos (anotar cada uno con timestamp)

> Un **error crítico** es: (a) tener que volver atrás más de una pantalla, (b) elegir mal una opción y no darse cuenta (ej. eligió "individual" creyendo que era equipos), (c) abandonar la tarea.

| # | Timestamp | Sub-tarea | Qué pasó (1 línea) | Severidad 1-4 |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |

**Escala de severidad** (ver también §9.2):

1. Cosmético — no afecta tarea
2. Menor — confusión leve, se resuelve solo en menos de 10s
3. Mayor — lo hizo dudar más de 15s o necesitar pista
4. Bloqueante — abandona o lleva al usuario por mal camino sin que se de cuenta

### 4.3 Help points

> Cada vez que el participante: (a) preguntó "¿dónde está X?", (b) se quedó más de 15 segundos sin saber qué hacer, (c) Juanjo tuvo que intervenir con una pista verbal.

| # | Timestamp | Sub-tarea | Qué preguntó / dónde se trabó |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |

**Total de help points en la sesión: _____**

### 4.4 SEQ — Single Ease Question (post cada sub-tarea principal)

> Preguntar **solo después de las sub-tareas 4, 8 y 12** (las tres más críticas), para no romper el flujo. Escala 1 (muy difícil) a 7 (muy fácil).

**Pregunta literal:**

> "En una escala del 1 al 7, donde 1 es 'muy difícil' y 7 es 'muy fácil', ¿qué tan fácil te resultó [lo que acabás de hacer, ej: encontrar dónde se organiza un torneo]?"

| Sub-tarea | SEQ (1-7) | Comentario opcional del participante |
| --- | --- | --- |
| #4 Encontrar "organizar torneo" | | |
| #8 Seleccionar modalidad EQUIPOS | | |
| #12 Confirmar torneo creado | | |

### 4.5 SUS — System Usability Scale (al final de la sesión completa)

> Leer cada pregunta al participante y registrar respuesta del 1 al 5.
> Escala: **1 = Totalmente en desacuerdo, 2 = En desacuerdo, 3 = Ni acuerdo ni desacuerdo, 4 = De acuerdo, 5 = Totalmente de acuerdo.**
>
> Es importante leer las preguntas tal cual están — la validez del SUS depende de no modificarlas. Las que siguen son la versión en español neutro estándar adaptada al chileno suave.

| # | Pregunta | Respuesta (1-5) |
| --- | --- | --- |
| 1 | Creo que usaría esta app frecuentemente. | |
| 2 | Encontré la app innecesariamente compleja. | |
| 3 | Pensé que la app era fácil de usar. | |
| 4 | Creo que necesitaría ayuda de alguien con experiencia técnica para poder usar esta app. | |
| 5 | Encontré que las distintas funciones de la app estaban bien integradas entre sí. | |
| 6 | Pensé que había demasiada inconsistencia en la app. | |
| 7 | Imagino que la mayoría de la gente aprendería a usar esta app rápidamente. | |
| 8 | Encontré la app muy engorrosa de usar. | |
| 9 | Me sentí seguro usando la app. | |
| 10 | Necesité aprender muchas cosas antes de poder empezar a usar la app. | |

**Cálculo del puntaje SUS (hacer después, fuera de la sesión):**

- Preguntas impares (1, 3, 5, 7, 9): restar 1 al valor que dio el participante.
- Preguntas pares (2, 4, 6, 8, 10): restar el valor que dio al 5.
- Sumar los 10 valores resultantes.
- Multiplicar por 2.5.
- Resultado: 0 a 100.

**Benchmark de referencia:**

- < 50 → app no usable, hay un problema serio
- 50–68 → debajo del promedio, hay trabajo pendiente
- 68 → promedio industria
- 80+ → excelente, recomendable
- 90+ → top 10% mundial

---

## 5. Preguntas post-sesión semi-estructuradas

> Una vez completados SUS y SEQ. Tono conversacional, dejar al participante hablar libre.
> Anotar palabras textuales cuando posible, no parafrasear.

1. **¿Qué fue lo más confuso de todo el proceso?**

   ```
   _________________________________________________________________
   _________________________________________________________________
   ```

2. **¿Hay algo que esperabas que estuviera y no encontraste?**

   ```
   _________________________________________________________________
   _________________________________________________________________
   ```

3. **¿Le mandarías esto a un amigo del club para que arme un torneo? ¿Por qué sí o por qué no?**

   ```
   _________________________________________________________________
   _________________________________________________________________
   ```

4. **Si pudieras cambiar UNA sola cosa de la app, ¿cuál sería?**

   ```
   _________________________________________________________________
   _________________________________________________________________
   ```

5. **Cuando organizas un torneo en tu club hoy, sin esta app, ¿cómo lo haces? ¿Por WhatsApp, planilla Excel, pizarra del club?** *(Permite mapear el status quo y contra qué compite la app.)*

   ```
   _________________________________________________________________
   _________________________________________________________________
   ```

6. **¿Hubo algún momento en que pensaste "esto está mejor de lo que esperaba"? ¿Cuál?** *(Captura aciertos, no solo problemas.)*

   ```
   _________________________________________________________________
   _________________________________________________________________
   ```

7. **¿Pagarías por usar esto? Si sí, ¿cuánto al año te parecería razonable? Si no, ¿qué tendría que tener para que pagues?** *(Sondea willingness-to-pay, importante para roadmap premium.)*

   ```
   _________________________________________________________________
   _________________________________________________________________
   ```

8. **¿Recomendarías a un amigo o socio del club que pruebe la app esta semana?** *(Proxy de NPS rápido — escala 0 a 10.)*

   ```
   Puntaje 0-10: ______   Por qué: ____________________________________
   ```

> Cerrar la sesión con:
>
> "Gracias en serio. Lo que me contaste hoy nos cambia el roadmap. Si más adelante avanzamos con algo grande, te aviso para mostrarte."

---

## 6. Template de reporte por sesión

> **Una página por participante.** Llenar el mismo día, en caliente, antes de pasar al siguiente.
> Guardar como `docs/auditorias/sesiones-usuarios/P[N]-[fecha].md`.

```markdown
# Sesión P[N] — [Fecha]

## Datos del participante
- Código: P__
- Edad aproximada: __
- Club: __________________________ (o "no socio")
- Handicap: __________
- Familiaridad con apps de golf previas: ☐ Ninguna  ☐ Probó alguna  ☐ Usa habitual
- Rol típico en torneos: ☐ Organizador  ☐ Invitado  ☐ Ambos
- Modelo de celular: __________________________
- Sistema operativo: ☐ iOS __  ☐ Android __

## Resultado tarea principal
- ☐ Completó solo
- ☐ Completó con ayuda
- ☐ Abandonó en sub-tarea # ____

## Métricas
- Tiempo total: __:__
- Errores críticos (cantidad): __
- Help points (cantidad): __
- SEQ #4 (encontrar organizar torneo): __ / 7
- SEQ #8 (seleccionar modalidad equipos): __ / 7
- SEQ #12 (confirmar torneo creado): __ / 7
- SUS total: __ / 100
- NPS pregunta 8: __ / 10

## Top 3 hallazgos (lo más importante)
1. ___________________________________________________________________
2. ___________________________________________________________________
3. ___________________________________________________________________

## Citas memorables (verbatim)
- "_____________________________________________________________________"
- "_____________________________________________________________________"
- "_____________________________________________________________________"

## Momento "aha" positivo (si hubo)
___________________________________________________________________

## Momento de mayor fricción
___________________________________________________________________

## Lo que cambiaría inmediatamente según este participante
___________________________________________________________________

## Notas libres del observador
___________________________________________________________________
___________________________________________________________________
```

---

## 7. Plan de reclutamiento

### 7.1 Perfiles ideales (target N = 3 a 5)

| # | Perfil | Por qué lo necesitamos | Cuántos |
| --- | --- | --- | --- |
| 1 | **Organizador habitual** — socio activo de un club, arma 2+ torneos privados al año (cumpleaños, despedidas, copas internas) | Es el comprador real. Su frustración con WhatsApp + Excel es el problema que resolvemos | 2 |
| 2 | **Invitado frecuente** — golfista que juega torneos pero nunca organizó | Detecta fricciones de la parte "invitar/aceptar" + es el usuario que el organizador va a sumar | 1-2 |
| 3 | **Golfista nuevo en el club / handicap alto** — menos de 2 años jugando, no técnico | Stress test del onboarding: si no entiende, no se publica | 1 |
| 4 | **Capitán / vocero comité torneos** (bonus si lo encontramos) | Power user con criterios exigentes. Si compra, compran 50 socios | 0-1 |

**No reclutar** (sesgos):

- Amigos personales muy cercanos de Juanjo (van a decir que está todo bien)
- Personas que ya probaron versiones beta de Golfers+ (ya conocen el flujo)
- Mayores de 70 años en esta primera ronda (aunque son target, requieren protocolo más largo y validar primero con segmento principal 40-65)

### 7.2 Dónde encontrarlos

**Clubes prioridad alta** (zona Santiago, donde Juanjo tiene acceso):

- Club de Golf Los Leones
- Club de Polo San Cristóbal
- Sport Francés
- Club de Golf Las Brisas de Chicureo
- Hacienda Chicureo
- La Dehesa (si hay contactos)

**Canales de reclutamiento:**

1. **Mensaje a contactos directos** del PM por WhatsApp 1-a-1 (no broadcast, se ve spammy)
2. **Grupos de WhatsApp de golf** (los que jueguen "cuadrangulares" o "interclubes" — preguntar permiso al admin antes de postear)
3. **Caddie master / starter** del club — pedir referidos de socios que organizan habitualmente
4. **Comité de torneos** del club — mail formal al presidente/secretario

### 7.3 Mensaje tipo para reclutamiento (WhatsApp 1-a-1)

> "Hola [Nombre], qué tal. Estoy desarrollando una app para organizar torneos de golf en clubes y necesito 45 minutos de tu tiempo para que la pruebes. Te muestro lo que tengo, vos la usás como si fueras a armar un torneo de equipos para el sábado, y yo tomo notas. Sirve un montón porque el target son golfistas como vos, no programadores.
>
> ¿Te tinca? Puedo ir yo al club, o donde te quede cómodo. Esta semana o la próxima. [Si decide ofrecer incentivo: "Te invito un café o algo del pro shop por la molestia."]"

### 7.4 Incentivo recomendado

**Recomendación del CTO:** **regalo simbólico de bajo costo + reciprocidad social, no transacción monetaria.**

| Opción | Costo aprox | Recomendación |
| --- | --- | --- |
| Nada, solo favor + café | $5.000 CLP por café | ⚠️ Riesgo: el participante puede sentirse subvalorado y dar respuestas complacientes |
| **Sleeve de 3 pelotas Pro V1** | $25.000 CLP por sleeve | ✅ **RECOMENDADO.** Universal en golf, todos las valoran, fácil de comprar, no se siente "pago" |
| Pro V1 dozen | $90.000 CLP | ❌ Demasiado caro para 3-5 personas, presupuesto $300-450k no se justifica en validación |
| Green fee del club | $35.000-80.000 CLP | ❌ Dependiente del club, fricción logística |
| Gift card pro shop | $20.000 CLP | 🟡 Alternativa válida si no consigues Pro V1 |

**Total presupuesto recomendado:** 5 sleeves Pro V1 × $25.000 = **$125.000 CLP** (~140 USD).

**Cómo entregarlo:** al final de la sesión, junto con un "muchas gracias en serio, esto vale oro para nosotros". No mencionarlo en el reclutamiento como anzuelo (puede sesgar respuestas).

---

## 8. Setup técnico

### 8.1 Grabación (3 escenarios, elegir uno)

**Escenario A — In-person, mismo lugar (RECOMENDADO):**

- Setup: notebook de Juanjo + celular del participante.
- Grabar pantalla del celular del participante con:
  - **iPhone:** Quicktime Player (Mac de Juanjo) por cable Lightning → grabación de pantalla del iPhone vía AirPlay o cable. Si Juanjo solo tiene PC Windows: instalar **LonelyScreen** (free) o **ApowerMirror** (free tier).
  - **Android:** **scrcpy** (free, open source, https://github.com/Genymobile/scrcpy) por USB. Instalar previo. Funciona perfecto en Windows.
- Audio: micrófono del notebook capta ambos (1 metro de distancia).
- Backup: grabar también con cámara externa o segundo celular apuntando a la pantalla del participante por si scrcpy falla.

**Escenario B — Remoto via Zoom:**

- Pedir al participante que comparta pantalla del celular vía Zoom mobile:
  - iPhone: Zoom app → Share → Screen.
  - Android: igual desde Zoom app.
- Grabar la sesión Zoom desde el lado de Juanjo (función nativa).
- ⚠️ Latencia y fricción: solo si el participante ya usa Zoom habitualmente.

**Escenario C — Loom (más simple si Juanjo está in-person):**

- Loom instalada en notebook de Juanjo + scrcpy/Quicktime para reflejar el celular del participante en el notebook.
- Loom graba todo lo que está en la pantalla del notebook + audio.
- Plan free de Loom es suficiente (limita a 5 min por video → necesitamos plan Starter $8/mes o cancelar después del proyecto).

**Recomendación final:** **Escenario A con scrcpy si participante usa Android, AirPlay/LonelyScreen si iPhone.** Setup 100% gratis, una sola dependencia técnica (scrcpy), funciona offline.

### 8.2 Respaldo de consentimiento

**Recomendación: verbal grabado + firma física en papel.**

- Imprimir el consentimiento (§1.3) por duplicado, una copia firmada se queda con el participante, otra con Juanjo.
- Al inicio de la grabación, pedir al participante que diga a cámara: "Yo [nombre] consiento a esta grabación".
- Guardar las firmas físicas escaneadas en carpeta `docs/auditorias/consentimientos/` (NO commitear al repo, contienen PII; guardar en Drive privado o disco local).

### 8.3 Hardware mínimo del PM

- Notebook con webcam, micrófono y al menos 30 GB libres (5 sesiones × ~2 GB de video).
- Cable USB-C o Lightning según iPhone/Android del participante.
- scrcpy preinstalado y probado con un Android cualquiera antes del día 1.
- Carpeta `audit-ftue-equipos-grabaciones/` lista en Drive privado para subir cada noche.

### 8.4 Checklist técnico pre-sesión (5 minutos antes)

- [ ] Notebook cargado al 100% (las sesiones consumen batería rápido grabando)
- [ ] scrcpy o LonelyScreen abierto y testeado con un dispositivo
- [ ] Loom / OBS / Quicktime listo para grabar con un botón
- [ ] Audio testeado (grabar 10 segundos, escuchar, confirmar que se entiende)
- [ ] WiFi conectada, ping al `golfersplus.vercel.app` exitoso
- [ ] Link de invitación de test generado y copiado al portapapeles
- [ ] Cronómetro listo (app del celular o reloj del notebook)

---

## 9. Análisis post-sesiones

### 9.1 Affinity mapping (después de las 3-5 sesiones)

**Herramienta recomendada:** **FigJam** (free hasta 3 archivos, suficiente) o **Miro** (free hasta 3 boards).

**Procedimiento:**

1. Después de cada sesión, escribir cada hallazgo en una sticky note virtual. Una sticky = un hallazgo. Codificar con `[P1]`, `[P2]`, etc. para tracking.
2. Al terminar la última sesión, abrir todas las stickies en un mismo board.
3. Agrupar por similaridad (no por sub-tarea, sino por **causa raíz**). Ejemplos de clusters esperables:
   - "Botón principal de organizar torneo invisible"
   - "Confusión modalidad equipos vs individual"
   - "Onboarding handicap mal explicado"
   - "Invitar jugadores no obvio"
4. Cada cluster recibe un título (frase corta, accionable: "Mover CTA principal arriba del fold").
5. Contar cuántos participantes mencionaron cada cluster. Reglas:
   - 3+ participantes lo mencionan → **insight confirmado**
   - 2 lo mencionan → **señal, validar en próxima ronda**
   - 1 lo menciona → **outlier**, registrar pero no priorizar

### 9.2 Severity rating

Para cada insight confirmado, asignar severidad usando la misma escala que en §4.2:

| Severidad | Definición | Acción |
| --- | --- | --- |
| 4 — Bloqueante | Impide completar la tarea principal. Usuario abandona o lleva a estado erróneo sin saberlo | Fix antes de cualquier feature nueva. P0. |
| 3 — Mayor | Causa demora >15s o intervención. No bloquea pero genera fricción grande | Fix en sprint siguiente. P1. |
| 2 — Menor | Confusión leve <10s, auto-resuelta | Backlog priorizado. P2. |
| 1 — Cosmético | No afecta task, solo polish | Backlog general. P3. |

**Output esperado:** tabla `docs/auditorias/insights-ftue-equipos.md` con todos los clusters ordenados por severidad descendente.

### 9.3 Decisión de saturación (cuándo parar)

**Regla de saturación:** Después de la sesión 4, revisar:

- ¿Los hallazgos de severidad 3-4 se están repitiendo entre participantes?
- ¿Aparecieron 2+ hallazgos nuevos en P4 que no estaban en P1-P3?

**Decisión:**

- Si los 3 hallazgos top se repiten en 3+ participantes y P4 no agregó nada nuevo significativo → **saturación alcanzada, parar.** Reportar y arreglar.
- Si P4 reveló 2+ hallazgos nuevos serios → **correr P5.** Si P5 sigue agregando hallazgos, hay un problema más profundo que necesita ronda nueva post-fix.

**Mínimo absoluto:** 3 sesiones. **Máximo recomendado para esta ronda:** 5 sesiones. Más allá rinde menos por dólar invertido (Nielsen lo demostró: con 5 usuarios encuentras ~85% de problemas de usabilidad).

### 9.4 Output final de la auditoría FTUE

Después del análisis, generar:

1. `docs/auditorias/insights-ftue-equipos.md` — tabla de clusters con severidad
2. `docs/auditorias/recomendaciones-ftue-equipos.md` — propuestas concretas de fix (CTO/Claude las prioriza)
3. Carpeta `docs/auditorias/sesiones-usuarios/` — los 3-5 reportes individuales
4. Slide o sección en `docs/SPRINT_LOG.md` resumiendo: SUS promedio, NPS promedio, top 3 issues bloqueantes, decisión de roadmap

---

## 10. Anexos

### 10.1 Glosario para el participante (si lo pregunta)

- **Think-aloud:** pensar en voz alta mientras usás la app.
- **Help point:** cada vez que pediste ayuda o te quedaste trabado.
- **SUS / SEQ:** dos cuestionarios cortos al final para medir qué tan fácil te resultó.

### 10.2 Qué NO hacer (errores comunes del moderador)

- ❌ Defender la app cuando el participante critica.
- ❌ Explicar cómo se hace algo "Ah, ese botón está acá abajo".
- ❌ Hacer preguntas cerradas ("¿no te pareció fácil?"). Siempre abiertas ("¿cómo te pareció?").
- ❌ Validar emocionalmente cada acción ("¡bien!", "perfecto"). Suena a profesor, sesga.
- ❌ Apurar al participante. El silencio es información.
- ❌ Mostrar enojo o frustración si la app falla. Es información de oro.

### 10.3 Si la app crashea o tiene un bug bloqueante durante la sesión

1. Mantener la calma. Decir: "Esto está bueno, justo el tipo de cosa que queremos detectar. ¿Qué intentabas hacer en ese momento?"
2. Tomar screenshot inmediato si es posible.
3. Anotar timestamp + lo que el participante intentaba.
4. Decidir: ¿hay forma de retomar la tarea desde otro ángulo? Si sí, intentarlo. Si no, dar por terminada la sesión de tarea y pasar a SUS + post-sesión.
5. Reportar ese bug en `/inbox` o issue de GitHub apenas termine la sesión, marcando severidad 4.

### 10.4 Versionado del protocolo

| Versión | Fecha | Cambios |
| --- | --- | --- |
| 1.0 | 2026-05-22 | Versión inicial para primera ronda FTUE equipos |

---

**Fin del protocolo.**

> *Recordatorio:* la mejor sesión es la que termina con el participante diciendo "qué interesante, capaz lo uso de verdad", y Juanjo con una lista de 5-7 cosas para arreglar. Si todo salió perfecto y no hay nada que arreglar, algo se hizo mal en el test, no en la app.
