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

### Modelo

- `session`, `sessions` e `capture` leem o histórico real do Codex em `~/.codex/sessions`.
- `exec`, `flow`, `watch`, `open-watch`, `popup` e `tmux` usam logs locais em `./sessions`.
- `open` é o alias interativo de `codex-live codex`.

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
codex-live session ls --theme dockermt --limit 10
codex-live session show
codex-live session use 1
codex-live session clear
codex-live session attach 1
```

`session ls` busca somente no histórico real do Codex em `~/.codex/sessions`.
Os diretórios locais em `./sessions/` são apenas logs operacionais do wrapper e não entram na busca.

### Capture do histórico do Codex
```bash
codex-live capture
codex-live capture 1 --focus
codex-live capture last --follow
codex-live capture 019cac6b-2dc1-78e1-a39b-e0b40970cb0a --behind
```

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
codex-live exec --repo operpdf -- npm test
codex-live exec --session current -- bash -lc "echo ok"
```

### Codex original via codex-live
```bash
codex-live open
codex-live codex help
codex-live codex -- --version
codex-live codex -- --model gpt-5
```

### Monitoramento (watch/open-watch/popup/tmux)
```bash
codex-live watch
codex-live watch current
codex-live open-watch current
codex-live popup current --width 70% --height 55%
codex-live tmux --watch popup
codex-live tmux current --watch split
codex-live tmux --watch both
codex-live tmux --watch window
```

Notas:
- `codex-live open` inicia o Codex interativo no terminal atual.
- `codex-live open-watch` abre uma nova janela de watch para um log local em `./sessions`.
- `popup` e `tmux` requerem cliente tmux ativo para abrir popup/janela.
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
