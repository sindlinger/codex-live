import fs from 'node:fs';
import path from 'node:path';

export function configPath(baseDir) {
  return path.join(baseDir, 'config', 'cli.json');
}

function defaultConfig() {
  return {
    defaultRepo: '',
    repos: {
      operpdf: '/mnt/c/git/operpdf-textopsalign',
    },
  };
}

export function loadConfig(baseDir) {
  const p = configPath(baseDir);
  if (!fs.existsSync(p)) return defaultConfig();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const obj = JSON.parse(raw);
    return {
      defaultRepo: obj.defaultRepo || '',
      repos: obj.repos && typeof obj.repos === 'object' ? obj.repos : {},
    };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(baseDir, cfg) {
  const p = configPath(baseDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

export function resolveRepo(baseDir, cfg, inputRepo) {
  if (inputRepo && cfg.repos[inputRepo]) return cfg.repos[inputRepo];
  if (inputRepo && inputRepo.startsWith('/')) return inputRepo;
  if (inputRepo && inputRepo.match(/^[A-Za-z]:\\/)) return inputRepo;
  if (inputRepo && inputRepo.includes('/')) return inputRepo;
  if (inputRepo && cfg.repos[inputRepo]) return cfg.repos[inputRepo];
  if (cfg.defaultRepo && cfg.repos[cfg.defaultRepo]) return cfg.repos[cfg.defaultRepo];
  if (cfg.defaultRepo && cfg.defaultRepo.includes('/')) return cfg.defaultRepo;
  return process.cwd();
}
