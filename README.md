# Tu Golf 🏌️

Plataforma web de **live scoring** para torneos amateur de golf. Permite organizar, gestionar y seguir torneos en tiempo real desde cualquier dispositivo.

## Características principales

- **Live Scoring en tiempo real** — los jugadores ingresan sus puntajes desde el campo y todos los ven al instante
- **Gestión de torneos** — crea y administra torneos con múltiples formatos (stroke play, stableford, match play)
- **Tablas de posiciones** — leaderboards actualizados automáticamente
- **Autenticación segura** — login y registro con Supabase Auth
- **Diseño responsive** — pensado para móvil, desde la cancha

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 14 (App Router) |
| Estilos | Tailwind CSS |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth |
| Lenguaje | TypeScript |

## Primeros pasos

### 1. Instalar dependencias

```bash
npm install
```

### 2. Variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto (ya incluido):

```env
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

### 3. Iniciar en modo desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

### 4. Build para producción

```bash
npm run build
npm start
```

## Estructura del proyecto

```
src/
├── app/
│   ├── layout.tsx          # Layout principal con navbar
│   ├── page.tsx            # Página de inicio
│   ├── login/
│   │   └── page.tsx        # Página de login
│   └── register/
│       └── page.tsx        # Página de registro
├── components/
│   └── Navbar.tsx          # Barra de navegación
└── lib/
    └── supabase.ts         # Cliente de Supabase
```

## Despliegue

El proyecto está optimizado para desplegarse en [Vercel](https://vercel.com). Solo conecta el repositorio y agrega las variables de entorno en el dashboard.

---

Construido con Next.js y Supabase.
