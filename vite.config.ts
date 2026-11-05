/** Builds the solo and cooperative HTML entry points with Vite. */
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  input: [
    resolve(import.meta.dirname, 'index.html'),
    resolve(import.meta.dirname, 'multiplayer.html'),
  ],
});
