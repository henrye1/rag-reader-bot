import { useState, useEffect } from "react";
import { FileUpload } from "@/components/FileUpload";
import { ChatInterface } from "@/components/ChatInterface";
import { DocumentList } from "@/components/DocumentList";
import { ReportViewer } from "@/components/ReportViewer";
import { WorkflowSteps } from "@/components/WorkflowSteps";
import { PromptUploader } from "@/components/PromptUploader";
import { QuestionsUploader } from "@/components/QuestionsUploader";
import { SkillSelector } from "@/components/SkillSelector";
import { SkillManager } from "@/components/SkillManager";
import { RagConfigPanel } from "@/components/RagConfigPanel";
import { RetrievalConfigPanel } from "@/components/RetrievalConfigPanel";
import { RagAssistantDialog } from "@/components/RagAssistantDialog";
import { IngestionConfigPanel } from "@/components/IngestionConfigPanel";
import { ReprocessDialog } from "@/components/ReprocessDialog";
import { OutputFormatPanel, DEFAULT_OUTPUT_FORMAT, type OutputFormatConfig } from "@/components/OutputFormatPanel";
import { FileText, Trash2 } from "lucide-react";
import { HelpDialog } from "@/components/HelpDialog";
import { Button } from "@/components/ui/button";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Skill } from "@/integrations/supabase/types";
import type { RagConfig, IngestionConfig, RetrievalConfig } from "@/integrations/supabase/rag-types";
import { DEFAULT_RAG_CONFIG, DEFAULT_INGESTION_CONFIG, DEFAULT_RETRIEVAL_CONFIG } from "@/integrations/supabase/rag-types";

export interface UploadedDocument {
  id: string;              // Local ID for UI tracking
  documentId: string;      // Supabase document UUID
  name: string;
  uploadedAt: Date;
  status: 'processing' | 'ready' | 'error';
  totalChunks?: number;
  totalCharacters?: number;
  errorMessage?: string;
  ingestionConfig?: IngestionConfig | null;
  hasOriginalText?: boolean;
}

