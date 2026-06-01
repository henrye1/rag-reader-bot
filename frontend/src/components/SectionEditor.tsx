import { useEditor, EditorContent } from "@tiptap/react";
import { Bold, Italic, List, ListOrdered, Heading2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tiptapExtensions } from "@/lib/tiptapExtensions";
import type { Section, ProseMirrorDoc } from "@/lib/documentTypes";

interface Props {
  section: Section;
  onChange: (bodyJson: ProseMirrorDoc) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

export function SectionEditor({ section, onChange, onRename, onDelete }: Props) {
  const editor = useEditor({
    extensions: tiptapExtensions,
    content: section.bodyJson,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as ProseMirrorDoc),
  });

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-white">
      <div className="flex items-center gap-2">
        <input
          className="font-semibold flex-1 bg-transparent outline-none"
          value={section.title}
          onChange={(e) => onRename(e.target.value)}
        />
        {section.status && <Badge variant="outline">{section.status}</Badge>}
        <Button variant="ghost" size="sm" onClick={onDelete}>Delete</Button>
      </div>
      {section.requirement && (
        <p className="text-xs text-muted-foreground italic">{section.requirement}</p>
      )}
      {editor && (
        <div className="flex gap-1 border-b pb-1">
          <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading2 className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Button>
        </div>
      )}
      <EditorContent editor={editor} className="prose prose-sm max-w-none min-h-[60px]" />
    </div>
  );
}
