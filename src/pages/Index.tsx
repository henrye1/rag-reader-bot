import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { AssessmentToolkitUploader } from "@/components/AssessmentToolkitUploader";
import { ReviewGenerator } from "@/components/ReviewGenerator";
import { ChatInterface } from "@/components/ChatInterface";
import { DocumentList } from "@/components/DocumentList";
import { ReportViewer } from "@/components/ReportViewer";
import { WorkflowSteps } from "@/components/WorkflowSteps";
import { PromptUploader } from "@/components/PromptUploader";
import { QuestionsUploader } from "@/components/QuestionsUploader";
import { FileCheck, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/hooks/use-toast";

export interface UploadedDocument {
  id: string;
  name: string;
  uploadedAt: Date;
  content?: string; // For JSON files
  isJson?: boolean;
  type?: 'client' | 'toolkit'; // Distinguish between client docs and assessment toolkit
}

const Index = () => {
  // Client Documents
  const [clientDocuments, setClientDocuments] = useLocalStorage<UploadedDocument[]>("clientDocuments", []);
  const [selectedClientFiles, setSelectedClientFiles] = useState<File[]>([]);
  
  // Assessment Toolkit
  const [toolkitDocuments, setToolkitDocuments] = useLocalStorage<UploadedDocument[]>("toolkitDocuments", []);
  const [selectedToolkitFiles, setSelectedToolkitFiles] = useState<File[]>([]);
  
  // Legacy fields (for backward compatibility, will be removed)
  const [documents, setDocuments] = useLocalStorage<UploadedDocument[]>("documents", []);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  
  // Report and Review
  const [generatedReport, setGeneratedReport] = useLocalStorage<string | null>("auditReport", null);
  const [reportData, setReportData] = useLocalStorage<any>("auditReportData", null);
  
  // Custom configurations (removed as they're not needed for audit reviews)
  const [customPrompt, setCustomPrompt] = useLocalStorage<string | null>("customPrompt", null);
  const [promptFileName, setPromptFileName] = useLocalStorage<string | null>("promptFileName", null);
  const [questionsTemplate, setQuestionsTemplate] = useLocalStorage<any[] | null>("questionsTemplate", null);
  const [questionsFileName, setQuestionsFileName] = useLocalStorage<string | null>("questionsFileName", null);
  
  const [resetTrigger, setResetTrigger] = useState(0);
  const { toast } = useToast();

  // Client Documents Handlers
  const handleClientFileSelect = (files: File[]) => {
    setSelectedClientFiles((prev) => [...prev, ...files]);
  };

  const handleClearSelectedClientFiles = () => {
    setSelectedClientFiles([]);
  };

  const handleRemoveClientFile = (index: number) => {
    setSelectedClientFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClientFileUpload = (docs: UploadedDocument[]) => {
    setClientDocuments((prev) => [...prev, ...docs]);
    setSelectedClientFiles([]);
  };

  const handleRemoveClientDocument = (id: string) => {
    setClientDocuments((prev) => prev.filter((doc) => doc.id !== id));
  };

  const handleClearAllClientDocuments = () => {
    setClientDocuments([]);
    setSelectedClientFiles([]);
  };

  // Toolkit Documents Handlers
  const handleToolkitFileSelect = (files: File[]) => {
    setSelectedToolkitFiles((prev) => [...prev, ...files]);
  };

  const handleClearSelectedToolkitFiles = () => {
    setSelectedToolkitFiles([]);
  };

  const handleRemoveToolkitFile = (index: number) => {
    setSelectedToolkitFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleToolkitFileUpload = (docs: UploadedDocument[]) => {
    setToolkitDocuments((prev) => [...prev, ...docs]);
    setSelectedToolkitFiles([]);
  };

  const handleRemoveToolkitDocument = (id: string) => {
    setToolkitDocuments((prev) => prev.filter((doc) => doc.id !== id));
  };

  const handleClearAllToolkitDocuments = () => {
    setToolkitDocuments([]);
    setSelectedToolkitFiles([]);
  };

  // Legacy handlers (for backward compatibility)
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
    // Reset client documents
    setClientDocuments([]);
    setSelectedClientFiles([]);
    
    // Reset toolkit documents
    setToolkitDocuments([]);
    setSelectedToolkitFiles([]);
    
    // Reset legacy documents
    setDocuments([]);
    setSelectedFiles([]);
    
    // Reset prompts and templates
    setCustomPrompt(null);
    setPromptFileName(null);
    setQuestionsTemplate(null);
    setQuestionsFileName(null);
    
    // Reset reports
    setGeneratedReport(null);
    setReportData(null);
    
    // Trigger chat reset by incrementing the trigger
    setResetTrigger(prev => prev + 1);
    
    toast({
      title: "Reset Complete",
      description: "All audit review data has been cleared. You can start fresh!",
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
      title: "Upload Client Documents",
      description: "Upload client methodology, policy, or framework documents",
      completed: clientDocuments.length > 0,
    },
    {
      id: 2,
      title: "Upload Assessment Toolkit",
      description: "Upload your compliance requirements and assessment criteria",
      completed: toolkitDocuments.length > 0,
    },
    {
      id: 3,
      title: "Generate Review Report",
      description: "Compare documents and generate structured compliance report",
      completed: !!generatedReport,
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
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Audit Review System</h1>
                <p className="text-sm text-muted-foreground">Automated compliance assessment and gap analysis</p>
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
              {/* Step 1: Upload Client Documents */}
              <FileUpload
                onFileSelect={handleClientFileSelect}
                selectedFiles={selectedClientFiles}
                onUploadComplete={handleClientFileUpload}
                onClearSelected={handleClearSelectedClientFiles}
                onRemoveFile={handleRemoveClientFile}
              />
              <DocumentList 
                documents={clientDocuments} 
                onRemove={handleRemoveClientDocument}
                onClearAll={handleClearAllClientDocuments}
              />

              {/* Step 2: Upload Assessment Toolkit */}
              <AssessmentToolkitUploader
                onFileSelect={handleToolkitFileSelect}
                selectedFiles={selectedToolkitFiles}
                onUploadComplete={handleToolkitFileUpload}
                onClearSelected={handleClearSelectedToolkitFiles}
                onRemoveFile={handleRemoveToolkitFile}
                uploadedDocuments={toolkitDocuments}
              />
            </aside>

            {/* Review Generation Area */}
            <div className="lg:min-h-[calc(100vh-200px)]">
              <ReviewGenerator 
                clientDocuments={clientDocuments}
                toolkitDocuments={toolkitDocuments}
                onReportGenerated={handleReportGenerated}
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
