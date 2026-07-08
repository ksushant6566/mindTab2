import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { APIRequestContext, Browser } from "@playwright/test";

const repoRoot = resolve(import.meta.dirname, "../../../..");
const fixedPasswordHash = "$2a$12$12BIRBlHUSKojmqizr76RexUjiG1FDjArIhyKwSqBZoR4.KYllDrC";
const seededE2EUsers = new Set<string>();
const e2eAccessTokens = new Map<string, string>();

type EnvMap = Record<string, string>;

export type E2EAccount = {
  email: string;
  password: string;
  name: string;
};

export function getE2EApiURL() {
  return getEnv("MINDTAB_E2E_API_URL", "http://localhost:8081");
}

export function getE2EAccount(): E2EAccount {
  return {
    email: getEnv("MINDTAB_E2E_EMAIL", "mindtab-e2e-web@mindtab.local"),
    password: getEnv("MINDTAB_E2E_PASSWORD", "MindTabE2E!2026"),
    name: getEnv("MINDTAB_E2E_NAME", "MindTab E2E"),
  };
}

export async function createAuthenticatedPage(browser: Browser, request: APIRequestContext) {
  const account = getE2EAccount();
  const apiURL = getE2EApiURL();
  await seedE2EUser(account, {
    userId: "mindtab-e2e-web-user",
    onboardingCompleted: true,
    seedWorkspace: true,
  });

  const context = await browser.newContext({ timezoneId: "Asia/Kolkata" });
  const accessToken = e2eAccessTokens.get(account.email) ?? await signinE2EAccount(request, apiURL, account);
  await context.route("**/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accessToken }),
    });
  });

  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-07-08T04:27:00+05:30"));
  return { context, page, account };
}

export async function createOnboardingPage(browser: Browser, request: APIRequestContext) {
  const baseAccount = getE2EAccount();
  const account = {
    email: getEnv("MINDTAB_E2E_ONBOARDING_EMAIL", "mindtab-e2e-onboarding@mindtab.local"),
    password: baseAccount.password,
    name: getEnv("MINDTAB_E2E_ONBOARDING_NAME", "MindTab Onboarding"),
  };
  const apiURL = getE2EApiURL();
  await seedE2EUser(account, {
    userId: "mindtab-e2e-onboarding-user",
    onboardingCompleted: false,
    seedWorkspace: false,
  });

  const context = await browser.newContext({ timezoneId: "Asia/Kolkata" });
  const accessToken = e2eAccessTokens.get(account.email) ?? await signinE2EAccount(request, apiURL, account);
  await context.route("**/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accessToken }),
    });
  });

  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-07-08T04:27:00+05:30"));
  return { context, page, account };
}

