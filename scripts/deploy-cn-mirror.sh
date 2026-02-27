#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${HOME}/.config/longwei-site/deploy.env"
PROFILE="${ALIYUN_PROFILE:-cnoss}"
MIRROR_PREFIX="${MIRROR_PREFIX:-mythic-pets}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy-cn] Missing env file: $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

: "${ALIYUN_ACCESS_KEY_ID:?ALIYUN_ACCESS_KEY_ID is required in deploy.env}"
: "${ALIYUN_ACCESS_KEY_SECRET:?ALIYUN_ACCESS_KEY_SECRET is required in deploy.env}"
: "${OSS_BUCKET:?OSS_BUCKET is required in deploy.env}"
: "${OSS_REGION:?OSS_REGION is required in deploy.env}"

PRIMARY_DOMAIN="${MIRROR_DOMAIN:-${CDN_DOMAINS%%,*}}"

cd "$ROOT_DIR"

echo "[deploy-cn] Building static export for /${MIRROR_PREFIX} ..."
npm run build:cn

echo "[deploy-cn] Configuring aliyun profile: ${PROFILE}"
aliyun configure set \
  --profile "$PROFILE" \
  --mode AK \
  --region "$OSS_REGION" \
  --access-key-id "$ALIYUN_ACCESS_KEY_ID" \
  --access-key-secret "$ALIYUN_ACCESS_KEY_SECRET" >/dev/null

echo "[deploy-cn] Syncing out/ -> oss://${OSS_BUCKET}/${MIRROR_PREFIX}/"
aliyun --profile "$PROFILE" ossutil sync out/ "oss://${OSS_BUCKET}/${MIRROR_PREFIX}/" --delete --force --no-progress

if [[ -n "${PRIMARY_DOMAIN}" ]]; then
  echo "[deploy-cn] Trying CDN refresh for ${PRIMARY_DOMAIN}/${MIRROR_PREFIX}/"
  aliyun --profile "$PROFILE" cdn RefreshObjectCaches \
    --ObjectPath "https://${PRIMARY_DOMAIN}/${MIRROR_PREFIX}/" \
    --ObjectType Directory >/dev/null || true
  echo "[deploy-cn] Mirror URL: https://${PRIMARY_DOMAIN}/${MIRROR_PREFIX}/index.html"
else
  echo "[deploy-cn] Mirror URL: https://<your-domain>/${MIRROR_PREFIX}/index.html"
fi
