/**
 * Extract the structured Assessment JSON from the bot's response text.
 *
 * The bot is prompted to append a fenced JSON code block at the end of its
 * response. This helper locates that block, parses it, and returns the
 * Assessment object — or null if no valid block is found.
 *
 * Recognised patterns:
 *   ```json
 *   { ... }
 *   ```
 *
 *   ```assessment-json
 *   { ... }
 *   ```
 *
 * Both work. The second form is recommended (less ambiguous if the response
 * contains other JSON snippets used as examples).
 */
import type { Assessment } from "./assessmentTypes";

const FENCE_REGEX = /```(?:assessment-json|json)\s*([\s\S]*?)```/g;

export function extractAssessmentJson(responseText: string): Assessment | null {
  if (!responseText) return null;

  const matches = Array.from(responseText.matchAll(FENCE_REGEX));
  if (matches.length === 0) return null;

  // Prefer the LAST fenced block in the response — the assessment JSON is
  // emitted after the human-readable text by convention.
  const candidate = matches[matches.length - 1][1].trim();

  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || !Array.isArray(parsed.topics)) {
      console.warn("Parsed JSON does not match Assessment schema (missing topics array)");
      return null;
    }
    return parsed as Assessment;
  } catch (err) {
    console.warn("Failed to parse assessment JSON:", err);
    return null;
  }
}

/**
 * Returns the response text with the trailing JSON fence stripped, so the
 * UI doesn't render the raw JSON to the user.
 */
export function stripAssessmentJson(responseText: string): string {
  if (!responseText) return responseText;
  return responseText.replace(FENCE_REGEX, "").trim();
}
