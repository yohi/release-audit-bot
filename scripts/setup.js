import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import readline from 'node:readline';

const ENV_FILE = '.env';
const DEV_VARS_FILE = '.dev.vars';
const GITIGNORE_FILE = '.gitignore';
const CLASP_JSON_FILE = '.clasp.json';

const SECRET_KEYS = [
  'SHEETS_API_URL',
  'DISCORD_WEBHOOK_URL',
  'GEMINI_API_KEY',
  'GITHUB_TOKEN',
  'RUN_SECRET'
];

// readline インタフェースをグローバルで1つだけ作成して使い回す
let rl;

async function main() {
  console.log('=== Release Audit Bot 環境構築セットアップ (with clasp) ===\n');

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // 1. 依存関係とログインの確認
    ensureGitignore();
    await ensureClaspInstalled();
    await ensureClaspLogin();

    // 2. .clasp.json の確認と GAS プロジェクトの紐付け
    await ensureClaspConfig();

    // 3. 既存の .env を読み込み
    const currentEnv = readEnv();

    // 4. GAS 側のパスワード (RELEASE_AUDIT_SECRET) の設定/取得
    let gasSecret = currentEnv.RUN_SECRET || ''; // デフォルトで RUN_SECRET と同じか、新規生成
    if (!gasSecret) {
      gasSecret = generateRandomPassword();
    }
    
    console.log(`\n🔑 GAS用の認証キー (RELEASE_AUDIT_SECRET) に設定する値: ${gasSecret}`);
    console.log('⚠️  GAS の「スクリプトプロパティ」に RELEASE_AUDIT_SECRET という名前で上記キーを手動設定してください。');
    console.log('※ GAS 側の設定画面 (歯車マーク) から設定できます。\n');

    // 5. GAS へのコードプッシュとデプロイ
    const webAppUrl = await deployAppsScript(gasSecret);
    if (webAppUrl) {
      currentEnv.SHEETS_API_URL = webAppUrl;
      console.log(`✨ SHEETS_API_URL を自動設定しました: ${webAppUrl}`);
    }

    // 6. 対話式で残りのシークレットを入力
    const updatedEnv = await promptSecrets(currentEnv);

    // 7. ファイル保存
    saveEnv(updatedEnv);
    saveDevVars(updatedEnv);

    // 8. Cloudflare Workers への一括登録
    const register = await askYesNo('\nCloudflare Workers に本番シークレットを一括登録しますか？ (y/n): ');
    if (register) {
      await deploySecrets(updatedEnv);
    }

    console.log('\n🎉 すべてのセットアップが完了しました！');
  } finally {
    rl.close();
  }
}

