import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node18',
  outDir: 'dist',
  bundle: true,
  splitting: false,
  clean: true,
  dts: false,
  noExternal: ['@actions/core', '@octokit/rest', 'minimatch', 'openai', 'parse-diff'],
});
