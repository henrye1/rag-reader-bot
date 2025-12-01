import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { ChatInterface } from "@/components/ChatInterface";
import { DocumentList } from "@/components/DocumentList";
import { ReportViewer } from "@/components/ReportViewer";
import { FileText } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";

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

  const handleReportGenerated = (html: string, data: any) => {
    setGeneratedReport(html);
    setReportData(data);
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Document Q&A Bot</h1>
              <p className="text-sm text-muted-foreground">Ask questions about your documents</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6 max-w-7xl mx-auto">
          {/* File Upload Section */}
          <div className="grid lg:grid-cols-[350px,1fr] gap-6">
            <aside className="space-y-6">
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
            </aside>

            {/* Chat Area */}
            <div className="lg:min-h-[calc(100vh-200px)]">
              <ChatInterface 
                documents={documents}
                onReportGenerated={handleReportGenerated}
              />
            </div>
          </div>

          {/* Report Viewer */}
          {generatedReport && (
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
