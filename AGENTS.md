# AGENTS.md — Codex Live

## Concepcao do repositorio

- Fonte de verdade de sessoes: `~/.codex/sessions`.
- `session`, `sessions`, `capture`, `watch`, `open-watch`, `popup`, `tmux` e `search` operam sobre esse historico real.
- `search` e a porta de entrada por memoria livre e pode pedir ao proprio Codex para reranquear, abrir, capturar, acompanhar ou responder sobre a melhor sessao.
- `open` e `codex` retomam sessoes reais do Codex.
- `exec` e `flow` nao criam sessoes do usuario; eles apenas gravam logs auxiliares em `./logs/runs`.

## Invariantes

1. Sessao do usuario = sessao real do Codex.
2. Logs locais nunca entram no catalogo, na busca ou na identificacao de sessoes do usuario.
3. `capture` e `watch` devem funcionar com leitura incremental e tolerar arquivos grandes em `~/.codex/sessions`.
4. ANSI/cor deve ser preservado para leitura humana.
5. Erros devem preservar contexto suficiente para reproduzir: comando, alvo e exit code quando houver.

## Fluxos principais

- Localizar uma conversa passada:
  - `codex-live search --to-codex "dockermt nas imagens locais e no dockerhub"`
- Inspecionar a sessao encontrada:
  - `codex-live capture <session_id> --focus --behind`
- Continuar a conversa:
  - `codex-live --session <session_id> open`
- Perguntar sobre a conversa sem abrir manualmente:
  - `codex-live search --to-codex --ask "o que concluimos?" "dockermt nas imagens locais e no dockerhub"`
- Acompanhar a sessao:
  - `codex-live watch <session_id>`

## Comandos essenciais

- Repositorios:
  - `codex-live repo ls`
  - `codex-live repo add <name> <path>`
  - `codex-live repo use <name|path>`
  - `codex-live repo rm <name>`
- Sessoes reais do Codex:
  - `codex-live session ls`
  - `codex-live session use <id|n>`
  - `codex-live session attach <n|session_id>`
  - `codex-live capture <session_id> --focus --behind`
  - `codex-live watch <session_id>`
- Memoria livre:
  - `codex-live search --to-codex "..."`
  - `codex-live search --to-codex --open "..."`
  - `codex-live search --to-codex --ask "pergunta" "..."`
- Execucao auxiliar:
  - `codex-live exec -- <cmd>`
  - `codex-live flow run ...`

## Regras operacionais

- Quando o objetivo for lembrar, retomar, explicar ou cruzar uma conversa, comece por `search`.
- Quando o usuario ja souber a sessao, use `capture`, `watch`, `open` ou `session attach`.
- Nao trate `./logs/runs` ou `logs/search` como fonte de verdade de sessoes; sao artefatos operacionais.
- Sempre citar `session_id` ao reportar evidencias ou comandos seguintes.
