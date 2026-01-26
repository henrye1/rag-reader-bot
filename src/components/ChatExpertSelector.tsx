import { useState, useEffect } from "react";
import { Brain, ChevronDown, Check, Search, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
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

// Research Assistant is a special mode that queries general knowledge
export const RESEARCH_ASSISTANT: Skill = {
  id: 'research-assistant',
  name: 'Research Assistant',
  description: 'Query general knowledge without revealing confidential document data. Use for exploring methodologies, statistical approaches, and external concepts.',
  category: 'Research',
  icon: '🔬',
  prompt_content: `You are a Research Assistant specializing in statistical methods, machine learning, and quantitative analysis.

Your role is to help the user explore and understand:
- Statistical methodologies (regression, time series, classification, etc.)
- Machine learning techniques and their applications
- Model validation and performance metrics
- Industry best practices and standards
- Alternative approaches and challenger models

IMPORTANT GUIDELINES:
1. Provide objective, educational responses about methodologies and techniques
2. When discussing alternatives, explain pros/cons and when each approach is appropriate
3. Reference academic literature and industry standards where relevant
4. Do NOT ask for or expect confidential document content - the user will describe their needs abstractly
5. Focus on helping the user understand concepts they can then apply to their own work
6. If the user describes a methodology they're using, suggest potential challenger approaches or improvements

Examples of how you can help:
- "What are the advantages of logistic regression vs. gradient boosting for credit scoring?"
- "How should I validate a PD model? What metrics matter most?"
- "What are alternative approaches to LGD estimation?"
- "Explain the differences between through-the-cycle and point-in-time PD"`,
  questions_template: null,
  is_default: false,
  is_active: true,
  created_at: new Date().toISOString(),
};

interface ChatExpertSelectorProps {
  selectedExpert: Skill | null;
  onExpertChange: (expert: Skill | null) => void;
  isResearchMode: boolean;
  onResearchModeChange: (enabled: boolean) => void;
}

export const ChatExpertSelector = ({
  selectedExpert,
  onExpertChange,
  isResearchMode,
  onResearchModeChange,
}: ChatExpertSelectorProps) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    } catch (error) {
      console.error("Failed to load skills:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectResearchAssistant = () => {
    onExpertChange(RESEARCH_ASSISTANT);
    onResearchModeChange(true);
  };

  const handleSelectSkill = (skill: Skill) => {
    onExpertChange(skill);
    onResearchModeChange(false);
  };

  const currentSelection = isResearchMode ? RESEARCH_ASSISTANT : selectedExpert;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 text-xs"
            disabled={isLoading}
          >
            {currentSelection ? (
              <>
                <span>{currentSelection.icon}</span>
                <span className="max-w-[120px] truncate">{currentSelection.name}</span>
              </>
            ) : (
              <>
                <Brain className="h-3.5 w-3.5" />
                <span>Select Expert</span>
              </>
            )}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[300px]" align="start">
          {/* Research Assistant Option */}
          <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Search className="h-3 w-3" />
            External Research
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={handleSelectResearchAssistant}
            className="flex items-start gap-2 py-2 cursor-pointer"
          >
            <span className="text-lg mt-0.5">🔬</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">Research Assistant</p>
                {isResearchMode && (
                  <Check className="h-3.5 w-3.5 text-primary ml-auto" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Query general knowledge (no document data)
              </p>
            </div>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Document Experts */}
          <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            Document Experts
          </DropdownMenuLabel>

          <ScrollArea className="max-h-[250px]">
            {categories.map((category, idx) => (
              <div key={category.name}>
                {idx > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[10px] text-muted-foreground/70 uppercase tracking-wider pl-4">
                  {category.name}
                </DropdownMenuLabel>
                {category.skills.map((skill) => (
                  <DropdownMenuItem
                    key={skill.id}
                    onClick={() => handleSelectSkill(skill)}
                    className="flex items-start gap-2 py-1.5 cursor-pointer"
                  >
                    <span className="text-base mt-0.5">{skill.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{skill.name}</p>
                        {skill.is_default && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            Default
                          </Badge>
                        )}
                        {!isResearchMode && selectedExpert?.id === skill.id && (
                          <Check className="h-3.5 w-3.5 text-primary ml-auto" />
                        )}
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>

      {isResearchMode && (
        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
          No document context
        </Badge>
      )}
    </div>
  );
};
