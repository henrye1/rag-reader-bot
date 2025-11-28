import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Trash2, Paperclip, X, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { UploadedDocument } from "@/pages/Index";
import { Badge } from "@/components/ui/badge";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatInterfaceProps {
  documents: UploadedDocument[];
}

export const ChatInterface = ({ documents }: ChatInterfaceProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [promptFileName, setPromptFileName] = useState<string | null>(null);
  const [isUploadingPrompt, setIsUploadingPrompt] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfFiles = files.filter((file) => file.type === "application/pdf");

    if (pdfFiles.length !== files.length) {
      toast({
        title: "Invalid file type",
        description: "Only PDF files are supported",
        variant: "destructive",
      });
    }

    setAttachedFiles((prev) => [...prev, ...pdfFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePromptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a Word document (.doc or .docx)",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingPrompt(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const { data, error } = await supabase.functions.invoke("parse-prompt-document", {
        body: formData,
      });

      if (error) throw error;

      setCustomPrompt(data.promptText);
      setPromptFileName(file.name);
      
      toast({
        title: "Success",
        description: "Custom prompt loaded successfully!",
      });
    } catch (error) {
      console.error("Prompt upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload prompt document",
        variant: "destructive",
      });
    } finally {
      setIsUploadingPrompt(false);
      if (promptInputRef.current) {
        promptInputRef.current.value = "";
      }
    }
  };

  const handleRemovePrompt = () => {
    setCustomPrompt(null);
    setPromptFileName(null);
    toast({
      title: "Prompt removed",
      description: "Using default prompt",
    });
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
      let attachedFileIds: string[] = [];
      if (attachedFiles.length > 0) {
        setIsUploading(true);
        for (const file of attachedFiles) {
          const formData = new FormData();
          formData.append("file", file);

          const { data: uploadData, error: uploadError } = await supabase.functions.invoke(
            "upload-document",
            {
              body: formData,
            }
          );

          if (uploadError) throw uploadError;
          attachedFileIds.push(uploadData.fileId);
        }
        setIsUploading(false);
        setAttachedFiles([]);
      }

      // Combine all file IDs
      const allFileIds = [
        ...documents.map((doc) => doc.id),
        ...attachedFileIds,
      ];

      const { data, error } = await supabase.functions.invoke("ask-question", {
        body: {
          question: input,
          fileIds: allFileIds,
          customPrompt: customPrompt,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
      };

      setMessages((prev) => [...prev, assistantMessage]);
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
    toast({
      title: "Chat cleared",
      description: "Conversation history has been reset",
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
                  <Bot className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Ready to Answer Your Questions
                </h3>
                <p className="text-muted-foreground">
                  Upload a document and ask me anything about its content. I'll provide accurate
                  answers based on the information in your files.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
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
                  </div>
                  {message.role === "user" && (
                    <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-secondary-foreground" />
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
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border p-4 bg-card">
          {/* Custom Prompt Display */}
          {promptFileName && (
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="secondary" className="flex items-center gap-2">
                <FileText className="h-3 w-3" />
                <span className="text-xs">Custom Prompt: {promptFileName}</span>
                <button
                  onClick={handleRemovePrompt}
                  className="ml-1 hover:text-destructive transition-colors"
                  disabled={isLoading || isUploading}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}
          
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
                size="icon"
                title="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <input
              ref={promptInputRef}
              type="file"
              accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handlePromptUpload}
              className="hidden"
            />
            <Button
              onClick={() => promptInputRef.current?.click()}
              variant="outline"
              size="icon"
              title="Upload custom prompt (Word doc)"
              disabled={isLoading || isUploading || isUploadingPrompt}
            >
              {isUploadingPrompt ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="icon"
              title="Attach PDF files"
              disabled={isLoading || isUploading || isUploadingPrompt}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={
                documents.length === 0 && attachedFiles.length === 0
                  ? "Upload documents or attach files to ask questions..."
                  : "Ask a question about your documents..."
              }
              disabled={isLoading || isUploading}
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
