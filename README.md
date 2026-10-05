# sólido. — graficadora 3D para integrales múltiples

Herramienta de trabajo para plantear integrales dobles y triples: se cargan las
fronteras de la región como desigualdades y la app dibuja la región/sólido, la
sombra en el plano, los barridos y el planteo iterado con sus límites.

## Módulos

1. **Dobles · Cartesianas** — barrido vertical (dy dx) u horizontal (dx dy).
2. **Dobles · Cambio de variables** — polares, elípticas, lineal y general, con jacobiano.
3. **Triples · Cartesianas** — los 6 órdenes de integración, flecha de perforación y sombra.
4. **Triples · Cilíndricas / Esféricas** — exploración en (r, θ, z) o (ρ, θ, φ).

Incluye presets de los TP, exportar/importar ejercicios en JSON y guardado
automático en el navegador.

## Uso

```bash
npm install
npm run dev      # servidor de desarrollo
npm test         # tests (vitest)
npm run build    # typecheck + build de producción
```

Capturas automáticas (requiere Chrome y el dev server corriendo):

```bash
SHOTS_URL=http://localhost:5173 node scripts/shots.mjs
```

## Stack

React 19 · Vite · Tailwind CSS v4 · three.js (react-three-fiber) · KaTeX · mathjs

---

Diseñado por [Palacio Tomás](https://github.com/tomasgabrielh6658-create)