const Index = () => {
  // Store document metadata in localStorage
  const [documents, setDocuments] = useLocalStorage<UploadedDocument[]>("documents", []);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [generatedReport, setGeneratedReport] = useLocalStorage<string | null>("generatedReport", null);
  const [reportData, setReportData] = useLocalStorage<Record<string, unknown> | null>("reportData", null);
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [promptFileName, setPromptFileName] = useLocalStorage<string | null>("promptFileName", null);
  const [questionsTemplate, setQuestionsTemplate] = useState<Record<string, unknown>[] | null>(null);
  const [questionsFileName, setQuestionsFileName] = useLocalStorage<string | null>("questionsFileName", null);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Skills state
  const [selectedSkill, setSelectedSkill] = useLocalStorage<Skill | null>("selectedSkill", null);
  const [showSkillManager, setShowSkillManager] = useState(false);
  const [showCustomPromptUpload, setShowCustomPromptUpload] = useState(false);
  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0);

  // RAG Config state (query-time)
  const [ragConfig, setRagConfig] = useLocalStorage<Omit<RagConfig, 'id' | 'created_at'>>(
    "ragConfig",
    DEFAULT_RAG_CONFIG
  );
  const [showRagAssistant, setShowRagAssistant] = useState(false);

  // Reprocess dialog state
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
  const [reprocessDocument, setReprocessDocument] = useState<UploadedDocument | null>(null);

  // Ingestion Config state (upload-time)
  const [ingestionConfig, setIngestionConfig] = useLocalStorage<IngestionConfig>(
    "ingestionConfig",
    DEFAULT_INGESTION_CONFIG
  );

  // Retrieval Config state (retrieval-time)
  const [retrievalConfig, setRetrievalConfig] = useLocalStorage<RetrievalConfig>(
    "retrievalConfig",
    DEFAULT_RETRIEVAL_CONFIG
  );

  // Output Format state
  const [outputFormat, setOutputFormat] = useLocalStorage<OutputFormatConfig>(
    "outputFormat",
    DEFAULT_OUTPUT_FORMAT
  );

  const { toast } = useToast();

  // Restore dates from localStorage (they get serialized as strings)
  useEffect(() => {
    setDocuments(prev => prev.map(doc => ({
      ...doc,
      uploadedAt: new Date(doc.uploadedAt)
    })));
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
    setDocuments((prev) => [...prev, ...docs]);
    setSelectedFiles([]);
  };

  const handleRemoveDocument = async (id: string) => {
    const doc = documents.find(d => d.id === id);
    if (doc?.documentId) {
      // Delete from Supabase
      try {
        await supabase.from('documents').delete().eq('id', doc.documentId);
      } catch (error) {
        console.error("Failed to delete document from database:", error);
      }
    }
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
  };

  const handleClearAllDocuments = async () => {
    // Delete all documents from Supabase
    for (const doc of documents) {
      if (doc.documentId) {
        try {
          await supabase.from('documents').delete().eq('id', doc.documentId);
        } catch (error) {
          console.error("Failed to delete document:", error);
        }
      }
    }
    setDocuments([]);
    setSelectedFiles([]);
  };

  const handleResetAll = async () => {
    await handleClearAllDocuments();
    setCustomPrompt(null);
    setPromptFileName(null);
    setQuestionsTemplate(null);
    setQuestionsFileName(null);
    setGeneratedReport(null);
    setReportData(null);
    setSelectedSkill(null);
    setShowCustomPromptUpload(false);
    setRagConfig(DEFAULT_RAG_CONFIG);
    setIngestionConfig(DEFAULT_INGESTION_CONFIG);
    setRetrievalConfig(DEFAULT_RETRIEVAL_CONFIG);
    setOutputFormat(DEFAULT_OUTPUT_FORMAT);
    setResetTrigger(prev => prev + 1);
    toast({
      title: "Reset Complete",
      description: "All data has been cleared. You can start fresh!",
    });
  };

  const handleReportGenerated = (html: string, data: Record<string, unknown>, isFollowUp?: boolean) => {
    if (isFollowUp && generatedReport) {
      // Cumulative mode: append new content to existing report
      const newAnswer = (data as { answer?: string }).answer || '';
      const isResearchContent = (data as { researchMode?: boolean }).researchMode === true;
      const timestamp = new Date().toLocaleTimeString();

      let sectionToAdd: string;

      if (isResearchContent) {
        // Research content goes to dedicated "External Research & Validation" section
        sectionToAdd = `
        <div class="section research-section" style="margin-top: 30px; border-top: 3px dashed #9c27b0; padding-top: 20px; background: linear-gradient(135deg, #f3e5f5 0%, #fce4ec 100%); border-radius: 8px; padding: 20px;">
          <h2 style="color: #9c27b0; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">🔬</span>
            EXTERNAL RESEARCH & VALIDATION (${timestamp})
          </h2>
          <p style="font-style: italic; color: #666; margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.7); border-radius: 4px;">
            The following external research and validation references the methodology and findings discussed in the document analysis above.
            This information is sourced from general knowledge and academic literature - no confidential document data was used.
          </p>
          ${formatFollowUpContent(newAnswer)}
        </div>
      `;
      } else {
        // Regular follow-up section (RAG-based)
        sectionToAdd = `
        <div class="section follow-up-section" style="margin-top: 30px; border-top: 3px dashed #2196f3; padding-top: 20px;">
          <h2 style="color: #2196f3;">FOLLOW-UP RESPONSE (${timestamp})</h2>
          ${formatFollowUpContent(newAnswer)}
        </div>
      `;
      }

      // Insert the section before the closing </div></body>
      const insertPoint = generatedReport.lastIndexOf('</div>\n</body>');
      if (insertPoint !== -1) {
        const updatedReport = generatedReport.slice(0, insertPoint) + sectionToAdd + generatedReport.slice(insertPoint);
        setGeneratedReport(updatedReport);
      } else {
        // Fallback: just append
        setGeneratedReport(generatedReport + sectionToAdd);
      }

      // Merge report data
      setReportData(prev => ({
        ...prev,
        ...data,
        followUpCount: ((prev as { followUpCount?: number })?.followUpCount || 0) + 1,
        researchCount: isResearchContent
          ? ((prev as { researchCount?: number })?.researchCount || 0) + 1
          : (prev as { researchCount?: number })?.researchCount || 0,
      }));
    } else if (html) {
      // Initial report: replace completely (only if we have HTML)
      setGeneratedReport(html);
      setReportData(data);
    }
    // If no html and not a follow-up, ignore (can't create initial report from research-only)
  };

  // Helper function to format follow-up content (similar to formatAnalysisContent in Edge Function)
  const formatFollowUpContent = (answer: string): string => {
    let html = answer;

    // Strip citations for clean report output
    html = html.replace(/\[Source:\s*[^\]]+\]/gi, '');
    html = html.replace(/\[Chunk\s*\d+[^\]]*\]/gi, '');
    html = html.replace(/\(Source:\s*[^)]+\)/gi, '');
    html = html.replace(/\s{2,}/g, ' ');
    html = html.replace(/\n\s*\n\s*\n/g, '\n\n');

    // Format markdown to HTML
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>\s*<h/g, '<h');
    html = html.replace(/<\/h([23])>\s*<\/p>/g, '</h$1>');

    return html;
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

  const handleQuestionsLoaded = (questions: Record<string, unknown>[], fileName: string) => {
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

  // Skills handlers
  const handleSkillSelect = (skill: Skill | null) => {
    setSelectedSkill(skill);
    if (skill) {
      // When a skill is selected, use its prompt content
      setCustomPrompt(skill.prompt_content);
      setPromptFileName(null); // Clear uploaded prompt file name
      setShowCustomPromptUpload(false);

      // If skill has questions template, use it
      if (skill.questions_template && skill.questions_template.length > 0) {
        setQuestionsTemplate(skill.questions_template);
        setQuestionsFileName(`${skill.name} (${skill.questions_template.length} questions)`);
      }

      toast({
        title: "Skill Activated",
        description: `Using "${skill.name}" expert knowledge`,
      });
    } else {
      // When skill is cleared, clear the prompt (unless custom upload is active)
      if (!showCustomPromptUpload) {
        setCustomPrompt(null);
      }
    }
  };

  const handleShowCustomUpload = () => {
    setShowCustomPromptUpload(true);
    setSelectedSkill(null);
  };

  const handleSkillsChanged = () => {
    setSkillsRefreshKey(prev => prev + 1);
  };

  // Reprocess handlers
  const handleOpenReprocess = (doc: UploadedDocument) => {
    setReprocessDocument(doc);
    setShowReprocessDialog(true);
  };

  const handleReprocessComplete = (documentId: string, newChunkCount: number) => {
    setDocuments(prev => prev.map(doc => {
      if (doc.documentId === documentId) {
        return {
          ...doc,
          totalChunks: newChunkCount,
          status: 'ready' as const,
        };
      }
      return doc;
    }));
    toast({
      title: "Document Reprocessed",
      description: `Document now has ${newChunkCount} chunks`,
    });
  };

  // Get ready documents for chat
  const readyDocuments = documents.filter(doc => doc.status === 'ready');

  const workflowSteps = [
    {
      id: 1,
      title: "Upload Client Documentation",
      description: "Upload the documents to be reviewed/assessed",
      completed: readyDocuments.length > 0,
    },
    {
      id: 2,
      title: "Select Expert Skill",
      description: "Choose an expert agent or upload custom knowledge",
      completed: !!selectedSkill || !!promptFileName,
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
                <p className="text-sm text-muted-foreground">RAG-powered document analysis with vector search</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <HelpDialog />
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
              {/* Ingestion Configuration (before upload) */}
              <IngestionConfigPanel
                config={ingestionConfig}
                onConfigChange={setIngestionConfig}
              />

              {/* Step 1: Upload Documents */}
              <FileUpload
                onFileSelect={handleFileSelect}
                selectedFiles={selectedFiles}
                onUploadComplete={handleFileUpload}
                onClearSelected={handleClearSelectedFiles}
                onRemoveFile={handleRemoveFile}
                ingestionConfig={ingestionConfig}
              />
              <DocumentList
                documents={documents}
                onRemove={handleRemoveDocument}
                onClearAll={handleClearAllDocuments}
                onReprocess={handleOpenReprocess}
              />

              {/* Step 2: Select Expert Skill or Upload Custom Prompt */}
              <SkillSelector
                key={skillsRefreshKey}
                selectedSkill={selectedSkill}
                onSkillSelect={handleSkillSelect}
                onManageSkills={() => setShowSkillManager(true)}
                onUploadCustom={handleShowCustomUpload}
              />

              {/* RAG Configuration Panel */}
              <RagConfigPanel
                config={ragConfig}
                onConfigChange={setRagConfig}
                onOpenAssistant={() => setShowRagAssistant(true)}
              />

              {/* Retrieval Configuration Panel */}
              <RetrievalConfigPanel
                config={retrievalConfig}
                onConfigChange={setRetrievalConfig}
              />

              {/* Output Format Configuration Panel */}
              <OutputFormatPanel
                config={outputFormat}
                onConfigChange={setOutputFormat}
              />

              {/* Custom Prompt Upload (shown when user chooses to upload custom) */}
              {showCustomPromptUpload && (
                <PromptUploader
                  customPrompt={customPrompt}
                  promptFileName={promptFileName}
                  onPromptLoaded={handlePromptLoaded}
                  onPromptRemoved={() => {
                    handlePromptRemoved();
                    setShowCustomPromptUpload(false);
                  }}
                />
              )}

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
                documents={readyDocuments}
                onReportGenerated={handleReportGenerated}
                customPrompt={customPrompt}
                questionsTemplate={questionsTemplate}
                resetTrigger={resetTrigger}
                ragConfig={ragConfig}
                retrievalConfig={retrievalConfig}
                outputFormat={outputFormat}
                selectedSkill={selectedSkill}
                onSkillChange={handleSkillSelect}
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

      {/* Skill Manager Dialog */}
      <SkillManager
        isOpen={showSkillManager}
        onClose={() => setShowSkillManager(false)}
        onSkillsChanged={handleSkillsChanged}
      />

      {/* RAG Assistant Dialog */}
      <RagAssistantDialog
        open={showRagAssistant}
        onOpenChange={setShowRagAssistant}
        onApplyConfig={(config, retrievalCfg) => {
          setRagConfig(config);
          if (retrievalCfg) {
            setRetrievalConfig(retrievalCfg);
          }
          toast({
            title: "Configuration Applied",
            description: `Applied "${config.name}" settings with retrieval optimizations`,
          });
        }}
      />

      {/* Reprocess Document Dialog */}
      <ReprocessDialog
        open={showReprocessDialog}
        onOpenChange={setShowReprocessDialog}
        document={reprocessDocument ? {
          id: reprocessDocument.documentId,
          name: reprocessDocument.name,
          totalChunks: reprocessDocument.totalChunks || 0,
          ingestionConfig: reprocessDocument.ingestionConfig,
          hasOriginalText: reprocessDocument.hasOriginalText,
        } : null}
        onReprocessComplete={handleReprocessComplete}
      />
    </div>
  );
};

export default Index;
