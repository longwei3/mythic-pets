#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function maskSecret(value) {
  if (!value) {
    return '(empty)';
  }
  if (value.length <= 12) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

async function requestJson(url, headers) {
  const response = await fetch(url, { headers });
  let body = '';
  try {
    body = await response.text();
  } catch {
    body = '';
  }

  let json;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    json,
    body,
  };
}

async function main() {
  const cwd = process.cwd();
  loadDotEnvFile(path.join(cwd, '.env.local'));

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key =
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  console.log('Cloud backup diagnostic');
  console.log(`- URL: ${url || '(missing)'}`);
  console.log(`- Key: ${maskSecret(key)}`);

  if (!url || !key) {
    console.log('\nResult: FAIL');
    console.log('- Missing NEXT_PUBLIC_SUPABASE_URL or key');
    console.log('- Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (preferred) in .env.local');
    process.exit(1);
  }

  const authHeaders = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  try {
    const settings = await requestJson(`${url}/auth/v1/settings`, { apikey: key });
    if (!settings.ok) {
      console.log('\nResult: FAIL');
      console.log(`- Auth API check failed: HTTP ${settings.status}`);
      if (settings.status === 401) {
        console.log('- Key looks invalid for this Supabase project');
      }
      if (settings.body) {
        console.log(`- Response: ${settings.body.slice(0, 240)}`);
      }
      process.exit(1);
    }

    const tableCheck = await requestJson(`${url}/rest/v1/game_state?select=key&limit=1`, authHeaders);

    if (tableCheck.ok) {
      console.log('\nResult: OK');
      console.log('- Supabase key is valid');
      console.log('- game_state table is reachable');
      process.exit(0);
    }

    console.log('\nResult: FAIL');
    console.log(`- game_state check failed: HTTP ${tableCheck.status}`);

    if (tableCheck.status === 401) {
      console.log('- Key is not accepted by REST API');
    } else if (tableCheck.status === 404) {
      console.log('- Table may be missing. Run supabase-schema.sql in SQL Editor');
    } else if (tableCheck.status === 400 || tableCheck.status === 403) {
      console.log('- Table exists but policy/permission blocks access (check RLS policy)');
    }

    if (tableCheck.body) {
      console.log(`- Response: ${tableCheck.body.slice(0, 240)}`);
    }

    process.exit(1);
  } catch (error) {
    console.log('\nResult: FAIL');
    console.log(`- Network or runtime error: ${String(error)}`);
    process.exit(1);
  }
}

await main();
