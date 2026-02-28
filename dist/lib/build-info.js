import fs from 'node:fs';
import path from 'node:path';
export function readBuildInfo(baseDir) {
    const pkgPath = path.join(baseDir, 'package.json');
    try {
        const raw = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(raw);
        return {
            version: String(pkg.version || '0.0.0'),
            builtAtUtc: String(pkg.buildMeta?.builtAtUtc || 'n/a')
        };
    }
    catch {
        return { version: '0.0.0', builtAtUtc: 'n/a' };
    }
}
