const runningThroughVite = Boolean(import.meta.env?.DEV || import.meta.env?.PROD);

async function bootFromSourceTree() {
  const mainUrl = new URL('./main.js', import.meta.url);
  const response = await fetch(mainUrl);
  if (!response.ok) throw new Error(`Could not load ${mainUrl.pathname} (${response.status})`);

  let source = await response.text();
  source = source.replace(/import\s+['"]\.\/styles\.css['"];?\s*/u, '');
  source = source.replaceAll("from './assets.js'", `from '${new URL('./assets.js', import.meta.url).href}'`);
  source = source.replaceAll("from './project.js'", `from '${new URL('./project.js', import.meta.url).href}'`);

  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    await import(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

try {
  if (runningThroughVite) await import('./main.js');
  else await bootFromSourceTree();
} catch (error) {
  console.error('[Nuitool] Boot failed', error);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:16px;z-index:9999;padding:16px;border-radius:16px;background:#171b2c;color:#fff;font:14px/1.5 system-ui;overflow:auto';
  box.innerHTML = `<strong>Nuitool could not start</strong><br><br>${String(error?.message || error)}`;
  document.body.appendChild(box);
}
