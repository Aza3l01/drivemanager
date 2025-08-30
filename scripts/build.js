const fs = require('fs-extra');
const path = require('path');

async function buildExtension(target = 'chrome') {
  const srcDir = './src';
  const destDir = `./dist/${target}`;
  
  console.log(`Building for ${target}...`);
  
  try {
    // Clean destination directory
    await fs.remove(destDir);
    await fs.ensureDir(destDir);
    
    // Copy all source files
    await fs.copy(srcDir, destDir);
    
    // Apply target-specific transformations
    const manifestPath = path.join(destDir, 'manifest.json');
    
    if (target === 'firefox') {
      await transformForFirefox(destDir, manifestPath);
    }
    
    // Add polyfill to HTML files for both browsers
    await addPolyfillToHTML(destDir);
    
    console.log(`✅ ${target} extension built successfully in ${destDir}/`);
    
  } catch (error) {
    console.error(`❌ Error building for ${target}:`, error);
    process.exit(1);
  }
}

async function transformForFirefox(destDir, manifestPath) {
  let manifest = await fs.readJson(manifestPath);
  
  // Convert Manifest V3 to V2 for Firefox
  manifest.manifest_version = 2;
  
  // Convert action to browser_action
  manifest.browser_action = manifest.action;
  delete manifest.action;
  
  // Convert service_worker to scripts
  manifest.background = {
    scripts: [
      "browser-polyfill.min.js",
      "background.js"
    ],
    persistent: false
  };
  
  // Add Firefox-specific settings
  manifest.browser_specific_settings = {
    gecko: {
      id: "drivemanager@yourdomain.com",
      strict_min_version: "109.0"
    }
  };
  
  // Remove V3-specific properties
  delete manifest.host_permissions;
  if (manifest.permissions) {
    manifest.permissions = manifest.permissions.concat([
      "https://www.googleapis.com/*",
      "https://www.googleapis.com/upload/drive/v3/*",
      "https://www.googleapis.com/drive/v3/*"
    ]);
  }
  
  await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  console.log('✅ Converted to Firefox-compatible manifest');
}

async function addPolyfillToHTML(destDir) {
  const htmlFiles = [
    path.join(destDir, 'popup', 'popup.html'),
    path.join(destDir, 'options', 'options.html')
  ];
  
  for (const htmlFile of htmlFiles) {
    if (await fs.pathExists(htmlFile)) {
      let content = await fs.readFile(htmlFile, 'utf8');
      
      // Only add if not already present
      if (!content.includes('browser-polyfill.min.js')) {
        content = content.replace(
          '</head>',
          '<script src="../browser-polyfill.min.js"></script></head>'
        );
        await fs.writeFile(htmlFile, content);
      }
    }
  }
}

// Build for all targets or specific target
async function buildAll() {
  await buildExtension('chrome');
  await buildExtension('firefox');
}

// Handle command line arguments
const target = process.argv[2] || 'all';
if (target === 'all') {
  buildAll();
} else if (['chrome', 'firefox'].includes(target)) {
  buildExtension(target);
} else {
  console.log('Usage: node scripts/build.js [chrome|firefox|all]');
  process.exit(1);
}