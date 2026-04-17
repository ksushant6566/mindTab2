import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.mindtab.in',
  server: {
    port: 4321,
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
