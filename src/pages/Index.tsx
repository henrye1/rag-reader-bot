import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { ChatInterface } from "@/components/ChatInterface";
import { DocumentList } from "@/components/DocumentList";
import { ReportViewer } from "@/components/ReportViewer";
import { WorkflowSteps } from "@/components/WorkflowSteps";
import { PromptUploader } from "@/components/PromptUploader";
import { QuestionsUploader } from "@/components/QuestionsUploader";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/hooks/use-toast";

export interface UploadedDocument {
  id: string;
  name: string;
  uploadedAt: Date;
  content?: string; // For JSON files
  isJson?: boolean;
}

const Index = () => {
  const [documents, setDocuments] = useLocalStorage<UploadedDocument[]>("documents", []);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [generatedReport, setGeneratedReport] = useLocalStorage<string | null>("generatedReport", null);
  const [reportData, setReportData] = useLocalStorage<any>("reportData", null);
  const [customPrompt, setCustomPrompt] = useLocalStorage<string | null>("customPrompt", null);
  const [promptFileName, setPromptFileName] = useLocalStorage<string | null>("promptFileName", null);
  const [questionsTemplate, setQuestionsTemplate] = useLocalStorage<any[] | null>("questionsTemplate", null);
  const [questionsFileName, setQuestionsFileName] = useLocalStorage<string | null>("questionsFileName", null);
  const { toast } = useToast();

  const handleFileSelect = (files: File[]) => {
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const handleClearSelectedFiles = () => {
    setSelectedFiles([]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileUpload = (docs: UploadedDocument[]) => {
    setDocuments((prev) => [...prev, ...docs]);
    setSelectedFiles([]);
  };

  const handleRemoveDocument = (id: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
  };

  const handleClearAllDocuments = () => {
    setDocuments([]);
    setSelectedFiles([]);
  };

  const handleResetAll = () => {
    setDocuments([]);
    setSelectedFiles([]);
    setCustomPrompt(null);
    setPromptFileName(null);
    setQuestionsTemplate(null);
    setQuestionsFileName(null);
    setGeneratedReport(null);
    setReportData(null);
    toast({
      title: "Reset Complete",
      description: "All data has been cleared. You can start fresh!",
    });
  };

  const handleReportGenerated = (html: string, data: any) => {
    setGeneratedReport(html);
    setReportData(data);
  };

  const handlePromptLoaded = (prompt: string, fileName: string) => {
    setCustomPrompt(prompt);
    setPromptFileName(fileName);
  };

  const handlePromptRemoved = () => {
    setCustomPrompt(null);
    setPromptFileName(null);
    toast({
      title: "Prompt removed",
      description: "Using default prompt",
    });
  };

  const handleQuestionsLoaded = (questions: any[], fileName: string) => {
    setQuestionsTemplate(questions);
    setQuestionsFileName(fileName);
  };

  const handleQuestionsRemoved = () => {
    setQuestionsTemplate(null);
    setQuestionsFileName(null);
    toast({
      title: "Questions template removed",
      description: "You can now ask questions freely",
    });
  };

  const workflowSteps = [
    {
      id: 1,
      title: "Upload Reference Documents",
      description: "Upload the documents you want to query",
      completed: documents.length > 0,
    },
    {
      id: 2,
      title: "Import Custom Prompt (Optional)",
      description: "Upload a custom prompt file to guide the AI",
      completed: !!promptFileName,
    },
    {
      id: 3,
      title: "Upload Questions or Ask Directly",
      description: "Batch upload questions or interact via chat",
      completed: !!questionsFileName || false,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Document Q&A System</h1>
                <p className="text-sm text-muted-foreground">Structured workflow for document analysis</p>
              </div>
            </div>
            <Button
              onClick={handleResetAll}
              variant="outline"
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Reset All
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6 max-w-7xl mx-auto">
          {/* Workflow Guide */}
          <WorkflowSteps steps={workflowSteps} />
          
          {/* File Upload Section */}
          <div className="grid lg:grid-cols-[400px,1fr] gap-6">
            <aside className="space-y-6">
              {/* Step 1: Upload Documents */}
              <FileUpload
                onFileSelect={handleFileSelect}
                selectedFiles={selectedFiles}
                onUploadComplete={handleFileUpload}
                onClearSelected={handleClearSelectedFiles}
                onRemoveFile={handleRemoveFile}
              />
              <DocumentList 
                documents={documents} 
                onRemove={handleRemoveDocument}
                onClearAll={handleClearAllDocuments}
              />

              {/* Step 2: Upload Custom Prompt */}
              <PromptUploader
                customPrompt={customPrompt}
                promptFileName={promptFileName}
                onPromptLoaded={handlePromptLoaded}
                onPromptRemoved={handlePromptRemoved}
              />

              {/* Step 3: Upload Questions */}
              <QuestionsUploader
                questionsTemplate={questionsTemplate}
                questionsFileName={questionsFileName}
                onQuestionsLoaded={handleQuestionsLoaded}
                onQuestionsRemoved={handleQuestionsRemoved}
              />
            </aside>

            {/* Chat Area */}
            <div className="lg:min-h-[calc(100vh-200px)]">
              <ChatInterface 
                documents={documents}
                onReportGenerated={handleReportGenerated}
                customPrompt={customPrompt}
                questionsTemplate={questionsTemplate}
                onClearChat={() => {
                  setGeneratedReport(null);
                  setReportData(null);
                }}
              />
            </div>
          </div>

          {/* Report Viewer - Only show when report is generated */}
          {generatedReport && reportData && (
            <ReportViewer 
              reportHtml={generatedReport}
              reportData={reportData}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
