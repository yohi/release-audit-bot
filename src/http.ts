import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status} from ${url}`);
  }
}

export async function requestText(url: string, init: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  const body = await response.text();
  if (!response.ok) {
    throw new HttpError(url, response.status, body.slice(0, 500));
  }
  return body;
}

export async function requestJson<T>(url: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const text = await requestText(url, init);
  return schema.parse(JSON.parse(text));
}
