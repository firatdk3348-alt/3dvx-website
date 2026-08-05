import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        siparis: resolve(__dirname, 'siparis.html'),
        hakkimizda: resolve(__dirname, 'hakkimizda.html'),
        kurumsal: resolve(__dirname, 'kurumsal.html'),
        
      }
    }
  }
});
