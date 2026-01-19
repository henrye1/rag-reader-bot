import { useState, useEffect } from "react";
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
  content?: string; // For JSON/TXT files - stored in memory, not localStorage
  isJson?: boolean;
}

// In-memory content store to avoid localStorage quota issues with large files
const contentStore = new Map<string, string>();

const Index = () => {
  // Store only document metadata (without content) in localStorage
  const [documentsMeta, setDocumentsMeta] = useLocalStorage<Omit<UploadedDocument, 'content'>[]>("documentsMeta", []);
  // Keep full documents with content in state (memory only)
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [generatedReport, setGeneratedReport] = useLocalStorage<string | null>("generatedReport", null);
  const [reportData, setReportData] = useLocalStorage<any>("reportData", null);
  // Store large expert knowledge content in memory only (not localStorage)
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [promptFileName, setPromptFileName] = useLocalStorage<string | null>("promptFileName", null);
  // Store questions template in memory to avoid localStorage quota issues
  const [questionsTemplate, setQuestionsTemplate] = useState<any[] | null>(null);
  const [questionsFileName, setQuestionsFileName] = useLocalStorage<string | null>("questionsFileName", null);
  const [resetTrigger, setResetTrigger] = useState(0);
  const { toast } = useToast();

  // Sync documents from metadata on mount (content won't persist but metadata will)
  useEffect(() => {
    // Clear old localStorage keys if they exist (migration from old storage format)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('documents');
      window.localStorage.removeItem('customPrompt');
      window.localStorage.removeItem('questionsTemplate');
    }

    // Restore documents from metadata - content will be empty for previous session docs
    const restoredDocs = documentsMeta.map(meta => ({
      ...meta,
      content: contentStore.get(meta.id) || undefined,
    }));
    setDocuments(restoredDocs);
  }, []);

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
    // Store content in memory cache
    docs.forEach(doc => {
      if (doc.content) {
        contentStore.set(doc.id, doc.content);
      }
    });

    // Update full documents in state (with content)
    setDocuments((prev) => [...prev, ...docs]);

    // Update metadata in localStorage (without content to avoid quota issues)
    const newMeta = docs.map(({ content, ...meta }) => meta);
    setDocumentsMeta((prev) => [...prev, ...newMeta]);

    setSelectedFiles([]);
  };

  const handleRemoveDocument = (id: string) => {
    contentStore.delete(id);
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    setDocumentsMeta((prev) => prev.filter((doc) => doc.id !== id));
  };

  const handleClearAllDocuments = () => {
    documents.forEach(doc => contentStore.delete(doc.id));
    setDocuments([]);
    setDocumentsMeta([]);
    setSelectedFiles([]);
  };

  const handleResetAll = () => {
    // Clear content store
    contentStore.clear();
    setDocuments([]);
    setDocumentsMeta([]);
    setSelectedFiles([]);
    setCustomPrompt(null);
    setPromptFileName(null);
    setQuestionsTemplate(null);
    setQuestionsFileName(null);
    setGeneratedReport(null);
    setReportData(null);
    // Trigger chat reset by incrementing the trigger
    setResetTrigger(prev => prev + 1);
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
      description: "Using default domain specialist prompt",
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
      title: "Upload Client Documentation",
      description: "Upload the documents to be reviewed/assessed",
      completed: documents.length > 0,
    },
    {
      id: 2,
      title: "Upload Expert Knowledge",
      description: "Upload framework/methodology to guide the assessment",
      completed: !!promptFileName,
    },
    {
      id: 3,
      title: "Upload Assessment Questions",
      description: "Upload questionnaire or ask questions in chat",
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
                resetTrigger={resetTrigger}
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
