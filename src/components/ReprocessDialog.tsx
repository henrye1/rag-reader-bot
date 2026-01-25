import { useState } from "react";
import { RefreshCw, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import type { IngestionConfig } from "@/integrations/supabase/rag-types";
import {
  DEFAULT_INGESTION_CONFIG,
  INGESTION_PRESETS,
  INGESTION_SKILL_INFO,
} from "@/integrations/supabase/rag-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Layers,
  Zap,
  Sparkles,
  FileText,
  BookOpen,
} from "lucide-react";

interface ReprocessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    name: string;
    totalChunks: number;
    ingestionConfig?: IngestionConfig | null;
    hasOriginalText?: boolean;
  } | null;
  onReprocessComplete: (documentId: string, newChunkCount: number) => void;
}

type ReprocessStatus = 'idle' | 'processing' | 'success' | 'error';

export const ReprocessDialog = ({
  open,
  onOpenChange,
  document,
  onReprocessComplete,
}: ReprocessDialogProps) => {
  const [config, setConfig] = useState<IngestionConfig>(DEFAULT_INGESTION_CONFIG);
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [status, setStatus] = useState<ReprocessStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [newChunkCount, setNewChunkCount] = useState<number | null>(null);

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== 'custom' && INGESTION_PRESETS[preset]) {
      setConfig(INGESTION_PRESETS[preset]);
    }
  };

  const handleConfigChange = (updates: Partial<IngestionConfig>) => {
    setSelectedPreset('custom');
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const handleReprocess = async () => {
    if (!document) return;

    setStatus('processing');
    setError(null);
    setNewChunkCount(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('reprocess-document', {
        body: {
          documentId: document.id,
          ingestionConfig: config,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to reprocess document');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setStatus('success');
      setNewChunkCount(data.totalChunks);
      onReprocessComplete(document.id, data.totalChunks);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  };

  const handleClose = () => {
    if (status !== 'processing') {
      setStatus('idle');
      setError(null);
      setNewChunkCount(null);
      onOpenChange(false);
    }
  };

  const estimateCost = () => {
    let multiplier = INGESTION_SKILL_INFO[config.chunking_strategy as keyof typeof INGESTION_SKILL_INFO]?.costMultiplier || 1;
    if (config.enable_context_enrichment) multiplier += 0.5;
    if (config.enable_metadata_extraction) multiplier += 0.2;
    if (config.enable_summary_chunks) multiplier += 0.5;
    if (config.extract_entities) multiplier += 0.3;
    return multiplier.toFixed(1);
  };

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Reprocess Document
          </DialogTitle>
          <DialogDescription>
            Re-chunk "{document.name}" with different settings. Original text will be preserved.
          </DialogDescription>
        </DialogHeader>

        {status === 'idle' && (
          <div className="space-y-4">
            {/* Current Config Info */}
            <div className="rounded-lg bg-muted p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Current Configuration</span>
                <Badge variant="secondary">{document.totalChunks} chunks</Badge>
              </div>
              {document.ingestionConfig ? (
                <p className="text-xs text-muted-foreground">
                  Strategy: {document.ingestionConfig.chunking_strategy},
                  Size: {document.ingestionConfig.chunk_size},
                  Overlap: {document.ingestionConfig.chunk_overlap}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No stored configuration (uploaded before this feature)
                </p>
              )}
            </div>

            {/* Preset Selector */}
            <div className="space-y-2">
              <Label>New Configuration</Label>
              <Select value={selectedPreset} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a preset..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      Custom Configuration
                    </div>
                  </SelectItem>
                  <SelectItem value="fast">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      Fast (Basic chunking)
                    </div>
                  </SelectItem>
                  <SelectItem value="balanced">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-blue-500" />
                      Balanced (Context + Metadata)
                    </div>
                  </SelectItem>
                  <SelectItem value="accurate">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      Accurate (Semantic + Summaries)
                    </div>
                  </SelectItem>
                  <SelectItem value="financial">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-green-500" />
                      Financial (Proposition-based)
                    </div>
                  </SelectItem>
                  <SelectItem value="legal">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-amber-600" />
                      Legal (Semantic + Entities)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Strategy Selector */}
            <div className="space-y-2">
              <Label className="text-sm">Chunking Strategy</Label>
              <Select
                value={config.chunking_strategy}
                onValueChange={(value) =>
                  handleConfigChange({ chunking_strategy: value as IngestionConfig['chunking_strategy'] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Size</SelectItem>
                  <SelectItem value="semantic">Semantic Boundaries</SelectItem>
                  <SelectItem value="proposition">Proposition-based</SelectItem>
                  <SelectItem value="hierarchical">Hierarchical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Chunk Size */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Chunk Size</Label>
                <span className="text-sm font-medium">{config.chunk_size}</span>
              </div>
              <Slider
                value={[config.chunk_size]}
                onValueChange={([value]) => handleConfigChange({ chunk_size: value })}
                min={500}
                max={4000}
                step={100}
              />
            </div>

            {/* Enhancements */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-sm font-medium">Enhancements</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="context"
                    checked={config.enable_context_enrichment}
                    onCheckedChange={(checked) =>
                      handleConfigChange({ enable_context_enrichment: checked })
                    }
                  />
                  <Label htmlFor="context" className="text-sm">Context</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="metadata"
                    checked={config.enable_metadata_extraction}
                    onCheckedChange={(checked) =>
                      handleConfigChange({ enable_metadata_extraction: checked })
                    }
                  />
                  <Label htmlFor="metadata" className="text-sm">Metadata</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="summary"
                    checked={config.enable_summary_chunks}
                    onCheckedChange={(checked) =>
                      handleConfigChange({ enable_summary_chunks: checked })
                    }
                  />
                  <Label htmlFor="summary" className="text-sm">Summaries</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="entities"
                    checked={config.extract_entities}
                    onCheckedChange={(checked) =>
                      handleConfigChange({ extract_entities: checked })
                    }
                  />
                  <Label htmlFor="entities" className="text-sm">Entities</Label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Estimated processing: ~{estimateCost()}x base</span>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div className="py-8 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <div>
              <p className="font-medium">Reprocessing document...</p>
              <p className="text-sm text-muted-foreground">
                This may take a moment depending on document size
              </p>
            </div>
            <Progress value={undefined} className="h-2" />
          </div>
        )}

        {status === 'success' && (
          <div className="py-8 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-green-600">Reprocessing complete!</p>
              <p className="text-sm text-muted-foreground">
                Document now has {newChunkCount} chunks
                {document.totalChunks !== newChunkCount && (
                  <span className="ml-1">
                    (was {document.totalChunks})
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="py-4 space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          {status === 'idle' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleReprocess} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Reprocess Document
              </Button>
            </>
          )}
          {status === 'success' && (
            <Button onClick={handleClose}>Done</Button>
          )}
          {status === 'error' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleReprocess} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
