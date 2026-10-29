# Sistema RRSS — "equipo de redes" automatizado para el Instagram de Golfers+

Fecha: 26-oct-2026 · Pedido: Juanjo (PM) · Estado: en construcción (F0, F1a y F1b implementadas)

> **Desvíos de este diseño, decididos al implementar (27-oct).** Lo de abajo sigue describiendo el
> sistema; estas tres cosas se hicieron distinto y lo que vale es esto:
>
> 1. **El estado son archivos versionados en el repo, no tablas `rrss_*`.** Las tandas viven en
>    `scripts/rrss/tandas/<AAAA-WNN>.json` y las referencias en `scripts/rrss/referencias/<id>.json`.
>    Razón: el principio de este mismo diseño es "aislado de la app de producción", y una tabla en
>    el proyecto de Supabase que corre los torneos lo contradice —una migración más, una ruta API
>    dentro del deploy que corre torneos, un secreto más en Vercel. De paso sale gratis la historia
>    de cada decisión (git) y el sistema completo se puede probar sin credenciales. Cuando el nivel
>    2 necesite series de métricas, la tabla se agrega **ahí**, que es donde una tabla sí paga.
> 2. **Sin webhook y sin ruta API.** Las decisiones de Telegram se leen con `getUpdates` cuando el
>    sistema corre. Telegram guarda las actualizaciones 24 h, de sobra para un ritmo semanal, y así
>    no hay ninguna ruta de RRSS dentro del deploy de la app.
> 3. **La publicación va por navegador, no por la API de Meta** (es la decisión del plan v2):
>    `scripts/rrss/publicar.mjs` empaqueta la tanda aprobada en `out/rrss/tandas/<tanda>/` y se sube
>    pieza a pieza, preguntando antes de cada publicación. Cuando exista la app de Meta, el
>    publicador por API reemplaza solo ese último paso.

## Objetivo

Que el Instagram de Golfers+ publique contenido de nivel profesional con constancia, y que la única
intervención de Juanjo sea **aprobar al final**. Metas, en orden:

1. **Registros en la app** (golfistas).
2. **Torneos y clubes** que organicen sus eventos en Golfers+ (organizadores).

Alcance, seguidores e interacción son medios. El éxito se mide en registros y en contactos de
organizadores atribuidos a Instagram.

## Decisiones tomadas (26-oct)

| Tema | Decisión |
|---|---|
| Ritmo | **Pieza central + derivados**: 1 reel central por semana → 1 carrusel + 3-4 stories derivados |
| Disparador | Comando `/rrss` en Claude Code. Todo corre solo y termina en una aprobación de Juanjo |
| Material de video | Grabaciones de la app con look comercial + archivo con licencia libre + IA solo para tomas imposibles |
| Nivel de video | Voz en off IA en español chileno + subtítulos animados; formatos fijos de golf; explicadores de estrategia animados de primer nivel (estilo el reel de @swingdecoded sobre lectura de putts) |
| Referencias | Juanjo manda links que le parecen benchmark; se replican como **idea**, nunca como copia |

## Límites externos verificados (Meta, oct-2026)

- Publicar en la cuenta propia: API oficial con **Standard Access**, sin App Review. Requiere cuenta
  profesional (Business o Creator). Formatos: foto, carrusel (hasta 20), reel, story.
  https://developers.facebook.com/docs/instagram-platform/content-publishing/
- **No hay borradores ni programación por API.** La cola, la aprobación y la hora de publicación viven
  en nuestro sistema. El contenido preparado vence a las 24 h si no se publica.
- **Nada de login automatizado con usuario y clave**: va contra los Términos de Instagram y arriesga la cuenta.
- Token de larga duración: 60 días, renovable por cron.
- Música en tendencia (Audio API) exige Facebook Login + una página de Facebook vinculada. Sin ella,
  audio propio (voz en off + música con licencia libre).
- Métricas por publicación disponibles (views, reach, saved, shares, tiempo de visualización de reels).
  La Business Discovery API permite ver métricas públicas de cuentas de competidores.

## Arquitectura

