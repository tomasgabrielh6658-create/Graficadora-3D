import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // react en su chunk propio: si quedara dentro de `three`, el entry
          // precargaría 1.1 MB de three.js aunque el 3D sea lazy.
          if (/node_modules[\\/]react(-dom)?[\\/]/.test(id) || id.includes('node_modules/scheduler')) return 'react'
          // three.js queda en el chunk lazy compartido de los módulos 3–4
          // (no lo forzamos: el helper __vitePreload debe quedar en el entry,
          //  si cae en `three` el entry lo precarga entero).
          if (id.includes('node_modules/katex')) return 'katex'
        },
      },
    },
  },
})
