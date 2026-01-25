import { useState } from "react";
import {
  HelpCircle,
  Brain,
  Search,
  Settings,
  Zap,
  Layers,
  RefreshCw,
  Shield,
  Gauge,
  GitBranch,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export const HelpDialog = () => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <HelpCircle className="h-4 w-4" />
          Help
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            User Guide
          </DialogTitle>
          <DialogDescription>
            Learn how to use the Document Q&A System effectively
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="quickstart" className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="quickstart">Quick Start</TabsTrigger>
            <TabsTrigger value="ingestion">Ingestion</TabsTrigger>
            <TabsTrigger value="query">Query</TabsTrigger>
            <TabsTrigger value="retrieval">Retrieval</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[55vh] mt-4 pr-4">
            {/* Quick Start Tab */}
            <TabsContent value="quickstart" className="space-y-4">
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Getting Started</h3>

                <div className="space-y-3">
                  <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">1</span>
                    </div>
                    <div>
                      <p className="font-medium">Upload Documents</p>
                      <p className="text-sm text-muted-foreground">
                        Drag and drop PDF, DOCX, TXT, or JSON files. Configure ingestion settings before uploading for best results.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">2</span>
                    </div>
                    <div>
                      <p className="font-medium">Select Expert Skill</p>
                      <p className="text-sm text-muted-foreground">
                        Choose a domain expert (Financial, Legal, etc.) or upload a custom prompt to guide the AI's analysis.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">3</span>
                    </div>
                    <div>
                      <p className="font-medium">Ask Questions</p>
                      <p className="text-sm text-muted-foreground">
                        Type questions in the chat or upload a question template for batch processing. View source citations with each answer.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-lg border border-primary/20 bg-primary/5">
                  <h4 className="font-medium flex items-center gap-2 mb-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Quick Tips
                  </h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-0.5 text-primary" />
                      Use "Fast" presets for quick testing, "Accurate" for production
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-0.5 text-primary" />
                      Enable HyDE for abstract or conceptual questions
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-0.5 text-primary" />
                      Reprocess documents if you need different chunking
                    </li>
                  </ul>
                </div>
              </div>
            </TabsContent>

            {/* Ingestion Tab */}
            <TabsContent value="ingestion" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Ingestion Configuration
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Controls how documents are processed and stored. Configure before uploading.
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium">Chunking Strategies</h4>

                  <div className="grid gap-2">
                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Fixed</span>
                        <Badge variant="secondary">1x cost</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Splits text at fixed intervals. Fast and predictable. Best for simple documents.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Semantic</span>
                        <Badge variant="secondary">2x cost</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Uses AI to find natural topic boundaries. Better retrieval quality for complex docs.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Proposition</span>
                        <Badge variant="secondary">3x cost</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Breaks text into atomic factual statements. Best for financial/scientific documents.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Hierarchical</span>
                        <Badge variant="secondary">2.5x cost</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Creates parent-child relationships. Enables context expansion during retrieval.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium">Enhancements</h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between p-2 rounded bg-muted/30">
                      <span>Context Enrichment</span>
                      <span className="text-muted-foreground">Adds surrounding text for better context</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-muted/30">
                      <span>Metadata Extraction</span>
                      <span className="text-muted-foreground">Extracts section titles and headings</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-muted/30">
                      <span>Summary Chunks</span>
                      <span className="text-muted-foreground">Generates summaries for each section</span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Query Tab */}
            <TabsContent value="query" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    Query Configuration
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Controls how questions are processed before searching documents.
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium">Query Skills</h4>

                  <div className="grid gap-2">
                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">Query Rewrite</span>
                        <Badge variant="outline" className="ml-auto">+1 call</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Improves vague or poorly-formed questions. Fixes typos and expands abbreviations.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-purple-500" />
                        <span className="font-medium">HyDE</span>
                        <Badge variant="outline" className="ml-auto">+1 call</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Generates a hypothetical answer first to guide document search. Great for abstract questions.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-green-500" />
                        <span className="font-medium">Decomposition</span>
                        <Badge variant="outline" className="ml-auto">+1 call</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Breaks complex multi-part questions into simpler sub-questions.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-orange-500" />
                        <span className="font-medium">Verification</span>
                        <Badge variant="outline" className="ml-auto">+1 call</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Cross-checks answers against source documents. Flags unsupported claims.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-cyan-500" />
                        <span className="font-medium">Confidence</span>
                        <Badge variant="outline" className="ml-auto">+1 call</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Scores answer confidence (High/Medium/Low) with reasoning about reliability.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        <span className="font-medium">Reasoning</span>
                        <Badge variant="outline" className="ml-auto">+0 calls</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Enables chain-of-thought reasoning for complex analytical questions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Retrieval Tab */}
            <TabsContent value="retrieval" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Search className="h-5 w-5 text-primary" />
                    Retrieval Configuration
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Controls how documents are searched and results are processed.
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium">Retrieval Skills</h4>

                  <div className="grid gap-2">
                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">Reranking</span>
                        <Badge variant="outline" className="ml-auto">Medium latency</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Re-scores retrieved chunks with a more accurate model. Improves relevance ranking.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-green-500" />
                        <span className="font-medium">Fusion Retrieval</span>
                        <Badge variant="outline" className="ml-auto">Low latency</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Combines semantic (vector) search with keyword (BM25) search for better recall.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-purple-500" />
                        <span className="font-medium">Hierarchical</span>
                        <Badge variant="outline" className="ml-auto">Low latency</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Expands retrieved chunks to include parent context. Requires hierarchical chunking.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-orange-500" />
                        <span className="font-medium">Self-RAG</span>
                        <Badge variant="outline" className="ml-auto">High latency</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Iteratively improves retrieval by reflecting on results. Maximum accuracy but slower.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        <span className="font-medium">CRAG</span>
                        <Badge variant="outline" className="ml-auto">Medium latency</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Corrective RAG: Detects poor retrieval and triggers correction or web fallback.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
