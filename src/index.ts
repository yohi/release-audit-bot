import { notifyDiscord } from "./discord";
import { analyzeRelease, releaseContext } from "./gemini";
import { fetchCompare, fetchLatestFeedEntry, parseGitHubRepo } from "./github";
import { createSheetsClient, statusUpdate } from "./sheets";
import { EnvSchema } from "./schema";
import type { Env, Repo } from "./schema";

type RunResult = {
  readonly checked: number;
  readonly changed: number;
};

async function runAudit(env: Env): Promise<RunResult> {
  const sheets = createSheetsClient(env.SHEETS_API_URL);
  const repos = await sheets.listRepos();
  let changed = 0;
  for (const repo of repos) {
    try {
      const didChange = await processRepo(repo, env, sheets.updateRepo);
      changed += didChange ? 1 : 0;
    } catch (error) {
      const now = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      try {
        await sheets.updateRepo(statusUpdate(repo.rowId, "error", message, now, repo.lastReleaseTag, repo.lastReleaseTime, "", ""));
      } catch (updateError) {
        const updateMessage = updateError instanceof Error ? updateError.message : String(updateError);
        console.error(`Failed to persist error status for repo ${repo.rowId}: ${updateMessage}`);
      }
    }
  }
  return { checked: repos.length, changed };
}

async function processRepo(
  row: Repo,
  env: Env,
  updateRepo: (request: ReturnType<typeof statusUpdate>) => Promise<void>,
): Promise<boolean> {
  const now = new Date().toISOString();
  const repo = parseGitHubRepo(row.repoUrl);
  const latest = await fetchLatestFeedEntry(repo, row.feedType);
  if (latest === undefined) {
    await updateRepo(statusUpdate(row.rowId, "feed_empty", "", now, row.lastReleaseTag, row.lastReleaseTime));
    return false;
  }
  if (latest.tag === row.lastReleaseTag) {
    await updateRepo(statusUpdate(row.rowId, "unchanged", "", now, row.lastReleaseTag, row.lastReleaseTime));
    return false;
  }
  const isLocked = row.processingTag === latest.tag && row.lockUntil.length > 0 && new Date(row.lockUntil) > new Date(now);
  if (isLocked) {
    await updateRepo(statusUpdate(row.rowId, "skipped_processing", "", now, row.lastReleaseTag, row.lastReleaseTime, row.processingTag, row.lockUntil));
    return false;
  }
  if (row.lastReleaseTag.length === 0) {
    await updateRepo(statusUpdate(row.rowId, "initialized", "", now, latest.tag, latest.publishedAt, "", ""));
    return false;
  }
  const lockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await updateRepo(statusUpdate(row.rowId, "processing", "", now, row.lastReleaseTag, row.lastReleaseTime, latest.tag, lockUntil));
  try {
    const label = `${repo.owner}/${repo.name}`;
    const compare = await fetchCompare(repo, row.lastReleaseTag, latest.tag, env.GITHUB_TOKEN);
    const context = releaseContext(label, row.lastReleaseTag, latest.tag, compare);
    const analysis = await analyzeRelease(env.GEMINI_API_KEY, env.GEMINI_MODEL, Number(env.MAX_PATCH_CHARS), context);
    await notifyDiscord(env.DISCORD_WEBHOOK_URL, {
      repo: label,
      tag: latest.tag,
      analysis,
      compareUrl: compare.html_url,
    });
    await updateRepo(statusUpdate(row.rowId, "notified", "", now, latest.tag, latest.publishedAt, "", ""));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRepo(statusUpdate(row.rowId, "error", message, now, row.lastReleaseTag, row.lastReleaseTime, "", ""));
    throw error;
  }
}

export default {
  async scheduled(_controller: ScheduledController, rawEnv: unknown, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runAudit(EnvSchema.parse(rawEnv)));
  },
  async fetch(request: Request, rawEnv: unknown): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/run") {
      return Response.json({ ok: true, usage: "GET /run to execute once" });
    }
    const env = EnvSchema.parse(rawEnv);
    const authHeader = request.headers.get("Authorization");
    const expected = `Bearer ${env.RUN_SECRET}`;
    if (authHeader !== expected) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      const result = await runAudit(env);
      return Response.json({ ok: true, result });
    } catch (error) {
      if (error instanceof Error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      throw error;
    }
  },
};
