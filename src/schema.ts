import { z } from "zod";

export const FeedTypeSchema = z.union([z.literal("releases"), z.literal("tags")]);

export const RepoSchema = z.object({
  rowId: z.string().min(1),
  repoUrl: z.string().url(),
  enabled: z.boolean(),
  feedType: FeedTypeSchema,
  lastReleaseTag: z.string(),
  lastReleaseTime: z.string(),
});

export const ReposResponseSchema = z.object({
  repos: z.array(RepoSchema),
});

export const UpdateRequestSchema = z.object({
  rowId: z.string().min(1),
  lastReleaseTag: z.string(),
  lastReleaseTime: z.string(),
  lastCheckedAt: z.string(),
  lastStatus: z.string(),
  lastError: z.string(),
  processingTag: z.string(),
  lockUntil: z.string(),
});

export const CompareFileSchema = z.object({
  filename: z.string(),
  status: z.string(),
  additions: z.number(),
  deletions: z.number(),
  changes: z.number(),
  patch: z.string().optional(),
});

export const CompareResponseSchema = z.object({
  html_url: z.string().url(),
  total_commits: z.number(),
  files: z.array(CompareFileSchema).optional(),
});

export const GeminiResponseSchema = z.object({
  candidates: z.array(
    z.object({
      content: z.object({
        parts: z.array(z.object({ text: z.string().optional() })),
      }),
    }),
  ),
});

export const EnvSchema = z.object({
  SHEETS_API_URL: z.string().url(),
  DISCORD_WEBHOOK_URL: z.string().url(),
  GEMINI_API_KEY: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  GEMINI_MODEL: z.string().min(1),
  MAX_PATCH_CHARS: z.string().regex(/^\d+$/),
});

export type Repo = z.infer<typeof RepoSchema>;
export type FeedType = z.infer<typeof FeedTypeSchema>;
export type UpdateRequest = z.infer<typeof UpdateRequestSchema>;
export type CompareFile = z.infer<typeof CompareFileSchema>;
export type CompareResponse = z.infer<typeof CompareResponseSchema>;
export type Env = z.infer<typeof EnvSchema>;
