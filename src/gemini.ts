import { GeminiResponseSchema } from "./schema";
import type { CompareFile, CompareResponse } from "./schema";
import { requestJson } from "./http";

export type ReleaseContext = {
  readonly repo: string;
  readonly previousTag: string;
  readonly currentTag: string;
  readonly compareUrl: string;
  readonly totalCommits: number;
  readonly files: readonly CompareFile[];
};

export async function analyzeRelease(
  apiKey: string,
  model: string,
  maxPatchChars: number,
  context: ReleaseContext,
): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await requestJson(
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(context, maxPatchChars) }] }],
      }),
    },
    GeminiResponseSchema,
  );
  const text = response.candidates[0]?.content.parts.map((part) => part.text ?? "").join("\n").trim();
  if (text === undefined || text.length === 0) {
    throw new Error("Gemini returned no analysis text");
  }
  return text;
}

export function releaseContext(repoLabel: string, previousTag: string, currentTag: string, compare: CompareResponse): ReleaseContext {
  return {
    repo: repoLabel,
    previousTag,
    currentTag,
    compareUrl: compare.html_url,
    totalCommits: compare.total_commits,
    files: compare.files ?? [],
  };
}

function buildPrompt(context: ReleaseContext, maxPatchChars: number): string {
  const fileSummary = context.files
    .map((file) => `- ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})\n${file.patch ?? ""}`)
    .join("\n\n")
    .slice(0, maxPatchChars);

  return `あなたはOSSリリース監査担当です。CHANGELOGではなく、以下のGitHub compare差分からリリース更新を分析してください。\n\n対象: ${context.repo}\n範囲: ${context.previousTag} -> ${context.currentTag}\nCompare: ${context.compareUrl}\nコミット数: ${context.totalCommits}\n\n出力形式:\n1. 重要度: Low / Medium / High / Critical\n2. 変更概要\n3. 影響範囲\n4. セキュリティ影響\n5. 破壊的変更の可能性\n6. 依存関係・CI/CD・設定変更\n7. 監査者が確認すべきファイル\n8. Discord向け短文要約\n\n差分:\n${fileSummary}`;
}
