import { CompareResponseSchema } from "./schema";
import type { CompareResponse, FeedType } from "./schema";
import { requestJson, requestText } from "./http";

export type GitHubRepo = {
  readonly owner: string;
  readonly name: string;
};

export type FeedEntry = {
  readonly tag: string;
  readonly publishedAt: string;
  readonly url: string;
};

export function parseGitHubRepo(repoUrl: string): GitHubRepo {
  const url = new URL(repoUrl);
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  const owner = segments[0];
  const name = segments[1];
  if (url.hostname !== "github.com" || owner === undefined || name === undefined) {
    throw new Error(`Unsupported GitHub repository URL: ${repoUrl}`);
  }
  return { owner, name: name.replace(/\.git$/, "") };
}

export async function fetchLatestFeedEntry(repo: GitHubRepo, feedType: FeedType): Promise<FeedEntry | undefined> {
  const feedUrl = `https://github.com/${repo.owner}/${repo.name}/${feedType}.atom`;
  const xml = await requestText(feedUrl, { headers: { "User-Agent": "release-audit-discord-bot" } });
  const entry = xml.match(/<entry>[\s\S]*?<\/entry>/)?.[0];
  if (entry === undefined) {
    return undefined;
  }
  const title = extractXml(entry, "title");
  const updated = extractXml(entry, "updated");
  const link = entry.match(/<link[^>]+href="([^"]+)"/)?.[1] ?? feedUrl;
  if (title === undefined || updated === undefined) {
    return undefined;
  }
  return { tag: normalizeTagTitle(title), publishedAt: updated, url: decodeXml(link) };
}

export async function fetchCompare(
  repo: GitHubRepo,
  baseTag: string,
  headTag: string,
  githubToken: string,
): Promise<CompareResponse> {
  const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/compare/${encodeURIComponent(baseTag)}...${encodeURIComponent(headTag)}`;
  return requestJson(
    url,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "User-Agent": "release-audit-discord-bot",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
    CompareResponseSchema,
  );
}

function extractXml(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`));
  const value = match?.[1];
  return value === undefined ? undefined : decodeXml(value.trim());
}

function normalizeTagTitle(title: string): string {
  return title.replace(/^Release\s+/i, "").trim();
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}
