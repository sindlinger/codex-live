import fs from 'node:fs';
import path from 'node:path';

export type BuildInfo = {
  version: string;
  builtAtUtc: string;
};

export function readBuildInfo(baseDir: string): BuildInfo {
  const pkgPath = path.join(baseDir, 'package.json');
  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string; buildMeta?: { builtAtUtc?: string } };
    return {
      version: String(pkg.version || '0.0.0'),
      builtAtUtc: String(pkg.buildMeta?.builtAtUtc || 'n/a')
    };
  } catch {
    return { version: '0.0.0', builtAtUtc: 'n/a' };
  }
}
