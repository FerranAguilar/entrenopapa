# Plan de Papá

Web sencilla para programar entrenamientos funcionales a distancia. Tiene dos páginas:

| Página | Archivo | Para quién |
|---|---|---|
| Entrenos | `index.html` | Papá: ve la lista ordenada de entrenos de la semana y los hace cuando le viene bien (con temporizador de descanso y HIIT), apunta sus carreras (día, tiempo y distancia), envía cómo le ha ido y consulta su historial en un calendario. |
| Entrenador | `entrenador.html` | Tú: programas las semanas, subes fotos y vídeos de los ejercicios (o pegas un enlace de YouTube, Vimeo, Google Drive o de una imagen) y respondes al feedback. |

No hay logins. Los datos se guardan en Supabase (proyecto **Entreno Papá**) y las dos páginas se actualizan solas.

## Publicarla con GitHub Pages

1. En GitHub, abre el repositorio → **Settings** → **Pages**.
2. En **Build and deployment**, elige **Source: Deploy from a branch**, rama **main** y carpeta **/ (root)**. Guarda.
3. En uno o dos minutos la web estará en:
   - Papá: `https://ferranaguilar.github.io/entrenopapa/`
   - Entrenador: `https://ferranaguilar.github.io/entrenopapa/entrenador.html`

Desde el móvil, abre cada enlace y usa **Añadir a pantalla de inicio** para tenerla como una app.

> GitHub Pages solo es gratuito en repositorios públicos con el plan Free. Si el repositorio es privado, necesitas GitHub Pro o hacerlo público. El código no contiene nada secreto.

## Archivos

- `app.js` / `app.css`: la aplicación (las dos páginas comparten el mismo código).
- `config.js`: dirección y clave pública del proyecto de Supabase.
- `vendor/supabase.js`: librería de Supabase (v2.45.4), incluida para no depender de un CDN.
- `manifest*.webmanifest` e `icons/`: icono y nombre al añadirla a la pantalla de inicio.

## Base de datos (Supabase)

- Tablas `weeks` (semanas), `feedback` (respuestas de Papá), `runs` (carreras planificadas o hechas, con tiempo y distancia) y `library` (foto, vídeo y enlace de cada ejercicio, por nombre). Cada fila guarda un documento JSON en la columna `data`.
- Bucket público `media` para fotos y vídeos (máximo 20 MB por archivo).
- Sin logins: cualquiera que tenga la dirección de la web puede leer y cambiar los datos. No compartas los enlaces fuera de la familia.

En el plan gratuito, Supabase pausa los proyectos que pasan una semana sin uso. Si la web dice que no hay conexión, entra en supabase.com y pulsa **Restore project**.

## Progresión automática

Las semanas que tienen `plan.auto` forman un plan que avanza solo. Al abrir cualquiera de las dos páginas en una semana nueva:

1. La semana que empieza se recalcula a partir de la anterior, entreno por entreno, con el esfuerzo (RPE) que marcó Papá: **1–6 sube**, **7–8 se repite**, **9–10 baja**. Si no hizo el entreno, se repite igual.
2. Se añade una semana más, provisional, que se ajustará cuando le toque.

En fuerza, subir es una repetición más por serie hasta el máximo del ejercicio (`prog.max`) y después una serie más; en HIIT, 5 s más de trabajo y 5 s menos de descanso (hasta 45/15). Una semana provisional que el entrenador edita a mano deja de ajustarse sola. La progresión se pausa desde la página de entrenador (documento `weeks/_plan`).
