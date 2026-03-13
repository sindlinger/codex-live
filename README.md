# codex-live

CLI único para execução, sessões e monitoramento do Codex.

## Instalação

```bash
cd ~/codex-live
npm install
npm run build
```

## Comando público

Somente este comando é público em `bin/`:

```bash
~/codex-live/bin/codex-live
```

## Uso moderno

### Repositórios
```bash
codex-live repo ls
codex-live repo add operpdf /mnt/c/git/operpdf-textopsalign
codex-live repo use operpdf
codex-live repo rm operpdf
```

### Sessões
```bash
codex-live session ls
codex-live session ls --theme despacho
codex-live session ls --days 2
codex-live session ls --sort newest --limit 20
codex-live session show
codex-live session use 1
codex-live session clear
```

`session ls` busca somente no histórico real do Codex em `~/.codex/sessions`.
Os diretórios locais em `./sessions/` são apenas logs operacionais do wrapper e não entram na busca.

### Fluxo principal (`run.exe`)
```bash
# defaults: 1-12 @M-DESP :Q22
codex-live flow run

# completo
codex-live flow run 1-10 @M-DESP :Q150 --probe

# atalho despacho
codex-live flow quick :Q22 --probe
```

### Execução arbitrária com log de execução
```bash
codex-live exec -- git status
```

### Codex original via codex-live
```bash
codex-live codex help
codex-live codex -- --version
codex-live codex -- --model gpt-5
```

### Monitoramento (watch/open/popup/tmux)
```bash
codex-live watch
codex-live open current
codex-live popup current --width 70% --height 55%
codex-live tmux --repo operpdf --session codex_live --width 70% --height 55%
codex-live tmux --watch popup
codex-live tmux --watch split
codex-live tmux --watch both
codex-live tmux --watch window
```

Notas do `open`:
- `codex-live open` abre no ambiente **WSL/tmux** (não usa PowerShell/Windows).
- Requer cliente tmux ativo para abrir popup/janela.
- Se não houver cliente tmux ativo, o comando falha com instrução manual.

## Estrutura

- `src/`: TypeScript
- `dist/`: compilado
- `bin/`: entrada pública (`codex-live`)
- `sessions/`: logs locais de execução/watch
- `logs/`: relatórios JSON
- `lixeira/`: wrappers removidos

## Desenvolvimento

```bash
npm run build
npm run check
npm test
npm run clean && npm run rebuild
```

### Versionamento automático no build

- A cada `npm run build`, o `codex-live` incrementa automaticamente a versão patch (`x.y.z`).
- O timestamp do build é salvo em `package.json` (`buildMeta.builtAtUtc`).
- O `watch` mostra no cabeçalho:
  - versão atual
  - horário de início do watch
  - horário de início da sessão
  - horário do último build

### Logs locais de execução

- `commands.log`: comando e status de saída.
- `output.log`: stdout/stderr bruto da execução.
- `timeline.log`: visão consolidada (com prefixos `[CMD]`, `[INFO]`, `[OUT]`, `[EXIT]`) para leitura limpa no watch.
