#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pkgPath = path.join(ROOT, 'package.json');

const raw = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(raw);

const current = String(pkg.version || '1.0.0');
const m = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!m) {
  console.error(`[bump-version] versão inválida no package.json: ${current}`);
  process.exit(1);
}

const major = Number(m[1]);
const minor = Number(m[2]);
const patch = Number(m[3]) + 1;
const next = `${major}.${minor}.${patch}`;

pkg.version = next;
pkg.buildMeta = {
  builtAtUtc: new Date().toISOString()
};

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(`[bump-version] ${current} -> ${next}`);
