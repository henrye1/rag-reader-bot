import { useState, useEffect } from "react";
import {
  Sliders,
  ChevronDown,
  ChevronUp,
  Wand2,
  Info,
  Zap,
  Shield,
  Gauge,
  Brain,
  RefreshCw,
  Layers,
  RotateCcw,
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
import { supabase } from "@/integrations/supabase/client";
import type { RagConfig } from "@/integrations/supabase/rag-types";
import { RAG_SKILL_INFO, DEFAULT_RAG_CONFIG } from "@/integrations/supabase/rag-types";

interface RagConfigPanelProps {
  config: Omit<RagConfig, 'id' | 'created_at'>;
  onConfigChange: (config: Omit<RagConfig, 'id' | 'created_at'>) => void;
  onOpenAssistant: () => void;
}

interface Preset {
  id: string;
  name: string;
  description: string | null;
  enable_hyde: boolean;
  enable_query_rewrite: boolean;
  enable_decomposition: boolean;
  enable_verification: boolean;
  enable_confidence: boolean;
  enable_reasoning: boolean;
  top_k: number;
  similarity_threshold: number;
  preset_category: string | null;
}

export const RagConfigPanel = ({
  config,
  onConfigChange,
  onOpenAssistant,
}: RagConfigPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('custom');

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    try {
      const { data, error } = await supabase
        .from('rag_configs')
        .select('*')
        .eq('is_preset', true)
        .order('name');

      if (error) throw error;
      setPresets(data || []);
    } catch (error) {
      console.error("Failed to load RAG presets:", error);
    }
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (presetId === 'custom') return;

    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      onConfigChange({
        ...config,
        name: preset.name,
        description: preset.description,
        enable_hyde: preset.enable_hyde,
        enable_query_rewrite: preset.enable_query_rewrite,
        enable_decomposition: preset.enable_decomposition,
        enable_verification: preset.enable_verification,
        enable_confidence: preset.enable_confidence,
        enable_reasoning: preset.enable_reasoning,
        top_k: preset.top_k,
        similarity_threshold: preset.similarity_threshold,
        preset_category: preset.preset_category,
      });
    }
  };

  const handleSkillToggle = (skill: keyof typeof RAG_SKILL_INFO, enabled: boolean) => {
    setSelectedPresetId('custom');
    const skillKey = `enable_${skill === 'queryRewrite' ? 'query_rewrite' : skill}` as keyof typeof config;
    onConfigChange({
      ...config,
      [skillKey]: enabled,
    });
  };

  const handleReset = () => {
    setSelectedPresetId('custom');
    onConfigChange(DEFAULT_RAG_CONFIG);
  };

  const countEnabledSkills = () => {
    let count = 0;
    if (config.enable_hyde) count++;
    if (config.enable_query_rewrite) count++;
    if (config.enable_decomposition) count++;
    if (config.enable_verification) count++;
    if (config.enable_confidence) count++;
    if (config.enable_reasoning) count++;
    return count;
  };

  const estimateApiCalls = () => {
    let calls = 1; // Base call
    if (config.enable_hyde) calls += RAG_SKILL_INFO.hyde.apiCalls;
    if (config.enable_query_rewrite) calls += RAG_SKILL_INFO.queryRewrite.apiCalls;
    if (config.enable_decomposition) calls += RAG_SKILL_INFO.decomposition.apiCalls;
    if (config.enable_verification) calls += RAG_SKILL_INFO.verification.apiCalls;
    if (config.enable_confidence) calls += RAG_SKILL_INFO.confidence.apiCalls;
    return calls;
  };

  const SkillToggle = ({
    skillKey,
    icon: Icon,
    enabled,
  }: {
    skillKey: keyof typeof RAG_SKILL_INFO;
    icon: React.ComponentType<{ className?: string }>;
    enabled: boolean;
  }) => {
    const info = RAG_SKILL_INFO[skillKey];
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
                {info.apiCalls > 0 && (
                  <p className="text-xs mt-1 text-muted-foreground">
                    +{info.apiCalls} API call(s)
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => handleSkillToggle(skillKey, checked)}
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
                  <Sliders className="h-4 w-4 text-primary" />
                  Query Configuration
                </CardTitle>
                <CardDescription className="text-xs">
                  {config.name || 'Custom'} · {countEnabledSkills()} skills
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="config-badge">
                ~{estimateApiCalls()} calls
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
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenAssistant}
                className="h-7 px-2 text-xs"
              >
                <Wand2 className="h-3.5 w-3.5 mr-1" />
                Wizard
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
                      <Sliders className="h-4 w-4" />
                      Custom Configuration
                    </div>
                  </SelectItem>
                  {presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      <div className="flex items-center gap-2">
                        {preset.name === 'Fast' && <Zap className="h-4 w-4 text-yellow-500" />}
                        {preset.name === 'Enhanced' && <Shield className="h-4 w-4 text-green-500" />}
                        {preset.name === 'Default' && <Gauge className="h-4 w-4 text-blue-500" />}
                        {!['Fast', 'Enhanced', 'Default'].includes(preset.name) && (
                          <Brain className="h-4 w-4 text-purple-500" />
                        )}
                        <span>{preset.name}</span>
                        {preset.preset_category && (
                          <Badge variant="secondary" className="text-xs ml-2">
                            {preset.preset_category}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPresetId !== 'custom' && (
                <p className="text-xs text-muted-foreground">
                  {presets.find(p => p.id === selectedPresetId)?.description}
                </p>
              )}
            </div>

            {/* Skills Toggles */}
            <div className="config-section">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Query Skills</Label>
              <div className="space-y-0.5">
                <SkillToggle
                  skillKey="queryRewrite"
                  icon={RefreshCw}
                  enabled={config.enable_query_rewrite}
                />
                <SkillToggle
                  skillKey="hyde"
                  icon={Brain}
                  enabled={config.enable_hyde}
                />
                <SkillToggle
                  skillKey="decomposition"
                  icon={Layers}
                  enabled={config.enable_decomposition}
                />
                <SkillToggle
                  skillKey="verification"
                  icon={Shield}
                  enabled={config.enable_verification}
                />
                <SkillToggle
                  skillKey="confidence"
                  icon={Gauge}
                  enabled={config.enable_confidence}
                />
                <SkillToggle
                  skillKey="reasoning"
                  icon={Zap}
                  enabled={config.enable_reasoning}
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
                    <Label className="text-sm">Top K (chunks to retrieve)</Label>
                    <span className="text-sm font-medium">{config.top_k}</span>
                  </div>
                  <Slider
                    value={[config.top_k]}
                    onValueChange={([value]) => {
                      setSelectedPresetId('custom');
                      onConfigChange({ ...config, top_k: value });
                    }}
                    min={5}
                    max={50}
                    step={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    More chunks = more context but higher latency
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Similarity Threshold</Label>
                    <span className="text-sm font-medium">{config.similarity_threshold.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[config.similarity_threshold * 100]}
                    onValueChange={([value]) => {
                      setSelectedPresetId('custom');
                      onConfigChange({ ...config, similarity_threshold: value / 100 });
                    }}
                    min={10}
                    max={80}
                    step={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    Lower = more results, higher = stricter matching
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
