import { build } from 'vite';
import fs from 'fs';
import path from 'fs'; // Use path below
import nodePath from 'path';
import archiver from 'archiver';

const args = process.argv.slice(2);
const isPackage = args.includes('--package');
const isObfuscate = args.includes('--obfuscate');

const outDir = isObfuscate ? 'dist-obfuscate' : 'dist';
const releaseDir = isObfuscate ? 'release-obfuscate' : 'release';

const commonViteConfig = {
  configFile: false,
  esbuild: {
    minifyIdentifiers: !isObfuscate,
    minifySyntax: true,
    minifyWhitespace: true,
  },
  build: {
    minify: isObfuscate ? 'terser' : 'esbuild',
    terserOptions: isObfuscate ? {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      },
      mangle: {
        toplevel: true,
        properties: false //Set to true for extreme obfuscation, but can break Chrome APIs
      },
      format: {
        comments: false
      }
    } : {}
  }
};

/**
 * Zip Packaging Logic
 * Compresses the distribution folder into a production-ready ZIP file 
 * for Chrome Web Store or internal distribution.
 */
function createZip(sourceDir, outPath) {
  if (!fs.existsSync(nodePath.dirname(outPath))) {
    fs.mkdirSync(nodePath.dirname(outPath), { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`[Package] Zip file created: ${outPath} (${archive.pointer()} total bytes)`);
      resolve();
    });

    archive.on('error', (err) => reject(err));
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

/**
 * Core Build Pipeline
 * 1. Bundles popup UI with Vite.
 * 2. Compiles TypeScript entry points (Background, Bridge, Injected scripts).
 * 3. Copies static manifests and assets.
 * 4. (Optional) Obfuscates and packages for release.
 */
async function buildExtension() {
  console.log(`[Build] Starting build... (Obfuscate: ${isObfuscate}, Package: ${isPackage})`);
  console.log(`[Build] Output Directory: ${outDir}`);

  // Build popup UI.
  await build({
    ...commonViteConfig,
    build: {
      ...commonViteConfig.build,
      emptyOutDir: true,
      outDir: outDir,
      rollupOptions: {
        input: 'popup.html'
      }
    }
  });

  // Script entry points.
  const entries = [
    { input: 'autosched.ts', output: 'autosched.js' },
    { input: 'autosched-main.ts', output: 'autosched-main.js' },
    { input: 'bridge.ts', output: 'bridge.js' },
    { input: 'background.ts', output: 'background.js' }
  ];

  for (const entry of entries) {
    await build({
      ...commonViteConfig,
      build: {
        ...commonViteConfig.build,
        emptyOutDir: false,
        outDir: outDir,
        rollupOptions: {
          input: entry.input,
          output: {
            format: 'iife',
            entryFileNames: entry.output,
          },
        },
      },
    });
  }

  // Copy extension assets.
  fs.copyFileSync('manifest.json', nodePath.resolve(outDir, 'manifest.json'));
  fs.copyFileSync('popup.css', nodePath.resolve(outDir, 'popup.css'));
  fs.copyFileSync('src/assets/logo128.png', nodePath.resolve(outDir, 'logo128.png'));
  console.log(`[Build] Static assets copied to ${outDir}/`);

  if (isPackage) {
    const zipFileName = isObfuscate ? 'web-tools-companion-obfuscated.zip' : 'web-tools-companion-store.zip';
    const zipPath = nodePath.resolve(releaseDir, zipFileName);
    await createZip(outDir, zipPath);
  }
}

buildExtension().catch(err => {
  console.error('[Build] Failed:', err);
  process.exit(1);
});
