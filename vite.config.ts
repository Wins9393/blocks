import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Les grandes icônes restent hors du préchargement : le système les lit
      // une fois à l'installation, et les mettre en cache doublerait le poids
      // du premier chargement pour des fichiers que la page ne demande jamais.
      includeManifestIcons: false,
      // Le service ouvrier ne précharge que ce que la page demande : les icônes
      // du manifeste, elles, sont lues une fois par le système à l'installation.
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Blocks',
        short_name: 'Blocks',
        description: 'Un bac à sable physique pour fabriquer, casser et recomposer les nombres.',
        lang: 'fr',
        theme_color: '#1d2433',
        background_color: '#1d2433',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        icons: [
          // Le PNG d'abord : iOS ignore le SVG, et une icône masquable en SVG
          // n'est pas lue par tous les lanceurs Android. Le SVG reste en
          // dernier pour les fenêtres qui savent l'agrandir sans le flouter.
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // La même, ramenée dans le cercle de sécurité : Android rogne un
          // disque de 80 % et le bloc y perdrait ses coins.
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
  },
});
