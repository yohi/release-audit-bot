import { requestText } from "./http";

export type DiscordMessage = {
  readonly repo: string;
  readonly tag: string;
  readonly analysis: string;
  readonly compareUrl: string;
};

export async function notifyDiscord(webhookUrl: string, message: DiscordMessage): Promise<void> {
  const content = [`[Release Audit] ${message.repo} ${message.tag}`, "", message.analysis, "", `Compare: ${message.compareUrl}`]
    .join("\n")
    .slice(0, 1900);
  await requestText(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}
