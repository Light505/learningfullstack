#!/usr/bin/env bash

set -euo pipefail

APP_NAME="learningfullstack"
DEFAULT_DEPLOY_DIR="/opt/${APP_NAME}"

log() {
    printf '\n==> %s\n' "$*"
}

warn() {
    printf '\nWARNING: %s\n' "$*" >&2
}

fail() {
    printf '\nERROR: %s\n' "$*" >&2
    exit 1
}

script_dir() {
    cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
}

repo_root() {
    local dir
    dir="$(script_dir)"
    cd -- "${dir}/.." && pwd
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_sudo() {
    if [ "$(id -u)" -eq 0 ]; then
        fail "Run this script as a non-root user with sudo privileges, not as root."
    fi

    require_command sudo
    sudo -v
}

env_value() {
    local file="$1"
    local key="$2"
    local env_current="${!key-}"
    local line value

    if [ -n "$env_current" ]; then
        printf '%s' "$env_current"
        return
    fi

    if [ ! -f "$file" ]; then
        return
    fi

    line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)"
    if [ -z "$line" ]; then
        return
    fi

    value="${line#*=}"
    value="${value%$'\r'}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    printf '%s' "$value"
}

require_env() {
    local file="$1"
    local key="$2"
    local value

    value="$(env_value "$file" "$key")"
    if [ -z "$value" ] || [[ "$value" == replace_with_* ]] || [ "$value" = "example.com" ] || [ "$value" = "admin@example.com" ]; then
        fail "Set ${key} in ${file} before running this script."
    fi

    printf '%s' "$value"
}

optional_env() {
    env_value "$1" "$2"
}

prepare_deploy_dir() {
    local deploy_dir="$1"

    log "Preparing ${deploy_dir}"
    sudo install -d -m 0750 -o "$USER" -g "$USER" "$deploy_dir"
    sudo install -d -m 0750 -o "$USER" -g "$USER" "${deploy_dir}/database"
    sudo install -d -m 0750 -o "$USER" -g "$USER" "${deploy_dir}/database/migrations"
}

copy_runtime_file() {
    local source="$1"
    local destination="$2"

    [ -f "$source" ] || fail "Missing required file: ${source}"
    install -m 0640 "$source" "$destination"
}

copy_runtime_dir_files() {
    local source_dir="$1"
    local destination_dir="$2"

    [ -d "$source_dir" ] || fail "Missing required directory: ${source_dir}"
    find "$source_dir" -maxdepth 1 -type f -name '*.sql' -print0 |
        while IFS= read -r -d '' file; do
            install -m 0640 "$file" "${destination_dir}/$(basename "$file")"
        done
}

install_docker_if_missing() {
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        log "Docker and Docker Compose plugin are already installed."
        return
    fi

    [ -r /etc/os-release ] || fail "Cannot detect OS. This script supports Ubuntu/Debian-style apt hosts."
    # shellcheck source=/dev/null
    . /etc/os-release
    if [ "${ID:-}" != "ubuntu" ] && [ "${ID:-}" != "debian" ]; then
        fail "Unsupported OS '${ID:-unknown}'. Install Docker manually, then rerun this script."
    fi

    log "Installing Docker Engine and Compose plugin from Docker's apt repository."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc

    local codename
    codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
    [ -n "$codename" ] || fail "Cannot determine OS codename for Docker apt repository."

    printf 'Types: deb\nURIs: https://download.docker.com/linux/%s\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' \
        "$ID" "$codename" "$(dpkg --print-architecture)" |
        sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null

    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo systemctl enable --now docker

    log "Docker installed. Verifying Compose plugin."
    sudo docker compose version >/dev/null
}

docker_cmd() {
    if docker info >/dev/null 2>&1; then
        docker "$@"
    else
        sudo env HOME="$HOME" docker "$@"
    fi
}

compose_cmd() {
    docker_cmd compose "$@"
}

