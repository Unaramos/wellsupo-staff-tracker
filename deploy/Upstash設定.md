# Render 無料プランでデータを消さない設定

Render の無料プランは **サーバー内のファイル（data.json）が消えます**。
代わりに **Upstash Redis（無料）** にデータを保存します。

## 手順（5分）

### 1. Upstash アカウント作成

1. https://upstash.com/ を開く
2. **Sign Up**（GitHub ログイン可）
3. **Create Database** をクリック
4. 設定:
   - Name: `wellsupo-staff`
   - Type: **Regional**
   - Region: **ap-northeast-1（Tokyo）** を選ぶ
5. **Create**

### 2. 接続情報をコピー

データベース画面の **REST API** タブから:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

をコピー

### 3. Render に環境変数を追加

Render ダッシュボード → `wellsupo-staff-tracker` → **Environment**:

| Key | Value |
|-----|-------|
| `UPSTASH_REDIS_REST_URL` | Upstash からコピー |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash からコピー |

**Save Changes** → 自動で再デプロイ

### 4. 動作確認

デプロイ完了後、ログに以下が出ればOK:

```
データ保存: Upstash Redis（永続）
```

---

## 無料枠について

Upstash Redis 無料枠:

- **500,000 コマンド/月**（このアプリなら十分）
- **256 MB ストレージ**（人員配置データなら余裕）
- **クレジットカード不要**

Render 無料プランのスリープ（起動に30秒）は残りますが、**データは消えません**。

---

## ローカルの data.json を引き継ぎたい場合

Mac 上の `data.json` に最新データがある場合:

1. Upstash 設定完了・再デプロイ後
2. アプリで一度編集して保存 → Redis にデータが入る
3. または今後ローカルで編集した内容を手動で再入力

（一括インポート機能が必要なら別途対応可能です）
