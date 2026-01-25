import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Info,
  Clock,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { VerificationResult, ConfidenceResult } from "@/integrations/supabase/rag-types";

interface RagMetadataBadgesProps {
  skillsApplied?: string[];
  verification?: VerificationResult;
  confidence?: ConfidenceResult;
  processingTimeMs?: number;
  wasDecomposed?: boolean;
  subQuestions?: string[];
  processedQuestion?: string;
  originalQuestion?: string;
}

export const RagMetadataBadges = ({
  skillsApplied = [],
  verification,
  confidence,
  processingTimeMs,
  wasDecomposed,
  subQuestions,
  processedQuestion,
  originalQuestion,
}: RagMetadataBadgesProps) => {
  const [showDetails, setShowDetails] = useState(false);

  // Don't render if no RAG metadata
  if (
    skillsApplied.length === 0 &&
    !verification &&
    !confidence &&
    !processingTimeMs
  ) {
    return null;
  }

  const getConfidenceBadge = () => {
    if (!confidence) return null;

    const colors = {
      High: 'bg-green-500/10 text-green-700 border-green-500/20',
      Medium: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
      Low: 'bg-red-500/10 text-red-700 border-red-500/20',
    };

    const icons = {
      High: <CheckCircle className="h-3 w-3" />,
      Medium: <Info className="h-3 w-3" />,
      Low: <AlertTriangle className="h-3 w-3" />,
    };

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge
              variant="outline"
              className={`gap-1 ${colors[confidence.label]}`}
            >
              {icons[confidence.label]}
              {confidence.label} Confidence
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[300px]">
            <p className="font-medium">
              Confidence Score: {(confidence.score * 100).toFixed(0)}%
            </p>
            <p className="text-xs mt-1">{confidence.reasoning}</p>
            {confidence.gaps.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium">Information Gaps:</p>
                <ul className="text-xs list-disc ml-3 mt-1">
                  {confidence.gaps.map((gap, idx) => (
                    <li key={idx}>{gap}</li>
                  ))}
                </ul>
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const getVerificationBadge = () => {
    if (!verification) return null;

    if (verification.verified && verification.severity === 'none') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge
                variant="outline"
                className="gap-1 bg-green-500/10 text-green-700 border-green-500/20"
              >
                <CheckCircle className="h-3 w-3" />
                Verified
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Answer verified - no issues found</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    const severityColors = {
      none: 'bg-green-500/10 text-green-700 border-green-500/20',
      minor: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
      major: 'bg-red-500/10 text-red-700 border-red-500/20',
    };

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge
              variant="outline"
              className={`gap-1 ${severityColors[verification.severity]}`}
            >
              <AlertTriangle className="h-3 w-3" />
              {verification.severity === 'major' ? 'Review Needed' : 'Minor Issues'}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[300px]">
            <p className="font-medium">Verification Issues:</p>
            <ul className="text-xs list-disc ml-3 mt-1">
              {verification.issues.map((issue, idx) => (
                <li key={idx}>{issue}</li>
              ))}
            </ul>
            {verification.suggestion && (
              <p className="text-xs mt-2 text-muted-foreground">
                Suggestion: {verification.suggestion}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className="flex flex-wrap items-center gap-2">
        {/* Confidence Badge */}
        {getConfidenceBadge()}

        {/* Verification Badge */}
        {getVerificationBadge()}

        {/* Skills Applied */}
        {skillsApplied.length > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="secondary" className="gap-1">
                  <Zap className="h-3 w-3" />
                  {skillsApplied.length} Skills
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">Skills Applied:</p>
                <ul className="text-xs mt-1">
                  {skillsApplied.map((skill, idx) => (
                    <li key={idx}>- {skill}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Processing Time */}
        {processingTimeMs && (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            {(processingTimeMs / 1000).toFixed(1)}s
          </Badge>
        )}
      </div>

      {/* Expandable Details */}
      {(wasDecomposed || processedQuestion) && (
        <Collapsible open={showDetails} onOpenChange={setShowDetails}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-6 text-xs text-muted-foreground p-0"
            >
              {showDetails ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Show query processing details
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
            {processedQuestion && processedQuestion !== originalQuestion && (
              <div>
                <p className="font-medium text-foreground">Query Rewritten:</p>
                <p className="mt-1 italic">"{processedQuestion}"</p>
              </div>
            )}
            {wasDecomposed && subQuestions && subQuestions.length > 1 && (
              <div>
                <p className="font-medium text-foreground">
                  Question Decomposed into {subQuestions.length} sub-questions:
                </p>
                <ul className="mt-1 list-decimal ml-4 space-y-1">
                  {subQuestions.map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
