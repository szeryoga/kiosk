#!/bin/sh
set -eu

envsubst '${APP_BASE_PATH} ${ADMIN_BASE_PATH} ${API_BASE_PATH}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