function ensureGitignore() {
  if (!fs.existsSync(GITIGNORE_FILE)) {
    fs.writeFileSync(GITIGNORE_FILE, '');
  }
  let content = fs.readFileSync(GITIGNORE_FILE, 'utf8');
  let modified = false;

  const filesToIgnore = ['.env', '.dev.vars', '.clasp.json'];
  filesToIgnore.forEach(file => {
    if (!content.includes(file)) {
      content += `\n# Secrets & Config\n${file}\n`;
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(GITIGNORE_FILE, content.trim() + '\n');
    console.log('📝 .gitignore に必要な設定を追加しました。');
  }
}

async function ensureClaspInstalled() {
  try {
    execSync('npx clasp -v', { stdio: 'ignore' });
  } catch (e) {
    console.log('📦 @google/clasp をインストールしています...');
    execSync('pnpm add -D @google/clasp', { stdio: 'inherit' });
  }
}

async function ensureClaspLogin() {
  console.log('🔍 Google clasp のログイン状態を確認しています...');
  try {
    execSync('npx clasp deployments', { stdio: 'ignore' });
    console.log('✅ clasp はログイン済みです。');
  } catch (e) {
    console.log('🔑 Google アカウントへのログインが必要です。ブラウザが開きます。');
    execSync('npx clasp login', { stdio: 'inherit' });
  }
}

async function ensureClaspConfig() {
  if (fs.existsSync(CLASP_JSON_FILE)) {
    console.log('✅ .clasp.json は既に存在します。');
    return;
  }

  console.log('\n--- Google Apps Script (GAS) の紐付け ---');
  console.log('※ スプレッドシートの「拡張機能」>「Apps Script」画面の URL、または「プロジェクトの設定 (歯車)」から Script ID をコピーしてください。');
  
  const scriptId = await new Promise(resolve => {
    rl.question('📝 GAS の Script ID を入力してください: ', answer => {
      resolve(answer.trim());
    });
  });

  if (!scriptId) {
    console.error('❌ Script ID が入力されなかったため、処理を中断します。');
    process.exit(1);
  }

  const config = {
    scriptId: scriptId,
    rootDir: 'apps-script'
  };

  fs.writeFileSync(CLASP_JSON_FILE, JSON.stringify(config, null, 2) + '\n');
  console.log('💾 .clasp.json を保存しました。');
}

async function deployAppsScript(secretKey) {
  const proceed = await askYesNo('\nGAS のコードを Google 側にプッシュし、ウェブアプリとしてデプロイしますか？ (y/n): ');
  if (!proceed) return null;

  try {
    console.log('📤 コードを Google Apps Script にプッシュ中...');
    execSync('npx clasp push', { stdio: 'inherit' });

    console.log('🚀 ウェブアプリとしてデプロイ中...');
    const output = execSync('npx clasp deploy', { encoding: 'utf8' });
    console.log(output);

    const match = output.match(/https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec/);
    if (match) {
      const url = match[0];
      return `${url}?secret=${secretKey}`;
    }
  } catch (e) {
    console.error('❌ GAS のデプロイ中にエラーが発生しました:', e.message);
    console.log('※ Google Apps Script の設定で「Google Apps Script API」がオンになっているか確認してください。\nhttps://script.google.com/home/usersettings');
  }
  return null;
}

function generateRandomPassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pass = '';
  for (let i = 0; i < 16; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

function readEnv() {
  const env = {};
  if (fs.existsSync(ENV_FILE)) {
    const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        env[match[1]] = value;
      }
    }
  }
  return env;
}

async function promptSecrets(currentEnv) {
  const env = { ...currentEnv };

  for (const key of SECRET_KEYS) {
    if (key === 'SHEETS_API_URL' && env[key]) {
      const keep = await askYesNo(`🔗 自動検出された SHEETS_API_URL を使用しますか？\nURL: ${env[key]}\n(y/n): `);
      if (keep) continue;
    }

    const currentValue = env[key] || '';
    const displayValue = currentValue ? `[設定済み: ${currentValue.slice(0, 15)}...]` : '[未設定]';
    
    const answer = await new Promise(resolve => {
      rl.question(`🔑 ${key} を入力してください ${displayValue}\n(変更しない場合はそのまま Enter): `, resolve);
    });

    if (answer.trim() !== '') {
      env[key] = answer.trim();
    }
  }

  return env;
}

function saveEnv(env) {
  const lines = Object.entries(env).map(([key, val]) => `${key}="${val}"`);
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n');
  console.log(`💾 ${ENV_FILE} を保存しました。`);
}

function saveDevVars(env) {
  const lines = Object.entries(env).map(([key, val]) => `${key}="${val}"`);
  fs.writeFileSync(DEV_VARS_FILE, lines.join('\n') + '\n');
  console.log(`💾 ${DEV_VARS_FILE} (ローカル開発用) を保存しました。`);
}

function askYesNo(query) {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

async function deploySecrets(env) {
  console.log('\n🚀 Cloudflare Workers へシークレットを登録中...');

  for (const key of SECRET_KEYS) {
    const value = env[key];
    if (!value) {
      console.log(`⚠️ ${key} が未設定のためスキップします。`);
      continue;
    }

    console.log(`📤 ${key} を送信中...`);
    await new Promise((resolve, reject) => {
      const child = spawn('npx', ['wrangler', 'secret', 'put', key], {
        stdio: ['pipe', 'inherit', 'inherit']
      });

      child.stdin.write(value + '\n');
      child.stdin.end();

      child.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to put secret: ${key}`));
        }
      });
    });
  }
}

main().catch(err => {
  console.error('Error during setup:', err);
});
