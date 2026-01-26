import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Paperclip, X, FileSearch, Copy, Download, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { UploadedDocument } from "@/pages/Index";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ChunkSources } from "@/components/ChunkSources";
import { RagMetadataBadges } from "@/components/RagMetadataBadges";
import type { Source } from "@/integrations/supabase/types";
import type { RagConfig, RetrievalConfig, VerificationResult, ConfidenceResult } from "@/integrations/supabase/rag-types";
import type { OutputFormatConfig } from "@/components/OutputFormatPanel";

// Helper function to strip citations from text for clean export
const stripCitations = (text: string): string => {
  // Remove [Source: Document Name, Chunk X] patterns and similar citation formats
  return text
    .replace(/\[Source:\s*[^\]]+\]/gi, '')
    .replace(/\[Chunk\s*\d+[^\]]*\]/gi, '')
    .replace(/\(Source:\s*[^)]+\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
};

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  // RAG metadata
  skillsApplied?: string[];
  verification?: VerificationResult;
  confidence?: ConfidenceResult;
  processingTimeMs?: number;
  wasDecomposed?: boolean;
  subQuestions?: string[];
  processedQuestion?: string;
  originalQuestion?: string;
}

interface ChatInterfaceProps {
  documents: UploadedDocument[];
  onReportGenerated: (html: string, data: Record<string, unknown>, isFollowUp?: boolean) => void;
  customPrompt: string | null;
  questionsTemplate: Record<string, unknown>[] | null;
  resetTrigger?: number;
  ragConfig?: Omit<RagConfig, 'id' | 'created_at'>;
  retrievalConfig?: RetrievalConfig;
  outputFormat?: OutputFormatConfig;
  suggestedQuestion?: string | null;
  onSuggestedQuestionUsed?: () => void;
  onClearChat?: () => void;
}

