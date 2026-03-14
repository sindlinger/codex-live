# PROMPT.md — Modelo operacional do codex-live

## Objetivo

Ser um wrapper fino para o historico real do Codex, facilitando:

- localizar sessoes passadas a partir de memoria imperfeita
- inspecionar eventos da sessao sem nova execucao
- retomar a sessao correta no proprio Codex
- acompanhar sessoes reais em watch, popup ou tmux
- executar comandos auxiliares com logs separados, sem confundir isso com sessoes do usuario

## Conceitos

- Sessao real do usuario:
  - arquivo `.jsonl` em `~/.codex/sessions`
- Log auxiliar local:
  - artefato em `./logs/runs` ou `./logs/search`
- Busca por memoria:
  - recuperacao local em `~/.codex/sessions`
  - reranqueamento opcional pelo proprio Codex
  - acoes opcionais: `--open`, `--capture`, `--watch`, `--ask`

## Fluxo recomendado

1. Encontrar a conversa:
   - `codex-live search --to-codex "dockermt nas imagens locais e no dockerhub"`
2. Validar a sessao:
   - `codex-live capture <session_id> --focus --behind`
3. Retomar ou perguntar:
   - `codex-live --session <session_id> open`
   - ou `codex-live search --to-codex --ask "o que concluimos?" "dockermt nas imagens locais e no dockerhub"`

## Comandos essenciais

- `codex-live session ls`
- `codex-live capture <session_id> --focus --behind`
- `codex-live search --to-codex "..."`
- `codex-live search --to-codex --ask "pergunta" "..."`
- `codex-live --session <session_id> open`
- `codex-live watch <session_id>`
- `codex-live exec -- <cmd>`
- `codex-live flow run ...`

## Regras operacionais

- Se a pergunta do usuario e sobre "em qual conversa falamos disso?", use `search`.
- Se a pergunta e "o que decidimos naquela conversa?", use `search --ask`.
- Se a intencao for continuar a conversa, use `open` com `--session` ou `session attach`.
- Nunca promover logs locais a "sessoes do usuario".
- Sempre devolver `session_id` e proximo comando sugerido quando isso ajudar.
