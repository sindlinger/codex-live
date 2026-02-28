#!/usr/bin/env bash
# shellcheck shell=bash
# Tema clássico ANSI (estilo Linux padrão)
if [ -t 1 ] || [ "${FORCE_COLOR:-0}" = "1" ]; then
  C_RESET=$'\033[0m'
  C_STAGE=$'\033[1;34m'   # azul
  C_CMD=$'\033[1;32m'     # verde
  C_OK=$'\033[1;32m'      # verde
  C_FAIL=$'\033[1;31m'    # vermelho
  C_WARN=$'\033[1;33m'    # amarelo
  C_DIM=$'\033[0;37m'     # cinza claro
  C_FILE=$'\033[1;34m'    # azul (paths/arquivos)
else
  C_RESET=''; C_STAGE=''; C_CMD=''; C_OK=''; C_FAIL=''; C_WARN=''; C_DIM=''; C_FILE=''
fi
