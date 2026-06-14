#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy-lib.sh
. "${SCRIPT_DIR}/deploy-lib.sh"

SOURCE_DIR="${SOURCE_DIR:-$(repo_root)}"
DEPLOY_DIR="${DEPLOY_DIR:-${DEFAULT_DEPLOY_DIR}}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/.env}"

require_sudo
prepare_deploy_dir "$DEPLOY_DIR"

log "Copying database schema files from ${SOURCE_DIR}"
copy_runtime_file "${SOURCE_DIR}/database/init.sql" "${DEPLOY_DIR}/database/init.sql"
copy_runtime_dir_files "${SOURCE_DIR}/database/migrations" "${DEPLOY_DIR}/database/migrations"

if [ ! -f "$ENV_FILE" ]; then
    if [ -f "${SOURCE_DIR}/.env.production.example" ]; then
        install -m 0600 "${SOURCE_DIR}/.env.production.example" "$ENV_FILE"
        fail "Created ${ENV_FILE} from .env.production.example. Edit DB_* and WEB_SERVER_DB_ALLOWED_HOST, then rerun this script."
    fi
    fail "Create ${ENV_FILE} before running this script."
fi

db_name="$(require_env "$ENV_FILE" DB_NAME)"
db_user="$(require_env "$ENV_FILE" DB_USER)"
db_pass="$(require_env "$ENV_FILE" DB_PASS)"
allowed_host="$(require_env "$ENV_FILE" WEB_SERVER_DB_ALLOWED_HOST)"
bind_address="$(optional_env "$ENV_FILE" MYSQL_BIND_ADDRESS)"
root_password="$(optional_env "$ENV_FILE" MYSQL_ROOT_PASSWORD)"
bind_address="${bind_address:-0.0.0.0}"

case "$db_name" in
    (*[!A-Za-z0-9_]*|'') fail "DB_NAME must contain only letters, numbers, and underscores for provisioning." ;;
esac

case "$db_user" in
    (*[!A-Za-z0-9_]*|'') fail "DB_USER must contain only letters, numbers, and underscores for provisioning." ;;
esac

case "$allowed_host" in
    (*[!A-Za-z0-9_.:%-]*|'') fail "WEB_SERVER_DB_ALLOWED_HOST contains unsupported characters." ;;
esac

case "$bind_address" in
    (*[!A-Za-z0-9_.:%-]*|'') fail "MYSQL_BIND_ADDRESS contains unsupported characters." ;;
esac

sql_escape() {
    printf '%s' "$1" | sed "s/'/''/g"
}

db_pass_sql="$(sql_escape "$db_pass")"

if ! command -v mysql >/dev/null 2>&1; then
    log "Installing MySQL server"
    sudo apt-get update
    sudo apt-get install -y mysql-server
fi

sudo systemctl enable --now mysql

log "Configuring MySQL to listen on ${bind_address}"
printf '[mysqld]\nbind-address = %s\n' "$bind_address" |
    sudo tee /etc/mysql/mysql.conf.d/99-learningfullstack.cnf >/dev/null
sudo systemctl restart mysql

mysql_root_args=()
if [ -n "$root_password" ] && [[ "$root_password" != replace_with_* ]]; then
    mysql_root_args=(-uroot "-p${root_password}")
fi

log "Creating database and app user"
sudo mysql "${mysql_root_args[@]}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${db_name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${db_user}'@'${allowed_host}' IDENTIFIED BY '${db_pass_sql}';
ALTER USER '${db_user}'@'${allowed_host}' IDENTIFIED BY '${db_pass_sql}';
GRANT ALL PRIVILEGES ON \`${db_name}\`.* TO '${db_user}'@'${allowed_host}';
FLUSH PRIVILEGES;
SQL

cd "$DEPLOY_DIR"

log "Importing base schema"
sudo mysql "${mysql_root_args[@]}" "$db_name" < database/init.sql

if find database/migrations -maxdepth 1 -type f -name '*.sql' | grep -q .; then
    log "Applying SQL migrations"
    find database/migrations -maxdepth 1 -type f -name '*.sql' | sort |
        while IFS= read -r migration; do
            sudo mysql "${mysql_root_args[@]}" "$db_name" < "$migration"
        done
fi

cat <<EOF

External database provisioning complete.

Firewall reminder for the DB VPS:
  sudo ufw allow from ${allowed_host} to any port 3306 proto tcp
  sudo ufw status verbose

Set these values in the web VPS ${DEFAULT_DEPLOY_DIR}/.env:
  DB_HOST=<this database server private or public IP>
  DB_PORT=3306
  DB_NAME=${db_name}
  DB_USER=${db_user}
  DB_PASS=<the password you set>
EOF
