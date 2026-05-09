import { build } from 'vite';
import fs from 'fs';
import nodePath from 'path';
import archiver from 'archiver';

const args = process.argv.slice(2);
const isPackage = args.includes('--package');
const isObfuscate = args.includes('--obfuscate');
const isFirefox = args.includes('--firefox');

const suffix = isFirefox ? '-firefox' : (isObfuscate ? '-obfuscate' : '');
const outDir = `dist${suffix}`;
const releaseDir = `release${suffix}`;

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
 * Source Code Packaging Logic
 * Specifically for Firefox (AMO) submission which requires original source 
 * when using minification or bundling.
 */
function packageSource(releaseDir) {
  const outPath = nodePath.resolve(releaseDir, 'source-code.zip');
  
  if (!fs.existsSync(nodePath.dirname(outPath))) {
    fs.mkdirSync(nodePath.dirname(outPath), { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`[Package] Source code archive created: ${outPath}`);
      resolve();
    });

    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    // List of files and directories to include in the source archive
    const includeList = [
      'src',
      'portal-guide',
      'manifest.json',
      'package.json',
      'package-lock.json',
      'build.mjs',
      'popup.css',
      'popup.ts',
      'background.ts',
      'bridge.ts',
      'autosched.ts',
      'autosched-main.ts',
      'saf-scraper.ts',
      'curriculum-scraper.ts',
      'animation-engine.ts',
      'dom_validator.ts',
      'logger.ts',
      'subsmapping.ts',
      'changelog.json',
      'README.md',
      'FIREFOX_SUBMISSION.md',
      'vite.config.ts'
    ];

    for (const item of includeList) {
      if (fs.existsSync(item)) {
        const stats = fs.statSync(item);
        if (stats.isDirectory()) {
          // Add directory and its contents
          archive.directory(item, item);
        } else {
          // Add individual file
          archive.file(item, { name: item });
        }
      }
    }

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
    { input: 'saf-scraper.ts', output: 'saf-scraper.js' },
    { input: 'curriculum-scraper.ts', output: 'curriculum-scraper.js' },
    { input: 'bridge.ts', output: 'bridge.js' },
    { input: 'portal-guide/portal-guide.ts', output: 'portal-guide.js' },
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

  // Copy extension assets with production sanitization
  if (isPackage) {
    // 1. Sanitize manifest.json
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    
    const sanitizeMatches = (matches) => {
        if (!Array.isArray(matches)) return matches;
        return matches.filter(match => !match.includes('localhost'));
    };

    if (manifest.host_permissions) {
        manifest.host_permissions = sanitizeMatches(manifest.host_permissions);
    }

    if (manifest.content_scripts) {
        manifest.content_scripts.forEach(script => {
            script.matches = sanitizeMatches(script.matches);
        });
        manifest.content_scripts = manifest.content_scripts.filter(script => script.matches.length > 0);
    }

    if (manifest.web_accessible_resources) {
        manifest.web_accessible_resources.forEach(res => {
            res.matches = sanitizeMatches(res.matches);
        });
    }

    if (isFirefox) {
      manifest.browser_specific_settings = {
        gecko: {
          id: "gen.harpuia@outlook.ph",
          strict_min_version: "142.0",
          data_collection_permissions: {
            required: ["none"]
          }
        }
      };
      
      // Firefox MV3 background script fix
      if (manifest.background && manifest.background.service_worker) {
        manifest.background.scripts = [manifest.background.service_worker];
        manifest.background.type = "module";
        delete manifest.background.service_worker;
      }
    }

    fs.writeFileSync(nodePath.resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`[Build] manifest.json sanitized ${isFirefox ? '(Firefox optimized) ' : ''}(localhost removed) for production.`);

    // 2. Sanitize compiled JavaScript files
    const jsFiles = fs.readdirSync(outDir).filter(file => file.endsWith('.js'));
    for (const file of jsFiles) {
        const filePath = nodePath.resolve(outDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Remove localhost and 127.0.0.1 references from the code
        const originalLength = content.length;
        
        // Regex to remove localhost patterns (e.g. "*://localhost/*", 'localhost:8000', etc.)
        // We target common patterns found in the manifest and scripts
        content = content.replace(/["']\*?:\/\/localhost(\/|\:\*\/)?\*?["'],?/g, '');
        content = content.replace(/["']localhost:\d+["'],?/g, '');
        content = content.replace(/\|\|\s*host\s*===\s*['"]localhost['"]\s*\|\|\s*host\s*===\s*['"]127\.0\.0\.1['"]/g, '');
        
        // Clean up any double commas introduced by removal in arrays
        content = content.replace(/,(\s*),/g, ',');
        content = content.replace(/\[\s*,/g, '[');
        content = content.replace(/,\s*\]/g, ']');

        if (content.length !== originalLength) {
            fs.writeFileSync(filePath, content);
            console.log(`[Build] Sanitized ${file}: Localhost references removed.`);
        }
    }
  } else {
    fs.copyFileSync('manifest.json', nodePath.resolve(outDir, 'manifest.json'));
  }

  fs.copyFileSync('popup.css', nodePath.resolve(outDir, 'popup.css'));
  fs.copyFileSync('changelog.json', nodePath.resolve(outDir, 'changelog.json'));
  fs.copyFileSync('src/assets/logo128.png', nodePath.resolve(outDir, 'logo128.png'));
  console.log(`[Build] Static assets copied to ${outDir}/`);

  if (isPackage) {
    let zipFileName = isObfuscate ? 'web-tools-companion-obfuscated.zip' : 'web-tools-companion-store.zip';
    if (isFirefox) zipFileName = 'web-tools-companion-firefox.zip';
    
    const zipPath = nodePath.resolve(releaseDir, zipFileName);
    await createZip(outDir, zipPath);

    if (isFirefox) {
      await packageSource(releaseDir);
    }
  }
}

buildExtension().catch(err => {
  console.error('[Build] Failed:', err);
  process.exit(1);
});
