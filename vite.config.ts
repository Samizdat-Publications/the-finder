// Multi-page Vite site: the landing page, the instrument (/play/) and How it's checked (/checked/).
// Vite 8 builds with Rolldown, so the page list lives under build.rolldownOptions.
import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// Folders that must never be watched or scanned (a plugin database, raw downloads, build output).
const IGNORED = ['.claude/**', 'sources/**', 'build/**', 'harness/**', 'review/**'];

export default defineConfig({
  base: '/',
  publicDir: 'public',
  plugins: [preact()],
  server: {
    watch: { ignored: IGNORED.map((g) => `**/${g}`) },
  },
  optimizeDeps: {
    entries: ['index.html', 'play/index.html', 'checked/index.html', ...IGNORED.map((g) => `!${g}`)],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        main: here('./index.html'),
        play: here('./play/index.html'),
        checked: here('./checked/index.html'),
      },
    },
  },
});
