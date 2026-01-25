import { useState } from "react";
import {
  FileText,
  ChevronDown,
  ChevronUp,
  Info,
  Table2,
  Quote,
  LayoutList,
  FileSpreadsheet,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

// Output style types
export type OutputStyle = 'narrative' | 'structured' | 'tabular' | 'audit';

// Citation format types
export type CitationFormat = 'inline' | 'detailed' | 'footnote';

// Output format configuration
export interface OutputFormatConfig {
  // Output style
  output_style: OutputStyle;

  // Structure options
  include_executive_summary: boolean;
  include_per_document_analysis: boolean;
  include_cross_references: boolean;

  // Table options
  extract_tables: boolean;
  extract_statistics: boolean;
  extract_model_parameters: boolean;

  // Citation options
  citation_format: CitationFormat;
  include_page_numbers: boolean;
  include_section_references: boolean;

  // Response length
  response_detail_level: 'concise' | 'standard' | 'comprehensive';
}

// Default configuration
export const DEFAULT_OUTPUT_FORMAT: OutputFormatConfig = {
  output_style: 'structured',
  include_executive_summary: true,
  include_per_document_analysis: true,
  include_cross_references: false,
  extract_tables: false,
  extract_statistics: false,
  extract_model_parameters: false,
  citation_format: 'inline',
  include_page_numbers: true,
  include_section_references: false,
  response_detail_level: 'standard',
};

// Audit-quality preset (matches the reference document)
export const AUDIT_PRESET: OutputFormatConfig = {
  output_style: 'audit',
  include_executive_summary: true,
  include_per_document_analysis: true,
  include_cross_references: true,
  extract_tables: true,
  extract_statistics: true,
  extract_model_parameters: true,
  citation_format: 'detailed',
  include_page_numbers: true,
  include_section_references: true,
  response_detail_level: 'comprehensive',
};

// Presets
export const OUTPUT_FORMAT_PRESETS: Record<string, OutputFormatConfig> = {
  simple: {
    output_style: 'narrative',
    include_executive_summary: false,
    include_per_document_analysis: false,
    include_cross_references: false,
    extract_tables: false,
    extract_statistics: false,
    extract_model_parameters: false,
    citation_format: 'inline',
    include_page_numbers: false,
    include_section_references: false,
    response_detail_level: 'concise',
  },
  standard: DEFAULT_OUTPUT_FORMAT,
  detailed: {
    output_style: 'structured',
    include_executive_summary: true,
    include_per_document_analysis: true,
    include_cross_references: true,
    extract_tables: true,
    extract_statistics: false,
    extract_model_parameters: false,
    citation_format: 'detailed',
    include_page_numbers: true,
    include_section_references: true,
    response_detail_level: 'comprehensive',
  },
  audit: AUDIT_PRESET,
};

// Style descriptions
const OUTPUT_STYLE_INFO = {
  narrative: {
    name: 'Narrative',
    description: 'Flowing prose response. Good for explanations and summaries.',
  },
  structured: {
    name: 'Structured',
    description: 'Organized with headers and bullet points. Good for clear breakdowns.',
  },
  tabular: {
    name: 'Tabular',
    description: 'Emphasizes tables and data extraction. Good for comparisons.',
  },
  audit: {
    name: 'Audit Quality',
    description: 'Professional format with executive summary, detailed citations, and extracted statistics. Matches audit documentation standards.',
  },
};

interface OutputFormatPanelProps {
  config: OutputFormatConfig;
  onConfigChange: (config: OutputFormatConfig) => void;
}

export const OutputFormatPanel = ({
  config,
  onConfigChange,
}: OutputFormatPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== 'custom' && OUTPUT_FORMAT_PRESETS[preset]) {
      onConfigChange(OUTPUT_FORMAT_PRESETS[preset]);
    }
  };

  const handleConfigChange = (updates: Partial<OutputFormatConfig>) => {
    setSelectedPreset('custom');
    onConfigChange({ ...config, ...updates });
  };

  const handleReset = () => {
    setSelectedPreset('standard');
    onConfigChange(DEFAULT_OUTPUT_FORMAT);
  };

  const countEnabledFeatures = () => {
    let count = 0;
    if (config.include_executive_summary) count++;
    if (config.include_per_document_analysis) count++;
    if (config.include_cross_references) count++;
    if (config.extract_tables) count++;
    if (config.extract_statistics) count++;
    if (config.extract_model_parameters) count++;
    if (config.include_page_numbers) count++;
    if (config.include_section_references) count++;
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
                  <LayoutList className="h-4 w-4 text-primary" />
                  Output Format
                </CardTitle>
                <CardDescription className="text-xs">
                  {OUTPUT_STYLE_INFO[config.output_style].name} · {countEnabledFeatures()} features
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="config-badge">
                {config.response_detail_level}
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
          <CardContent className="space-y-4 pt-0 px-4">
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
                      <LayoutList className="h-4 w-4" />
                      Custom Configuration
                    </div>
                  </SelectItem>
                  <SelectItem value="simple">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-500" />
                      Simple (Quick answers)
                    </div>
                  </SelectItem>
                  <SelectItem value="standard">
                    <div className="flex items-center gap-2">
                      <LayoutList className="h-4 w-4 text-blue-500" />
                      Standard (Balanced)
                    </div>
                  </SelectItem>
                  <SelectItem value="detailed">
                    <div className="flex items-center gap-2">
                      <Table2 className="h-4 w-4 text-purple-500" />
                      Detailed (With tables)
                    </div>
                  </SelectItem>
                  <SelectItem value="audit">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-green-600" />
                      Audit Quality (Professional)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Output Style */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Output Style
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[250px]">
                      <p>Controls the overall format and structure of responses.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={config.output_style}
                onValueChange={(value) =>
                  handleConfigChange({ output_style: value as OutputStyle })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['narrative', 'structured', 'tabular', 'audit'] as OutputStyle[]).map((style) => {
                    const info = OUTPUT_STYLE_INFO[style];
                    return (
                      <SelectItem key={style} value={style}>
                        <span className="font-medium">{info.name}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {OUTPUT_STYLE_INFO[config.output_style].description}
              </p>
            </div>

            {/* Structure Options */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Structure Options
              </Label>

              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Executive Summary</Label>
                </div>
                <Switch
                  checked={config.include_executive_summary}
                  onCheckedChange={(checked) =>
                    handleConfigChange({ include_executive_summary: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <LayoutList className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Per-Document Analysis</Label>
                </div>
                <Switch
                  checked={config.include_per_document_analysis}
                  onCheckedChange={(checked) =>
                    handleConfigChange({ include_per_document_analysis: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <Quote className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Cross-References</Label>
                </div>
                <Switch
                  checked={config.include_cross_references}
                  onCheckedChange={(checked) =>
                    handleConfigChange({ include_cross_references: checked })
                  }
                />
              </div>
            </div>

            {/* Table Extraction Options */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Data Extraction
              </Label>

              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Extract Tables</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Extract and format tables from documents</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch
                  checked={config.extract_tables}
                  onCheckedChange={(checked) =>
                    handleConfigChange({ extract_tables: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Extract Statistics</Label>
                </div>
                <Switch
                  checked={config.extract_statistics}
                  onCheckedChange={(checked) =>
                    handleConfigChange({ extract_statistics: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer">Extract Model Parameters</Label>
                </div>
                <Switch
                  checked={config.extract_model_parameters}
                  onCheckedChange={(checked) =>
                    handleConfigChange({ extract_model_parameters: checked })
                  }
                />
              </div>
            </div>

            {/* Citation Options */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Citation Format
              </Label>

              <Select
                value={config.citation_format}
                onValueChange={(value) =>
                  handleConfigChange({ citation_format: value as CitationFormat })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inline">Inline (brief)</SelectItem>
                  <SelectItem value="detailed">Detailed [Source: file, section, page]</SelectItem>
                  <SelectItem value="footnote">Footnote style</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center justify-between py-1.5">
                <Label className="text-sm cursor-pointer">Include Page Numbers</Label>
                <Switch
                  checked={config.include_page_numbers}
                  onCheckedChange={(checked) =>
                    handleConfigChange({ include_page_numbers: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between py-1.5">
                <Label className="text-sm cursor-pointer">Include Section References</Label>
                <Switch
                  checked={config.include_section_references}
                  onCheckedChange={(checked) =>
                    handleConfigChange({ include_section_references: checked })
                  }
                />
              </div>
            </div>

            {/* Detail Level */}
            <div className="space-y-1.5 border-t pt-3">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Response Detail Level
              </Label>
              <Select
                value={config.response_detail_level}
                onValueChange={(value) =>
                  handleConfigChange({ response_detail_level: value as OutputFormatConfig['response_detail_level'] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="concise">Concise (brief answers)</SelectItem>
                  <SelectItem value="standard">Standard (balanced)</SelectItem>
                  <SelectItem value="comprehensive">Comprehensive (detailed analysis)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
