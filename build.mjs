import { build } from 'vite';
import fs from 'fs';
import path from 'path';

const commonViteConfig = {
  configFile: false,
  esbuild: {
    minifyIdentifiers: false, // Minifies and compresses but prevents variable name obfuscation/mangling
    minifySyntax: true,
    minifyWhitespace: true,
  }
};

async function buildExtension() {
  // Build popup
  await build({
    ...commonViteConfig,
    build: {
      emptyOutDir: true,
      outDir: 'dist',
      rollupOptions: {
        input: 'popup.html'
      }
    }
  });

  // Build autosched
  await build({
    ...commonViteConfig,
    build: {
      emptyOutDir: false,
      outDir: 'dist',
      rollupOptions: {
        input: 'autosched.ts',
        output: {
          format: 'iife',
          entryFileNames: 'autosched.js',
        },
      },
    },
  });

  // Build autosched-main
  await build({
    ...commonViteConfig,
    build: {
      emptyOutDir: false,
      outDir: 'dist',
      rollupOptions: {
        input: 'autosched-main.ts',
        output: {
          format: 'iife',
          entryFileNames: 'autosched-main.js',
        },
      },
    },
  });

  // Build bridge
  await build({
    ...commonViteConfig,
    build: {
      emptyOutDir: false,
      outDir: 'dist',
      rollupOptions: {
        input: 'bridge.ts',
        output: {
          format: 'iife',
          entryFileNames: 'bridge.js',
        },
      },
    },
  });

  // Copy static assets
  fs.copyFileSync('manifest.json', path.resolve('dist', 'manifest.json'));
  fs.copyFileSync('popup.css', path.resolve('dist', 'popup.css'));
  fs.copyFileSync('src/assets/logo128.png', path.resolve('dist', 'logo128.png'));
  console.log('Copied static assets to dist/');
}

buildExtension();
