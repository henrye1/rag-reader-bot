import { useState } from "react";
import { Wand2, ChevronRight, ChevronLeft, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { RagConfig, RetrievalConfig, AssistantState } from "@/integrations/supabase/rag-types";
import { ASSISTANT_QUESTIONS, DEFAULT_RAG_CONFIG, DEFAULT_RETRIEVAL_CONFIG } from "@/integrations/supabase/rag-types";

interface RagAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyConfig: (config: Omit<RagConfig, 'id' | 'created_at'>, retrievalConfig?: RetrievalConfig) => void;
}

export const RagAssistantDialog = ({
  open,
  onOpenChange,
  onApplyConfig,
}: RagAssistantDialogProps) => {
  const [state, setState] = useState<AssistantState & { recommendedRetrievalConfig: RetrievalConfig | null }>({
    step: 0,
    documentType: null,
    questionComplexity: null,
    priority: null,
    recommendedConfig: null,
    recommendedRetrievalConfig: null,
  });

  const currentQuestion = ASSISTANT_QUESTIONS[state.step];
  const totalSteps = ASSISTANT_QUESTIONS.length + 1; // +1 for recommendation step
  const progress = ((state.step + 1) / totalSteps) * 100;

  const handleOptionSelect = (value: string) => {
    const updates: Partial<AssistantState> = {};

    if (state.step === 0) {
      updates.documentType = value;
    } else if (state.step === 1) {
      updates.questionComplexity = value as 'simple' | 'moderate' | 'complex';
    } else if (state.step === 2) {
      updates.priority = value as 'speed' | 'balanced' | 'accuracy';
    }

    // Move to next step
    if (state.step < ASSISTANT_QUESTIONS.length - 1) {
      setState(prev => ({ ...prev, ...updates, step: prev.step + 1 }));
    } else {
      // Generate recommendation
      const fullState = { ...state, ...updates } as AssistantState;
      const config = generateRecommendation(fullState);
      const retrievalConfig = generateRetrievalRecommendation(fullState);
      setState(prev => ({
        ...prev,
        ...updates,
        step: prev.step + 1,
        recommendedConfig: config,
        recommendedRetrievalConfig: retrievalConfig,
      }));
    }
  };

  const generateRecommendation = (s: AssistantState): Omit<RagConfig, 'id' | 'created_at'> => {
    const config: Omit<RagConfig, 'id' | 'created_at'> = {
      ...DEFAULT_RAG_CONFIG,
      name: 'Custom (Assistant)',
      description: `Configured for ${s.documentType} documents`,
    };

    // Document type adjustments
    switch (s.documentType) {
      case 'Financial':
        config.top_k = 25;
        config.similarity_threshold = 0.3;
        config.enable_verification = true;
        config.enable_confidence = true;
        break;
      case 'Legal':
        config.top_k = 30;
        config.similarity_threshold = 0.25;
        config.enable_verification = true;
        config.enable_confidence = true;
        break;
      case 'Technical':
        config.top_k = 20;
        config.similarity_threshold = 0.35;
        config.enable_hyde = true;
        break;
      default:
        config.top_k = 15;
        config.similarity_threshold = 0.3;
    }

    // Complexity adjustments
    switch (s.questionComplexity) {
      case 'simple':
        config.enable_decomposition = false;
        config.enable_reasoning = false;
        break;
      case 'moderate':
        config.enable_decomposition = true;
        config.enable_query_rewrite = true;
        break;
      case 'complex':
        config.enable_decomposition = true;
        config.enable_query_rewrite = true;
        config.enable_reasoning = true;
        config.enable_hyde = true;
        break;
    }

    // Priority adjustments
    switch (s.priority) {
      case 'speed':
        config.enable_hyde = false;
        config.enable_verification = false;
        config.enable_confidence = false;
        config.enable_reasoning = false;
        config.top_k = Math.min(config.top_k, 10);
        break;
      case 'balanced':
        config.enable_query_rewrite = true;
        // Keep verification/confidence if already set by document type
        break;
      case 'accuracy':
        config.enable_hyde = true;
        config.enable_query_rewrite = true;
        config.enable_verification = true;
        config.enable_confidence = true;
        config.top_k = Math.max(config.top_k, 20);
        break;
    }

    return config;
  };

  const generateRetrievalRecommendation = (s: AssistantState): RetrievalConfig => {
    const config: RetrievalConfig = { ...DEFAULT_RETRIEVAL_CONFIG };

    // Document type adjustments
    switch (s.documentType) {
      case 'Financial':
        config.enable_reranking = true;
        config.reranker_model = 'llm-rerank';
        config.rerank_top_n = 20;
        config.enable_fusion = true;
        config.enable_crag = true;
        config.crag_relevance_threshold = 0.35;
        break;
      case 'Legal':
        config.enable_reranking = true;
        config.reranker_model = 'llm-rerank';
        config.rerank_top_n = 25;
        config.enable_fusion = true;
        config.enable_hierarchical = true;
        config.enable_self_rag = true;
        config.max_self_rag_iterations = 2;
        break;
      case 'Technical':
        config.enable_fusion = true;
        config.enable_reranking = true;
        config.reranker_model = 'llm-rerank';
        break;
      default:
        config.enable_reranking = true;
        config.reranker_model = 'llm-rerank';
        break;
    }

    // Complexity adjustments
    switch (s.questionComplexity) {
      case 'simple':
        config.enable_self_rag = false;
        config.enable_hierarchical = false;
        break;
      case 'moderate':
        config.enable_fusion = true;
        break;
      case 'complex':
        config.enable_self_rag = true;
        config.max_self_rag_iterations = 2;
        config.enable_hierarchical = true;
        config.enable_crag = true;
        break;
    }

    // Priority adjustments
    switch (s.priority) {
      case 'speed':
        config.enable_reranking = false;
        config.enable_self_rag = false;
        config.enable_crag = false;
        config.enable_hierarchical = false;
        config.enable_fusion = false;
        break;
      case 'balanced':
        config.enable_reranking = true;
        config.enable_fusion = true;
        // Keep other settings as-is
        break;
      case 'accuracy':
        config.enable_reranking = true;
        config.reranker_model = 'llm-rerank';
        config.rerank_top_n = 25;
        config.enable_fusion = true;
        config.enable_self_rag = true;
        config.max_self_rag_iterations = 3;
        config.enable_crag = true;
        config.enable_hierarchical = true;
        config.enable_feedback_loop = true;
        break;
    }

    return config;
  };

  const handleBack = () => {
    if (state.step > 0) {
      setState(prev => ({
        ...prev,
        step: prev.step - 1,
        recommendedConfig: null,
      }));
    }
  };

  const handleApply = () => {
    if (state.recommendedConfig) {
      onApplyConfig(state.recommendedConfig, state.recommendedRetrievalConfig || undefined);
      onOpenChange(false);
      // Reset state for next time
      setState({
        step: 0,
        documentType: null,
        questionComplexity: null,
        priority: null,
        recommendedConfig: null,
        recommendedRetrievalConfig: null,
      });
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state
    setState({
      step: 0,
      documentType: null,
      questionComplexity: null,
      priority: null,
      recommendedConfig: null,
      recommendedRetrievalConfig: null,
    });
  };

  const countEnabledSkills = (config: Omit<RagConfig, 'id' | 'created_at'>) => {
    let count = 0;
    if (config.enable_hyde) count++;
    if (config.enable_query_rewrite) count++;
    if (config.enable_decomposition) count++;
    if (config.enable_verification) count++;
    if (config.enable_confidence) count++;
    if (config.enable_reasoning) count++;
    return count;
  };

  const countEnabledRetrievalSkills = (config: RetrievalConfig) => {
    let count = 0;
    if (config.enable_reranking) count++;
    if (config.enable_fusion) count++;
    if (config.enable_hierarchical) count++;
    if (config.enable_self_rag) count++;
    if (config.enable_crag) count++;
    if (config.enable_feedback_loop) count++;
    return count;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            RAG Configuration Wizard
          </DialogTitle>
          <DialogDescription>
            Answer a few questions to get optimal settings for your use case
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Progress value={progress} className="h-2" />

          {state.step < ASSISTANT_QUESTIONS.length ? (
            <>
              <div className="py-2">
                <h3 className="text-lg font-medium mb-4">{currentQuestion.question}</h3>
                <div className="grid gap-3">
                  {currentQuestion.options.map((option) => (
                    <Card
                      key={option.id}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => handleOptionSelect(option.value)}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="flex-1">
                          <p className="font-medium">{option.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {option.description}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {state.step > 0 && (
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
            </>
          ) : (
            // Recommendation step
            <div className="py-4 space-y-4">
              <div className="flex items-center gap-3 text-center justify-center">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
              </div>
              <h3 className="text-lg font-medium text-center">
                Recommended Configuration
              </h3>

              {state.recommendedConfig && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Document Type</span>
                      <Badge>{state.documentType}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Question Complexity</span>
                      <Badge variant="secondary">{state.questionComplexity}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Priority</span>
                      <Badge variant="outline">{state.priority}</Badge>
                    </div>

                    <div className="border-t pt-3 mt-3">
                      <p className="text-sm font-medium mb-2">Settings:</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          {state.recommendedConfig.enable_query_rewrite ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                          )}
                          Query Rewrite
                        </div>
                        <div className="flex items-center gap-2">
                          {state.recommendedConfig.enable_hyde ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                          )}
                          HyDE
                        </div>
                        <div className="flex items-center gap-2">
                          {state.recommendedConfig.enable_decomposition ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                          )}
                          Decomposition
                        </div>
                        <div className="flex items-center gap-2">
                          {state.recommendedConfig.enable_verification ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                          )}
                          Verification
                        </div>
                        <div className="flex items-center gap-2">
                          {state.recommendedConfig.enable_confidence ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                          )}
                          Confidence
                        </div>
                        <div className="flex items-center gap-2">
                          {state.recommendedConfig.enable_reasoning ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                          )}
                          Reasoning
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-3 border-t text-sm">
                        <span className="text-muted-foreground">Top K</span>
                        <span className="font-medium">{state.recommendedConfig.top_k}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Similarity Threshold</span>
                        <span className="font-medium">{state.recommendedConfig.similarity_threshold}</span>
                      </div>

                      {/* Retrieval Skills */}
                      {state.recommendedRetrievalConfig && (
                        <>
                          <p className="text-sm font-medium mt-3 mb-2 border-t pt-3">Retrieval Skills:</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center gap-2">
                              {state.recommendedRetrievalConfig.enable_reranking ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                              )}
                              Reranking
                            </div>
                            <div className="flex items-center gap-2">
                              {state.recommendedRetrievalConfig.enable_fusion ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                              )}
                              Fusion
                            </div>
                            <div className="flex items-center gap-2">
                              {state.recommendedRetrievalConfig.enable_hierarchical ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                              )}
                              Hierarchical
                            </div>
                            <div className="flex items-center gap-2">
                              {state.recommendedRetrievalConfig.enable_self_rag ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                              )}
                              Self-RAG
                            </div>
                            <div className="flex items-center gap-2">
                              {state.recommendedRetrievalConfig.enable_crag ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                              )}
                              CRAG
                            </div>
                            <div className="flex items-center gap-2">
                              {state.recommendedRetrievalConfig.enable_feedback_loop ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <span className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                              )}
                              Feedback
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">
                      {countEnabledSkills(state.recommendedConfig)} query skills + {state.recommendedRetrievalConfig ? countEnabledRetrievalSkills(state.recommendedRetrievalConfig) : 0} retrieval skills
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={handleBack}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <Button onClick={handleApply} className="gap-2">
                  <Check className="h-4 w-4" />
                  Apply Configuration
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
