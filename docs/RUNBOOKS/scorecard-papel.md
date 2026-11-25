# Runbook — Plan B en cancha: la app o un teléfono fallan durante la ronda

**Para quién:** el organizador que anota (en una ronda «un celular por equipo», el creador de la ronda).
**Regla:** la ronda NUNCA se pierde por esperar. Lo único irreversible es **«Descartar ronda»**: en un evento real no se toca.

Antes de salir: imprimir la tarjeta de abajo (una por equipo) y llevar lápiz. Si nada falla, no se usa.

## 1. Qué hacer según lo que pase

| Pasa esto | Qué hacer | Por qué funciona |
|---|---|---|
| **Sin señal en un hoyo** | Seguir anotando en la app como si nada. Arriba aparece «Falta enviar»; el hoyo muestra «Enviar hoyo N». No cerrar la app ni descartar. | Los golpes quedan guardados en el teléfono y suben solos al volver la señal, en orden y sin duplicarse. |
| **Se recargó la página sin señal** | Volver a abrir la ronda. Lo anotado sigue ahí y el hoyo dice «Falta enviar» hasta que suba. | La cola de golpes vive en el teléfono, no en la página. |
| **El teléfono del otro anotador muere** (batería, se le cerró la sesión, no puede entrar) | Ese anotador sigue en **papel**. El creador entra a su scorer, en la franja «Equipos que anota otro celular» toca **Liberar** en ese equipo, lo toma y anota los hoyos desde el papel cuando pueda. | El creador puede anotar cualquier equipo; liberar no borra golpes. |
| **La app no carga para nadie** (caída) | Los dos equipos siguen en **papel**. No crear otra ronda. Cuando vuelva, el creador entra a la misma ronda y transcribe hoyo por hoyo; después finaliza. | Una ronda en curso acepta golpes de cualquier hoyo hasta que se finaliza. |
| **«Finalizar» da error** | Esperar 1 minuto y reintentar con señal. Si sigue, **dejar la ronda en curso** y avisar a Claude con hora y captura. | No finalizar no pierde nada; la ronda se puede cerrar después. |
| **«Finalizar» frena y nombra a un equipo** | Ese equipo tiene hoyos sin anotar: completarlos (o pedirle al otro anotador que toque «Guardar hoyo 18») y reintentar. | Es la protección para no cerrar con un equipo incompleto. |
| **Los amigos dicen que la tabla no se mueve** | Que recarguen la página. La tabla pública se refresca cada ~10 s. | La vista pública se sirve cacheada a propósito para aguantar mucha gente. |

## 2. Tarjeta de papel (imprimir una por equipo)

```
Ronda: ______________________   Fecha: ___/___/____   Código ronda: ________
Equipo: ____________________   HCP equipo (club): _____   Anota: ______________

 Hoyo |  1 |  2 |  3 |  4 |  5 |  6 |  7 |  8 |  9 | IDA
 Par  |    |    |    |    |    |    |    |    |    |
 Golp |    |    |    |    |    |    |    |    |    |
 App✓ |    |    |    |    |    |    |    |    |    |

 Hoyo | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | VUELTA | TOTAL
 Par  |    |    |    |    |    |    |    |    |    |        |
 Golp |    |    |    |    |    |    |    |    |    |        |
 App✓ |    |    |    |    |    |    |    |    |    |        |

 Gross: _____   − HCP: _____   = Neto: _____     Firma anotador: ____________
```

La fila **App✓** se marca cuando ese hoyo ya está en la app: así, al transcribir, se sabe exactamente qué falta.

## 3. Después

- Avisar a Claude con hora y captura de lo que falló (sigue `incident-bug-en-torneo.md`, pasos 3 a 6).
- Nada de deploys durante la ronda: la ventana del evento está congelada en `config/eventos-en-vivo.json`.
