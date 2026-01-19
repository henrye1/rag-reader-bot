import { useState, useRef } from "react";
import { Upload, FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface QuestionsUploaderProps {
  questionsTemplate: any[] | null;
  questionsFileName: string | null;
  onQuestionsLoaded: (questions: any[], fileName: string) => void;
  onQuestionsRemoved: () => void;
}

export const QuestionsUploader = ({ questionsTemplate, questionsFileName, onQuestionsLoaded, onQuestionsRemoved }: QuestionsUploaderProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      "application/json",
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword"
    ];
    const isValidType = validTypes.includes(file.type) ||
                        file.name.endsWith('.json') ||
                        file.name.endsWith('.pdf') ||
                        file.name.endsWith('.txt') ||
                        file.name.endsWith('.docx') ||
                        file.name.endsWith('.doc');

    if (!isValidType) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JSON, PDF, TXT, or Word (.doc, .docx) file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      if (file.type === "application/json" || file.name.endsWith('.json')) {
        const text = await file.text();
        const questions = JSON.parse(text);
        
        if (!Array.isArray(questions)) {
          throw new Error("JSON must contain an array of questions");
        }
        
        onQuestionsLoaded(questions, file.name);
      } else {
        const formData = new FormData();
        formData.append("file", file);

        const { data, error } = await supabase.functions.invoke("parse-prompt-document", {
          body: formData,
        });

        if (error) throw error;

        const lines = data.promptText.split('\n').filter((l: string) => l.trim());
        onQuestionsLoaded(lines.map((q: string, i: number) => ({ id: i + 1, question: q })), file.name);
      }
      
      toast({
        title: "Success",
        description: "Questions template loaded successfully!",
      });
    } catch (error) {
      console.error("Questions upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload questions template",
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
        <CardTitle>Step 3: Upload Assessment Questions</CardTitle>
        <CardDescription>
          Upload the questionnaire/assessment template that the expert should answer based on the client documentation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {questionsFileName ? (
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-sm">{questionsFileName}</p>
                <Badge variant="secondary" className="mt-1">
                  {questionsTemplate?.length || 0} assessment questions loaded
                </Badge>
              </div>
            </div>
            <Button
              onClick={onQuestionsRemoved}
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
                  <p className="font-medium text-foreground">Upload Assessment Questions</p>
                  <p className="text-sm text-muted-foreground mt-1">Questionnaire template (JSON, PDF, TXT, or Word)</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.pdf,.txt,.doc,.docx,application/json,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="questions-upload"
                />
                <Button 
                  variant="secondary" 
                  size="sm" 
                  asChild
                  disabled={isUploading}
                >
                  <label htmlFor="questions-upload" className="cursor-pointer">
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
            <div className="text-center text-sm text-muted-foreground">
              <p>Primary method: Ask questions in the chat below</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};