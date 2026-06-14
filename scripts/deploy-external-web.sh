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

log "Copying external-database web runtime files from ${SOURCE_DIR}"
copy_runtime_file "${SOURCE_DIR}/docker-compose.web.yml" "${DEPLOY_DIR}/docker-compose.web.yml"

if [ ! -f "$ENV_FILE" ]; then
    if [ -f "${SOURCE_DIR}/.env.production.example" ]; then
        install -m 0600 "${SOURCE_DIR}/.env.production.example" "$ENV_FILE"
        fail "Created ${ENV_FILE} from .env.production.example. Edit it with real external DB values, then rerun this script."
    fi
    fail "Create ${ENV_FILE} before running this script."
fi

require_env "$ENV_FILE" APP_DOMAIN >/dev/null
require_env "$ENV_FILE" TRAEFIK_ACME_EMAIL >/dev/null
require_env "$ENV_FILE" WEB_IMAGE >/dev/null
require_env "$ENV_FILE" DB_HOST >/dev/null
require_env "$ENV_FILE" DB_PORT >/dev/null
require_env "$ENV_FILE" DB_NAME >/dev/null
require_env "$ENV_FILE" DB_USER >/dev/null
require_env "$ENV_FILE" DB_PASS >/dev/null

print_ufw_web_guidance
ghcr_login_if_requested "$ENV_FILE"

log "Starting Traefik, web app, and Watchtower"
cd "$DEPLOY_DIR"
compose_cmd --env-file "$ENV_FILE" -f docker-compose.web.yml up -d --remove-orphans

log "Waiting for web container"
wait_for_compose_service_healthy "$ENV_FILE" web -f docker-compose.web.yml

log "Checking database connectivity from the web container"
compose_cmd --env-file "$ENV_FILE" -f docker-compose.web.yml exec -T web php -r '
$host = getenv("DB_HOST");
$port = getenv("DB_PORT") ?: "3306";
$name = getenv("DB_NAME");
$user = getenv("DB_USER");
$pass = getenv("DB_PASS");
$pdo = new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
echo "Database connection OK\n";
'

cat <<EOF

External database web deployment complete.

Verify:
  cd ${DEPLOY_DIR}
  docker compose --env-file .env -f docker-compose.web.yml ps
  curl -I http://$(require_env "$ENV_FILE" APP_DOMAIN)
  curl -I https://$(require_env "$ENV_FILE" APP_DOMAIN)
  docker logs traefik --tail 100
  docker logs watchtower --tail 100
EOF
