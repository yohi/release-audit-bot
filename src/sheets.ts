import { ReposResponseSchema, UpdateRequestSchema } from "./schema";
import type { Repo, UpdateRequest } from "./schema";
import { requestJson } from "./http";

export type SheetsClient = {
  readonly listRepos: () => Promise<readonly Repo[]>;
  readonly updateRepo: (request: UpdateRequest) => Promise<void>;
};

export function createSheetsClient(apiUrl: string): SheetsClient {
  return {
    async listRepos(): Promise<readonly Repo[]> {
      const response = await requestJson(
        actionUrl(apiUrl, "repos"),
        {},
        ReposResponseSchema,
      );
      return response.repos;
    },
    async updateRepo(request: UpdateRequest): Promise<void> {
      const body = JSON.stringify(UpdateRequestSchema.parse(request));
      await requestJson(actionUrl(apiUrl, "update"), { method: "POST", headers: { "Content-Type": "application/json" }, body }, UpdateRequestSchema);
    },
  };
}

function actionUrl(apiUrl: string, action: string): string {
  const url = new URL(apiUrl);
  url.searchParams.set("action", action);
  return url.toString();
}

export function statusUpdate(rowId: string, status: string, error: string, now: string, tag: string, time: string, processingTag: string = "", lockUntil: string = ""): UpdateRequest {
  return {
    rowId,
    lastReleaseTag: tag,
    lastReleaseTime: time,
    lastCheckedAt: now,
    lastStatus: status,
    lastError: error,
    processingTag,
    lockUntil,
  };
}
