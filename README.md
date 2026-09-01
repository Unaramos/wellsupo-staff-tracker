# 【人員配置表】株式会社ウェルサポ様

事業所ごとの人員配置（日本人・EPA介護福祉士・在留資格「介護」・永住者等）を管理するWebアプリです。

## 機能

- **12事業所** — ウェルサポ様の就業場所を登録済み
- **4区分の人員管理** — 日本人（手入力）、EPA介護福祉士、在留資格「介護」、永住者・配偶者等
- **ドラッグ&ドロップ** — 外国人人材の事業所間移動
- **アラート** — 外国人合計 > 日本人 で警告
- **権限管理** — 閲覧者 / 編集者 / 管理者
- **編集履歴** — 誰がいつ何を変更したか記録
- **CSV出力**

## 起動方法

```bash
cd facility-staff-tracker
npm install
npm start
```

→ http://localhost:3000 を開く

## デモアカウント

| 権限 | ユーザー名 | パスワード |
|------|-----------|-----------|
| 管理者 | admin | admin123 |
| 編集者 | editor | editor123 |
| 閲覧者 | viewer | viewer123 |

## 権限の違い

| 操作 | 閲覧者 | 編集者 | 管理者 |
|------|--------|--------|--------|
| 表の閲覧 | ✅ | ✅ | ✅ |
| 編集履歴の閲覧 | ✅ | ✅ | ✅ |
| 人数変更・D&D | ❌ | ✅ | ✅ |
| ユーザー管理 | ❌ | ❌ | ✅ |

## 公開方法（固定URL）

`trycloudflare.com` のURLは **一時的** で、Mac停止・再起動で無効になります。

**常に同じURLで開きたい場合** → [deploy/固定URLの設定.md](deploy/固定URLの設定.md) を参照。

| 方法 | URL例 | おすすめ |
|------|-------|----------|
| **Render デプロイ** | `https://wellsupo-staff-tracker.onrender.com` | ✅ 最も確実（Mac不要） |
| カスタムドメイン + Tunnel | `https://ninaite.chomolungma.co.jp` | Mac常時起動が必要 |
| quick tunnel | `https://xxxx.trycloudflare.com` | 一時確認用のみ |

```bash
# Render 用環境変数（本番では必ず設定）
SESSION_SECRET=ランダムな長い文字列
SHARED_PASSWORD=5961
ADMIN_PASSWORD=（管理者パスワード）
ADMIN_NAME=ナリカワ
```

## データ

JSON ファイル（`data.json`）に保存されます。バックアップは `data.json` をコピーしてください。
