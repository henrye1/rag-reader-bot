import { StarterKit } from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";

// NOTE: TipTap StarterKit v3 already bundles @tiptap/extension-link internally.
// Adding a separate Link extension would cause a duplicate-extension error at runtime.
// Instead, we configure StarterKit's bundled Link with openOnClick: false.

/** Single source of truth for extensions — used by the editor, generateJSON, and tests. */
export const tiptapExtensions = [
  StarterKit.configure({ link: { openOnClick: false } }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];
