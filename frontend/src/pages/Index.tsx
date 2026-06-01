import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { FileUpload } from "@/components/FileUpload";
import { ChatInterface } from "@/components/ChatInterface";
import { DocumentList } from "@/components/DocumentList";
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
import { POPIACompliancePanel, DEFAULT_POPIA_CONFIG, type POPIAConfig } from "@/components/POPIACompliancePanel";
import { DocumentComparison } from "@/components/DocumentComparison";
import { FileText, Trash2, Settings } from "lucide-react";
import { HelpDialog } from "@/components/HelpDialog";
import { Button } from "@/components/ui/button";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/hooks/use-toast";
import { useDocumentStatusPoller } from "@/hooks/use-document-status-poller";
import { apiFetch, apiCall } from "@/lib/api";
import type { Skill } from "@/types/database";
import type { RagConfig, IngestionConfig, RetrievalConfig } from "@/types/rag-types";
import { DEFAULT_RAG_CONFIG, DEFAULT_INGESTION_CONFIG, DEFAULT_RETRIEVAL_CONFIG } from "@/types/rag-types";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { AssessmentDocumentPanel } from "@/components/AssessmentDocumentPanel";
import { useAssessmentDocument } from "@/hooks/useAssessmentDocument";
import { assessmentToSections } from "@/lib/assessmentToDocument";
import { appendAnswerToSections, type SectionRouting } from "@/lib/appendToSection";
import { extractAssessmentJson } from "@/lib/extractAssessmentJson";

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
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [promptFileName, setPromptFileName] = useLocalStorage<string | null>("promptFileName", null);
  const [questionsTemplate, setQuestionsTemplate] = useState<Record<string, unknown>[] | null>(null);
  const [questionsFileName, setQuestionsFileName] = useLocalStorage<string | null>("questionsFileName", null);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Assessment document state
  const { doc, setDoc, createDocument, saving } = useAssessmentDocument();

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

  // POPIA Compliance state
  const [popiaConfig, setPopiaConfig] = useLocalStorage<POPIAConfig>(
    "popiaConfig",
    DEFAULT_POPIA_CONFIG
  );

  // Last PII detection result for UI display
  const [lastPIIDetection, setLastPIIDetection] = useState<{
    hasPII: boolean;
    riskLevel: 'none' | 'low' | 'medium' | 'high';
    detectedTypes: string[];
  } | null>(null);

  const { toast } = useToast();

  // Restore dates from localStorage (they get serialized as strings)
  // and recover stale "processing" documents on startup
  useEffect(() => {
    setDocuments(prev => prev.map(doc => ({
      ...doc,
      uploadedAt: new Date(doc.uploadedAt)
    })));

    // Startup recovery: check DB status for any documents stuck as "processing"
    (async () => {
      const stored: UploadedDocument[] = JSON.parse(localStorage.getItem("documents") || "[]");
      const processing = stored.filter(d => d.status === "processing");
      if (processing.length === 0) return;

      const ids = processing.map(d => d.documentId);
      const { data } = await apiFetch<{ id: string; status: string; total_chunks: number | null }[]>(
        "documents/status",
        { params: { ids: ids.join(",") } }
      );

      if (!data || data.length === 0) return;

      const updates: Record<string, { status: "ready" | "error"; totalChunks?: number }> = {};
      for (const row of data) {
        if (row.status === "ready" || row.status === "error") {
          updates[row.id] = {
            status: row.status as "ready" | "error",
            totalChunks: row.total_chunks ?? undefined,
          };
        }
      }

      if (Object.keys(updates).length > 0) {
        setDocuments(prev => prev.map(doc => {
          const update = updates[doc.documentId];
          if (update) {
            return { ...doc, status: update.status, totalChunks: update.totalChunks ?? doc.totalChunks };
          }
          return doc;
        }));
      }
    })();
  }, []);

  // Poller: watch processing documents for status changes
  const processingDocumentIds = useMemo(
    () => documents.filter(d => d.status === "processing").map(d => d.documentId),
    [documents]
  );

  const handleDocumentStatusChange = useCallback(
    (documentId: string, status: "ready" | "error", data: { totalChunks?: number; errorMessage?: string; hasOriginalText?: boolean }) => {
      setDocuments(prev => prev.map(doc => {
        if (doc.documentId === documentId) {
          return {
            ...doc,
            status,
            totalChunks: data.totalChunks ?? doc.totalChunks,
            errorMessage: data.errorMessage,
            hasOriginalText: data.hasOriginalText ?? doc.hasOriginalText,
          };
        }
        return doc;
      }));

      if (status === "ready") {
        toast({ title: "Document ready", description: "A document has finished indexing and is now available for RAG search." });
      } else {
        toast({ title: "Document error", description: data.errorMessage || "A document failed during processing.", variant: "destructive" });
      }
    },
    [setDocuments, toast]
  );

  useDocumentStatusPoller(processingDocumentIds, handleDocumentStatusChange);

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
      try {
        await apiFetch(`documents/${doc.documentId}`, { method: 'DELETE' });
      } catch (error) {
        console.error("Failed to delete document from database:", error);
      }
    }
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
  };

  const handleRetryDocument = async (doc: UploadedDocument) => {
    // Set back to processing so the poller picks it up
    setDocuments(prev => prev.map(d =>
      d.id === doc.id ? { ...d, status: 'processing' as const, errorMessage: undefined } : d
    ));

    const { error } = await apiCall('reprocess-document', {
      documentId: doc.documentId,
      ingestionConfig: doc.ingestionConfig || ingestionConfig,
    });

    if (error) {
      setDocuments(prev => prev.map(d =>
        d.id === doc.id ? { ...d, status: 'error' as const, errorMessage: error.message } : d
      ));
      toast({ title: "Retry failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Retrying", description: `Re-processing ${doc.name}...` });
    }
  };

  const handleClearAllDocuments = async () => {
    for (const doc of documents) {
      if (doc.documentId) {
        try {
          await apiFetch(`documents/${doc.documentId}`, { method: 'DELETE' });
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

  // Compliance update handler (extracted so it can be shared by both ChatInterface instances)
  const handleComplianceUpdate = (info: { piiDetected: boolean; riskLevel: 'none' | 'low' | 'medium' | 'high'; detectedTypes?: string[] } | null) => {
    if (info) {
      setLastPIIDetection({
        hasPII: info.piiDetected,
        riskLevel: info.riskLevel,
        detectedTypes: info.detectedTypes || [],
      });
    }
  };

  // Keep a ref to the latest document so the async answer handler reads current
  // state rather than a stale closure value across rapid successive answers.
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; }, [doc]);
  // Guards against creating duplicate documents if two answers arrive before the
  // first createDocument POST returns (both would otherwise see doc === null).
  const creatingRef = useRef(false);

  // Answer-for-document handler: seeds or appends to the assessment document
  const handleAnswerForDocument = async (question: string, answer: string, routing: SectionRouting | null) => {
    const currentDoc = docRef.current;
    const parsedAssessment = extractAssessmentJson(answer);
    if (parsedAssessment) {
      const seeded = assessmentToSections(parsedAssessment);
      if (currentDoc) {
        const kept = currentDoc.sections.filter((s) => s.origin !== "assessment");
        setDoc({ ...currentDoc, sections: [...seeded, ...kept], sourceAssessment: parsedAssessment, title: parsedAssessment.title || currentDoc.title });
      } else if (!creatingRef.current) {
        creatingRef.current = true;
        try {
          await createDocument({
            title: parsedAssessment.title || "Assessment",
            entity: parsedAssessment.entity || "",
            reportingDate: parsedAssessment.reportingDate || "",
            documentIds: readyDocuments.map((d) => d.documentId),
            sections: seeded,
            sourceAssessment: parsedAssessment,
          });
        } finally {
          creatingRef.current = false;
        }
      }
      return;
    }
    const safeRouting: SectionRouting = routing ?? { targetSectionId: null, sectionTitle: question.slice(0, 60), isNew: true };
    if (currentDoc) {
      setDoc({ ...currentDoc, sections: appendAnswerToSections(currentDoc.sections, safeRouting, question, answer) });
    } else if (!creatingRef.current) {
      creatingRef.current = true;
      try {
        await createDocument({
          title: "Working notes",
          documentIds: readyDocuments.map((d) => d.documentId),
          sections: appendAnswerToSections([], { ...safeRouting, isNew: true }, question, answer),
        });
      } finally {
        creatingRef.current = false;
      }
    }
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

  // Config sidebar content — rendered inside the aside (no-doc mode) or the Sheet (doc mode)
  const configSidebarContent = (
    <div className="space-y-6">
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
        onRetry={handleRetryDocument}
      />

      {/* Document Comparison - show when 2+ documents available */}
      {readyDocuments.length >= 2 && (
        <div className="flex justify-end">
          <DocumentComparison
            documents={documents}
            ragConfig={ragConfig}
            retrievalConfig={retrievalConfig}
            outputFormat={outputFormat}
            popiaConfig={popiaConfig}
            onAnswerForDocument={handleAnswerForDocument}
          />
        </div>
      )}

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

      {/* POPIA Compliance Panel */}
      <POPIACompliancePanel
        config={popiaConfig}
        onConfigChange={setPopiaConfig}
        lastPIIDetection={lastPIIDetection}
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
    </div>
  );

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
          {doc ? (
            /* When an assessment document is open: Sheet sidebar + resizable split */
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Settings className="h-4 w-4" />
                      Configuration
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[400px] sm:w-[480px] overflow-y-auto">
                    <div className="pt-6">
                      {configSidebarContent}
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              <div className="lg:min-h-[calc(100vh-200px)]">
                <ResizablePanelGroup direction="horizontal" className="min-h-[calc(100vh-220px)] rounded-lg border">
                  <ResizablePanel defaultSize={50} minSize={30}>
                    <div className="h-full p-2">
                      <ChatInterface
                        documents={readyDocuments}
                        customPrompt={customPrompt}
                        questionsTemplate={questionsTemplate}
                        resetTrigger={resetTrigger}
                        ragConfig={ragConfig}
                        retrievalConfig={retrievalConfig}
                        outputFormat={outputFormat}
                        popiaConfig={popiaConfig}
                        selectedSkill={selectedSkill}
                        onSkillChange={handleSkillSelect}
                        skillsRefreshKey={skillsRefreshKey}
                        documentSections={doc.sections.map((s) => ({ id: s.id, title: s.title }))}
                        onAnswerForDocument={handleAnswerForDocument}
                        onComplianceUpdate={handleComplianceUpdate}
                        onClearChat={() => { /* keep document open */ }}
                      />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={50} minSize={30}>
                    <div className="h-full p-2">
                      <AssessmentDocumentPanel doc={doc} onChange={setDoc} saving={saving} />
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </div>
          ) : (
            /* No assessment document: classic aside + chat layout */
            <div className="grid lg:grid-cols-[400px,1fr] gap-6">
              <aside className="space-y-6">
                {configSidebarContent}
              </aside>

              {/* Chat Area */}
              <div className="lg:min-h-[calc(100vh-200px)]">
                <ChatInterface
                  documents={readyDocuments}
                  customPrompt={customPrompt}
                  questionsTemplate={questionsTemplate}
                  resetTrigger={resetTrigger}
                  ragConfig={ragConfig}
                  retrievalConfig={retrievalConfig}
                  outputFormat={outputFormat}
                  popiaConfig={popiaConfig}
                  selectedSkill={selectedSkill}
                  onSkillChange={handleSkillSelect}
                  skillsRefreshKey={skillsRefreshKey}
                  documentSections={[]}
                  onAnswerForDocument={handleAnswerForDocument}
                  onComplianceUpdate={handleComplianceUpdate}
                  onClearChat={() => {}}
                />
              </div>
            </div>
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
