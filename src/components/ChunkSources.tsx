import { useState } from "react";
import { ChevronDown, ChevronUp, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Source } from "@/integrations/supabase/types";

interface ChunkSourcesProps {
  sources: Source[];
}

export const ChunkSources = ({ sources }: ChunkSourcesProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());

  const toggleChunk = (index: number) => {
    setExpandedChunks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const getSimilarityColor = (similarity: number): string => {
    if (similarity >= 0.7) return "bg-green-500";
    if (similarity >= 0.5) return "bg-yellow-500";
    return "bg-orange-500";
  };

  const getSimilarityLabel = (similarity: number): string => {
    if (similarity >= 0.7) return "High";
    if (similarity >= 0.5) return "Medium";
    return "Low";
  };

  if (sources.length === 0) return null;

  return (
    <div className="border border-border rounded-lg bg-muted/30">
      <Button
        variant="ghost"
        className="w-full justify-between px-3 py-2 h-auto"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 text-sm">
          <Search className="h-4 w-4 text-primary" />
          <span className="font-medium">Sources Retrieved</span>
          <Badge variant="secondary" className="ml-1">
            {sources.length} chunks
          </Badge>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </Button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {sources.map((source, index) => (
            <div
              key={index}
              className="border border-border rounded-md bg-background"
            >
              <div
                className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50"
                onClick={() => toggleChunk(index)}
              >
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{source.documentName}</p>
                  <p className="text-xs text-muted-foreground">
                    Chunk {source.chunkIndex + 1}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-white ${getSimilarityColor(source.similarity)}`}
                >
                  {(source.similarity * 100).toFixed(0)}% {getSimilarityLabel(source.similarity)}
                </Badge>
                {expandedChunks.has(index) ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              {expandedChunks.has(index) && (
                <div className="px-3 pb-3 pt-1 border-t border-border">
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {source.preview}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
