import { useState, useEffect } from "react";
import { Brain, ChevronDown, Check, Plus, Settings, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import type { Skill, SkillCategory } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

interface SkillSelectorProps {
  selectedSkill: Skill | null;
  onSkillSelect: (skill: Skill | null) => void;
  onManageSkills: () => void;
  onUploadCustom: () => void;
}

export const SkillSelector = ({
  selectedSkill,
  onSkillSelect,
  onManageSkills,
  onUploadCustom,
}: SkillSelectorProps) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('skills')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('category')
        .order('name');

      if (error) throw error;

      const skillsData = data as Skill[];
      setSkills(skillsData);

      // Group by category
      const grouped = skillsData.reduce((acc, skill) => {
        const existing = acc.find(c => c.name === skill.category);
        if (existing) {
          existing.skills.push(skill);
        } else {
          acc.push({ name: skill.category, skills: [skill] });
        }
        return acc;
      }, [] as SkillCategory[]);

      setCategories(grouped);

      // Auto-select default skill if none selected
      if (!selectedSkill) {
        const defaultSkill = skillsData.find(s => s.is_default);
        if (defaultSkill) {
          onSkillSelect(defaultSkill);
        }
      }
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

  return (
    <Card className="shadow-soft">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Step 2: Select Expert Skill
            </CardTitle>
            <CardDescription>
              Choose an expert agent or upload custom knowledge
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onManageSkills}
            className="gap-1"
          >
            <Settings className="h-4 w-4" />
            Manage
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between h-auto py-3"
              disabled={isLoading}
            >
              {selectedSkill ? (
                <div className="flex items-center gap-3 text-left">
                  <span className="text-xl">{selectedSkill.icon}</span>
                  <div>
                    <p className="font-medium">{selectedSkill.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedSkill.category}
                    </p>
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">
                  {isLoading ? "Loading skills..." : "Select an expert skill..."}
                </span>
              )}
              <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[350px]" align="start">
            <ScrollArea className="h-[300px]">
              {categories.map((category, idx) => (
                <div key={category.name}>
                  {idx > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">
                    {category.name}
                  </DropdownMenuLabel>
                  {category.skills.map((skill) => (
                    <DropdownMenuItem
                      key={skill.id}
                      onClick={() => onSkillSelect(skill)}
                      className="flex items-start gap-3 py-2 cursor-pointer"
                    >
                      <span className="text-lg mt-0.5">{skill.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{skill.name}</p>
                          {skill.is_default && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              Default
                            </Badge>
                          )}
                          {selectedSkill?.id === skill.id && (
                            <Check className="h-4 w-4 text-primary ml-auto" />
                          )}
                        </div>
                        {skill.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {skill.description}
                          </p>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </ScrollArea>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onUploadCustom}
              className="flex items-center gap-2 text-primary cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Upload Custom Knowledge
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {selectedSkill && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{selectedSkill.name}</p>
                  <Badge variant="secondary" className="text-xs">
                    Active
                  </Badge>
                </div>
                {selectedSkill.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedSkill.description}
                  </p>
                )}
                {selectedSkill.questions_template && selectedSkill.questions_template.length > 0 && (
                  <p className="text-xs text-primary mt-1">
                    Includes {selectedSkill.questions_template.length} assessment questions
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSkillSelect(null)}
                className="text-xs h-7"
              >
                Clear
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