ghcr_login_if_requested() {
    local env_file="$1"
    local web_image username token

    web_image="$(require_env "$env_file" WEB_IMAGE)"
    if [[ "$web_image" != ghcr.io/* ]]; then
        return
    fi

    username="$(optional_env "$env_file" GHCR_USERNAME)"
    if [ -z "$username" ]; then
        warn "WEB_IMAGE uses ghcr.io but GHCR_USERNAME is empty. Skipping docker login."
        warn "If this is a private package, run: docker login ghcr.io"
        return
    fi

    token="${GHCR_TOKEN-}"
    if [ -z "$token" ]; then
        printf 'Enter GHCR token for %s (input hidden, leave blank to skip login): ' "$username" >&2
        IFS= read -r -s token || true
        printf '\n' >&2
    fi

    if [ -z "$token" ]; then
        warn "Skipping GHCR login. Private image pulls may fail."
        return
    fi

    log "Logging in to ghcr.io as ${username}"
    printf '%s' "$token" | docker_cmd login ghcr.io -u "$username" --password-stdin
}

print_ufw_web_guidance() {
    cat <<'EOF'

Firewall reminder for the web VPS:
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw status verbose

Do not open 3306/tcp for single-server mode. The MySQL container is internal.
phpMyAdmin is bound to 127.0.0.1:8081 and is not publicly exposed.
EOF
}

wait_for_container_healthy() {
    local container="$1"
    local attempts="${2:-60}"
    local status

    for _ in $(seq 1 "$attempts"); do
        status="$(docker_cmd inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
        if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
            return
        fi
        sleep 5
    done

    fail "Container ${container} did not become healthy/running in time."
}

wait_for_compose_service_healthy() {
    local env_file="$1"
    local service="$2"
    shift 2

    local attempts=60
    local ids status all_ready

    for _ in $(seq 1 "$attempts"); do
        ids="$(compose_cmd --env-file "$env_file" "$@" ps -q "$service" 2>/dev/null || true)"
        if [ -n "$ids" ]; then
            all_ready=true
            while IFS= read -r id; do
                [ -n "$id" ] || continue
                status="$(docker_cmd inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
                if [ "$status" != "healthy" ] && [ "$status" != "running" ]; then
                    all_ready=false
                    break
                fi
            done <<EOF
$ids
EOF
            if [ "$all_ready" = "true" ]; then
                return
            fi
        fi
        sleep 5
    done

    fail "Compose service ${service} did not become healthy/running in time."
}

database_has_tables() {
    local env_file="$1"
    local db_name root_password count

    db_name="$(require_env "$env_file" MYSQL_DATABASE)"
    root_password="$(require_env "$env_file" MYSQL_ROOT_PASSWORD)"
    count="$(compose_cmd --env-file "$env_file" -f docker-compose.web.yml -f docker-compose.database.yml exec -T db \
        mysql -uroot "-p${root_password}" -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${db_name}';" 2>/dev/null || true)"

    [ "${count:-0}" != "0" ]
}

run_single_server_schema() {
    local env_file="$1"
    local db_name root_password migration_count

    db_name="$(require_env "$env_file" MYSQL_DATABASE)"
    root_password="$(require_env "$env_file" MYSQL_ROOT_PASSWORD)"

    if database_has_tables "$env_file"; then
        log "Database already has tables. Skipping base schema import."
    else
        log "Importing base schema into ${db_name}"
        compose_cmd --env-file "$env_file" -f docker-compose.web.yml -f docker-compose.database.yml exec -T db \
            mysql -uroot "-p${root_password}" "$db_name" < database/init.sql
    fi

    migration_count="$(find database/migrations -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
    if [ "$migration_count" != "0" ]; then
        log "Applying SQL migrations"
        find database/migrations -maxdepth 1 -type f -name '*.sql' | sort |
            while IFS= read -r migration; do
                compose_cmd --env-file "$env_file" -f docker-compose.web.yml -f docker-compose.database.yml exec -T db \
                    mysql -uroot "-p${root_password}" "$db_name" < "$migration"
            done
    fi
}
