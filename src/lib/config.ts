import fs from 'node:fs';
import path from 'node:path';

export interface LiveConfig {
  defaultRepo: string;
  repos: Record<string, string>;
}

function defaultConfig(): LiveConfig {
  return {
    defaultRepo: '',
    repos: {
      operpdf: '/mnt/c/git/operpdf-textopsalign'
    }
  };
}

export function configPath(baseDir: string): string {
  return path.join(baseDir, 'config', 'cli.json');
}

export function loadConfig(baseDir: string): LiveConfig {
  const p = configPath(baseDir);
  if (!fs.existsSync(p)) return defaultConfig();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LiveConfig>;
    return {
      defaultRepo: parsed.defaultRepo ?? '',
      repos: typeof parsed.repos === 'object' && parsed.repos ? parsed.repos : {}
    };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(baseDir: string, cfg: LiveConfig): void {
  const p = configPath(baseDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

export function resolveRepo(baseDir: string, cfg: LiveConfig, inputRepo?: string): string {
  if (inputRepo && cfg.repos[inputRepo]) return cfg.repos[inputRepo];
  if (inputRepo && (inputRepo.startsWith('/') || /^[A-Za-z]:\\/.test(inputRepo) || inputRepo.includes('/'))) {
    return inputRepo;
  }
  if (cfg.defaultRepo && cfg.repos[cfg.defaultRepo]) return cfg.repos[cfg.defaultRepo];
  if (cfg.defaultRepo && cfg.defaultRepo.includes('/')) return cfg.defaultRepo;
  return baseDir;
}
