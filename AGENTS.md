# AGENTS.md — Codex Live Terminal Toolkit

## Contrato
- Entrada operacional: `codex-live run|pipeline`
- Observabilidade: `codex-live watch|open-watch|popup`
- Sessões: selecionáveis por `--session-id` ou `--session-number`

## Invariantes
1. Logs por sessão em `sessions/<id>/`.
2. ANSI/cor preservado para leitura humana.
3. Erro deve preservar comando e exit code.

## Comandos de suporte
- Repositórios:
  - `codex-live repos list`
  - `codex-live repos add <name> <path>`
  - `codex-live repos use <name|path>`
- Sessões:
  - `codex-live sessions list`
  - `codex-live watch --session-number 1`
  - `codex-live watch --session-id <id>`
