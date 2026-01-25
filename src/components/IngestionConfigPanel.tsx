import { useState } from "react";
import {
  Layers,
  ChevronDown,
  ChevronUp,
  Info,
  Zap,
  FileText,
  Table,
  List,
  Sparkles,
  BookOpen,
  RotateCcw,
  ScanText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { IngestionConfig, ChunkingStrategy, ParserPreference } from "@/integrations/supabase/rag-types";
import {
  DEFAULT_INGESTION_CONFIG,
  INGESTION_SKILL_INFO,
  INGESTION_PRESETS,
  PARSER_INFO,
} from "@/integrations/supabase/rag-types";

interface IngestionConfigPanelProps {
  config: IngestionConfig;
  onConfigChange: (config: IngestionConfig) => void;
}

export const IngestionConfigPanel = ({
  config,
  onConfigChange,
}: IngestionConfigPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== 'custom' && INGESTION_PRESETS[preset]) {
      onConfigChange(INGESTION_PRESETS[preset]);
    }
  };

  const handleConfigChange = (updates: Partial<IngestionConfig>) => {
    setSelectedPreset('custom');
    onConfigChange({ ...config, ...updates });
  };

  const handleReset = () => {
    setSelectedPreset('custom');
    onConfigChange(DEFAULT_INGESTION_CONFIG);
  };

  const getStrategyIcon = (strategy: ChunkingStrategy) => {
    switch (strategy) {
      case 'fixed': return <Layers className="h-4 w-4" />;
      case 'semantic': return <BookOpen className="h-4 w-4" />;
      case 'proposition': return <Sparkles className="h-4 w-4" />;
      case 'hierarchical': return <FileText className="h-4 w-4" />;
      default: return <Layers className="h-4 w-4" />;
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

  const countEnabledFeatures = () => {
    let count = 0;
    if (config.chunking_strategy !== 'fixed') count++;
    if (config.enable_context_enrichment) count++;
    if (config.enable_metadata_extraction) count++;
    if (config.enable_summary_chunks) count++;
    if (config.extract_entities) count++;
    return count;
  };

  return (
    <Card className="config-card shadow-soft">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="config-card-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Layers className="h-4 w-4 text-primary" />
                  Ingestion Configuration
                </CardTitle>
                <CardDescription className="text-xs">
                  {selectedPreset !== 'custom'
                    ? `${selectedPreset.charAt(0).toUpperCase() + selectedPreset.slice(1)} preset`
                    : `Custom · ${countEnabledFeatures()} enhancements`}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="config-badge">
                {estimateCost()}x cost
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-7 px-2 text-xs"
                title="Reset to defaults"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0 px-4">
            {/* Preset Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Preset</Label>
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

            {/* Chunking Strategy */}
            <div className="config-section">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Chunking Strategy</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[300px]">
                      <p>How documents are split into searchable chunks. More advanced strategies improve retrieval quality but increase processing time.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={config.chunking_strategy}
                onValueChange={(value) =>
                  handleConfigChange({ chunking_strategy: value as ChunkingStrategy })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['fixed', 'semantic', 'proposition', 'hierarchical'] as ChunkingStrategy[]).map(
                    (strategy) => {
                      const info = INGESTION_SKILL_INFO[strategy];
                      return (
                        <SelectItem key={strategy} value={strategy}>
                          <div className="flex items-center gap-2">
                            {getStrategyIcon(strategy)}
                            <div>
                              <span className="font-medium">{info.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                ({info.costMultiplier}x)
                              </span>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    }
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {INGESTION_SKILL_INFO[config.chunking_strategy as keyof typeof INGESTION_SKILL_INFO]?.description}
              </p>
            </div>

            {/* Enhancement Toggles */}
            <div className="config-section">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Enhancements</Label>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Context Enrichment</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{INGESTION_SKILL_INFO.contextEnrichment.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch
                  checked={config.enable_context_enrichment}
                  onCheckedChange={(checked) =>
                    handleConfigChange({ enable_context_enrichment: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Metadata Extraction</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{INGESTION_SKILL_INFO.metadataExtraction.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch
                  checked={config.enable_metadata_extraction}
                  onCheckedChange={(checked) =>
                    handleConfigChange({ enable_metadata_extraction: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Summary Chunks</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{INGESTION_SKILL_INFO.summaryChunks.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch
                  checked={config.enable_summary_chunks}
                  onCheckedChange={(checked) =>
                    handleConfigChange({ enable_summary_chunks: checked })
                  }
                />
              </div>
            </div>

            {/* Advanced Settings */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span className="text-sm text-muted-foreground">Advanced Settings</span>
                  {showAdvanced ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Chunk Size (characters)</Label>
                    <span className="text-sm font-medium">{config.chunk_size}</span>
                  </div>
                  <Slider
                    value={[config.chunk_size]}
                    onValueChange={([value]) =>
                      handleConfigChange({ chunk_size: value })
                    }
                    min={500}
                    max={4000}
                    step={100}
                  />
                  <p className="text-xs text-muted-foreground">
                    Smaller = more precise, larger = more context
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Chunk Overlap</Label>
                    <span className="text-sm font-medium">{config.chunk_overlap}</span>
                  </div>
                  <Slider
                    value={[config.chunk_overlap]}
                    onValueChange={([value]) =>
                      handleConfigChange({ chunk_overlap: value })
                    }
                    min={0}
                    max={500}
                    step={50}
                  />
                  <p className="text-xs text-muted-foreground">
                    Overlap between chunks to maintain context
                  </p>
                </div>

                {/* Parser Selection */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ScanText className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">Document Parser</Label>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[300px]">
                          <p>Choose how PDF and DOCX files are parsed. LlamaParse provides superior extraction for complex documents with tables and layouts.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Select
                    value={config.parser_preference}
                    onValueChange={(value) =>
                      handleConfigChange({ parser_preference: value as ParserPreference })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['auto', 'llamaparse', 'gemini'] as ParserPreference[]).map((parser) => {
                        const info = PARSER_INFO[parser];
                        return (
                          <SelectItem key={parser} value={parser}>
                            <div className="flex items-center gap-2">
                              <ScanText className="h-4 w-4" />
                              <span className="font-medium">{info.name}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {PARSER_INFO[config.parser_preference]?.description}
                  </p>
                </div>

                <div className="space-y-2 pt-2">
                  <Label className="text-sm font-medium">Preservation Options</Label>
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <Table className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm">Preserve Tables</Label>
                    </div>
                    <Switch
                      checked={config.preserve_tables}
                      onCheckedChange={(checked) =>
                        handleConfigChange({ preserve_tables: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <List className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm">Preserve Lists</Label>
                    </div>
                    <Switch
                      checked={config.preserve_lists}
                      onCheckedChange={(checked) =>
                        handleConfigChange({ preserve_lists: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm">Extract Named Entities</Label>
                    </div>
                    <Switch
                      checked={config.extract_entities}
                      onCheckedChange={(checked) =>
                        handleConfigChange({ extract_entities: checked })
                      }
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
