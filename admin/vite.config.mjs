import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // The standalone admin app keeps its existing /floor-admin/ preview path.
  // GitHub Pages embeds the same build at /floor/admin/ via VITE_ADMIN_BASE.
  base: process.env.VITE_ADMIN_BASE || '/floor-admin/',
  plugins: [react()],
})
