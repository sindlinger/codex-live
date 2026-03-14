# codex-live

CLI para trabalhar em cima do historico real do Codex.

O repositorio nao trata mais logs locais como "sessoes do usuario". A fonte de verdade de sessoes e `~/.codex/sessions`. O papel do `codex-live` agora e:

- localizar sessoes reais
- inspecionar sessoes reais
- retomar sessoes reais
- acompanhar sessoes reais em watch/popup/tmux
- gravar logs auxiliares separados para `exec` e `flow`

## Instalacao

```bash
cd ~/codex-live
npm install
npm run build
```

## Comando publico

Somente este comando e publico em `bin/`:

```bash
~/codex-live/bin/codex-live
```

## Concepcao do repositorio

### Fonte de verdade

- `~/.codex/sessions`: sessoes reais do Codex

### Comandos que leem sessoes reais

- `session`
- `sessions`
- `search`
- `capture`
- `watch`
- `open-watch`
- `popup`
- `tmux`
- `open`
- `codex`

### Logs auxiliares locais

- `./logs/runs`: logs de `exec` e `flow`
- `./logs/search`: artefatos efemeros de `search --to-codex`

Esses logs nao sao sessoes do usuario e nao entram na busca/catalogo.

## Fluxos canonicos

### Encontrar uma conversa por memoria

```bash
codex-live search --to-codex "dockermt nas imagens locais e no dockerhub"
```

### Inspecionar a sessao encontrada

```bash
codex-live capture <session_id> --focus --behind
```

### Continuar a conversa no Codex

```bash
codex-live --session <session_id> open
```

### Perguntar sobre a conversa sem abrir manualmente

```bash
codex-live search --to-codex --ask "o que concluimos sobre isso?" "dockermt nas imagens locais e no dockerhub"
```

### Acompanhar a sessao

```bash
codex-live watch <session_id>
```

### Fluxo programatico

```bash
sid=$(codex-live search --to-codex --json "dockermt nas imagens locais e no dockerhub" | jq -r '.selected_session_id')
codex-live capture "$sid" --focus --behind
codex-live --session "$sid" open
```

## Comandos

### Repositorios

```bash
codex-live repo ls
codex-live repo add operpdf /mnt/c/git/operpdf-textopsalign
codex-live repo use operpdf
codex-live repo rm operpdf
```

### Catalogo de sessoes reais

```bash
codex-live session ls
codex-live session ls --theme dockermt --limit 10
codex-live session ls --days 2
codex-live session ls --from 2026-03-01 --to 2026-03-07
codex-live session use 1
codex-live session show
codex-live session clear
codex-live session attach 1
```

`session ls` busca somente no historico real do Codex em `~/.codex/sessions`.

### Busca por memoria livre

```bash
codex-live search "dockermt no dockerhub"
codex-live search --days 3 "dockermt nas imagens locais"
codex-live search --to-codex "estavamos procurando o dockermt ha uns 3 dias no dockerhub"
codex-live search --to-codex --open "dockermt nas imagens locais e no dockerhub"
codex-live search --to-codex --capture "dockermt nas imagens locais e no dockerhub"
codex-live search --to-codex --watch "dockermt nas imagens locais e no dockerhub"
codex-live search --to-codex --ask "o que concluimos?" "dockermt nas imagens locais e no dockerhub"
codex-live search --json "certidao conselho reconciliar com despacho"
```

Atalhos de acao:

- `--open`: reabre a melhor sessao encontrada no Codex
- `--capture`: executa `capture <session_id> --focus --behind`
- `--watch`: acompanha a melhor sessao encontrada
- `--ask "pergunta"`: pergunta ao Codex dentro da melhor sessao encontrada e imprime a resposta

Saida JSON util para automacao:

- `selected_session_id`
- `action`
- `asked_question`
- `answer`
- `candidates`
- `codex`

### Capture do historico do Codex

```bash
codex-live capture
codex-live capture 1 --focus
codex-live capture last --follow
codex-live capture 019cac6b-2dc1-78e1-a39b-e0b40970cb0a --behind
codex-live capture --raw --lines 30
```

### Codex original via codex-live

```bash
codex-live open
codex-live codex help
codex-live codex -- --version
codex-live codex -- --model gpt-5
```

### Monitoramento

```bash
codex-live watch
codex-live watch last
codex-live open-watch 1
codex-live popup last --width 70% --height 55%
codex-live tmux --watch popup
codex-live tmux 1 --watch split
codex-live tmux --watch both
```

Notas:

- `open-watch`, `popup` e `tmux` operam sobre sessoes reais do Codex
- `popup` e `tmux` exigem cliente tmux ativo

### Execucao auxiliar

```bash
codex-live exec -- git status
codex-live exec --repo operpdf -- npm test
codex-live exec -- bash -lc "echo ok"

codex-live flow run
codex-live flow run 1-10 @M-DESP :Q150 --probe
codex-live flow quick :Q22 --probe
```

`exec` e `flow` nao criam sessao do usuario. Eles apenas gravam logs auxiliares em `./logs/runs`.

## Estrutura

- `src/`: TypeScript
- `dist/`: compilado
- `bin/`: entrada publica (`codex-live`)
- `logs/runs/`: logs auxiliares de `exec` e `flow`
- `logs/search/`: artefatos efemeros de `search --to-codex`
- `docs/codex-sessions.md`: estrutura observada de `~/.codex/sessions`
- `AGENTS.md`: contrato atual do repositorio
- `PROMPT.md`: modelo operacional resumido

## Documentacao complementar

- [docs/codex-sessions.md](/home/chanfle/codex-live/docs/codex-sessions.md): layout, tipos de registro e implicacoes praticas do historico real do Codex

## Desenvolvimento

```bash
npm run build
npm run check
npm test
npm run clean && npm run rebuild
```

### Versionamento automatico no build

- cada `npm run build` incrementa a versao patch
- o timestamp do build fica em `package.json` em `buildMeta.builtAtUtc`
