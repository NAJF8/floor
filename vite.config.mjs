import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // The official custom domain serves the customer app from its root.
  base: '/',
  plugins: [react()],
})

