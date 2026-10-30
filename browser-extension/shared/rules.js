/**
 * SATARK Browser Extension - Shared Exam Integrity Rules & Blocklists
 */

export const DEFAULT_RESTRICTED_DOMAINS = [
  "chatgpt.com",
  "openai.com",
  "claude.ai",
  "bard.google.com",
  "gemini.google.com",
  "stackoverflow.com",
  "chegg.com",
  "quora.com",
  "brainly.in",
  "brainly.com",
  "github.com/copilot",
  "discord.com",
  "web.whatsapp.com",
  "web.telegram.org",
];

export function isRestrictedUrl(url, restrictedList = DEFAULT_RESTRICTED_DOMAINS) {
  if (!url) return { isRestricted: false };
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    for (const domain of restrictedList) {
      if (hostname === domain || hostname.endsWith("." + domain)) {
        return { isRestricted: true, matchedDomain: domain, hostname };
      }
    }
  } catch (e) {
    // Invalid URL
  }
  return { isRestricted: false };
}

