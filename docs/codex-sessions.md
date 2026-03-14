# Estrutura real de `~/.codex/sessions`

Esta documentacao descreve a estrutura observada do historico real do Codex e como o `codex-live` a utiliza.

## Papel no repositorio

`~/.codex/sessions` e a fonte de verdade de sessoes do usuario.

O `codex-live` usa esse espaco para:

- catalogar sessoes com `session` e `sessions`
- recuperar sessoes por memoria livre com `search`
- inspecionar eventos com `capture`
- acompanhar sessoes com `watch`, `open-watch`, `popup` e `tmux`
- retomar sessoes com `open`, `codex` e `session attach`

Nao entram aqui:

- `./logs/runs`
- `./logs/search`

Esses diretorios sao apenas artefatos operacionais locais.

## Layout em disco

Padrao observado:

```text
~/.codex/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-mm-ss-<session_id>.jsonl
```

Exemplo:

```text
~/.codex/sessions/2026/03/12/rollout-2026-03-12T22-36-12-019ce4d6-4062-79d2-827b-d4922866dbf3.jsonl
```

Observacoes:

- a arvore por data e consistente
- o `session_id` aparece no nome do arquivo
- o primeiro `session_meta.payload.id` normalmente coincide com o `session_id` do nome do arquivo

## Forma geral do JSONL

Cada linha tende a ser um objeto JSON independente:

```json
{
  "timestamp": "2026-03-13T01:37:16.137Z",
  "type": "session_meta|turn_context|event_msg|response_item|compacted",
  "payload": { "...": "..." }
}
```

Tipos de topo observados:

| type | contagem observada |
|---|---:|
| `response_item` | 41,374 |
| `event_msg` | 40,300 |
| `turn_context` | 11,818 |
| `session_meta` | 883 |
| `compacted` | 2 |

## Campos mais uteis para o `codex-live`

### Identidade e contexto

- `session_meta.payload.id`
- `session_meta.payload.cwd`
- `session_meta.payload.timestamp`
- `session_meta.payload.git.branch`
- `session_meta.payload.git.repository_url`

Uso pratico:

- montar catalogo
- inferir repositorio
- ordenar por tempo

### Evidencia textual forte

- `event_msg.payload.type=user_message`
- `event_msg.payload.type=agent_message`
- `response_item.payload.type=message`
- `response_item.payload.role=user|assistant`
- `response_item.payload.content[].type=input_text|output_text`

Uso pratico:

- busca por assunto
- `capture --focus`
- trechos usados pelo `search --to-codex`
- perguntas com `search --ask`

### Evidencia textual fraca

- `turn_context`
- `agent_reasoning`
- `function_call`
- `function_call_output`

Uso pratico:

- diagnostico
- contexto complementar
- pistas secundarias de busca

## Como cada comando usa esse espaco

### `session ls`

- monta um catalogo a partir de `session_meta`
- complementa tema com mensagem inicial e texto observado
- aplica filtros por tema, tempo e proximidade

### `search`

- extrai termos da memoria do usuario
- procura candidatas no historico real
- coleta evidencias de tema e conteudo
- opcionalmente pede ao proprio Codex para reranquear
- pode agir sobre a melhor sessao encontrada:
  - `--open`
  - `--capture`
  - `--watch`
  - `--ask`

### `capture`

- resolve `last`, `<n>`, `<session_id>` ou caminho de arquivo
- le os ultimos eventos da sessao
- pode filtrar para foco e acompanhar em `--follow`

### `watch` e familia

- usam a mesma resolucao de alvo de `capture`
- seguem a sessao real do Codex
- nunca dependem de um espaco de sessao local paralelo

## Sequencia tipica de uma sessao

Sequencia frequente em sessoes recentes:

1. `session_meta`
2. `response_item` com `message` de `developer`
3. `response_item` com `message` de `user`
4. `event_msg` `task_started`
5. `turn_context`
6. `event_msg` `user_message`
7. `response_item` `reasoning`
8. `event_msg` `agent_message`
9. `response_item` com `message` de `assistant`
10. chamadas de ferramenta e saidas

Essa ordem e comum, mas nao deve ser tratada como garantia absoluta.

## Anomalias reais do corpus

### Arquivos vazios

Existe pelo menos um `.jsonl` com tamanho zero.

Implicacao:

- o parser deve aceitar arquivo vazio sem falhar

### Arquivos gigantes

Existe pelo menos um arquivo maior que `5 GB`.

Implicacao:

- catalogo, capture e watch nao podem depender de leitura integral

### Multiplo `session_meta` no mesmo arquivo

Em parte do corpus observado, um mesmo arquivo pode conter mais de um `session_meta`.

Implicacao:

- nao assumir exatamente um `session_meta` por arquivo
- nome do arquivo e primeiro `session_meta` sao as melhores referencias de identidade

## Consequencias praticas para implementacao

- sessao do usuario deve ser representada a partir do arquivo real do Codex
- logs locais sao auxiliares e devem continuar separados
- `search` deve privilegiar evidencia de `user_message` e `assistant message`
- `capture` e `watch` devem continuar tolerantes a arquivos muito grandes
- `search --ask` deve retomar a sessao real, nao inventar um contexto paralelo
