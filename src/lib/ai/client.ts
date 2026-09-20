import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let _client: Anthropic | null = null;
export function claude() {
  if (!_client) _client = new Anthropic();
  return _client;
}
export const MODEL = env.model;
export const PARSE_MODEL = env.parseModel;
export const aiReady = () => env.hasAnthropic;
