import fs from 'node:fs';
import path from 'node:path';
import { execCapture } from './proc.js';
import { ensureDir, nowIso } from './runtime.js';
const REGISTRY_BASENAME = 'watch-windows.json';
function registryPath(baseDir) {
    return path.join(baseDir, 'logs', REGISTRY_BASENAME);
}
function readRegistry(baseDir) {
    const file = registryPath(baseDir);
    try {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        const windows = Array.isArray(parsed.windows) ? parsed.windows : [];
        return { version: 1, windows: windows };
    }
    catch {
        return { version: 1, windows: [] };
    }
}
function writeRegistry(baseDir, registry) {
    const file = registryPath(baseDir);
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
}
function isPidAlive(pid) {
    if (!Number.isFinite(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function cleanRegistry(baseDir) {
    const current = readRegistry(baseDir);
    const alive = current.windows.filter((w) => isPidAlive(w.pid));
    const cleaned = { version: 1, windows: alive };
    writeRegistry(baseDir, cleaned);
    return cleaned;
}
export function getCurrentTty() {
    const out = execCapture('bash', ['-lc', 'tty'], { stdio: ['ignore', 'pipe', 'ignore'] }).stdout.trim();
    if (!out || out.toLowerCase().includes('not a tty'))
        return '(no-tty)';
    return out;
}
export function listActiveWatchWindows(baseDir) {
    return cleanRegistry(baseDir).windows;
}
export function registerWatchWindow(baseDir, entry) {
    const current = cleanRegistry(baseDir);
    const withoutSelf = current.windows.filter((w) => w.pid !== entry.pid);
    withoutSelf.push(entry);
    writeRegistry(baseDir, { version: 1, windows: withoutSelf });
}
export function unregisterWatchWindow(baseDir, pid) {
    const current = cleanRegistry(baseDir);
    const filtered = current.windows.filter((w) => w.pid !== pid);
    writeRegistry(baseDir, { version: 1, windows: filtered });
}
export function closeActiveWatchWindows(baseDir) {
    const current = cleanRegistry(baseDir);
    const closed = [];
    const failed = [];
    for (const w of current.windows) {
        try {
            process.kill(w.pid, 'SIGTERM');
            closed.push(w);
        }
        catch {
            failed.push(w);
        }
    }
    const after = cleanRegistry(baseDir);
    return {
        before: current.windows.length,
        closed,
        failed,
        remaining: after.windows
    };
}
export function newWatchWindowEntry(params) {
    return {
        pid: params.pid,
        sessionId: params.sessionId,
        launcher: params.launcher,
        ownerPid: params.ownerPid,
        ownerTty: params.ownerTty,
        ownerCmd: params.ownerCmd,
        startedAtUtc: nowIso()
    };
}
