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
codex-live session show
codex-live session use 1
codex-live session clear
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

### Execução arbitrária com log de sessão
```bash
codex-live exec -- git status
```

### Codex original via codex-live
```bash
codex-live codex help
codex-live codex -- --version
codex-live codex -- --model gpt-5
```

### Monitoramento (watch/open/popup/tmux)
```bash
codex-live watch
codex-live open current
codex-live popup current --width 70% --height 55%
codex-live tmux --repo operpdf --session codex_live --width 70% --height 55%
```

## Estrutura

- `src/`: TypeScript
- `dist/`: compilado
- `bin/`: entrada pública (`codex-live`)
- `sessions/`: logs por sessão
- `logs/`: relatórios JSON
- `lixeira/`: wrappers legados removidos

## Desenvolvimento

```bash
npm run build
npm run check
npm run clean && npm run rebuild
```
