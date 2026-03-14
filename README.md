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

- `session`, `sessions`, `capture`, `watch`, `open-watch`, `popup` e `tmux` leem o histórico real do Codex em `~/.codex/sessions`.
- `search` faz busca por memória livre nesse mesmo histórico real e pode pedir reranqueamento ao próprio Codex.
- `exec` e `flow` só gravam logs auxiliares em `./logs/runs`.
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
Os logs auxiliares em `./logs/runs/` não entram na busca de sessões.

### Capture do histórico do Codex
```bash
codex-live capture
codex-live capture 1 --focus
codex-live capture last --follow
codex-live capture 019cac6b-2dc1-78e1-a39b-e0b40970cb0a --behind
```

### Busca por memória livre
```bash
codex-live search "dockermt no dockerhub"
codex-live search --days 3 "dockermt nas imagens locais"
codex-live search --to-codex "estávamos procurando o dockermt há uns 3 dias no dockerhub"
codex-live search --json "certidao conselho reconciliar com despacho"
```

`search --to-codex` primeiro levanta candidatas em `~/.codex/sessions` e só depois pede ao Codex para reranquear essas candidatas com um protocolo fixo de investigação.

Fluxo rápido:

```bash
codex-live search --to-codex "dockermt nas imagens locais e no dockerhub"
codex-live capture <session_id> --focus --behind
codex-live watch <session_id>
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
codex-live exec -- bash -lc "echo ok"
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
codex-live watch last
codex-live open-watch 1
codex-live popup last --width 70% --height 55%
codex-live tmux --watch popup
codex-live tmux 1 --watch split
codex-live tmux --watch both
codex-live tmux --watch window
```

Notas:
- `codex-live open` inicia o Codex interativo no terminal atual.
- `codex-live open-watch` abre uma nova janela de watch para uma sessão real do Codex.
- `popup` e `tmux` requerem cliente tmux ativo para abrir popup/janela.
- Se não houver cliente tmux ativo, o comando falha com instrução manual.

## Estrutura

- `src/`: TypeScript
- `dist/`: compilado
- `bin/`: entrada pública (`codex-live`)
- `logs/`: relatórios JSON
- `logs/runs/`: logs auxiliares de `exec` e `flow`
- `logs/search/`: artefatos efêmeros do `search --to-codex`
- `docs/codex-sessions.md`: estrutura observada do histórico real em `~/.codex/sessions`
- `lixeira/`: wrappers removidos

## Estrutura do histórico real

- [docs/codex-sessions.md](/home/chanfle/codex-live/docs/codex-sessions.md): layout, tipos de registro, campos úteis para busca e anomalias observadas em `~/.codex/sessions`

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
