import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const dist = path.resolve('dist/coreui-free-angular-admin-template/browser');
const json = file => JSON.parse(fs.readFileSync(path.join(dist, file), 'utf8'));
const manifest = json('manifest.webmanifest'); const sw = json('ngsw.json');
assert.equal(manifest.name, 'MisFinanzas'); assert.equal(manifest.display, 'standalone'); assert.equal(manifest.lang, 'es');
assert.equal(manifest.start_url, './#/quick-entry'); assert.equal(manifest.scope, './');
assert.equal(manifest.shortcuts.length, 3);
for (const size of [192, 512]) {
  const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}` && icon.purpose === 'any'); assert.ok(icon, `Falta icono ${size}`);
  const data = fs.readFileSync(path.join(dist, icon.src)); assert.equal(data.toString('ascii', 1, 4), 'PNG'); assert.equal(data.readUInt32BE(16), size); assert.equal(data.readUInt32BE(20), size);
}
assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
const apple = fs.readFileSync(path.join(dist, 'assets/pwa/apple-touch-icon.png')); assert.equal(apple.readUInt32BE(16), 180); assert.equal(apple.readUInt32BE(20), 180);
assert.ok(fs.existsSync(path.join(dist, 'ngsw-worker.js')));
assert.equal(sw.dataGroups.length, 0, 'La PWA no debe almacenar respuestas privadas de la API');
const cached = sw.assetGroups.flatMap(group => group.urls);
assert.ok(cached.includes('/index.html')); assert.ok(cached.includes('/manifest.webmanifest'));
assert.ok(cached.every(url => !url.startsWith('/api/') && !url.startsWith('/assets/receipts/')));
const headers = fs.readFileSync(path.join(dist, '_headers'), 'utf8'); assert.ok(headers.includes('/ngsw-worker.js')); assert.ok(headers.includes('no-store'));
console.log('PWA verificada: manifest, iconos, service worker, cabeceras y caché solo de recursos públicos.');
