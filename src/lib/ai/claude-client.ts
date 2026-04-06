/**
 * Shared Claude API client for all AI features.
 * Uses the Anthropic Messages API directly via fetch.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeResponse {
  content: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function claudeChat(
  messages: ClaudeMessage[],
  options?: {
    system?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY non configurée");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: options?.model || "claude-haiku-4-5-20251001",
      max_tokens: options?.maxTokens || 2000,
      temperature: options?.temperature ?? 0.7,
      system: options?.system || undefined,
      messages,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errBody.slice(0, 200)}`);
  }

  const result = await response.json();
  const textContent = result.content?.[0]?.text || "";

  return {
    content: textContent,
    model: result.model,
    usage: result.usage,
  };
}

/**
 * Helper: extract JSON from Claude response (handles markdown code blocks)
 */
export function extractJSON(text: string): unknown {
  const match = text.match(/[\[{][\s\S]*[\]}]/);
  if (!match) throw new Error("No JSON found in response");
  return JSON.parse(match[0]);
}
