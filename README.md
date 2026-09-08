# eConomy

App personal de ingresos y gastos, con usuarios separados, resumen mensual,
analisis por categoria/subcategoria, e importacion desde Excel.

## Importante: donde viven los datos

Esta version guarda los datos en el **localStorage del navegador**, no en un
servidor. Eso significa:

- Los datos solo existen en el navegador/dispositivo donde los introduces.
  Si entras desde el movil y desde el ordenador, cada uno tendra sus propios
  datos, no se sincronizan solos.
- Si borras los datos de navegacion del navegador (o usas modo incognito),
  los movimientos se pierden. Haz copias de seguridad exportando cuando
  quieras (funcion de exportar aun por anadir, o pidele a Claude que la anada).
- Las contrasenas se guardan como hash (SHA-256 con sal), nunca en texto
  plano, pero al no haber servidor esto sigue siendo una separacion de datos
  basica entre personas que comparten el mismo despliegue, no un sistema de
  seguridad de nivel bancario.

Si mas adelante quieres que los datos se sincronicen entre dispositivos,
hace falta anadir un backend real (por ejemplo, una base de datos con una
API) — dimelo y lo planificamos.

## Requisitos

- [Node.js](https://nodejs.org) 18 o superior
- npm (viene con Node)

## Desarrollo local

```bash
npm install
npm run dev
```

Abre la URL que muestra la terminal (normalmente `http://localhost:5173`).

## Desplegar en GitHub Pages

### 1. Sube el proyecto a un repositorio

```bash
git init
git add .
git commit -m "Primera version de eConomy"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

### 2. Ajusta el "base" en `vite.config.js`

Abre `vite.config.js` y cambia esta linea para que coincida con el nombre
de tu repositorio:

```js
base: "/TU_REPO/",
```

Si vas a publicar en `https://tuusuario.github.io/TU_REPO/`, `TU_REPO` es el
nombre del repositorio. Si en cambio usas un dominio propio o un repo tipo
`tuusuario.github.io`, pon `base: "/"`.

Vuelve a hacer commit y push de ese cambio.

### 3. Activa GitHub Pages con GitHub Actions

En tu repositorio en GitHub: **Settings > Pages > Build and deployment >
Source**, elige **GitHub Actions**.

El workflow ya incluido (`.github/workflows/deploy.yml`) construye la app y
la publica automaticamente cada vez que haces push a `main`. La primera
vez puede tardar 1-2 minutos; en la pestana **Actions** del repo veras el
progreso, y GitHub te dara la URL final (algo como
`https://tuusuario.github.io/TU_REPO/`).

## Importar tu historico de Excel

En la pestana **Registro > Importar movimientos**, sube un archivo `.json`
con este formato (uno de estos por movimiento):

```json
[
  {
    "id": "opcional-si-lo-tienes",
    "type": "expense",
    "amount": 12.5,
    "description": "Cena",
    "category": "Ocio",
    "subcategory": "Restaurantes",
    "date": "2024-01-15"
  }
]
```

Si Claude te genero un archivo `movimientos-historico.json`, es exactamente
este formato: puedes usarlo directamente.
