#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?AWS_ACCOUNT_ID is required}"
DEPLOY_INSTANCE_TAG_NAME="${DEPLOY_INSTANCE_TAG_NAME:-get-slot-now-prod}"
EXTENSION_USAGE_TRACKER_ECR_REPOSITORY="${EXTENSION_USAGE_TRACKER_ECR_REPOSITORY:-extension-usage-tracker}"
EXTENSION_USAGE_TRACKER_IMAGE_TAG="${EXTENSION_USAGE_TRACKER_IMAGE_TAG:?EXTENSION_USAGE_TRACKER_IMAGE_TAG is required}"
EXTENSION_USAGE_TRACKER_PUBLIC_PATH="${EXTENSION_USAGE_TRACKER_PUBLIC_PATH:-/extension-usage-tracker}"

required_env=(
  NEXT_PUBLIC_APP_URL
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_EXTENSION_SCHEMA
  SUPABASE_EXTENSION_USERS_TABLE
  PAYMENT_PROVIDER
  LICENSE_SYNC_INTERVAL_MS
)

case "${PAYMENT_PROVIDER:-dodo}" in
  dodo)
    required_env+=(
      DODO_PAYMENTS_ENVIRONMENT
      DODO_PAYMENTS_API_KEY
      DODO_PAYMENTS_WEBHOOK_KEY
      DODO_PRODUCT_CANADA_CREDITS
      DODO_PRODUCT_UK_CREDITS
      CANADA_CREDITS_PER_PURCHASE
      UK_CREDITS_PER_PURCHASE
    )
    ;;
  paddle)
    required_env+=(
      PADDLE_ENVIRONMENT
      PADDLE_API_KEY
      PADDLE_WEBHOOK_SECRET
      PADDLE_PRICE_CANADA_CREDITS
      PADDLE_PRICE_UK_CREDITS
      CANADA_CREDITS_PER_PURCHASE
      UK_CREDITS_PER_PURCHASE
    )
    ;;
  *)
    echo "PAYMENT_PROVIDER must be dodo or paddle." >&2
    exit 1
    ;;
esac

missing=0
for name in "${required_env[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "Missing required environment value ${name}." >&2
    missing=1
  fi
done

if [ "${missing}" -ne 0 ]; then
  exit 1
fi

if [ -z "${DEPLOY_INSTANCE_ID:-}" ]; then
  DEPLOY_INSTANCE_ID="$(aws ec2 describe-instances \
    --region "${AWS_REGION}" \
    --filters "Name=tag:Name,Values=${DEPLOY_INSTANCE_TAG_NAME}" "Name=instance-state-name,Values=running" \
    --query 'Reservations[].Instances[].InstanceId' \
    --output text)"
fi

if [ -z "${DEPLOY_INSTANCE_ID}" ] || [ "${DEPLOY_INSTANCE_ID}" = "None" ]; then
  echo "Unable to find a running EC2 instance tagged Name=${DEPLOY_INSTANCE_TAG_NAME}." >&2
  exit 1
fi

env_file="$(mktemp)"
command_file="$(mktemp)"
trap 'rm -f "${env_file}" "${command_file}"' EXIT

cat > "${env_file}" <<ENV
NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ALLOWED_EXTENSION_ORIGINS=${ALLOWED_EXTENSION_ORIGINS:-}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_EXTENSION_SCHEMA=${SUPABASE_EXTENSION_SCHEMA}
SUPABASE_EXTENSION_USERS_TABLE=${SUPABASE_EXTENSION_USERS_TABLE}
PAYMENT_PROVIDER=${PAYMENT_PROVIDER}
LICENSE_SYNC_INTERVAL_MS=${LICENSE_SYNC_INTERVAL_MS}
DODO_PAYMENTS_ENVIRONMENT=${DODO_PAYMENTS_ENVIRONMENT:-test_mode}
DODO_PAYMENTS_API_KEY=${DODO_PAYMENTS_API_KEY:-}
DODO_PAYMENTS_WEBHOOK_KEY=${DODO_PAYMENTS_WEBHOOK_KEY:-}
DODO_PRODUCT_CANADA_CREDITS=${DODO_PRODUCT_CANADA_CREDITS:-}
DODO_PRODUCT_UK_CREDITS=${DODO_PRODUCT_UK_CREDITS:-}
DODO_PRODUCT_CANADA_PRO=${DODO_PRODUCT_CANADA_PRO:-}
DODO_PRODUCT_UK_PRO=${DODO_PRODUCT_UK_PRO:-}
CANADA_CREDITS_PER_PURCHASE=${CANADA_CREDITS_PER_PURCHASE:-5}
UK_CREDITS_PER_PURCHASE=${UK_CREDITS_PER_PURCHASE:-5}
PADDLE_ENVIRONMENT=${PADDLE_ENVIRONMENT:-sandbox}
PADDLE_API_KEY=${PADDLE_API_KEY:-}
PADDLE_WEBHOOK_SECRET=${PADDLE_WEBHOOK_SECRET:-}
PADDLE_PRICE_CANADA_CREDITS=${PADDLE_PRICE_CANADA_CREDITS:-}
PADDLE_PRICE_UK_CREDITS=${PADDLE_PRICE_UK_CREDITS:-}
PADDLE_PRICE_CANADA_PRO=${PADDLE_PRICE_CANADA_PRO:-}
PADDLE_PRICE_UK_PRO=${PADDLE_PRICE_UK_PRO:-}
ENV

env_payload="$(base64 < "${env_file}" | tr -d '\n')"

