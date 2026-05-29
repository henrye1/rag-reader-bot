import { useState } from "react";
import {
  Brain,
  Sparkles,
  Loader2,
  Check,
  Copy,
  Save,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiCall, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { GeneratedSkillResponse, SkillType, OutputFormat } from "@/types/database";

interface SkillCreatorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSkillCreated: () => void;
}

const CATEGORIES = [
  "Financial Regulation",
  "Risk Management",
  "Compliance",
  "Audit",
  "Legal",
  "Technical",
  "Operations",
  "Document Generation",
  "Research",
  "Custom",
];

const ICONS = ["📊", "🏦", "📈", "🔍", "📄", "🎯", "💼", "📋", "⚖️", "🛡️", "💡", "🧮", "🎨", "🎬", "📚", "🔬"];

type Step = 'describe' | 'preview' | 'edit';

export const SkillCreatorDialog = ({
  isOpen,
  onClose,
  onSkillCreated,
}: SkillCreatorDialogProps) => {
  const [step, setStep] = useState<Step>('describe');
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedSkill, setGeneratedSkill] = useState<GeneratedSkillResponse | null>(null);
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  // Editable fields
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedCategory, setEditedCategory] = useState("");
  const [editedIcon, setEditedIcon] = useState("");
  const [editedPromptContent, setEditedPromptContent] = useState("");

  const { toast } = useToast();

  const resetDialog = () => {
    setStep('describe');
    setDescription("");
    setGeneratedSkill(null);
    setShowPromptPreview(false);
    setEditedName("");
    setEditedDescription("");
    setEditedCategory("");
    setEditedIcon("");
    setEditedPromptContent("");
  };

  const handleClose = () => {
    resetDialog();
    onClose();
  };

  const handleGenerate = async () => {
    if (!description.trim() || description.length < 10) {
      toast({
        title: "Description too short",
        description: "Please provide a more detailed description (at least 10 characters)",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await apiCall("create-skill", {
        description, saveSkill: false,
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || "Failed to generate skill");
      }

      const result: GeneratedSkillResponse = {
        skill: data.skill,
        reasoning: data.reasoning,
        suggested_use_cases: data.suggested_use_cases,
      };

      setGeneratedSkill(result);

      // Pre-fill editable fields
      setEditedName(result.skill.name);
      setEditedDescription(result.skill.description);
      setEditedCategory(result.skill.category);
      setEditedIcon(result.skill.icon);
      setEditedPromptContent(result.skill.prompt_content);

      setStep('preview');

      toast({
        title: "Skill Generated",
        description: `Created "${result.skill.name}" - review and save`,
      });
    } catch (error) {
      console.error("Failed to generate skill:", error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate skill",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!editedName || !editedPromptContent) {
      toast({
        title: "Missing Required Fields",
        description: "Name and prompt content are required",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await apiFetch("skills", {
        method: 'POST',
        body: {
          name: editedName,
          description: editedDescription,
          category: editedCategory || 'Custom',
          icon: editedIcon || '\uD83C\uDFAF',
          skill_type: 'expert' as SkillType,
          output_format: 'text' as OutputFormat,
          prompt_content: editedPromptContent,
          is_active: true,
          is_default: false,
          user_id: null,
        },
      });

      if (error) throw error;

      toast({
        title: "Skill Saved",
        description: `"${editedName}" has been added to your skills`,
      });

      onSkillCreated();
      handleClose();
    } catch (error) {
      console.error("Failed to save skill:", error);
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save skill",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = () => {
    setStep('describe');
    setGeneratedSkill(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Content copied to clipboard",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI Skill Creator
          </DialogTitle>
          <DialogDescription>
            {step === 'describe' && "Describe the expert skill you need, and AI will generate a complete definition."}
            {step === 'preview' && "Review the generated skill. You can edit any field before saving."}
            {step === 'edit' && "Edit the skill details as needed."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          {/* Step 1: Describe */}
          {step === 'describe' && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="description">
                  What kind of expert do you need?
                </Label>
                <Textarea
                  id="description"
                  placeholder="Example: I need an expert for analyzing financial statements, including balance sheets, income statements, and cash flow. They should identify key ratios, trends, and red flags..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[150px]"
                  disabled={isGenerating}
                />
                <p className="text-xs text-muted-foreground">
                  Be specific about the domain, what the expert should analyze, and what kind of insights you need.
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium mb-2">Tips for better results:</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>- Mention the specific domain or industry</li>
                  <li>- Describe what documents or content they'll analyze</li>
                  <li>- Specify the type of insights or assessments needed</li>
                  <li>- Include any relevant standards or regulations</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && generatedSkill && (
            <div className="space-y-4 py-4">
              {/* Generated Skill Card */}
              <div className="border rounded-lg p-4 bg-gradient-to-br from-primary/5 to-primary/10">
                <div className="flex items-start gap-3">
                  <div className="text-3xl">{editedIcon}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Input
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="font-semibold text-lg h-8 px-2"
                      />
                      <Badge variant="secondary">{editedCategory}</Badge>
                    </div>
                    <Textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="mt-2 text-sm text-muted-foreground min-h-[60px]"
                    />
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Select value={editedCategory} onValueChange={setEditedCategory}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={editedIcon} onValueChange={setEditedIcon}>
                    <SelectTrigger className="w-[80px]">
                      <SelectValue placeholder="Icon" />
                    </SelectTrigger>
                    <SelectContent>
                      {ICONS.map((icon) => (
                        <SelectItem key={icon} value={icon}>
                          <span className="text-lg">{icon}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Reasoning */}
              {generatedSkill.reasoning && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    AI Reasoning
                  </h4>
                  <p className="text-xs text-muted-foreground">{generatedSkill.reasoning}</p>
                </div>
              )}

              {/* Use Cases */}
              {generatedSkill.suggested_use_cases && generatedSkill.suggested_use_cases.length > 0 && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <h4 className="text-sm font-medium mb-2">Suggested Use Cases</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {generatedSkill.suggested_use_cases.map((useCase, idx) => (
                      <li key={idx} className="flex items-start gap-1">
                        <Check className="h-3 w-3 mt-0.5 text-green-500 shrink-0" />
                        {useCase}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Expert Knowledge Preview */}
              <div className="border rounded-lg">
                <button
                  onClick={() => setShowPromptPreview(!showPromptPreview)}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm font-medium">Expert Knowledge (Prompt Content)</span>
                  {showPromptPreview ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showPromptPreview && (
                  <div className="border-t p-3">
                    <div className="flex justify-end mb-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(editedPromptContent)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <Textarea
                      value={editedPromptContent}
                      onChange={(e) => setEditedPromptContent(e.target.value)}
                      className="min-h-[300px] font-mono text-xs"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2">
          {step === 'describe' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || description.length < 10}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Skill
                  </>
                )}
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleRegenerate}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Skill
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
