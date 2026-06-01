import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  GitCompare,
  FileText,
  ArrowLeftRight,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Minus,
  Equal,
  Download,
  Copy,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiCall } from "@/lib/api";
import type { UploadedDocument } from "@/pages/Index";
import type { RagConfig, RetrievalConfig } from "@/types/rag-types";
import type { OutputFormatConfig } from "@/components/OutputFormatPanel";
import type { POPIAConfig } from "@/components/POPIACompliancePanel";
import { ComplianceIndicator } from "@/components/POPIACompliancePanel";
import type { SectionRouting } from "@/lib/appendToSection";

interface DocumentComparisonProps {
  documents: UploadedDocument[];
  ragConfig?: Omit<RagConfig, 'id' | 'created_at'>;
  retrievalConfig?: RetrievalConfig;
  outputFormat?: OutputFormatConfig;
  popiaConfig?: POPIAConfig;
  onAnswerForDocument?: (question: string, answer: string, routing: SectionRouting | null) => void;
}

interface ComparisonResult {
  summary: string;
  similarities: string[];
  differences: string[];
  additions: string[];
  removals: string[];
  recommendations: string[];
  complianceInfo?: {
    piiDetected: boolean;
    redactionApplied: boolean;
    riskLevel: 'none' | 'low' | 'medium' | 'high';
  };
}

