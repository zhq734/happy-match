import { defineConfig } from 'vite';

// GitHub Pages 部署在子路径下，使用相对基路径确保资源可正确加载。
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2020',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