CODEX_ENV_PAYLOAD="${env_payload}" python3 - "${command_file}" <<'PY'
import json
import os
import sys

aws_region = os.environ["AWS_REGION"]
aws_account_id = os.environ["AWS_ACCOUNT_ID"]
repository = os.environ["EXTENSION_USAGE_TRACKER_ECR_REPOSITORY"]
image_tag = os.environ["EXTENSION_USAGE_TRACKER_IMAGE_TAG"]
public_path = os.environ["EXTENSION_USAGE_TRACKER_PUBLIC_PATH"]
env_payload = os.environ["CODEX_ENV_PAYLOAD"]

script = f"""set -euo pipefail
APP_DIR=/opt/get-slot-now
SERVICE_DIR=/opt/get-slot-now/extension-usage-tracker
SERVICE_NAME=extension-usage-tracker
AWS_REGION={aws_region}
AWS_ACCOUNT_ID={aws_account_id}
IMAGE="${{AWS_ACCOUNT_ID}}.dkr.ecr.${{AWS_REGION}}.amazonaws.com/{repository}:{image_tag}"
PUBLIC_PATH={public_path}

if [ ! -f "${{APP_DIR}}/docker-compose.yml" ] || [ ! -f "${{APP_DIR}}/Caddyfile" ]; then
  echo "${{APP_DIR}} is missing docker-compose.yml or Caddyfile. Run the get-slot-now EC2 deployment once first." >&2
  exit 1
fi

mkdir -p "${{SERVICE_DIR}}"
printf '%s' {env_payload!r} | base64 -d > "${{SERVICE_DIR}}/.env"
chmod 0600 "${{SERVICE_DIR}}/.env"

cd "${{APP_DIR}}"

aws ecr get-login-password --region "${{AWS_REGION}}" \\
  | docker login --username AWS --password-stdin "${{AWS_ACCOUNT_ID}}.dkr.ecr.${{AWS_REGION}}.amazonaws.com"

docker pull "${{IMAGE}}"

network="$(docker inspect "$(docker compose ps -q caddy)" --format '{{{{range $name, $_ := .NetworkSettings.Networks}}}}{{{{$name}}}}{{{{"\\n"}}}}{{{{end}}}}' | head -n 1)"
if [ -z "${{network}}" ]; then
  echo "Unable to determine Caddy Docker network." >&2
  exit 1
fi

docker rm -f "${{SERVICE_NAME}}" >/dev/null 2>&1 || true
docker run -d \\
  --name "${{SERVICE_NAME}}" \\
  --restart unless-stopped \\
  --network "${{network}}" \\
  --env-file "${{SERVICE_DIR}}/.env" \\
  "${{IMAGE}}"

if ! grep -q "handle_path ${{PUBLIC_PATH}}/\\*" Caddyfile; then
  awk -v public_path="${{PUBLIC_PATH}}" '
    /^\\thandle \\{{/ && inserted == 0 {{
      print "\\thandle_path " public_path "/* {{"
      print "\\t\\treverse_proxy extension-usage-tracker:3000"
      print "\\t}}"
      print ""
      inserted = 1
    }}
    {{ print }}
  ' Caddyfile > Caddyfile.tmp
  mv Caddyfile.tmp Caddyfile
fi

docker compose restart caddy

for attempt in $(seq 1 30); do
  if docker exec "${{SERVICE_NAME}}" node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"; then
    break
  fi
  echo "Waiting for extension-usage-tracker to become healthy (${{attempt}}/30)..."
  sleep 5
done

docker exec "${{SERVICE_NAME}}" node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
docker ps --filter "name=${{SERVICE_NAME}}"
"""

command = "\n".join([
    "cat > /tmp/extension-usage-tracker-deploy.sh <<'CODEX_SSM_SCRIPT'",
    script,
    "CODEX_SSM_SCRIPT",
    "bash /tmp/extension-usage-tracker-deploy.sh",
])

with open(sys.argv[1], "w", encoding="utf-8") as target:
    json.dump({"commands": [command]}, target)
PY

command_id="$(aws ssm send-command \
  --region "${AWS_REGION}" \
  --document-name AWS-RunShellScript \
  --comment "Deploy extension usage tracker container" \
  --instance-ids "${DEPLOY_INSTANCE_ID}" \
  --parameters "file://${command_file}" \
  --query 'Command.CommandId' \
  --output text)"

wait_seconds="${SSM_WAIT_SECONDS:-10}"
max_attempts="${SSM_WAIT_MAX_ATTEMPTS:-60}"
wait_status=1

for attempt in $(seq 1 "${max_attempts}"); do
  command_status="$(aws ssm get-command-invocation \
    --region "${AWS_REGION}" \
    --command-id "${command_id}" \
    --instance-id "${DEPLOY_INSTANCE_ID}" \
    --query 'Status' \
    --output text 2>/dev/null || true)"

  case "${command_status}" in
    Success)
      wait_status=0
      break
      ;;
    Failed|Cancelled|TimedOut|Cancelling)
      wait_status=1
      break
      ;;
  esac

  echo "SSM deploy command ${command_id} status=${command_status:-pending} (${attempt}/${max_attempts})"
  sleep "${wait_seconds}"
done

aws ssm get-command-invocation \
  --region "${AWS_REGION}" \
  --command-id "${command_id}" \
  --instance-id "${DEPLOY_INSTANCE_ID}" \
  --query '{Status:Status,StandardOutputContent:StandardOutputContent,StandardErrorContent:StandardErrorContent}' \
  --output json

exit "${wait_status}"
