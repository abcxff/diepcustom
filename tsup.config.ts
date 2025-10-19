import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'es2021',
  outDir: 'lib',
  clean: true,
  sourcemap: false,
  minify: false,
  skipNodeModulesBundle: true,
  external: ['uWebSockets.js']
})