export const ChatInterface = ({ documents, onReportGenerated, customPrompt, questionsTemplate, resetTrigger, ragConfig, retrievalConfig, outputFormat, suggestedQuestion, onSuggestedQuestionUsed, onClearChat }: ChatInterfaceProps) => {
  const [messages, setMessages] = useLocalStorage<Message[]>("chatMessages", []);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [hasProcessedQuestions, setHasProcessedQuestions] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Handle suggested question from skill selector
  useEffect(() => {
    if (suggestedQuestion) {
      setInput(suggestedQuestion);
      onSuggestedQuestionUsed?.();
    }
  }, [suggestedQuestion, onSuggestedQuestionUsed]);

  // Watch for reset trigger from parent
  useEffect(() => {
    if (resetTrigger && resetTrigger > 0) {
      setMessages([]);
      setAttachedFiles([]);
      setInput("");
      setHasProcessedQuestions(false);
    }
  }, [resetTrigger]);

  // Auto-process when questions template is uploaded
  useEffect(() => {
    const autoProcessQuestions = async () => {
      if (questionsTemplate && questionsTemplate.length > 0 &&
          documents.length > 0 &&
          !hasProcessedQuestions &&
          !isLoading) {

        console.log("Auto-processing questions template...");
        setHasProcessedQuestions(true);

        const userMessage: Message = {
          id: Date.now().toString(),
          role: "user",
          content: `Processing ${questionsTemplate.length} questions from uploaded template...`,
        };

        setMessages((prev) => [...prev, userMessage]);
        setIsLoading(true);

        try {
          // Get document IDs for the RAG system
          const documentIds = documents.map((doc) => doc.documentId);

          const { data, error } = await supabase.functions.invoke("ask-question", {
            body: {
              question: "Please process all questions from the uploaded template systematically.",
              documentIds: documentIds,
              customPrompt: customPrompt,
              questionsTemplate: questionsTemplate,
              generateReport: true,
              ragConfig: ragConfig,
              retrievalConfig: retrievalConfig,
              outputFormat: outputFormat,
            },
          });

          if (error) throw error;

          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.answer,
            sources: data.sources,
            // RAG metadata
            skillsApplied: data.skillsApplied,
            verification: data.verification,
            confidence: data.confidence,
            processingTimeMs: data.processingTimeMs,
            wasDecomposed: data.wasDecomposed,
            subQuestions: data.subQuestions,
            processedQuestion: data.processedQuestion,
            originalQuestion: data.originalQuestion,
          };

          setMessages((prev) => [...prev, assistantMessage]);

          if (data.reportHtml) {
            onReportGenerated(data.reportHtml, data.reportData);
          }

          toast({
            title: "Questions Processed",
            description: `Successfully answered ${questionsTemplate.length} questions using ${data.sources?.length || 0} retrieved chunks`,
          });
        } catch (error) {
          console.error("Auto-process error:", error);
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "Failed to process questions",
            variant: "destructive",
          });
          setHasProcessedQuestions(false);
        } finally {
          setIsLoading(false);
        }
      }
    };

    autoProcessQuestions();
  }, [questionsTemplate, documents, hasProcessedQuestions, isLoading]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      const type = file.type;
      const name = file.name.toLowerCase();
      return (type === "application/pdf" || name.endsWith(".pdf") ||
              type === "application/json" || name.endsWith(".json") ||
              type === "text/plain" || name.endsWith(".txt"));
    });

    if (validFiles.length !== files.length) {
      toast({
        title: "Invalid file type",
        description: "Only PDF, JSON, and TXT files are supported",
        variant: "destructive",
      });
    }

    setAttachedFiles((prev) => [...prev, ...validFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || isUploading) return;

    if (documents.length === 0 && attachedFiles.length === 0) {
      toast({
        title: "No documents",
        description: "Please upload a document or attach files to your question",
        variant: "destructive",
      });
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Upload attached files first if any
      const attachedDocIds: string[] = [];
      if (attachedFiles.length > 0) {
        setIsUploading(true);
        for (const file of attachedFiles) {
          const formData = new FormData();
          formData.append("file", file);

          const { data: uploadData, error: uploadError } = await supabase.functions.invoke(
            "upload-document",
            { body: formData }
          );

          if (uploadError) throw uploadError;
          if (uploadData?.documentId) {
            attachedDocIds.push(uploadData.documentId);
          }
        }
        setIsUploading(false);
        setAttachedFiles([]);
      }

      // Combine all document IDs
      const allDocumentIds = [
        ...documents.map((doc) => doc.documentId),
        ...attachedDocIds,
      ];

      // Build conversation history from previous messages (for context continuity)
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const { data, error } = await supabase.functions.invoke("ask-question", {
        body: {
          question: input,
          documentIds: allDocumentIds,
          customPrompt: customPrompt,
          questionsTemplate: questionsTemplate,
          generateReport: true,
          ragConfig: ragConfig,
          retrievalConfig: retrievalConfig,
          outputFormat: outputFormat,
          conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        sources: data.sources,
        // RAG metadata
        skillsApplied: data.skillsApplied,
        verification: data.verification,
        confidence: data.confidence,
        processingTimeMs: data.processingTimeMs,
        wasDecomposed: data.wasDecomposed,
        subQuestions: data.subQuestions,
        processedQuestion: data.processedQuestion,
        originalQuestion: data.originalQuestion,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (data.reportHtml) {
        // Pass isFollowUp=true if there were already messages before this interaction
        const isFollowUp = messages.length > 0;
        onReportGenerated(data.reportHtml, data.reportData, isFollowUp);
      }
    } catch (error) {
      console.error("Question error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get answer",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    onClearChat?.();
    toast({
      title: "Conversation Reset",
      description: "Chat history and accumulated report have been cleared. You can start a new conversation.",
    });
  };

  // Copy response to clipboard (without citations for clean paste)
  const handleCopyResponse = async (messageId: string, content: string) => {
    try {
      const cleanContent = stripCitations(content);
      await navigator.clipboard.writeText(cleanContent);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
      toast({
        title: "Copied to clipboard",
        description: "Response copied without citations for easy pasting",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  // Export response as text file (without citations)
  const handleExportResponse = (content: string, sources?: Source[]) => {
    const cleanContent = stripCitations(content);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');

    // Build export content with metadata
    let exportContent = `Document Q&A Response Export
Generated: ${new Date().toLocaleString()}
${'='.repeat(50)}

RESPONSE:
${cleanContent}
`;

    // Add source references separately if available
    if (sources && sources.length > 0) {
      exportContent += `
${'='.repeat(50)}
SOURCE REFERENCES (for audit trail):
${sources.map((s, i) => `${i + 1}. ${s.documentName} - Chunk ${s.chunkIndex} (Similarity: ${(s.similarity * 100).toFixed(1)}%)`).join('\n')}
`;
    }

    // Create and download file
    const blob = new Blob([exportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qa-response-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Response exported",
      description: "Downloaded as text file with source references for audit trail",
    });
  };

  return (
    <Card className="h-full flex flex-col shadow-elegant">
      <CardContent className="flex-1 flex flex-col p-0">
        {/* Messages Area */}
        <ScrollArea className="flex-1 p-6">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="h-16 w-16 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-4 shadow-elegant">
                  <FileSearch className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  RAG-Powered Document Q&A
                </h3>
                <p className="text-muted-foreground">
                  Upload documents to index them with vector embeddings. When you ask a question,
                  I'll search for the most relevant sections and provide accurate answers with citations.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <div key={message.id}>
                  <div
                    className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {message.role === "assistant" && (
                      <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0">
                        <Bot className="h-5 w-5 text-white" />
                      </div>
                    )}
                    <div
                      className={`
                        max-w-[80%] rounded-2xl px-4 py-3 shadow-soft
                        ${
                          message.role === "user"
                            ? "bg-gradient-primary text-white"
                            : "bg-card border border-border"
                        }
                      `}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {message.content}
                      </p>
                      {/* Copy/Export buttons for assistant messages */}
                      {message.role === "assistant" && (
                        <div className="flex items-center gap-1 mt-3 pt-2 border-t border-border/50">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyResponse(message.id, message.content)}
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            title="Copy response (without citations)"
                          >
                            {copiedMessageId === message.id ? (
                              <Check className="h-3 w-3 mr-1 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3 mr-1" />
                            )}
                            {copiedMessageId === message.id ? "Copied" : "Copy"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExportResponse(message.content, message.sources)}
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            title="Export response as text file"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Export
                          </Button>
                        </div>
                      )}
                    </div>
                    {message.role === "user" && (
                      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                        <User className="h-5 w-5 text-secondary-foreground" />
                      </div>
                    )}
                  </div>
                  {/* Show RAG metadata badges for assistant messages */}
                  {message.role === "assistant" && (
                    <div className="ml-12">
                      <RagMetadataBadges
                        skillsApplied={message.skillsApplied}
                        verification={message.verification}
                        confidence={message.confidence}
                        processingTimeMs={message.processingTimeMs}
                        wasDecomposed={message.wasDecomposed}
                        subQuestions={message.subQuestions}
                        processedQuestion={message.processedQuestion}
                        originalQuestion={message.originalQuestion}
                      />
                    </div>
                  )}
                  {/* Show sources for assistant messages */}
                  {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                    <div className="ml-12 mt-2">
                      <ChunkSources sources={message.sources} />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-4 justify-start">
                  <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div className="bg-card border border-border rounded-2xl px-4 py-3 shadow-soft">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                      <span className="text-sm text-muted-foreground">Searching documents...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border p-4 bg-card">
          {/* Attached Files Display */}
          {attachedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg text-sm"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="text-secondary-foreground">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => handleRemoveAttachment(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {messages.length > 0 && (
              <Button
                onClick={handleClearChat}
                variant="outline"
                size="default"
                title="Reset conversation and clear accumulated report"
                className="gap-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-300"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">Reset Conversation</span>
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.json,.txt"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="icon"
              title="Attach PDF, JSON, or TXT files"
              disabled={isLoading || isUploading}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={
                questionsTemplate && questionsTemplate.length > 0
                  ? "Questions template uploaded - will auto-process when documents are ready..."
                  : documents.length === 0 && attachedFiles.length === 0
                  ? "Upload documents or attach files to ask questions..."
                  : "Ask a question about your documents (RAG search will find relevant sections)..."
              }
              disabled={isLoading || isUploading || (questionsTemplate && questionsTemplate.length > 0)}
              className="flex-1 min-h-[80px] max-h-[200px] resize-none"
              rows={3}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || isUploading || (documents.length === 0 && attachedFiles.length === 0)}
              className="bg-gradient-primary hover:opacity-90 transition-opacity"
              size="icon"
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
