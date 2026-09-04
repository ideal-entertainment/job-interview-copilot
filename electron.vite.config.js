import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    main: {},
    preload: {},
    renderer: {
        // Vite 7 defaults to IPv6 [::1]; Electron resolves localhost to 127.0.0.1.
        server: {
            host: '127.0.0.1',
            port: 5173,
            strictPort: true
        },
        resolve: {
            alias: {
                '@renderer': resolve('src/renderer/src')
            }
        },
        plugins: [react()]
    }
});
