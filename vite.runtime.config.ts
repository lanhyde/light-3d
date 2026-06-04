import { defineConfig } from 'vite'

/**
 * Builds the exported-bundle runtime as a single, self-contained ESM file.
 *
 * three.js is bundled in (not externalized) so an exported web project runs by
 * just serving its folder — no CDN, no npm install — which also keeps it usable
 * offline / inside a WebAR host page. The editor reads the emitted file at
 * export time and drops it into each exported bundle.
 *
 *   npm run build:runtime   ->   public/export/light3d-viewer.js
 */
export default defineConfig({
  publicDir: false, // outDir lives inside public/; don't recursively copy it
  build: {
    outDir: 'public/export',
    emptyOutDir: false, // keep other public/ assets
    minify: true,
    target: 'es2020',
    lib: {
      entry: 'src/runtime/viewerEntry.ts',
      formats: ['es'],
      fileName: () => 'light3d-viewer.js',
    },
  },
})
