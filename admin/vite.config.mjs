import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Keep the standalone preview path for older local/Pages consumers.
  // The official flowers.alasas.tech deployment overrides this with /admin/.
  base: process.env.VITE_ADMIN_BASE || '/floor-admin/',
  plugins: [react()],
})
