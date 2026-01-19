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
  onFileSelect: (files: File[]) => void;
  selectedFiles: File[];
  onUploadComplete: (docs: UploadedDocument[]) => void;
  onClearSelected: () => void;
  onRemoveFile: (index: number) => void;
}

export const FileUpload = ({ onFileSelect, selectedFiles, onUploadComplete, onClearSelected, onRemoveFile }: FileUploadProps) => {
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
      console.log("Files dropped:", files.map(f => ({ name: f.name, type: f.type, size: f.size })));

      const validFile = files.find((file) => {
        const type = file.type;
        const name = file.name.toLowerCase();
        const isPdf = type === "application/pdf" || name.endsWith(".pdf");
        const isJson = type === "application/json" || name.endsWith(".json");
        const isTxt = type === "text/plain" || name.endsWith(".txt");
        const isWord = type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                       type === "application/msword" ||
                       name.endsWith(".docx") ||
                       name.endsWith(".doc");
        console.log(`File validation: ${name}, type: ${type}, isPdf: ${isPdf}, isJson: ${isJson}, isTxt: ${isTxt}, isWord: ${isWord}`);
        return isPdf || isJson || isTxt || isWord;
      });

      const validFiles = files.filter((file) => {
        const type = file.type;
        const name = file.name.toLowerCase();
        return (type === "application/pdf" || name.endsWith(".pdf") ||
                type === "application/json" || name.endsWith(".json") ||
                type === "text/plain" || name.endsWith(".txt") ||
                type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                type === "application/msword" ||
                name.endsWith(".docx") || name.endsWith(".doc"));
      });

      const oversizedFiles = validFiles.filter(f => f.size > MAX_FILE_SIZE_BYTES);
      if (oversizedFiles.length > 0) {
        toast({
          title: "Files too large",
          description: `Maximum file size is ${MAX_FILE_SIZE_MB} MB per file`,
          variant: "destructive",
        });
        return;
      }

      if (validFiles.length > 0) {
        onFileSelect(validFiles);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload PDF, JSON, TXT, or Word (.doc, .docx) files",
          variant: "destructive",
        });
      }
    },
    [onFileSelect, toast]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      console.log("Files selected via input:", files.map(f => ({ name: f.name, type: f.type, size: f.size })));

      const validFiles = files.filter((file) => {
        const type = file.type;
        const name = file.name.toLowerCase();
        const isValid = (type === "application/pdf" || name.endsWith(".pdf") ||
                type === "application/json" || name.endsWith(".json") ||
                type === "text/plain" || name.endsWith(".txt") ||
                type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                type === "application/msword" ||
                name.endsWith(".docx") || name.endsWith(".doc"));
        console.log(`File "${file.name}" validation: type="${type}", isValid=${isValid}`);
        return isValid;
      });

      console.log("Valid files count:", validFiles.length);

      const oversizedFiles = validFiles.filter(f => f.size > MAX_FILE_SIZE_BYTES);
      if (oversizedFiles.length > 0) {
        console.log("Oversized files detected:", oversizedFiles.map(f => f.name));
        toast({
          title: "Files too large",
          description: `Maximum file size is ${MAX_FILE_SIZE_MB} MB per file`,
          variant: "destructive",
        });
        return;
      }

      if (validFiles.length > 0) {
        console.log("Calling onFileSelect with valid files");
        onFileSelect(validFiles);
      } else if (files.length > 0) {
        console.log("No valid files found, showing error toast");
        toast({
          title: "Invalid file type",
          description: "Please upload PDF, JSON, TXT, or Word (.doc, .docx) files",
          variant: "destructive",
        });
      }
    },
    [onFileSelect, toast]
  );

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    const uploadedDocs: UploadedDocument[] = [];

    try {
      for (const file of selectedFiles) {
        console.log(`Uploading file: ${file.name}, size: ${file.size}, type: ${file.type}`);

        const formData = new FormData();
        formData.append("file", file);

        const { data, error } = await supabase.functions.invoke("upload-document", {
          body: formData,
        });

        console.log("Upload response:", { data, error });

        if (error) {
          console.error("Supabase function error:", error);
          throw error;
        }

        if (!data || !data.fileId) {
          console.error("Invalid response from upload:", data);
          throw new Error("Invalid response from server - no fileId returned");
        }

        const isTxtOrJson = data.fileId?.startsWith('json-') || data.fileId?.startsWith('txt-');

        uploadedDocs.push({
          id: data.fileId,
          name: file.name,
          uploadedAt: new Date(),
          content: data.content,
          isJson: isTxtOrJson,
        });

        console.log(`File uploaded successfully: ${file.name}, fileId: ${data.fileId}`);
      }

      onUploadComplete(uploadedDocs);

      toast({
        title: "Success",
        description: `${uploadedDocs.length} document(s) uploaded and ready for questions!`,
      });
    } catch (error) {
      console.error("Upload error details:", error);

      let errorMessage = "Failed to upload documents";
      if (error instanceof Error) {
        if (error.message.includes("Failed to send a request")) {
          errorMessage = "Upload timeout or network error. Please try again in a moment.";
        } else {
          errorMessage = error.message;
        }
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error);
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
        <CardTitle>Step 1: Upload Client Documentation</CardTitle>
        <CardDescription>Upload the client documents to be reviewed/assessed (PDF, JSON, TXT, or Word)</CardDescription>
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
              <p className="text-sm text-muted-foreground mt-1">PDF, JSON, TXT, or Word files • or click to browse</p>
            </div>
            <input
              type="file"
              accept=".pdf,.json,.txt,.doc,.docx,application/pdf,application/json,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
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

        {selectedFiles.length > 0 && (
          <div className="space-y-3">
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveFile(index)}
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={onClearSelected}
                variant="outline"
                className="flex-1"
              >
                Clear All
              </Button>
              <Button
                onClick={handleUpload}
                disabled={isUploading}
                className="flex-1 bg-gradient-primary hover:opacity-90 transition-opacity"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Upload ${selectedFiles.length} File(s)`
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
