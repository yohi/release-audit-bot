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

## 環境構築とデプロイ (自動化スクリプト)

本プロジェクトには、Google Apps Script (GAS) のデプロイ、URL自動検出、および Cloudflare Workers Secrets の登録を一括で行う自動化セットアップスクリプトが用意されています。

### 1. 事前準備
1. [Google Apps Script ユーザー設定](https://script.google.com/home/usersettings) にアクセスし、**「Google Apps Script API」** を **「オン」** にします。
2. スプレッドシート（シート名: `repos`）を用意し、ヘッダー行を記述しておきます。
3. スプレッドシートの「拡張機能」>「Apps Script」を開き、設定（歯車マーク）から **Script ID** をコピーします。

### 2. セットアップスクリプトの実行
プロジェクトルートで以下を実行します。

```bash
pnpm run setup
```

対話プロンプトに従って **Script ID** や API キー、Discord Webhook などの設定値を入力すると、以下の処理が自動で行われます：
* Google アカウントへのログイン (`clasp login`)
* GAS コードのプッシュとウェブアプリとしてのデプロイ (`clasp push`, `clasp deploy`)
* 生成された Web App URL に安全な認証キー（記号なし）を結合した `SHEETS_API_URL` の自動組み立て
* `.env` および `.dev.vars` (ローカル開発用) の生成と `.gitignore` への自動登録
* Cloudflare Workers 本番環境へのシークレットの一括自動デプロイ

一度設定した値は `.env` に保存されるため、2回目以降の実行時は Enter を押すだけで値を維持できます。

### 3. Workers のデプロイ
シークレットが登録されたら、Worker 本体をデプロイします。

```bash
pnpm run deploy
```

---

## 構成と環境変数

`wrangler.jsonc` では、Gemini API 無料枠で最もクォータ制限の緩いモデルとして **`gemini-3.1-flash-lite`** (RPM: 15, RPD: 500) をデフォルト指定しています。

### Cloudflare Worker secrets (pnpm run setup で一括設定可能)

以下を登録する必要があります。

```text
SHEETS_API_URL        - ?secret=KEY を含んだ GAS の Web App URL
DISCORD_WEBHOOK_URL   - 通知先の Discord Webhook URL
GEMINI_API_KEY        - Google AI Studio で発行した Gemini API キー
GITHUB_TOKEN          - GitHub の Personal Access Token (レート制限回避用)
RUN_SECRET            - 手動実行エンドポイント (/run) 用の任意のパスワードキー
```

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

起動後、`/run` にアクセスすると Cron 相当の処理を 1 回実行します。

手動実行時は `Authorization: Bearer <RUN_SECRET>` ヘッダーが必要です。例:

```bash
curl -H "Authorization: Bearer $RUN_SECRET" "https://<worker-host>/run"
```
