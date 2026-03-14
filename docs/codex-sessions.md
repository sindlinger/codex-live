# Estrutura real de `~/.codex/sessions`

Esta documentacao descreve a estrutura observada do historico real do Codex em `~/.codex/sessions`.

Ela serve de base para busca, captura, watch e monitoramento no `codex-live`.

## Escopo

Esta doc cobre:
- layout em disco
- tipos de registro observados
- campos relevantes para busca e apresentacao
- anomalias reais do corpus
- implicacoes praticas para parser

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
- o UUID da sessao aparece no nome do arquivo
- o primeiro `session_meta.payload.id` normalmente bate com o UUID do nome do arquivo

## Snapshot da inspecao

Inspecao feita em `2026-03-13T07:44:30Z`.

- raiz observada: `~/.codex/sessions`
- arquivos `.jsonl`: `816`
- volume total: `14,301,752,588` bytes
- arquivos vazios: `1`
- maior arquivo observado: `5,106,205,729` bytes

Consequencia pratica:
- parser de catalogo e captura precisa tolerar arquivos grandes
- leitura integral de arquivo nao pode ser pressuposto do formato

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

## Sequencia tipica

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
10. chamadas de ferramenta, saidas e token accounting

Essa ordem e comum, mas nao deve ser tratada como garantia absoluta.

## `session_meta`

Campos frequentes observados:

- `id`
- `timestamp`
- `cwd`
- `originator`
- `cli_version`
- `source`
- `model_provider`
- `base_instructions`
- `git`
- `agent_nickname`
- `agent_role`
- `forked_from_id`

Subcampos relevantes:

- `git.commit_hash`
- `git.branch`
- `git.repository_url`
- `base_instructions.text`

Observacoes:
- `source` pode ser string como `cli`, `exec` ou `vscode`
- `source` tambem pode ser objeto, especialmente em sessoes de subagente

Exemplo observado de `source` estruturado:

```json
{
  "source": {
    "subagent": {
      "thread_spawn": {
        "parent_thread_id": "...",
        "depth": 1,
        "agent_nickname": "Lorentz",
        "agent_role": "explorer"
      }
    }
  }
}
```

## `turn_context`

Campos frequentes:

- `cwd`
- `approval_policy`
- `sandbox_policy`
- `model`
- `personality`
- `collaboration_mode`
- `effort`
- `summary`
- `user_instructions`
- `truncation_policy`
- `turn_id`
- `developer_instructions`
- `current_date`
- `timezone`
- `realtime_active`

Uso pratico:
- bom para diagnostico
- bom para informacao tecnica complementar
- nao deve ser a base principal de busca por assunto

## `event_msg`

Subtipos observados:

| payload.type | contagem observada |
|---|---:|
| `token_count` | 24,964 |
| `agent_reasoning` | 11,346 |
| `agent_message` | 1,936 |
| `user_message` | 1,500 |
| `task_started` | 298 |
| `task_complete` | 139 |
| `turn_aborted` | 103 |
| `entered_review_mode` | 7 |
| `exited_review_mode` | 7 |

Campos mais uteis para busca e evidencia:

- `user_message.message`
- `agent_message.message`
- `agent_reasoning.text`

## `response_item`

Subtipos observados:

| payload.type | contagem observada |
|---|---:|
| `function_call` | 11,808 |
| `function_call_output` | 11,610 |
| `reasoning` | 11,425 |
| `message` | 5,171 |
| `custom_tool_call` | 453 |
| `custom_tool_call_output` | 452 |
| `ghost_snapshot` | 368 |
| `web_search_call` | 87 |

No subtipo `message`, os papeis mais frequentes foram:

| role | contagem observada |
|---|---:|
| `assistant` | 1081 |
| `user` | 579 |
| `developer` | 357 |

Partes mais comuns em `message.content`:

| part.type | contagem observada |
|---|---:|
| `input_text` | 1327 |
| `output_text` | 1081 |

Observacoes:
- `function_call.arguments` costuma vir como string JSON serializada
- `function_call_output.output` pode ser grande

## Tipos raros

### `response_item:ghost_snapshot`

Observado com `ghost_commit` contendo:

- `id`
- `parent`
- `preexisting_untracked_files`
- `preexisting_untracked_dirs`

### `compacted`

Observado em poucos casos:

```json
{
  "type": "compacted",
  "payload": {
    "message": "..."
  }
}
```

## Anomalias reais do corpus

### Arquivos vazios

Existe pelo menos um `.jsonl` com tamanho zero.

Implicacao:
- o parser deve aceitar arquivo vazio sem falhar

### Arquivos gigantes

Existe pelo menos um arquivo maior que `5 GB`.

Implicacao:
- catalogo, capture e watch devem funcionar sem depender de leitura integral

### Multiplo `session_meta` no mesmo arquivo

Em `56` arquivos o head observado ja contem mais de um `session_meta`.

Implicacao:
- nao se deve assumir exatamente um `session_meta` por arquivo
- o nome do arquivo e o primeiro `session_meta` sao as melhores referencias de identidade

## Campos prioritarios para busca

Para busca por memoria, tema ou recencia, os campos mais uteis foram:

1. `session_meta.payload.timestamp`
2. `session_meta.payload.cwd`
3. `event_msg.user_message.message`
4. `response_item.message` com `role=user`
5. `response_item.message` com `role=assistant`
6. nome do arquivo e `session_id`

## Implicacoes para o `codex-live`

Direcao adotada:
- `session`, `capture`, `watch`, `open-watch`, `popup` e `tmux` trabalham sobre `~/.codex/sessions`
- `exec` e `flow` nao criam sessoes; apenas gravam logs auxiliares em `./logs/runs`
- selecao de sessao para monitoramento usa `last`, `<n>`, `<session_id>` ou caminho de `.jsonl`

Se o formato real do Codex mudar, esta documentacao deve ser atualizada com nova inspecao do proprio corpus.
