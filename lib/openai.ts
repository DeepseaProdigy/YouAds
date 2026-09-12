import OpenAI from "openai";

const preferred = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";
const fallback = "gpt-4o";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export function getChatModel(): string {
  return preferred;
}

export function getFallbackChatModel(): string {
  return fallback;
}