async function signinE2EAccount(request: APIRequestContext, apiURL: string, account: E2EAccount) {
  const signin = await request.post(`${apiURL}/auth/email/signin`, {
    data: {
      email: account.email,
      password: account.password,
    },
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!signin.ok()) {
    throw new Error(`E2E email sign in failed with ${signin.status()}: ${await signin.text()}`);
  }

  const session = await signin.json() as { accessToken: string };
  e2eAccessTokens.set(account.email, session.accessToken);
  return session.accessToken;
}

function seedE2EUser(
  account: E2EAccount,
  options: { userId: string; onboardingCompleted: boolean; seedWorkspace: boolean }
) {
  if (seededE2EUsers.has(account.email)) return;

  const databaseURL = getEnv("MINDTAB_E2E_DATABASE_URL", getEnv("DATABASE_URL", ""));
  if (!databaseURL) {
    throw new Error("Set MINDTAB_E2E_DATABASE_URL or DATABASE_URL for authenticated e2e tests.");
  }

  const email = sqlLiteral(account.email);
  const name = sqlLiteral(account.name);
  const passwordHash = sqlLiteral(fixedPasswordHash);
  const userId = sqlLiteral(options.userId);
  const onboardingCompleted = options.onboardingCompleted ? "true" : "false";

  const sql = `
INSERT INTO users (id, name, email, email_verified, onboarding_completed, password_hash, updated_at)
VALUES (${userId}, ${name}, ${email}, CURRENT_TIMESTAMP, ${onboardingCompleted}, ${passwordHash}, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  email_verified = CURRENT_TIMESTAMP,
  onboarding_completed = EXCLUDED.onboarding_completed,
  password_hash = EXCLUDED.password_hash,
  updated_at = CURRENT_TIMESTAMP;

${options.seedWorkspace ? `
INSERT INTO projects (id, name, description, status, start_date, created_by, last_updated_by, updated_at)
VALUES (
  '00000000-0000-4000-8000-000000000101',
  'E2E Launch Plan',
  'Seeded project for Playwright workstation visual checks.',
  'active',
  CURRENT_DATE,
  (SELECT id FROM users WHERE email = ${email}),
  (SELECT id FROM users WHERE email = ${email}),
  CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = CURRENT_TIMESTAMP,
  deleted_at = NULL;

INSERT INTO tasks (id, title, description, status, priority, impact, position, user_id, project_id, completed_at, updated_at)
VALUES
  (
    '00000000-0000-4000-8000-000000000201',
    'Review workstation sidebar',
    'Confirm project navigation, pinned projects, and chat sections stay visually stable.',
    'in_progress',
    'priority_1',
    'high',
    1,
    (SELECT id FROM users WHERE email = ${email}),
    '00000000-0000-4000-8000-000000000101',
    NULL,
    CURRENT_TIMESTAMP
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    'Prepare appearance presets',
    'Check typography tokens, semantic colors, and visual density in settings.',
    'pending',
    'priority_2',
    'medium',
    2,
    (SELECT id FROM users WHERE email = ${email}),
    '00000000-0000-4000-8000-000000000101',
    NULL,
    CURRENT_TIMESTAMP
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  impact = EXCLUDED.impact,
  position = EXCLUDED.position,
  user_id = EXCLUDED.user_id,
  project_id = EXCLUDED.project_id,
  deleted_at = NULL,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO notes (id, title, content, source, type, user_id, project_id, updated_at)
VALUES (
  '00000000-0000-4000-8000-000000000301',
  'Workstation audit notes',
  '<p>Visual baseline for task cards, sidebar density, calendar surfaces, chat, and vault.</p>',
  'mindtab',
  'article',
  (SELECT id FROM users WHERE email = ${email}),
  '00000000-0000-4000-8000-000000000101',
  CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  source = EXCLUDED.source,
  type = EXCLUDED.type,
  user_id = EXCLUDED.user_id,
  project_id = EXCLUDED.project_id,
  deleted_at = NULL,
  archived_at = NULL,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO conversations (id, user_id, title, updated_at, deleted_at)
VALUES (
  '00000000-0000-4000-8000-000000000401',
  (SELECT id FROM users WHERE email = ${email}),
  'E2E workstation chat',
  CURRENT_TIMESTAMP,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  title = EXCLUDED.title,
  updated_at = CURRENT_TIMESTAMP,
  deleted_at = NULL;

INSERT INTO messages (id, conversation_id, role, content, created_at)
VALUES
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000401', 'user', 'Summarize the current workstation redesign status.', CURRENT_TIMESTAMP - INTERVAL '2 minutes'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000401', 'assistant', 'Sidebar, settings, typography tokens, and visual e2e coverage are being hardened.', CURRENT_TIMESTAMP - INTERVAL '1 minute')
ON CONFLICT (id) DO UPDATE SET
  conversation_id = EXCLUDED.conversation_id,
  role = EXCLUDED.role,
  content = EXCLUDED.content,
  created_at = EXCLUDED.created_at;

INSERT INTO content (
  id,
  user_id,
  source_url,
  source_type,
  source_title,
  extracted_text,
  summary,
  tags,
  key_topics,
  processing_status,
  commit_status,
  updated_at,
  deleted_at
)
VALUES (
  '00000000-0000-4000-8000-000000000501',
  (SELECT id FROM users WHERE email = ${email}),
  'https://example.com/mindtab-e2e',
  'website',
  'MindTab visual baseline',
  'Seeded saved item for Playwright visual coverage.',
  'A compact saved reference used to verify the vault web UI.',
  ARRAY['e2e', 'visual'],
  ARRAY['Playwright', 'UI architecture'],
  'completed',
  'committed',
  CURRENT_TIMESTAMP,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  source_url = EXCLUDED.source_url,
  source_type = EXCLUDED.source_type,
  source_title = EXCLUDED.source_title,
  extracted_text = EXCLUDED.extracted_text,
  summary = EXCLUDED.summary,
  tags = EXCLUDED.tags,
  key_topics = EXCLUDED.key_topics,
  processing_status = EXCLUDED.processing_status,
  commit_status = EXCLUDED.commit_status,
  updated_at = CURRENT_TIMESTAMP,
  deleted_at = NULL;
` : ""}
`;

  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      execFileSync("psql", [
        databaseURL,
        "--quiet",
        "--no-psqlrc",
        "--command",
        sql,
      ], {
        stdio: "pipe",
        env: process.env,
      });
      seededE2EUsers.add(account.email);
      return;
    } catch (error) {
      lastError = error && typeof error === "object" && "stderr" in error
        ? String(error.stderr).trim()
        : "";
      sleep(750 * attempt);
    }
  }

  throw new Error(`Failed to seed authenticated e2e user.${lastError ? ` psql: ${lastError}` : ""}`);
}

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function getEnv(key: string, fallback: string) {
  return process.env[key] || loadLocalEnv()[key] || fallback;
}

let localEnv: EnvMap | null = null;

function loadLocalEnv() {
  if (localEnv) return localEnv;
  localEnv = {
    ...readEnvFile(resolve(repoRoot, "server/.env")),
    ...readEnvFile(resolve(repoRoot, "apps/web/.env")),
    ...readEnvFile(resolve(repoRoot, ".env")),
  };
  return localEnv;
}

function readEnvFile(path: string): EnvMap {
  if (!existsSync(path)) return {};
  const env: EnvMap = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}
