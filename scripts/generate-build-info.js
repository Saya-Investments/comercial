// Genera build-info.json en la raiz con la hora del build.
// Se ejecuta antes de `next build` (ver script "build" en package.json).
const fs = require('node:fs')
const path = require('node:path')

const info = {
  buildTime: new Date().toISOString(),
}

const out = path.join(__dirname, '..', 'build-info.json')
fs.writeFileSync(out, JSON.stringify(info, null, 2) + '\n')
console.log(`[build-info] generated ${out} -> ${info.buildTime}`)
