#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy-lib.sh
. "${SCRIPT_DIR}/deploy-lib.sh"

SOURCE_DIR="${SOURCE_DIR:-$(repo_root)}"
DEPLOY_DIR="${DEPLOY_DIR:-${DEFAULT_DEPLOY_DIR}}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/.env}"

require_sudo
install_docker_if_missing
prepare_deploy_dir "$DEPLOY_DIR"

log "Copying single-server runtime files from ${SOURCE_DIR}"
copy_runtime_file "${SOURCE_DIR}/docker-compose.web.yml" "${DEPLOY_DIR}/docker-compose.web.yml"
copy_runtime_file "${SOURCE_DIR}/docker-compose.database.yml" "${DEPLOY_DIR}/docker-compose.database.yml"
copy_runtime_file "${SOURCE_DIR}/database/init.sql" "${DEPLOY_DIR}/database/init.sql"
copy_runtime_dir_files "${SOURCE_DIR}/database/migrations" "${DEPLOY_DIR}/database/migrations"

if [ ! -f "$ENV_FILE" ]; then
    if [ -f "${SOURCE_DIR}/.env.production.example" ]; then
        install -m 0600 "${SOURCE_DIR}/.env.production.example" "$ENV_FILE"
        fail "Created ${ENV_FILE} from .env.production.example. Edit it with real values, then rerun this script."
    fi
    fail "Create ${ENV_FILE} before running this script."
fi

require_env "$ENV_FILE" APP_DOMAIN >/dev/null
require_env "$ENV_FILE" TRAEFIK_ACME_EMAIL >/dev/null
require_env "$ENV_FILE" WEB_IMAGE >/dev/null
require_env "$ENV_FILE" MYSQL_ROOT_PASSWORD >/dev/null
require_env "$ENV_FILE" MYSQL_DATABASE >/dev/null
require_env "$ENV_FILE" MYSQL_USER >/dev/null
require_env "$ENV_FILE" MYSQL_PASSWORD >/dev/null

single_server_db_host="$(optional_env "$ENV_FILE" DB_HOST)"
if [ -n "$single_server_db_host" ] && [ "$single_server_db_host" != "db" ]; then
    fail "Single-server mode uses the internal Docker database host 'db'. Remove DB_HOST from ${ENV_FILE}, or set DB_HOST=db. Current DB_HOST=${single_server_db_host}."
fi

print_ufw_web_guidance
ghcr_login_if_requested "$ENV_FILE"

log "Starting Traefik, web app, Watchtower, and MySQL"
cd "$DEPLOY_DIR"
compose_cmd --env-file "$ENV_FILE" -f docker-compose.web.yml -f docker-compose.database.yml up -d --remove-orphans

log "Waiting for database and web containers"
wait_for_container_healthy db 60
run_single_server_schema "$ENV_FILE"
wait_for_compose_service_healthy "$ENV_FILE" web -f docker-compose.web.yml -f docker-compose.database.yml

cat <<EOF

Deployment complete.

Verify:
  cd ${DEPLOY_DIR}
  docker compose --env-file .env -f docker-compose.web.yml -f docker-compose.database.yml ps
  curl -I http://$(require_env "$ENV_FILE" APP_DOMAIN)
  curl -I https://$(require_env "$ENV_FILE" APP_DOMAIN)
  docker logs traefik --tail 100
  docker logs watchtower --tail 100
EOF
