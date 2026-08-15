import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly body: string,
  ) {
    const displayUrl = new URL(url);
    displayUrl.search = "";
    super(`HTTP ${status} from ${displayUrl.toString()}`);
  }
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestText(url: string, init: RequestInit, maxRetries = 2): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(Math.min(500 * Math.pow(2, attempt - 1), 3000));
    }
    try {
      const response = await fetch(url, init);
      const body = await response.text();
      if (!response.ok) {
        const error = new HttpError(url, response.status, body.slice(0, 500));
        if (shouldRetry(response.status) && attempt < maxRetries) {
          lastError = error;
          continue;
        }
        throw error;
      }
      return body;
    } catch (error) {
      if (error instanceof HttpError && !shouldRetry(error.status)) {
        throw error;
      }
      lastError = error;
      if (attempt >= maxRetries) {
        break;
      }
    }
  }
  throw lastError;
}

export async function requestJson<T>(url: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const text = await requestText(url, init);
  return schema.parse(JSON.parse(text));
}

