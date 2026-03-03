import { useState, useEffect } from "react";
import {
  Search,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  GitBranch,
  RefreshCcw,
  AlertTriangle,
  TrendingUp,
  Shuffle,
  Zap,
  RotateCcw,
  FileText,
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
import { apiFetch } from "@/lib/api";
import type { RetrievalConfig, RetrievalConfigRecord } from "@/types/rag-types";
import {
  RETRIEVAL_SKILL_INFO,
  DEFAULT_RETRIEVAL_CONFIG,
  RETRIEVAL_PRESETS,
} from "@/types/rag-types";

interface RetrievalConfigPanelProps {
  config: RetrievalConfig;
  onConfigChange: (config: RetrievalConfig) => void;
}

export const RetrievalConfigPanel = ({
  config,
  onConfigChange,
}: RetrievalConfigPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('custom');
  const [dbPresets, setDbPresets] = useState<RetrievalConfigRecord[]>([]);
  const [useDbPresets, setUseDbPresets] = useState(false);

  // Load presets from database on mount
  useEffect(() => {
    loadDbPresets();
  }, []);

  const loadDbPresets = async () => {
    try {
      const { data, error } = await apiFetch<RetrievalConfigRecord[]>("configs/retrieval-presets");

      if (error) {
        console.log('Using client-side retrieval presets (API not available)');
        setUseDbPresets(false);
        return;
      }

      if (data && data.length > 0) {
        setDbPresets(data);
        setUseDbPresets(true);
      }
    } catch (error) {
      console.log('Using client-side retrieval presets');
      setUseDbPresets(false);
    }
  };

  const handlePresetChange = (presetIdOrKey: string) => {
    setSelectedPresetId(presetIdOrKey);
    if (presetIdOrKey === 'custom') return;

    if (useDbPresets) {
      // Use database preset
      const preset = dbPresets.find(p => p.id === presetIdOrKey);
      if (preset) {
        onConfigChange({
          enable_reranking: preset.enable_reranking,
          reranker_model: preset.reranker_model as RetrievalConfig['reranker_model'],
          rerank_top_n: preset.rerank_top_n,
          enable_fusion: preset.enable_fusion,
          fusion_strategy: preset.fusion_strategy as RetrievalConfig['fusion_strategy'],
          fusion_weights: {
            semantic: preset.fusion_weight_semantic,
            keyword: preset.fusion_weight_keyword,
          },
          enable_hierarchical: preset.enable_hierarchical,
          expand_to_parent: preset.expand_to_parent,
          max_hierarchy_depth: preset.max_hierarchy_depth,
          enable_self_rag: preset.enable_self_rag,
          max_self_rag_iterations: preset.max_self_rag_iterations,
          self_rag_threshold: preset.self_rag_threshold,
          enable_crag: preset.enable_crag,
          crag_relevance_threshold: preset.crag_relevance_threshold,
          enable_web_fallback: preset.enable_web_fallback,
          enable_feedback_loop: preset.enable_feedback_loop,
          feedback_learning_rate: preset.feedback_learning_rate,
        });
      }
    } else {
      // Use client-side preset
      if (RETRIEVAL_PRESETS[presetIdOrKey]) {
        onConfigChange(RETRIEVAL_PRESETS[presetIdOrKey]);
      }
    }
  };

  const handleSkillToggle = (
    skill: keyof typeof config,
    enabled: boolean
  ) => {
    setSelectedPresetId('custom');
    onConfigChange({
      ...config,
      [skill]: enabled,
    });
  };

  const handleReset = () => {
    setSelectedPresetId('custom');
    onConfigChange(DEFAULT_RETRIEVAL_CONFIG);
  };

  const countEnabledSkills = () => {
    let count = 0;
    if (config.enable_reranking) count++;
    if (config.enable_fusion) count++;
    if (config.enable_hierarchical) count++;
    if (config.enable_self_rag) count++;
    if (config.enable_crag) count++;
    if (config.enable_feedback_loop) count++;
    return count;
  };

  const estimateLatency = () => {
    let calls = 0;
    if (config.enable_reranking && config.reranker_model !== 'none') calls += 1;
    if (config.enable_self_rag) calls += config.max_self_rag_iterations;
    if (config.enable_crag) calls += 1;
    return calls;
  };

  const SkillToggle = ({
    skillKey,
    configKey,
    icon: Icon,
    enabled,
  }: {
    skillKey: keyof typeof RETRIEVAL_SKILL_INFO;
    configKey: keyof RetrievalConfig;
    icon: React.ComponentType<{ className?: string }>;
    enabled: boolean;
  }) => {
    const info = RETRIEVAL_SKILL_INFO[skillKey];
    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium cursor-pointer">
            {info.name}
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[250px]">
                <p className="font-medium">{info.fullName}</p>
                <p className="text-xs mt-1">{info.description}</p>
                <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                  {info.apiCalls > 0 && (
                    <span>+{info.apiCalls} API call(s)</span>
                  )}
                  <span>Latency: {info.latencyImpact}</span>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => handleSkillToggle(configKey, checked)}
        />
      </div>
    );
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
                  <Search className="h-4 w-4 text-primary" />
                  Retrieval Configuration
                </CardTitle>
                <CardDescription className="text-xs">
                  {countEnabledSkills()} skills active
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {estimateLatency() > 0 && (
                <Badge variant="secondary" className="config-badge">
                  +{estimateLatency()} calls
                </Badge>
              )}
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
              <Select value={selectedPresetId} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a preset..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">
                    <div className="flex items-center gap-2">
                      <Shuffle className="h-4 w-4" />
                      Custom Configuration
                    </div>
                  </SelectItem>
                  {useDbPresets ? (
                    // Database presets
                    dbPresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        <div className="flex items-center gap-2">
                          {preset.name === 'Fast' && <Zap className="h-4 w-4 text-yellow-500" />}
                          {preset.name === 'Enhanced' && <Search className="h-4 w-4 text-green-500" />}
                          {preset.name === 'Default' && <Shuffle className="h-4 w-4 text-blue-500" />}
                          {preset.name === 'Accurate' && <Layers className="h-4 w-4 text-purple-500" />}
                          {!['Fast', 'Enhanced', 'Default', 'Accurate'].includes(preset.name) && (
                            <Shuffle className="h-4 w-4 text-gray-500" />
                          )}
                          <span>{preset.name}</span>
                          {preset.preset_category && (
                            <Badge variant="secondary" className="text-xs ml-2">
                              {preset.preset_category}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    // Client-side presets (fallback)
                    <>
                      <SelectItem value="fullDocument">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-orange-500" />
                          Full Document (No chunking)
                        </div>
                      </SelectItem>
                      <SelectItem value="fast">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-yellow-500" />
                          Fast (No enhancements)
                        </div>
                      </SelectItem>
                      <SelectItem value="balanced">
                        <div className="flex items-center gap-2">
                          <Shuffle className="h-4 w-4 text-blue-500" />
                          Balanced (Rerank + Fusion)
                        </div>
                      </SelectItem>
                      <SelectItem value="accurate">
                        <div className="flex items-center gap-2">
                          <Search className="h-4 w-4 text-green-500" />
                          Accurate (All skills)
                        </div>
                      </SelectItem>
                      <SelectItem value="questionnaire">
                        <div className="flex items-center gap-2">
                          <Layers className="h-4 w-4 text-purple-500" />
                          Questionnaire Mode
                        </div>
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {selectedPresetId !== 'custom' && useDbPresets && (
                <p className="text-xs text-muted-foreground">
                  {dbPresets.find(p => p.id === selectedPresetId)?.description}
                </p>
              )}
            </div>

            {/* Full Document Mode */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-orange-500" />
                  <Label className="text-sm font-semibold">Full Document Mode</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[300px]">
                        <p className="font-medium">{RETRIEVAL_SKILL_INFO.fullDocument.fullName}</p>
                        <p className="text-xs mt-1">{RETRIEVAL_SKILL_INFO.fullDocument.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch
                  checked={config.enable_full_document_mode}
                  onCheckedChange={(checked) => {
                    setSelectedPresetId('custom');
                    onConfigChange({ ...config, enable_full_document_mode: checked });
                  }}
                />
              </div>
              {config.enable_full_document_mode && (
                <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <p className="text-xs text-orange-700 dark:text-orange-300">
                    <strong>Full Document Mode enabled:</strong> RAG chunking is bypassed.
                    The entire document text will be sent to the LLM for analysis.
                    Best for smaller documents (&lt;100k chars) where you need complete context.
                  </p>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Max Characters</Label>
                      <span className="text-xs font-medium">{(config.full_document_max_chars / 1000).toFixed(0)}k</span>
                    </div>
                    <Slider
                      value={[config.full_document_max_chars / 1000]}
                      onValueChange={([value]) => {
                        setSelectedPresetId('custom');
                        onConfigChange({ ...config, full_document_max_chars: value * 1000 });
                      }}
                      min={50}
                      max={200}
                      step={10}
                    />
                    <p className="text-xs text-muted-foreground">
                      Falls back to RAG if documents exceed this limit
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Core Retrieval Skills */}
            <div className="space-y-1 border-t pt-4">
              <Label className="text-sm font-semibold">Core Retrieval Skills {config.enable_full_document_mode && <span className="text-xs text-muted-foreground">(bypassed)</span>}</Label>
              <div className="space-y-1">
                <SkillToggle
                  skillKey="reranking"
                  configKey="enable_reranking"
                  icon={Layers}
                  enabled={config.enable_reranking}
                />
                <SkillToggle
                  skillKey="fusion"
                  configKey="enable_fusion"
                  icon={Shuffle}
                  enabled={config.enable_fusion}
                />
                <SkillToggle
                  skillKey="hierarchical"
                  configKey="enable_hierarchical"
                  icon={GitBranch}
                  enabled={config.enable_hierarchical}
                />
              </div>
            </div>

            {/* Self-Improvement Skills */}
            <div className="space-y-1 border-t pt-4">
              <Label className="text-sm font-semibold">Self-Improvement Skills</Label>
              <div className="space-y-1">
                <SkillToggle
                  skillKey="selfRag"
                  configKey="enable_self_rag"
                  icon={RefreshCcw}
                  enabled={config.enable_self_rag}
                />
                <SkillToggle
                  skillKey="crag"
                  configKey="enable_crag"
                  icon={AlertTriangle}
                  enabled={config.enable_crag}
                />
                <SkillToggle
                  skillKey="feedbackLoop"
                  configKey="enable_feedback_loop"
                  icon={TrendingUp}
                  enabled={config.enable_feedback_loop}
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
                {/* Reranking Settings */}
                {config.enable_reranking && (
                  <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                    <Label className="text-xs font-semibold text-muted-foreground">RERANKING</Label>
                    <div className="space-y-2">
                      <Label className="text-sm">Reranker Model</Label>
                      <Select
                        value={config.reranker_model}
                        onValueChange={(value: 'none' | 'cross-encoder' | 'llm-rerank') => {
                          setSelectedPresetId('custom');
                          onConfigChange({ ...config, reranker_model: value });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="llm-rerank">LLM Rerank (Gemini)</SelectItem>
                          <SelectItem value="cross-encoder">Cross-Encoder (Future)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Rerank Top N</Label>
                        <span className="text-sm font-medium">{config.rerank_top_n}</span>
                      </div>
                      <Slider
                        value={[config.rerank_top_n]}
                        onValueChange={([value]) => {
                          setSelectedPresetId('custom');
                          onConfigChange({ ...config, rerank_top_n: value });
                        }}
                        min={5}
                        max={30}
                        step={5}
                      />
                    </div>
                  </div>
                )}

                {/* Fusion Settings */}
                {config.enable_fusion && (
                  <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                    <Label className="text-xs font-semibold text-muted-foreground">FUSION RETRIEVAL</Label>
                    <div className="space-y-2">
                      <Label className="text-sm">Fusion Strategy</Label>
                      <Select
                        value={config.fusion_strategy}
                        onValueChange={(value: 'rrf' | 'weighted' | 'linear') => {
                          setSelectedPresetId('custom');
                          onConfigChange({ ...config, fusion_strategy: value });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rrf">Reciprocal Rank Fusion</SelectItem>
                          <SelectItem value="weighted">Weighted Combination</SelectItem>
                          <SelectItem value="linear">Linear Interpolation</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {config.fusion_strategy === 'weighted' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Semantic Weight</Label>
                          <span className="text-sm font-medium">
                            {config.fusion_weights.semantic.toFixed(1)} / {config.fusion_weights.keyword.toFixed(1)}
                          </span>
                        </div>
                        <Slider
                          value={[config.fusion_weights.semantic * 100]}
                          onValueChange={([value]) => {
                            setSelectedPresetId('custom');
                            const semantic = value / 100;
                            onConfigChange({
                              ...config,
                              fusion_weights: {
                                semantic,
                                keyword: 1 - semantic,
                              },
                            });
                          }}
                          min={20}
                          max={80}
                          step={10}
                        />
                        <p className="text-xs text-muted-foreground">
                          Semantic vs Keyword search weight
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Self-RAG Settings */}
                {config.enable_self_rag && (
                  <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                    <Label className="text-xs font-semibold text-muted-foreground">SELF-RAG</Label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Max Iterations</Label>
                        <span className="text-sm font-medium">{config.max_self_rag_iterations}</span>
                      </div>
                      <Slider
                        value={[config.max_self_rag_iterations]}
                        onValueChange={([value]) => {
                          setSelectedPresetId('custom');
                          onConfigChange({ ...config, max_self_rag_iterations: value });
                        }}
                        min={1}
                        max={5}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Quality Threshold</Label>
                        <span className="text-sm font-medium">{config.self_rag_threshold.toFixed(2)}</span>
                      </div>
                      <Slider
                        value={[config.self_rag_threshold * 100]}
                        onValueChange={([value]) => {
                          setSelectedPresetId('custom');
                          onConfigChange({ ...config, self_rag_threshold: value / 100 });
                        }}
                        min={30}
                        max={80}
                        step={5}
                      />
                      <p className="text-xs text-muted-foreground">
                        Stop iterating when quality exceeds this
                      </p>
                    </div>
                  </div>
                )}

                {/* CRAG Settings */}
                {config.enable_crag && (
                  <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                    <Label className="text-xs font-semibold text-muted-foreground">CORRECTIVE RAG</Label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Relevance Threshold</Label>
                        <span className="text-sm font-medium">{config.crag_relevance_threshold.toFixed(2)}</span>
                      </div>
                      <Slider
                        value={[config.crag_relevance_threshold * 100]}
                        onValueChange={([value]) => {
                          setSelectedPresetId('custom');
                          onConfigChange({ ...config, crag_relevance_threshold: value / 100 });
                        }}
                        min={20}
                        max={60}
                        step={5}
                      />
                      <p className="text-xs text-muted-foreground">
                        Trigger correction below this relevance
                      </p>
                    </div>
                  </div>
                )}

                {/* Hierarchical Settings */}
                {config.enable_hierarchical && (
                  <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                    <Label className="text-xs font-semibold text-muted-foreground">HIERARCHICAL EXPANSION</Label>
                    <div className="flex items-center justify-between py-2">
                      <Label className="text-sm">Expand to Parent Chunks</Label>
                      <Switch
                        checked={config.expand_to_parent}
                        onCheckedChange={(checked) => {
                          setSelectedPresetId('custom');
                          onConfigChange({ ...config, expand_to_parent: checked });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Max Depth</Label>
                        <span className="text-sm font-medium">{config.max_hierarchy_depth}</span>
                      </div>
                      <Slider
                        value={[config.max_hierarchy_depth]}
                        onValueChange={([value]) => {
                          setSelectedPresetId('custom');
                          onConfigChange({ ...config, max_hierarchy_depth: value });
                        }}
                        min={1}
                        max={3}
                        step={1}
                      />
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
