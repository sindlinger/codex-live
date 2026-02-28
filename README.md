# codex-live

Toolkit **Node.js + TypeScript** para execução e monitoramento ao vivo com logs por sessão.

## Build
```bash
cd ~/codex-live
npm install
npm run build
```

## Comando principal
```bash
codex-live <subcomando>
```

Atalhos diretos:
- `codex-run` -> `codex-live-run`
- `codex-watch` -> `codex-live-watch`

## Subcomandos
- `repos`: cadastro/seleção de repositório
- `sessions`: lista sessões (com índice)
- `run`: executa qualquer comando com rastreabilidade
- `pipeline`: atalho para `./run.exe` com range/model/input/probe/params
- `watch`, `open-watch`, `popup`: monitoramento em terminal atual, janela nova ou popup tmux
- `codex-tmux`: sobe/reaproveita sessão tmux com opção de popup e logging JSON (`--log`)

## Exemplos
```bash
codex-live repos list
codex-live sessions list
codex-live pipeline --repo operpdf --range 1-12 --model @M-DESP --input :Q22 --probe
codex-live run --repo /mnt/c/git/operpdf-textopsalign -- ./run.exe 1-12 --inputs @M-DESP --inputs :Q22 --probe
codex-live watch --session-number 1
```
