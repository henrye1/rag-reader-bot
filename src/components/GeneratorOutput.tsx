import { useState } from "react";
import {
  Copy,
  Download,
  Check,
  FileText,
  Code,
  ChevronDown,
  ChevronUp,
  Presentation,
  FileOutput,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import type { OutputFormat } from "@/integrations/supabase/types";

interface GeneratorOutputProps {
  content: string;
  outputFormat: OutputFormat;
  skillName?: string;
  structuredData?: Record<string, unknown>;
}

// Simple markdown to HTML conversion for preview
const markdownToHtml = (markdown: string): string => {
  let html = markdown;

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  // Lists
  html = html.replace(/^\- (.*$)/gim, '<li class="ml-4">$1</li>');
  html = html.replace(/^\d+\. (.*$)/gim, '<li class="ml-4 list-decimal">$1</li>');

  // Tables (basic)
  html = html.replace(/\|(.+)\|/g, (match, content) => {
    const cells = content.split('|').map((cell: string) => cell.trim());
    const isHeader = content.includes('---');
    if (isHeader) return '';
    return `<tr>${cells.map((cell: string) => `<td class="border px-2 py-1">${cell}</td>`).join('')}</tr>`;
  });

  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-muted p-3 rounded-lg overflow-x-auto text-sm"><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 rounded">$1</code>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p class="mb-3">');
  html = `<p class="mb-3">${html}</p>`;

  return html;
};

export const GeneratorOutput = ({
  content,
  outputFormat,
  skillName,
  structuredData,
}: GeneratorOutputProps) => {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'raw' | 'structured'>('preview');
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied",
        description: "Content copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    const extension = outputFormat === 'json' ? 'json' : 'md';
    const mimeType = outputFormat === 'json' ? 'application/json' : 'text/markdown';
    const filename = `${skillName?.replace(/\s+/g, '_') || 'generated'}_output.${extension}`;

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: `Saved as ${filename}`,
    });
  };

  // Parse JSON for structured view
  let parsedJson: Record<string, unknown> | null = null;
  if (outputFormat === 'json' || structuredData) {
    try {
      parsedJson = structuredData || JSON.parse(content);
    } catch {
      // Not valid JSON
    }
  }

  // Render PPTX structure if detected
  const renderPptxPreview = () => {
    if (!parsedJson || !('presentation' in parsedJson)) {
      return null;
    }

    const presentation = parsedJson.presentation as {
      title: string;
      subtitle?: string;
      sections?: Array<{
        section_title: string;
        slides: Array<{
          slide_number: number;
          layout: string;
          title: string;
          content?: Record<string, unknown>;
        }>;
      }>;
    };

    return (
      <div className="space-y-4">
        {/* Title Slide Preview */}
        <div className="border rounded-lg p-6 bg-gradient-to-br from-primary/10 to-primary/5">
          <div className="text-center">
            <Presentation className="h-8 w-8 mx-auto mb-3 text-primary" />
            <h2 className="text-xl font-bold">{presentation.title}</h2>
            {presentation.subtitle && (
              <p className="text-muted-foreground mt-1">{presentation.subtitle}</p>
            )}
          </div>
        </div>

        {/* Sections */}
        {presentation.sections?.map((section, sectionIdx) => (
          <div key={sectionIdx} className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Section {sectionIdx + 1}: {section.section_title}
            </h3>
            <div className="grid gap-2">
              {section.slides?.map((slide, slideIdx) => (
                <div
                  key={slideIdx}
                  className="border rounded-lg p-3 bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="shrink-0">
                      Slide {slide.slide_number}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{slide.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{slide.layout}</p>
                      {slide.content?.bullet_points && (
                        <ul className="text-xs mt-1 space-y-0.5">
                          {(slide.content.bullet_points as string[]).slice(0, 3).map((point, i) => (
                            <li key={i} className="truncate text-muted-foreground">- {point}</li>
                          ))}
                          {(slide.content.bullet_points as string[]).length > 3 && (
                            <li className="text-muted-foreground">...</li>
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="mt-4 border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileOutput className="h-4 w-4 text-primary" />
            Generated Output
            {skillName && (
              <Badge variant="secondary" className="text-xs">
                {skillName}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs capitalize">
              {outputFormat}
            </Badge>
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'preview' | 'raw' | 'structured')}>
          <TabsList className="grid w-full grid-cols-3 mb-3">
            <TabsTrigger value="preview" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="raw" className="text-xs">
              <Code className="h-3 w-3 mr-1" />
              Raw
            </TabsTrigger>
            {parsedJson && (
              <TabsTrigger value="structured" className="text-xs">
                <Presentation className="h-3 w-3 mr-1" />
                Structure
              </TabsTrigger>
            )}
          </TabsList>

          <ScrollArea className="h-[400px] rounded-lg border p-4">
            <TabsContent value="preview" className="mt-0">
              {outputFormat === 'json' && parsedJson?.presentation ? (
                renderPptxPreview()
              ) : outputFormat === 'markdown' || outputFormat === 'text' ? (
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
                />
              ) : (
                <pre className="text-sm whitespace-pre-wrap">{content}</pre>
              )}
            </TabsContent>

            <TabsContent value="raw" className="mt-0">
              <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-3 rounded-lg">
                {content}
              </pre>
            </TabsContent>

            {parsedJson && (
              <TabsContent value="structured" className="mt-0">
                <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-3 rounded-lg">
                  {JSON.stringify(parsedJson, null, 2)}
                </pre>
              </TabsContent>
            )}
          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  );
};
