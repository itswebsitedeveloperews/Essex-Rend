import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  site: 'https://essexrend.co.uk',
  server: {
    allowedHosts: ['.replit.dev', 'essex-rend.replit.app'],
  },
  security: {
    checkOrigin: true,
  },
  vite: {
    server: {
      allowedHosts: true,
    },
    preview: {
      allowedHosts: true,
    },
  },
});