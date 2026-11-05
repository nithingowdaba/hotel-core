import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

const backendExample = path.resolve('../backend/.env.example');
const examplePort = fs.existsSync(backendExample)
  ? fs.readFileSync(backendExample, 'utf8').match(/^PORT=(\d+)$/m)?.[1]
  : undefined;
const backendPort = process.env.PORT || examplePort || '3000';
const backendOrigin = `http://localhost:${backendPort}`;

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': backendOrigin, '/api-docs': backendOrigin, '/health': backendOrigin } },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, manifest: true },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.js' },
});
