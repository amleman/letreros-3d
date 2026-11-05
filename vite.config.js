import { resolve } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { defineConfig } from 'vite';

const VITRINA_FILE = resolve(__dirname, 'public/vitrina.json');

/**
 * API local SOLO para el servidor de desarrollo (npm run dev):
 *   GET /api/vitrina  -> contenido de public/vitrina.json
 *   PUT /api/vitrina  -> sobrescribe public/vitrina.json
 * No existe en el build de Netlify: allí el visor solo lee ./vitrina.json estático.
 */
function vitrinaDevApi() {
  return {
    name: 'bibliosign-vitrina-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/vitrina', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          if (req.method === 'GET') {
            const raw = await readFile(VITRINA_FILE, 'utf-8').catch(() => '{}');
            res.end(raw);
            return;
          }
          if (req.method === 'PUT') {
            let body = '';
            for await (const chunk of req) body += chunk;
            const data = JSON.parse(body);
            if (!data || typeof data !== 'object' || !Array.isArray(data.designs)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Formato inválido: se esperaba { designs: [...] }' }));
              return;
            }
            await writeFile(VITRINA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8');
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Método no permitido' }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err.message || err) }));
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  // `vite build --mode vitrina` (Netlify): solo se publica el visor para jefatura, nunca el diseñador CAD
  const isVitrina = mode === 'vitrina';

  return {
    base: './',
    plugins: [vitrinaDevApi()],
    server: {
      port: 3000,
      open: true
    },
    build: {
      outDir: 'dist',
      sourcemap: !isVitrina,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        input: isVitrina
          ? { visor: resolve(__dirname, 'visor.html') }
          : {
              main: resolve(__dirname, 'index.html'),
              visor: resolve(__dirname, 'visor.html')
            }
      }
    }
  };
});
