import { useState, useEffect } from "react";
import { Brain, ChevronDown, Check, Plus, Settings, Sparkles, MessageSquare } from "lucide-react";
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

// Expert-level suggested questions grouped by topic area
interface QuestionGroup {
  topic: string;
  questions: string[];
}

const SUGGESTED_QUESTIONS: Record<string, QuestionGroup[]> = {
  "Financial Regulation": [
    {
      topic: "ECL Formulation",
      questions: [
        "What methodology is prescribed for calculating Expected Credit Loss (ECL)?",
        "How should forward-looking information be incorporated into ECL estimates?",
        "What are the Stage 1, 2, and 3 classification criteria for impairment?",
      ],
    },
    {
      topic: "PD Modelling",
      questions: [
        "What are the requirements for Probability of Default (PD) estimation?",
        "How should through-the-cycle vs point-in-time PD be calibrated?",
      ],
    },
    {
      topic: "LGD & EAD",
      questions: [
        "What factors must be considered in Loss Given Default (LGD) estimation?",
        "How should collateral and recovery rates be incorporated into LGD?",
      ],
    },
    {
      topic: "Validation & Governance",
      questions: [
        "What model validation requirements are specified?",
        "What governance and oversight structures are required for credit risk models?",
        "What backtesting and performance monitoring is mandated?",
      ],
    },
  ],
  "Risk Management": [
    {
      topic: "Risk Identification",
      questions: [
        "What risk categories and taxonomies are defined in this framework?",
        "How should emerging and concentration risks be identified?",
      ],
    },
    {
      topic: "Risk Measurement",
      questions: [
        "What quantitative methods are prescribed for risk measurement?",
        "What are the key risk indicators (KRIs) and thresholds specified?",
        "How should stress testing scenarios be designed and applied?",
      ],
    },
    {
      topic: "Risk Mitigation",
      questions: [
        "What risk mitigation strategies and controls are recommended?",
        "How should risk transfer mechanisms (hedging, insurance) be implemented?",
      ],
    },
    {
      topic: "Risk Governance",
      questions: [
        "What are the risk appetite framework requirements?",
        "What escalation procedures and reporting lines are defined?",
        "What role should the Board and risk committees play?",
      ],
    },
  ],
  "Compliance": [
    {
      topic: "Regulatory Requirements",
      questions: [
        "What are the key compliance obligations specified in this document?",
        "What regulatory filings and disclosures are required?",
      ],
    },
    {
      topic: "Controls & Monitoring",
      questions: [
        "What internal control requirements are mandated?",
        "How should compliance be monitored and tested?",
        "What documentation and record-keeping requirements exist?",
      ],
    },
    {
      topic: "Governance & Reporting",
      questions: [
        "What governance structures are required for compliance oversight?",
        "How should compliance breaches be reported and remediated?",
        "What are the penalties or consequences for non-compliance?",
      ],
    },
  ],
  "Audit": [
    {
      topic: "Audit Scope & Planning",
      questions: [
        "What areas require audit coverage according to this document?",
        "How should audit risk assessment be performed?",
      ],
    },
    {
      topic: "Audit Procedures",
      questions: [
        "What specific audit procedures and testing are prescribed?",
        "What documentation and evidence should auditors review?",
        "What sampling methodologies are recommended?",
      ],
    },
    {
      topic: "Independence & Reporting",
      questions: [
        "What independence and objectivity requirements apply?",
        "How should audit findings be reported and escalated?",
        "What follow-up procedures are required for remediation?",
      ],
    },
  ],
  "General": [
    {
      topic: "Document Overview",
      questions: [
        "What is the main purpose and scope of this document?",
        "Who are the key stakeholders and responsible parties?",
        "What are the critical dates, deadlines, and milestones?",
      ],
    },
    {
      topic: "Requirements & Processes",
      questions: [
        "What are the key requirements outlined in this document?",
        "What processes or procedures are described?",
        "What are the key definitions and terminology used?",
      ],
    },
  ],
  "Custom": [
    {
      topic: "Analysis",
      questions: [
        "Summarize the main points and key findings of this document",
        "What are the critical requirements that need immediate attention?",
        "What gaps or areas of concern are identified?",
      ],
    },
    {
      topic: "Implementation",
      questions: [
        "What actions or next steps are recommended?",
        "Who is responsible for implementation and oversight?",
      ],
    },
  ],
};

interface SkillSelectorProps {
  selectedSkill: Skill | null;
  onSkillSelect: (skill: Skill | null) => void;
  onManageSkills: () => void;
  onUploadCustom: () => void;
  onQuestionSelect?: (question: string) => void;
}

export const SkillSelector = ({
  selectedSkill,
  onSkillSelect,
  onManageSkills,
  onUploadCustom,
  onQuestionSelect,
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

            {/* Suggested Questions by Topic */}
            {onQuestionSelect && (
              <div className="mt-3 pt-3 border-t border-primary/20">
                <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Expert Questions by Topic
                </p>
                <ScrollArea className="max-h-[280px]">
                  <div className="space-y-3 pr-2">
                    {(SUGGESTED_QUESTIONS[selectedSkill.category] || SUGGESTED_QUESTIONS["General"]).map((group, groupIdx) => (
                      <div key={groupIdx} className="space-y-1.5">
                        <p className="text-[10px] font-semibold text-primary uppercase tracking-wider px-1">
                          {group.topic}
                        </p>
                        {group.questions.map((question, qIdx) => (
                          <button
                            key={qIdx}
                            onClick={() => onQuestionSelect(question)}
                            className="w-full text-left text-xs px-2 py-1.5 rounded-md bg-background hover:bg-primary/10 border border-transparent hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
