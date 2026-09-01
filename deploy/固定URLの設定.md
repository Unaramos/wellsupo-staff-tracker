# 固定URLで常に開く方法

## なぜ trycloudflare.com のURLは死ぬのか

`https://xxxx.trycloudflare.com` は **一時トンネル** です。

- Mac再起動・スリープ・cloudflared停止で **URLごと無効** になる
- 再起動のたびに **URLが変わる**
- 本番共有には向きません

---

## おすすめ: Render にデプロイ（24時間365日・URL固定）

**メリット:** Macを起動したままにしなくてよい / URLが変わらない / 無料枠あり

### 手順

1. **GitHub にコードを push**
   ```bash
   cd facility-staff-tracker
   git init
   git add .
   git commit -m "Initial commit"
   # GitHub でリポジトリ作成後
   git remote add origin https://github.com/あなたのID/wellsupo-staff-tracker.git
   git push -u origin main
   ```

2. **Render でデプロイ**
   - https://dashboard.render.com/ にログイン
   - **New → Blueprint**
   - 上記 GitHub リポジトリを選択（`render.yaml` を読み込む）
   - 環境変数を設定:
     - `SHARED_PASSWORD` = `5961`（編集者用）
     - `ADMIN_PASSWORD` = （管理者パスワード）
   - Deploy

3. **固定URLが発行される**
   - 例: `https://wellsupo-staff-tracker.onrender.com`
   - このURLは **変わりません**

4. **（任意）カスタムドメイン `ninaite.chomolungma.co.jp`**
   - Render ダッシュボード → Settings → Custom Domains → ドメイン追加
   - muumuu-domain で CNAME を Render の指示どおりに設定

### データについて

- 初回デプロイ時は `data.json` が無いので **初期サンプルデータ** で起動します
- 今の Mac 上のデータを引き継ぐ場合:
  1. Render の **Shell** を開く
  2. ローカルの `data.json` をアップロード（または Render Disk を有料で追加）

---

## 代替: 自宅Mac + 固定ドメイン（Cloudflare Tunnel）

Macを常時起動できる場合のみ。URLは `https://ninaite.chomolungma.co.jp` で固定。

### 手順

1. **Cloudflare にログイン（1回だけ）**
   ```bash
   cloudflared tunnel login
   ```

2. **セットアップスクリプト実行**
   ```bash
   cd facility-staff-tracker
   bash deploy/setup-tunnel.sh
   ```

3. **muumuu-domain で DNS 設定**
   - タイプ: CNAME
   - ホスト: `ninaite`
   - 値: `{トンネルID}.cfargotunnel.com`（スクリプト出力を参照）

4. **起動**
   ```bash
   npm start
   cloudflared tunnel --config deploy/config.yml run wellsupo-staff
   ```

Mac再起動後も自動起動したい場合は、LaunchAgent の設定を別途行ってください。

---

## 比較

| 方法 | URL | Mac不要 | 常時稼働 |
|------|-----|---------|----------|
| trycloudflare（現状） | 毎回変わる | ❌ Mac必須 | ❌ |
| Render デプロイ | 固定 | ✅ | ✅ |
| カスタムドメイン + Tunnel | 固定 | ❌ Mac必須 | △ Mac依存 |

**結論:** 共有用の「常に開くURL」が欲しいなら **Render デプロイ** が最も確実です。
