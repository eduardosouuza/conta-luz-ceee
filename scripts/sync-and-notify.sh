#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")/.."

if [ ! -s token.json ]; then
  echo 'Configure o token do Gmail antes de executar a rotina.' >&2
  exit 1
fi
if [ ! -s dados/avisos-whatsapp.json ]; then
  echo 'Transfira o histórico de avisos antes de executar a rotina.' >&2
  exit 1
fi

node src/index.js
node src/alerts.js --send
