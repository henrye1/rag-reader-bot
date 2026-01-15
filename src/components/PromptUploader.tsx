import { useState, useRef } from "react";
import { Upload, FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface PromptUploaderProps {
  customPrompt: string | null;
  promptFileName: string | null;
  onPromptLoaded: (prompt: string, fileName: string) => void;
  onPromptRemoved: () => void;
}

export const PromptUploader = ({ customPrompt, promptFileName, onPromptLoaded, onPromptRemoved }: PromptUploaderProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      "text/plain",
      "application/pdf",
      "application/json",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword"
    ];
    const isValidType = validTypes.includes(file.type) ||
                        file.name.endsWith('.txt') ||
                        file.name.endsWith('.pdf') ||
                        file.name.endsWith('.json') ||
                        file.name.endsWith('.docx') ||
                        file.name.endsWith('.doc');

    if (!isValidType) {
      toast({
        title: "Invalid file type",
        description: "Please upload a text (.txt), JSON, PDF, or Word (.doc, .docx) file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      console.log("Uploading prompt file:", file.name, "Type:", file.type, "Size:", file.size);

      const formData = new FormData();
      formData.append("file", file);

      const { data, error } = await supabase.functions.invoke("parse-prompt-document", {
        body: formData,
      });

      console.log("Upload response:", { data, error });

      if (error) {
        console.error("Supabase function error:", error);
        throw error;
      }

      if (!data || !data.promptText) {
        throw new Error("No prompt text returned from server");
      }

      onPromptLoaded(data.promptText, file.name);

      toast({
        title: "Success",
        description: "Custom prompt loaded successfully!",
      });
    } catch (error) {
      console.error("Prompt upload error:", error);

      let errorMessage = "Failed to upload prompt document";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = String((error as any).message);
      }

      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle>Step 2: Import Custom Prompt (Optional)</CardTitle>
        <CardDescription>Upload a custom prompt file (TXT, JSON, PDF, or Word) to override the default domain specialist prompt</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {promptFileName ? (
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-sm">{promptFileName}</p>
                <Badge variant="secondary" className="mt-1">Custom Prompt Active</Badge>
              </div>
            </div>
            <Button
              onClick={onPromptRemoved}
              variant="ghost"
              size="icon"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="border-2 border-dashed rounded-xl p-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Upload Custom Prompt</p>
                  <p className="text-sm text-muted-foreground mt-1">TXT, JSON, PDF, or Word files</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.pdf,.json,.doc,.docx,text/plain,application/pdf,application/json,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="prompt-upload"
                />
                <Button 
                  variant="secondary" 
                  size="sm" 
                  asChild
                  disabled={isUploading}
                >
                  <label htmlFor="prompt-upload" className="cursor-pointer">
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Browse Files"
                    )}
                  </label>
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};