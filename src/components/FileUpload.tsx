import { useCallback, useState } from "react";
import { Upload, FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { UploadedDocument } from "@/pages/Index";

const MAX_FILE_SIZE_MB = 40;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onUploadComplete: (doc: UploadedDocument) => void;
  onClearSelected: () => void;
}

export const FileUpload = ({ onFileSelect, selectedFile, onUploadComplete, onClearSelected }: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      const validFile = files.find((file) => 
        file.type === "application/pdf" || file.type === "application/json"
      );

      if (validFile) {
        if (validFile.size > MAX_FILE_SIZE_BYTES) {
          toast({
            title: "File too large",
            description: `Maximum file size is ${MAX_FILE_SIZE_MB} MB. Your file is ${(validFile.size / 1024 / 1024).toFixed(2)} MB`,
            variant: "destructive",
          });
          return;
        }
        onFileSelect(validFile);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF or JSON file",
          variant: "destructive",
        });
      }
    },
    [onFileSelect, toast]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        if (file.type === "application/pdf" || file.type === "application/json") {
          if (file.size > MAX_FILE_SIZE_BYTES) {
            toast({
              title: "File too large",
              description: `Maximum file size is ${MAX_FILE_SIZE_MB} MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)} MB`,
              variant: "destructive",
            });
            return;
          }
          onFileSelect(file);
        } else {
          toast({
            title: "Invalid file type",
            description: "Please upload a PDF or JSON file",
            variant: "destructive",
          });
        }
      }
    },
    [onFileSelect, toast]
  );

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      // Call edge function to upload and process the PDF
      const formData = new FormData();
      formData.append("file", selectedFile);

      const { data, error } = await supabase.functions.invoke("upload-document", {
        body: formData,
      });

      if (error) throw error;

      const newDoc: UploadedDocument = {
        id: data.fileId,
        name: selectedFile.name,
        uploadedAt: new Date(),
      };

      onUploadComplete(newDoc);

      toast({
        title: "Success",
        description: "Document uploaded and ready for questions!",
      });
    } catch (error) {
      console.error("Upload error:", error);
      
      let errorMessage = "Failed to upload document";
      if (error instanceof Error) {
        if (error.message.includes("Failed to send a request")) {
          errorMessage = "Upload timeout or network error. This may be due to file size or temporary API limits. Please try again in a moment.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle>Upload Document</CardTitle>
        <CardDescription>Upload PDF or JSON files to ask questions about them</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-xl p-8 transition-all duration-200
            ${
              isDragging
                ? "border-primary bg-primary/5 scale-[1.02]"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            }
          `}
        >
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Drop your files here</p>
              <p className="text-sm text-muted-foreground mt-1">PDF or JSON files • or click to browse</p>
            </div>
            <input
              type="file"
              accept=".pdf,.json,application/pdf,application/json"
              onChange={handleFileInput}
              className="hidden"
              id="file-upload"
            />
            <Button variant="secondary" size="sm" asChild>
              <label htmlFor="file-upload" className="cursor-pointer">
                Browse Files
              </label>
            </Button>
          </div>
        </div>

        {selectedFile && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              <FileText className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClearSelected}
                aria-label="Remove selected file"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Button
              onClick={handleUpload}
              disabled={isUploading}
              className="w-full bg-gradient-primary hover:opacity-90 transition-opacity"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Upload & Process"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
