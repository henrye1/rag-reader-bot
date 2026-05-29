import { generateJSON } from "@tiptap/core";
import { marked } from "marked";
import { tiptapExtensions } from "./tiptapExtensions";
import type { ProseMirrorDoc } from "./documentTypes";

// Enable GFM (tables, strikethrough, etc.) explicitly.
marked.use({ gfm: true });

/** Convert AI markdown answers into ProseMirror JSON for insertion/editing. */
export function markdownToProseMirror(markdown: string): ProseMirrorDoc {
  const html = marked.parse(markdown ?? "", { async: false }) as string;
  const json = generateJSON(html || "<p></p>", tiptapExtensions);
  return json as ProseMirrorDoc;
}
