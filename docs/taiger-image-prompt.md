# tAIger+ — Prompt para generar imagen con IA

## Usar en: Midjourney, Leonardo AI, o DALL-E 3

### Prompt principal (copiar y pegar):

```
A majestic Bengal tiger head portrait emerging from darkness, semi-realistic digital art style, three-quarter view looking directly at camera with intense confident gaze, amber and warm gold lighting on fur, deep dark navy background (#0a1628), subtle geometric patterns woven into the tiger stripes suggesting artificial intelligence and data, the tiger exudes calm authority like a professional sports coach, cinematic lighting from upper left, shallow depth of field, luxury brand aesthetic, ultra clean composition, no text, no watermark, 16:9 aspect ratio --style raw --v 6.1
```

### Variantes:

**Mas abstracto (para hero background):**
```
Abstract tiger essence, amber and gold light streaks forming the suggestion of tiger stripes and eyes against deep navy darkness, minimal, geometric, data visualization aesthetic mixed with organic feline energy, luxury sports brand mood, ultra wide format --ar 3:1 --style raw --v 6.1
```

**Mas cercano (para avatar del coach):**
```
Extreme close-up of a tiger's eye, photorealistic, amber iris with gold flecks, reflection of a golf course in the pupil, dramatic side lighting, dark background, cinematic, luxury brand aesthetic --ar 1:1 --style raw --v 6.1
```

### Donde se usara cada imagen:

| Imagen | Donde | Tamaño | Formato |
|--------|-------|--------|---------|
| Portrait principal | TaigerHero component | 400x200px | WebP, quality 85 |
| Abstract streaks | Background del hero | 800x300px | WebP, quality 75 |
| Tiger eye closeup | Avatar en chat de tAIger | 64x64px | WebP, quality 90 |

### Como integrar:

1. Generar la imagen con el prompt
2. Exportar como WebP (tamaño indicado arriba)
3. Guardar en `public/images/taiger/`
4. Claude integra con animacion CSS (parallax, reveal, breathing)

### Paleta de colores a respetar:

- Background app: #0a1628 (navy oscuro)
- Gold primario: #c4992a
- Gold claro: #e8c06a
- Texto: #edeae4
- Texto secundario: #94a8c0

La imagen debe integrarse SIN BORDES visibles contra el background #0a1628.
