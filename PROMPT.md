# PROMPT.md — Codex Live CLI

## Objetivo
Executar comandos com rastreabilidade total e monitoramento ao vivo, com sessão identificável por ID ou número.

## Fluxo recomendado
1. `codex-open-watch` (ou `codex-popup` em tmux)
2. `codex-live pipeline --repo operpdf --range 1-12 --model @M-DESP --input :Q22 --probe`
3. Se necessário, usar `codex-live sessions list` e revisar sessão por número/ID.

## Comandos essenciais
- `codex-live repos list|add|use|remove`
- `codex-live sessions list`
- `codex-live run --repo <nome|path> -- <cmd>`
- `codex-live pipeline --repo <nome|path> --range <1-12> --model <alias> --input <alias> [--probe] [--param <arg>]...`
- `codex-live watch --session-number <n>`
- `codex-live watch --session-id <id>`

## Regras operacionais
- Não executar comando crítico sem `codex-live run` ou `codex-live pipeline`.
- Sempre citar `session_id` ao reportar evidências.
- Nunca ocultar erro; reportar comando e exit code.
