import { useState, useEffect } from "react";
import {
  Brain,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
  ChevronDown,
  ChevronUp,
  Globe,
  User,
  FileText,
  Sparkles,
  Wand2,
  FileOutput,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import type { Skill } from "@/types/database";
import { useToast } from "@/hooks/use-toast";
import { SkillCreatorDialog } from "@/components/SkillCreatorDialog";

interface SkillManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSkillsChanged: () => void;
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
  "Meta",
  "General",
  "Custom",
];

const ICONS = ["📊", "🏦", "📈", "🔍", "📄", "🎯", "💼", "📋", "⚖️", "🛡️", "💡", "🧮"];

const emptySkill: Partial<Skill> = {
  name: "",
  description: "",
  category: "Custom",
  icon: "🎯",
  prompt_content: "",
  questions_template: null,
  is_active: true,
  is_default: false,
};

export const SkillManager = ({ isOpen, onClose, onSkillsChanged }: SkillManagerProps) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [globalSkills, setGlobalSkills] = useState<Skill[]>([]);
  const [userSkills, setUserSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Partial<Skill> | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showSkillCreator, setShowSkillCreator] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadSkills();
    }
  }, [isOpen]);

  const loadSkills = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await apiFetch<Skill[]>("skills");

      if (error) throw error;

      const allSkills = data || [] as Skill[];
      setSkills(allSkills);
      setGlobalSkills(allSkills.filter(s => s.user_id === null));
      setUserSkills(allSkills.filter(s => s.user_id !== null));
    } catch (error) {
      console.error("Failed to load skills:", error);
      toast({
        title: "Error",
        description: "Failed to load skills",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingSkill?.name || !editingSkill?.prompt_content) {
      toast({
        title: "Validation Error",
        description: "Name and prompt content are required",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (editingSkill.id) {
        // Update existing
        const { error } = await apiFetch(`skills/${editingSkill.id}`, {
          method: 'PUT',
          body: {
            name: editingSkill.name,
            description: editingSkill.description,
            category: editingSkill.category,
            icon: editingSkill.icon,
            prompt_content: editingSkill.prompt_content,
            questions_template: editingSkill.questions_template,
            is_active: editingSkill.is_active,
          },
        });

        if (error) throw error;

        toast({
          title: "Success",
          description: "Skill updated successfully",
        });
      } else {
        // Create new
        const { error } = await apiFetch("skills", {
          method: 'POST',
          body: {
            name: editingSkill.name,
            description: editingSkill.description,
            category: editingSkill.category || 'Custom',
            icon: editingSkill.icon || '\uD83C\uDFAF',
            prompt_content: editingSkill.prompt_content,
            questions_template: editingSkill.questions_template,
            is_active: editingSkill.is_active ?? true,
            user_id: null,
          },
        });

        if (error) throw error;

        toast({
          title: "Success",
          description: "Skill created successfully",
        });
      }

      setEditingSkill(null);
      loadSkills();
      onSkillsChanged();
    } catch (error) {
      console.error("Failed to save skill:", error);
      toast({
        title: "Error",
        description: "Failed to save skill",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await apiFetch(`skills/${id}`, { method: 'DELETE' });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Skill deleted successfully",
      });

      setDeleteConfirm(null);
      loadSkills();
      onSkillsChanged();
    } catch (error) {
      console.error("Failed to delete skill:", error);
      toast({
        title: "Error",
        description: "Failed to delete skill",
        variant: "destructive",
      });
    }
  };

  const SkillCard = ({ skill }: { skill: Skill }) => {
    const isExpanded = expandedSkill === skill.id;
    const isGlobal = skill.user_id === null;
    const skillType = skill.skill_type || 'expert';

    return (
      <div className="border rounded-lg bg-card">
        <div
          className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50"
          onClick={() => setExpandedSkill(isExpanded ? null : skill.id)}
        >
          <span className="text-xl">{skill.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium truncate">{skill.name}</p>
              {/* Skill Type Badges */}
              {skillType === 'generator' && (
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                  <FileOutput className="h-3 w-3 mr-1" />
                  Generator
                </Badge>
              )}
              {skillType === 'meta' && (
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  <Wand2 className="h-3 w-3 mr-1" />
                  Meta
                </Badge>
              )}
              {skill.is_default && (
                <Badge variant="secondary" className="text-xs">Default</Badge>
              )}
              {!skill.is_active && (
                <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{skill.category}</p>
          </div>
          <div className="flex items-center gap-2">
            {isGlobal ? (
              <Globe className="h-4 w-4 text-muted-foreground" title="Global skill" />
            ) : (
              <User className="h-4 w-4 text-primary" title="Your skill" />
            )}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="px-3 pb-3 pt-1 border-t space-y-3">
            {skill.description && (
              <p className="text-sm text-muted-foreground">{skill.description}</p>
            )}
            <div className="bg-muted/50 rounded p-2">
              <p className="text-xs font-medium mb-1 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Prompt Preview
              </p>
              <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                {skill.prompt_content}
              </p>
            </div>
            {skill.questions_template && skill.questions_template.length > 0 && (
              <p className="text-xs text-primary">
                {skill.questions_template.length} assessment questions included
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingSkill(skill);
                }}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
              {deleteConfirm === skill.id ? (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(skill.id);
                    }}
                  >
                    Confirm Delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(null);
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(skill.id);
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Manage Expert Skills
          </DialogTitle>
          <DialogDescription>
            Create, edit, and organize your expert skills and agents
          </DialogDescription>
        </DialogHeader>

        {editingSkill ? (
          // Edit/Create Form
          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            <div className="grid grid-cols-[auto,1fr] gap-4">
              <div>
                <Label>Icon</Label>
                <Select
                  value={editingSkill.icon || "🎯"}
                  onValueChange={(value) => setEditingSkill({ ...editingSkill, icon: value })}
                >
                  <SelectTrigger className="w-20 text-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICONS.map((icon) => (
                      <SelectItem key={icon} value={icon} className="text-xl">
                        {icon}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name *</Label>
                <Input
                  value={editingSkill.name || ""}
                  onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
                  placeholder="e.g., IFRS 9 Expert"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select
                  value={editingSkill.category || "Custom"}
                  onValueChange={(value) => setEditingSkill({ ...editingSkill, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingSkill.is_active ?? true}
                    onChange={(e) => setEditingSkill({ ...editingSkill, is_active: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Input
                value={editingSkill.description || ""}
                onChange={(e) => setEditingSkill({ ...editingSkill, description: e.target.value })}
                placeholder="Brief description of this skill's expertise"
              />
            </div>

            <div>
              <Label>Expert Knowledge / Prompt Content *</Label>
              <Textarea
                value={editingSkill.prompt_content || ""}
                onChange={(e) => setEditingSkill({ ...editingSkill, prompt_content: e.target.value })}
                placeholder="Enter the expert knowledge, framework, or instructions for this skill..."
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This content will be used to guide the AI's responses when this skill is active
              </p>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setEditingSkill(null)}
                disabled={isSaving}
              >
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
                    {editingSkill.id ? "Update Skill" : "Create Skill"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // Skills List
          <>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setShowSkillCreator(true)}
                size="sm"
                variant="outline"
                className="gap-1"
              >
                <Sparkles className="h-4 w-4" />
                AI Generate
              </Button>
              <Button onClick={() => setEditingSkill({ ...emptySkill })} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New Skill
              </Button>
            </div>

            <Tabs defaultValue="all" className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">All ({skills.length})</TabsTrigger>
                <TabsTrigger value="global">
                  <Globe className="h-3 w-3 mr-1" />
                  Global ({globalSkills.length})
                </TabsTrigger>
                <TabsTrigger value="custom">
                  <User className="h-3 w-3 mr-1" />
                  Custom ({userSkills.length})
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 mt-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    <TabsContent value="all" className="space-y-2 mt-0">
                      {skills.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          No skills found. Create your first skill!
                        </p>
                      ) : (
                        skills.map((skill) => <SkillCard key={skill.id} skill={skill} />)
                      )}
                    </TabsContent>
                    <TabsContent value="global" className="space-y-2 mt-0">
                      {globalSkills.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          No global skills available
                        </p>
                      ) : (
                        globalSkills.map((skill) => <SkillCard key={skill.id} skill={skill} />)
                      )}
                    </TabsContent>
                    <TabsContent value="custom" className="space-y-2 mt-0">
                      {userSkills.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          No custom skills yet. Create one!
                        </p>
                      ) : (
                        userSkills.map((skill) => <SkillCard key={skill.id} skill={skill} />)
                      )}
                    </TabsContent>
                  </>
                )}
              </ScrollArea>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>

    {/* AI Skill Creator Dialog */}
    <SkillCreatorDialog
      isOpen={showSkillCreator}
      onClose={() => setShowSkillCreator(false)}
      onSkillCreated={() => {
        loadSkills();
        onSkillsChanged();
      }}
    />
  </>
  );
};
