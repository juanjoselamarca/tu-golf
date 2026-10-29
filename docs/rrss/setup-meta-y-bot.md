# Setup de Instagram, Meta y el bot RRSS — pasos de Juanjo

> Estado verificado el 27-oct-2026 mirando las cuentas, no de memoria.
> Diseño del sistema: `docs/superpowers/specs/2026-10-26-rrss-sistema-design.md`.
> Los nombres de los botones de Meta cambian seguido: si alguno no calza exacto, busca el más parecido.

## Dónde estamos

| Paso | Estado |
| --- | --- |
| 1. Instagram profesional | ✅ Listo. `@golfers.plus` ya es cuenta profesional, categoría "Deportes y ocio", con correo público y link a `golfersplus.vercel.app`. |
| 2. Cuenta de Facebook | ⛔ **Te toca a ti.** Ya NO bloquea el lanzamiento: se publica por navegador. |
| 3. App en Meta y token de publicación | ⏸ Depende del paso 2. |
| 4. Bot RRSS en Telegram | 🟡 Creado (`@golfersplus_rrss_bot`). Falta que pegues el token y le escribas `/start`. |

> **Actualizado el 27-oct:** nada de esto bloquea el lanzamiento. El plan v2 publica **por
> navegador con la extensión de Chrome, pieza a pieza y con tu aprobación**, no por la API de Meta
> (`docs/rrss/plan-lanzamiento.md`). La API sigue valiendo la pena para no subir a mano y para leer
> métricas, pero es una mejora, no un requisito. Y sin el bot de Telegram el sistema también corre:
> el portón de aprobación cae al canal `chat` y te presento la tanda en la sesión.

## 2. Cuenta de Facebook (5 min) — ya no es un bloqueo

Tu cuenta de Meta (`juanjoselamarca@gmail.com`) hoy tiene **un solo perfil**: el de Instagram. Sin perfil
de Facebook no hay forma de entrar a `developers.facebook.com` — lo verifiqué: la única puerta para crear
cuenta ahí es "Regístrate con Facebook", no existe vía solo-Instagram.

Yo no puedo crear cuentas (es una de las cosas que no hago, por diseño). Tú:

1. Entra a **facebook.com** → **Crear cuenta nueva**, con el mismo correo `juanjoselamarca@gmail.com`.
2. No hace falta publicar nada ni buscar amigos. El perfil solo existe para ser el dueño de la app.
3. Cuando esté, avísame y sigo con el paso 3 sin molestarte más (salvo un token que copiar).

## 3. App en Meta para publicar (15 min, desde el computador)

1. Entra a **developers.facebook.com** con tu usuario de Facebook → **Mis apps** → **Crear app**.
2. Caso de uso: **Administrar mensajes y contenido en Instagram** (Instagram API). Tipo: **Empresa**.
   Nombre: `Golfers+ RRSS`.
3. En la app: **Roles de la app** → **Roles** → **Agregar personas** → **Evaluador de Instagram** →
   escribe `golfers.plus`.
4. En Instagram: **Configuración** → **Apps y sitios web** → **Invitaciones de evaluador** → **Aceptar**.
5. De vuelta en la app de Meta: **Configuración de la API con inicio de sesión de Instagram** →
   **Generar token** junto a la cuenta → inicia sesión en Instagram y acepta los permisos:
   - `instagram_business_basic`
   - `instagram_business_content_publish`
   - `instagram_business_manage_insights`
6. Pega el token en `.env.local` como `RRSS_META_TOKEN=...` y avísame. No lo escribas en el chat:
   así no queda en ningún transcript. Yo lo subo a Vercel como secreto y lo renuevo cada 60 días.

No hace falta App Review: publicar en la cuenta propia funciona con el acceso estándar.

## 4. Bot RRSS en Telegram — falta el token

El bot ya está creado: **`@golfersplus_rrss_bot`**, nombre "Golfers+ RRSS". Es un bot distinto del de
reportes (`@Golfers_App_Bot`), para que nada de Instagram se mezcle con los bugs.

Te quedan dos cosas de 30 segundos:

1. En el chat de **@BotFather** está el token que te devolvió al crearlo (empieza con números y dos
   puntos). Pégalo en `.env.local` como `RRSS_TELEGRAM_BOT_TOKEN=...`. Si no lo encuentras, mándale
   `/token` a BotFather y elige el bot.
2. Abre **@golfersplus_rrss_bot** y escríbele `/start`, para que pueda mandarte las tandas a aprobar.

Igual que el de Meta: no lo escribas en el chat, solo en `.env.local`. Claude no puede leerlo ni
pegarlo —el clasificador de permisos bloquea las credenciales, y un token que pasa por el chat
queda escrito en el historial—, pero lo que sigue sí es automático:

```bash
node --env-file=.env.local scripts/rrss/conectar-telegram.mjs
```

Espera a que le escribas `/start`, guarda tu `chat_id` en `.env.local` como
`RRSS_TELEGRAM_CHAT_ID` —sin tocar ninguna otra línea del archivo— y te manda un mensaje de
prueba para que veas el canal andando. Hacerlo a mano con `getUpdates` en el navegador también
funciona, pero deja el token escrito en el historial del browser.

Solo ese chat puede aprobar: cualquier otro que le escriba al bot se ignora.

**Si no haces esto, el sistema igual funciona.** Sin las dos variables, el portón de aprobación usa
el canal `chat`: te presento la tanda completa en la sesión de Claude Code —la idea, cada pieza con
su hoja de contactos y el caption entero— y registro el veredicto que des. Lo que cambia con el bot
es que apruebas desde el teléfono con un botón, sin abrir el computador.

## 5. Opcional: página de Facebook

Solo si quieres usar música en tendencia en los reels. Una vez que exista el perfil de Facebook, crea una
página de Golfers+ y vincúlala en Instagram → **Centro de cuentas**. Sin esto, los reels van mudos
o con música con licencia, que es lo que estaba planificado igual: la voz sintética está
descartada (`estrategia-viva.md`) y voz humana todavía no hay.

## Qué hago yo con esto

- Guardo los dos tokens como secretos y pruebo que publicar y leer métricas funcione (con una
  publicación de prueba que te muestro antes).
- Dejo un aviso automático en el bot si el token de Meta está por vencer.
- Mientras la API siga bloqueada, las piezas se renderizan igual y la tanda aprobada queda
  empaquetada en `out/rrss/tandas/<tanda>/` con los archivos en orden de subida, el caption de cada
  una y un `SUBIR.md`. Subir es lo único manual, y va pieza a pieza preguntándote antes de cada
  publicación: publicar es irreversible y aprobar la tanda no es autorización para seguir
  publicando lo que venga después.
