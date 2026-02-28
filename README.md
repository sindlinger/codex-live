# codex-live

Toolkit de terminal para operar o Codex com execução rastreável, sessão persistente e monitoramento ao vivo.

Implementação atual: **Node.js + TypeScript**.

## Objetivo

Fornecer um fluxo padronizado para:
- executar comandos com trilha de auditoria por sessão;
- acompanhar saída em tempo real (`watch`);
- abrir watch em janela externa ou popup tmux;
- iniciar sessão tmux do Codex com logging opcional em JSON.

---

## Estrutura

- `src/`: código TypeScript
- `dist/`: código compilado
- `bin/`: wrappers finos (entrada pública)
- `sessions/`: sessões de execução (`commands.log`, `output.log`, `events.jsonl`)
- `logs/`: relatórios JSON (ex.: `codex-tmux --log`)
- `config/cli.json`: configuração de repositórios
- `lixeira/`: conteúdo legado removido do fluxo ativo

---

## Requisitos

- Node.js 20+
- npm
- tmux (para recursos de popup/painel)
- PowerShell (`powershell.exe`) para abrir janela externa no WSL/Windows (recomendado)

---

## Instalação

```bash
cd ~/codex-live
npm install
npm run build
```

Validação de tipos:

```bash
npm run check
```

---

## Entradas públicas (`bin/`)

Comandos principais:
- `codex-live`
- `codex-live-run`
- `codex-live-watch`
- `codex-live-open-watch`
- `codex-popup`
- `codex-tmux`

Atalhos:
- `codex-run` -> `codex-live-run`
- `codex-watch` -> `codex-live-watch`

Toggles tmux:
- `tmux-watch-pane-toggle.sh`
- `tmux-watch-popup-toggle.sh`

> Observação: os scripts em `bin/` são wrappers finos; a lógica fica em `dist/*.js` (gerada de `src/*.ts`).

---

## Uso rápido

### 1) Configurar/listar repositórios

```bash
~/codex-live/bin/codex-live repos list
~/codex-live/bin/codex-live repos add operpdf /mnt/c/git/operpdf-textopsalign
~/codex-live/bin/codex-live repos use operpdf
```

Também funciona com o alias:

```bash
```

### 2) Executar comando rastreado

```bash
~/codex-live/bin/codex-live run --repo operpdf -- ./run.exe 1-12 --inputs @M-DESP --inputs :Q22 --probe
```

ou via atalho direto:

```bash
~/codex-live/bin/codex-run --repo /mnt/c/git/operpdf-textopsalign -- ./run.exe 1-12 --inputs @M-DESP --inputs :Q22 --probe
```

### 3) Ver sessão

```bash
~/codex-live/bin/codex-live sessions list
~/codex-live/bin/codex-live watch --session-number 1
```

### 4) Pipeline (atalho para `./run.exe`)

```bash
~/codex-live/bin/codex-live pipeline --repo operpdf --range 1-12 --model @M-DESP --input :Q22 --probe
```

### 5) Abrir watch em janela externa

```bash
~/codex-live/bin/codex-live open-watch current
```

### 6) Popup (se estiver dentro de tmux)

```bash
~/codex-live/bin/codex-popup current --width 70% --height 55%
```

### 7) Subir sessão tmux do Codex

```bash
~/codex-live/bin/codex-tmux --session codex_live --repo /mnt/c/git/operpdf-textopsalign
```

Com log JSON:

```bash
~/codex-live/bin/codex-tmux --session codex_live --repo /mnt/c/git/operpdf-textopsalign --log
```

### 8) Chamar o Codex original via codex-live

Help original do Codex:

```bash
~/codex-live/bin/codex-live codex --help-original
```

Passando parâmetros do Codex original:

```bash
~/codex-live/bin/codex-live codex -- --model gpt-5
```

Com alias:

```bash
```

---

## Sessões e logs

Cada execução de `codex-live-run` cria/usa uma sessão em:

- `sessions/<session_id>/commands.log`
- `sessions/<session_id>/output.log`
- `sessions/<session_id>/events.jsonl`
- `sessions/<session_id>/meta.json`

Alias de sessão atual:
- `sessions/current` (symlink)

Relatórios JSON (`codex-tmux --log`):
- `logs/codex-tmux__<timestamp>__<pid>.json`

---

## Cores e terminal

- A execução usa pseudo-TTY (`script`) quando disponível para preservar ANSI.
- `NO_COLOR=1` desabilita cor.
- O `watch` mostra `commands.log` + `output.log` em tempo real.

---

## Integração tmux

No `.tmux.conf`, exemplo de binds:

```tmux
bind-key C run-shell '/home/chanfle/codex-live/bin/codex-tmux --session codex_live --repo "#{@codex_repo}" --width 70% --height 55%'
bind-key V run-shell '/home/chanfle/codex-live/bin/codex-live-open-watch current'
bind-key W run-shell '/home/chanfle/codex-live/bin/tmux-watch-popup-toggle.sh'
bind-key w run-shell '/home/chanfle/codex-live/bin/tmux-watch-pane-toggle.sh'
```

---

## Troubleshooting

### `popup` abre e some
- Comportamento esperado do tmux popup: ele fecha ao perder foco.
- Para monitor contínuo, use painel toggle (`tmux-watch-pane-toggle.sh`) ou `open-watch` em janela separada.

### `No server running on /tmp/tmux-1000/default`
- Inicie uma sessão tmux primeiro:

```bash
tmux new -s codex_live
```

### janela externa não abre
- Verifique disponibilidade de `powershell.exe` no WSL.
- Fallback Linux usa `gnome-terminal`/`x-terminal-emulator`.

---

## Desenvolvimento

Build:

```bash
npm run build
```

Type-check:

```bash
npm run check
```

Limpar compilação:

```bash
npm run clean
npm run rebuild
```

---

## Contrato de design

- `bin/*` = interface pública (wrappers finos)
- `src/*` = lógica de produto
- `dist/*` = artefato compilado
- Sem lógica duplicada em shell
- Sessão e logs sempre explícitos