Principio: **aislado de la app de producción**. Ningún fallo del sistema RRSS puede tocar un torneo.
Bot de Telegram propio, scripts propios y —desvío 1— el estado en archivos versionados en vez de
tablas `rrss_*`. **Cero rutas API dentro del deploy de la app** (desvío 2: el webhook no existe, y
el publicador por API tampoco mientras se suba por navegador). El sistema no comparte nada con el
scorer: ni tabla, ni ruta, ni secreto.

### Nivel 1 — Bandeja de referencias
- Juanjo reenvía un link (IG, TikTok, YouTube) al **bot RRSS** (bot nuevo, separado del inbox de bugs).
- Script: descarga (yt-dlp) → análisis con Gemini (qué formato es, gancho de los primeros 3 s, ritmo,
  por qué funciona, cómo adaptarlo a Golfers+, y **qué NO copiar**) → ficha en
  `scripts/rrss/referencias/<id>.json`.
- Costo: una llamada barata a Gemini por referencia. Cero tokens de Claude.

### Nivel 2 — Inteligencia (semanal y mensual)
- **Semanal, sin IA:** cron que junta métricas de nuestras publicaciones (48 h y 7 días), métricas
  públicas de 3-4 cuentas benchmark y hashtags de golf → `rrss_metricas`. Calcula un **resumen
  compacto** (qué formato, tema y hora rindió mejor) que es lo único que lee `/rrss`.
- **Mensual, con IA:** reescribe `estrategia-viva.md` (pilares, formatos ganadores, horarios, qué
  dejar de hacer) a partir del resumen y las referencias. Juanjo ve el cambio en el mismo flujo de aprobación.
- **Umbral de muestra (no ajustar a ruido):** 8 publicaciones del mismo formato con datos de 7 días
  y la diferencia sostenida en todas. Nunca se cambia la estrategia por uno o dos videos. El umbral
  **vive escrito en `docs/rrss/estrategia-viva.md`**, que es el archivo que `/rrss` lee cada semana:
  acá queda la decisión, allá el número que manda.

### Nivel 3 — Creación (`/rrss`)
1. Lee: guía de marca + estrategia viva + resumen de métricas + referencias nuevas. Todo compacto y
   precalculado.
2. **Opus** propone la idea central de la semana y escribe el guion del reel, el carrusel derivado
   y las stories.
3. **Render sin IA** con plantillas de marca:
   - Reel: Remotion. Grabaciones de la app (Playwright con cuentas demo y datos demo), teléfono en
     primer plano, zooms, subtítulos animados y gráficos de estrategia animados.
   - Voz: edge-tts en español de Chile (`es-CL-CatalinaNeural` / `es-CL-LorenzoNeural`), gratis.
     **Los tiempos de cada palabra que devuelve el TTS son la columna vertebral del reel:**
     subtítulos, zooms y gráficos aparecen justo cuando la voz los nombra, sin editar a mano.
   - Efectos de sonido sintetizados por código (sin archivos externos ni licencias).
   - Render del MP4 en GitHub Actions (Linux), no en el PC: en esta máquina Windows Application
     Control bloquea ejecutables sin firma y ffmpeg puede caer ahí. Alternativa: WebCodecs en Chrome.
   - Carrusel: plantillas HTML → PNG. Stories: derivadas del mismo material.
4. **Controles fijos sin IA** antes de la revisión: ninguna lámina quieta dura más de 6 s en un
   reel; el gancho aparece en el segundo 0; la portada lleva un número; cada palabra clave del
   guion está en la voz; medidas y zonas seguras correctas.
5. **Hoja de contactos:** un fotograma por escena en una sola imagen. La revisión mira esa hoja (y
   las láminas), no el video completo: más barata y detecta lo mismo.
6. **Revisión** de la tanda completa, una sola vez, con el checklist de marca, golf correcto contra
   reglas reales, sin datos de usuarios reales, sin promesas falsas y copy corto con punch.
7. Arma la tanda en `scripts/rrss/tandas/<AAAA-WNN>.json` con la hora sugerida de cada pieza.

