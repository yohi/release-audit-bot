# release-audit-bot

Google Sheets の監査対象リポジトリ一覧を Cloudflare Workers Cron が読み取り、GitHub の RSS で新しい release/tag を検知し、GitHub compare API の差分を Gemini API に分析させて Discord Webhook に通知する MVP です。

## 構成

```text
Google Sheets
  -> Google Apps Script Web App
  -> Cloudflare Workers Cron
  -> GitHub releases.atom / tags.atom
  -> GitHub compare API
  -> Gemini API Free Tier
  -> Discord Webhook
```

## Google Sheets

シート名は `repos` にしてください。ヘッダー行は以下です。

```text
repo_url,enabled,feed_type,last_release_tag,last_release_time,last_checked_at,last_status,last_error,processing_tag,lock_until
```

`feed_type` は `releases` または `tags` です。初回実行時は `last_release_tag` が空の場合、最新タグを記録するだけで通知しません。

## Apps Script

`apps-script/Code.gs` をスプレッドシートに紐づく Apps Script に貼り付け、スクリプトプロパティに `RELEASE_AUDIT_SECRET` を設定してください。

Web App としてデプロイし、Cloudflare Worker の `SHEETS_API_URL` には次の形で設定します。

```text
https://script.google.com/macros/s/.../exec?secret=YOUR_SECRET
```

## Cloudflare Worker secrets

以下を `wrangler secret put` で設定してください。

```text
SHEETS_API_URL
DISCORD_WEBHOOK_URL
GEMINI_API_KEY
GITHUB_TOKEN
```

`SHEETS_API_URL` には Apps Script の `secret` クエリを含めます。`GITHUB_TOKEN` は必須です（public repo でも GitHub API のレート制限緩和に必要です）。

## 実行

```bash
pnpm install
pnpm check
pnpm dry-run
pnpm deploy
```

ローカル確認時は次を使えます。

```bash
pnpm dev
```

起動後、`/run` にアクセスするとCron相当の処理を1回実行します。
