#!/bin/bash
# chomolungma.co.jp カスタムドメイン設定スクリプト
# 使用前: cloudflared tunnel login （ブラウザでCloudflare認証）

set -e
HOSTNAME="ninaite.chomolungma.co.jp"
TUNNEL_NAME="wellsupo-staff"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== 人員配置表 Cloudflare Tunnel セットアップ ==="
echo "ホスト名: $HOSTNAME"
echo ""

if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
  echo "❌ Cloudflare に未ログインです。先に以下を実行してください:"
  echo "   cloudflared tunnel login"
  echo ""
  echo "   → ブラウザが開くので chomolungma.co.jp を管理する Cloudflare アカウントでログイン"
  exit 1
fi

echo "1. トンネル作成..."
cloudflared tunnel list | grep -q "$TUNNEL_NAME" || cloudflared tunnel create "$TUNNEL_NAME"

echo "2. DNS ルート設定（Cloudflare 管理下の場合）..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>/dev/null || echo "   ※ DNS は muumuu-domain 側で CNAME 設定が必要な場合があります"

TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
echo ""
echo "=== セットアップ情報 ==="
echo "トンネル ID: $TUNNEL_ID"
echo "CNAME 先: ${TUNNEL_ID}.cfargotunnel.com"
echo ""
echo "【muumuu-domain での DNS 設定】"
echo "  タイプ: CNAME"
echo "  ホスト: ninaite"
echo "  値:     ${TUNNEL_ID}.cfargotunnel.com"
echo ""
echo "3. 起動:"
echo "   cd $PROJECT_DIR && node server.js &"
echo "   cloudflared tunnel --config $PROJECT_DIR/deploy/config.yml run $TUNNEL_NAME"