### Nivel 4 — Aprobación y publicación
- El bot RRSS manda la tanda con vista previa (video y láminas) y botones **Aprobar todo / Pedir
  cambios / Rechazar**. "Pedir cambios" acepta una frase y regenera solo lo pedido.
- Al aprobar: el publicador (pg_cron → ruta API) publica cada pieza a su hora con la API oficial y
  registra el id de Instagram para medirla después.
- **Lo que nunca se automatiza:** seguir o dejar de seguir, likes, comentarios en cuentas ajenas
  y mensajes. Son las acciones repetidas que Instagram castiga con restricciones, y más en una
  cuenta chica. Solo se publica lo nuestro con la API oficial, unas 6 piezas por semana, muy lejos
  del tope de la API.
- **Publicación manual opcional:** si un reel necesita audio en tendencia (que la API no siempre
  permite), el bot manda video, portada y texto listos y Juanjo lo sube desde el teléfono.

### Atribución
- Link en bio y en stories con UTM (`utm_source=instagram&utm_campaign=<pieza>`), contado en el
  registro de usuarios. Para organizadores, una landing de torneos con su propio UTM.

## Formatos fijos

| Formato | Público | Fuente de verdad |
|---|---|---|
| El dato que te baja el hándicap | Golfistas | Shot Scope verificado (`external_priors_amateur_benchmarks`) |
| Regla que casi nadie conoce | Golfistas | Reglas de Golf R&A/USGA (PDF oficial) |
| Estrategia en cancha (explicador animado) | Golfistas | Referencias + guion revisado contra fuentes |
| Así se vive un torneo en Golfers+ | Organizadores | Grabación de la app con torneo demo |
| Torneo de la semana | Organizadores | Torneos reales, **solo con permiso** del organizador y sin datos personales |

## Consumo de tokens

- Lo caro es "ponerse al día", no la cantidad de piezas. Por eso hay **un solo** `/rrss` por semana y
  todo el contexto llega precalculado.
- Opus: idea y guiones (1 vez por semana). Revisión: 1 vez por tanda. Hashtags, tamaños y textos
  de stories: modelo barato. Render, subida, publicación y métricas: scripts, cero tokens.
- Gemini: análisis de referencias (centavos).

## Lo que solo puede hacer Juanjo (una vez, ~30 min)

1. Pasar la cuenta de Instagram a **profesional** (Business).
2. Crear la app en developers.facebook.com con su usuario y autorizarla con los permisos de publicar y de métricas.
3. Crear el bot RRSS en Telegram con @BotFather y pasar el token (Claude lo guarda como secreto).
4. Opcional: crear una página de Facebook y vincularla, si se quiere música en tendencia.
5. Aprobar la guía de marca (documento corto que Claude propone).

## Fases

| Fase | Entrega | Criterio para seguir |
|---|---|---|
| F0 | Guía de marca + setup de Meta y bot | Juanjo aprueba la guía; token de publicación funciona |
| F1 | Bandeja de referencias + carrusel con aprobación y publicación | Primer carrusel publicado tras un solo "Aprobar" |
| F2 | Reel central con plantilla (app con look comercial + voz + subtítulos) + derivados | Juanjo considera el reel "nivel pro" sin retoques manuales |
| F3 | Métricas semanales + estrategia viva mensual + atribución UTM | Resumen semanal llega solo |
| F4 | Explicadores de estrategia animados de primer nivel | Sobre la base de las referencias que mande Juanjo |

**Evaluación a las 6 semanas de F2:** registros y contactos de organizadores atribuidos a Instagram,
contra el tiempo de aprobación de Juanjo. Si no se mueven, se ajusta la estrategia o se pausa.

## Riesgos

- **Calidad del video automático**: es el mayor riesgo; por eso F2 tiene criterio de "nivel pro" antes de seguir.
- **Token de Meta vencido**: cron de renovación + alerta por el bot.
- **Política de Meta cambia**: solo API oficial; nada que dependa de scraping.
- **Derechos**: música y clips solo con licencia; las referencias se usan como idea.
- **Privacidad**: piezas solo con cuentas y datos demo, o con permiso explícito.
