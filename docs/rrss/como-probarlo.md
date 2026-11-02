# Cómo probar el sistema de RRSS — guía de Juanjo

> Para el día que quieras darle una vuelta tú, sin Claude al lado. Todo corre local y **nada sale a
> Instagram sin que tú apruebes y sin que alguien suba el archivo a mano**: no hay publicación
> automática, ni siquiera cuando exista el token de Meta.

## Lo que ya está listo para mirar

| Qué | Dónde |
| --- | --- |
| El reel de lanzamiento (13,9 s, 1080×1920) | `out/rrss/anota-todos-ven/anota-todos-ven.mp4` |
| La lámina de cierre y su hoja de contactos | `out/rrss/2026-10-27-anota-todos-ven/` |
| La tanda de la semana, esperando tu veredicto | `scripts/rrss/tandas/2026-W44.json` |

## 1. Ver qué hay pendiente

```bash
node --env-file=.env.local scripts/rrss/aprobacion.mjs
```

Te dice el canal (`telegram` si pegaste el token del bot, `chat` si no) y qué tanda está esperando.
Es solo de lectura: no cambia nada.

## 2. Ver la tanda completa antes de decidir

Pídele a Claude "muéstrame la tanda 2026-W44" y te presenta la idea, el reel, el caption entero y la
hora sugerida. Si prefieres mirarlo tú: el MP4 y la hoja de contactos están en las rutas de la tabla
de arriba, y el caption está en `scripts/rrss/piezas/2026-10-27-anota-todos-ven.json`.

## 3. Dar el veredicto

Tres opciones, igual que los tres botones del bot:

```bash
node scripts/rrss/aprobacion.mjs --veredicto 2026-W44 aprobar
node scripts/rrss/aprobacion.mjs --veredicto 2026-W44 cambios "el titular del cierre se lee chico"
node scripts/rrss/aprobacion.mjs --veredicto 2026-W44 rechazar "esta semana no"
```

Con **cambios** la tanda vuelve a borrador con tu nota y hay que rearmarla; con **rechazar** queda
cerrada y la semana siguiente parte de cero.

## 4. Empaquetar para subir (solo con la tanda aprobada)

```bash
node scripts/rrss/publicar.mjs 2026-W44
```

Deja `out/rrss/tandas/2026-W44/` con los archivos numerados en orden de subida, el caption listo para
pegar y un `SUBIR.md` que encabeza con quién aprobó. Cada pieza dice **dónde** se sube —reel,
historia o carrusel del feed—, no la medida del lienzo: el reel del lanzamiento mide 1080×1920 igual
que una historia, y subirlo como historia lo borra en 24 h.

**Si se queja de una huella que no calza, hazle caso.** Quiere decir que algo cambió después de que
lo aprobaste —el caption, una lámina o la escena del reel— y lo que saldría publicado no es lo que
viste. Se corrige y se vuelve a aprobar; no hay forma de saltárselo, a propósito.

## 5. Cerrar la tanda con los links

Después de subir, para poder medirla:

```bash
node scripts/rrss/publicar.mjs --publicada 2026-W44 https://www.instagram.com/reel/XXXX/
```

## Si quieres aprobar desde el teléfono

Faltan 30 segundos tuyos: pegar el token de `@golfersplus_rrss_bot` en `.env.local` como
`RRSS_TELEGRAM_BOT_TOKEN` (Claude no puede: el clasificador bloquea que lea una credencial).
Lo demás lo hace un comando:

```bash
node --env-file=.env.local scripts/rrss/conectar-telegram.mjs
```

Espera a que le escribas `/start` al bot, guarda el `chat_id` solo y te manda un mensaje de
prueba. Detalle en `docs/rrss/pendientes-de-juanjo.md`. Sin esto el sistema funciona igual,
solo que la aprobación pasa por la sesión de Claude en vez del teléfono.

## Qué NO va a pasar nunca

- Publicar sin tu aprobación. El portón está en el código, no en una convención.
- Publicar una pieza distinta de la que aprobaste: la tanda guarda la huella del texto, de las
  láminas y de la escena, y el empaquetador las vuelve a comparar contra lo que hay en disco.
- Seguir cuentas, dar likes, comentar o mandar mensajes directos. Nada de eso se automatiza.