export function DocumentComparison({
  documents,
  ragConfig,
  retrievalConfig,
  outputFormat,
  popiaConfig,
  onAnswerForDocument,
}: DocumentComparisonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [doc1Id, setDoc1Id] = useState<string>("");
  const [doc2Id, setDoc2Id] = useState<string>("");
  const [comparisonFocus, setComparisonFocus] = useState<string>("");
  const [isComparing, setIsComparing] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const readyDocuments = documents.filter(d => d.status === 'ready');

  const handleCompare = async () => {
    if (!doc1Id || !doc2Id) {
      toast({
        title: "Select Documents",
        description: "Please select two documents to compare",
        variant: "destructive",
      });
      return;
    }

    if (doc1Id === doc2Id) {
      toast({
        title: "Different Documents Required",
        description: "Please select two different documents to compare",
        variant: "destructive",
      });
      return;
    }

    setIsComparing(true);
    setResult(null);

    try {
      const doc1 = documents.find(d => d.documentId === doc1Id);
      const doc2 = documents.find(d => d.documentId === doc2Id);

      // Build comparison question
      let comparisonQuestion = `Compare these two documents and identify:
1. Key SIMILARITIES between the documents
2. Key DIFFERENCES between the documents
3. What was ADDED in "${doc2?.name}" compared to "${doc1?.name}"
4. What was REMOVED from "${doc2?.name}" compared to "${doc1?.name}"
5. Recommendations based on the comparison

Provide a structured analysis with clear sections.`;

      if (comparisonFocus) {
        comparisonQuestion = `Focus specifically on: ${comparisonFocus}\n\n${comparisonQuestion}`;
      }

      const { data, error } = await apiCall("ask-question", {
          question: comparisonQuestion,
          documentIds: [doc1Id, doc2Id],
          ragConfig: ragConfig,
          retrievalConfig: {
            ...retrievalConfig,
            enable_full_document_mode: true,
          },
          outputFormat: {
            ...outputFormat,
            output_style: 'structured',
            include_cross_references: true,
          },
          popiaConfig: popiaConfig,
      });

      if (error) throw error;

      // Parse the response to extract structured comparison
      const comparisonResult = parseComparisonResponse(data.answer, data);
      setResult(comparisonResult);

      // Route answer into the document
      onAnswerForDocument?.(comparisonQuestion, data.answer, data.sectionRouting ?? null);

      toast({
        title: "Comparison Complete",
        description: `Analyzed ${doc1?.name} vs ${doc2?.name}`,
      });
    } catch (err) {
      console.error("Comparison error:", err);
      toast({
        title: "Comparison Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsComparing(false);
    }
  };

  const parseComparisonResponse = (answer: string, rawData: Record<string, unknown>): ComparisonResult => {
    // Simple parsing - extract sections from the response
    const similarities: string[] = [];
    const differences: string[] = [];
    const additions: string[] = [];
    const removals: string[] = [];
    const recommendations: string[] = [];

    // Extract bullet points from different sections
    const lines = answer.split('\n');
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect section headers
      if (trimmed.toLowerCase().includes('similar') || trimmed.toLowerCase().includes('common')) {
        currentSection = 'similarities';
      } else if (trimmed.toLowerCase().includes('differ') || trimmed.toLowerCase().includes('change')) {
        currentSection = 'differences';
      } else if (trimmed.toLowerCase().includes('add') || trimmed.toLowerCase().includes('new')) {
        currentSection = 'additions';
      } else if (trimmed.toLowerCase().includes('remov') || trimmed.toLowerCase().includes('delet')) {
        currentSection = 'removals';
      } else if (trimmed.toLowerCase().includes('recommend') || trimmed.toLowerCase().includes('suggest')) {
        currentSection = 'recommendations';
      }

      // Extract bullet points
      if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.match(/^\d+\./)) {
        const content = trimmed.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '');
        if (content.length > 10) { // Skip very short items
          switch (currentSection) {
            case 'similarities':
              similarities.push(content);
              break;
            case 'differences':
              differences.push(content);
              break;
            case 'additions':
              additions.push(content);
              break;
            case 'removals':
              removals.push(content);
              break;
            case 'recommendations':
              recommendations.push(content);
              break;
          }
        }
      }
    }

    return {
      summary: answer.slice(0, 500) + (answer.length > 500 ? '...' : ''),
      similarities: similarities.slice(0, 5),
      differences: differences.slice(0, 5),
      additions: additions.slice(0, 5),
      removals: removals.slice(0, 5),
      recommendations: recommendations.slice(0, 3),
      complianceInfo: rawData.complianceInfo as ComparisonResult['complianceInfo'],
    };
  };

  const handleCopyResult = () => {
    if (result) {
      const text = `Document Comparison Results\n\n${result.summary}\n\nSimilarities:\n${result.similarities.join('\n')}\n\nDifferences:\n${result.differences.join('\n')}`;
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (readyDocuments.length < 2) {
    return null; // Don't show comparison if less than 2 documents
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <GitCompare className="h-4 w-4" />
          Compare Documents
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" />
            Document Comparison
          </DialogTitle>
          <DialogDescription>
            Compare two documents to identify similarities, differences, and changes
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Document Selection */}
          <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-end">
            <div className="space-y-2">
              <Label>Document A (Base)</Label>
              <Select value={doc1Id} onValueChange={setDoc1Id}>
                <SelectTrigger>
                  <SelectValue placeholder="Select first document" />
                </SelectTrigger>
                <SelectContent>
                  {readyDocuments.map((doc) => (
                    <SelectItem key={doc.documentId} value={doc.documentId} disabled={doc.documentId === doc2Id}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span className="truncate max-w-[200px]">{doc.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ArrowLeftRight className="h-5 w-5 text-muted-foreground mb-2" />

            <div className="space-y-2">
              <Label>Document B (Compare To)</Label>
              <Select value={doc2Id} onValueChange={setDoc2Id}>
                <SelectTrigger>
                  <SelectValue placeholder="Select second document" />
                </SelectTrigger>
                <SelectContent>
                  {readyDocuments.map((doc) => (
                    <SelectItem key={doc.documentId} value={doc.documentId} disabled={doc.documentId === doc1Id}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span className="truncate max-w-[200px]">{doc.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Comparison Focus (optional) */}
          <div className="space-y-2">
            <Label>Comparison Focus (Optional)</Label>
            <Textarea
              placeholder="e.g., 'Focus on methodology changes' or 'Compare risk parameters only'"
              value={comparisonFocus}
              onChange={(e) => setComparisonFocus(e.target.value)}
              className="h-20 resize-none"
            />
          </div>

          {/* POPIA Notice */}
          {popiaConfig?.showComplianceIndicators && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-50 p-2 rounded">
              <AlertTriangle className="h-4 w-4 text-blue-500" />
              <span>
                Document content will be sent to Google Gemini for comparison.
                {popiaConfig.enableAutoRedaction ? ' PII will be automatically redacted.' : ' Consider enabling PII redaction in POPIA settings.'}
              </span>
            </div>
          )}

          {/* Results */}
          {result && (
            <Card className="border-green-200 bg-green-50/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Comparison Results
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {result.complianceInfo && (
                      <ComplianceIndicator
                        piiDetected={result.complianceInfo.piiDetected}
                        redactionEnabled={result.complianceInfo.redactionApplied}
                        riskLevel={result.complianceInfo.riskLevel}
                      />
                    )}
                    <Button variant="ghost" size="sm" onClick={handleCopyResult}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-4">
                    {/* Similarities */}
                    {result.similarities.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                          <Equal className="h-4 w-4 text-blue-500" />
                          Similarities
                        </h4>
                        <ul className="space-y-1">
                          {result.similarities.map((item, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                              <span className="text-blue-500 mt-0.5">•</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Differences */}
                    {result.differences.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                          <ArrowLeftRight className="h-4 w-4 text-orange-500" />
                          Differences
                        </h4>
                        <ul className="space-y-1">
                          {result.differences.map((item, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                              <span className="text-orange-500 mt-0.5">•</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Additions */}
                    {result.additions.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                          <Plus className="h-4 w-4 text-green-500" />
                          Additions (in Document B)
                        </h4>
                        <ul className="space-y-1">
                          {result.additions.map((item, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                              <span className="text-green-500 mt-0.5">+</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Removals */}
                    {result.removals.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                          <Minus className="h-4 w-4 text-red-500" />
                          Removals (from Document B)
                        </h4>
                        <ul className="space-y-1">
                          {result.removals.map((item, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                              <span className="text-red-500 mt-0.5">-</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recommendations */}
                    {result.recommendations.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-purple-500" />
                          Recommendations
                        </h4>
                        <ul className="space-y-1">
                          {result.recommendations.map((item, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                              <span className="text-purple-500 mt-0.5">→</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Close
          </Button>
          <Button
            onClick={handleCompare}
            disabled={!doc1Id || !doc2Id || isComparing}
            className="gap-2"
          >
            {isComparing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Comparing...
              </>
            ) : (
              <>
                <GitCompare className="h-4 w-4" />
                Compare Documents
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
