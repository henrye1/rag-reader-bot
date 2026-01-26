import { useState } from "react";
import { FileText, X, Trash2, CheckCircle, Loader2, AlertCircle, Database, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { UploadedDocument } from "@/pages/Index";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface DocumentListProps {
  documents: UploadedDocument[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onReprocess?: (document: UploadedDocument) => void;
}

export const DocumentList = ({ documents, onRemove, onClearAll, onReprocess }: DocumentListProps) => {
  const [isClearing, setIsClearing] = useState(false);
  const readyCount = documents.filter(d => d.status === 'ready').length;
  const totalChunks = documents.reduce((sum, d) => sum + (d.totalChunks || 0), 0);

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      await onClearAll();
    } finally {
      setIsClearing(false);
    }
  };

  if (documents.length === 0) {
    return (
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Indexed Documents</CardTitle>
          <CardDescription>No documents uploaded yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (doc: UploadedDocument) => {
    switch (doc.status) {
      case 'ready':
        return (
          <Badge variant="secondary" className="bg-green-500/10 text-green-700 border-green-500/20">
            <Database className="h-3 w-3 mr-1" />
            {doc.totalChunks} chunks
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 border-blue-500/20">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Indexing
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="secondary" className="bg-red-500/10 text-red-700 border-red-500/20">
            Error
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Indexed Documents</CardTitle>
            <CardDescription>
              {readyCount} of {documents.length} document(s) ready for RAG search
            </CardDescription>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                Clear All Documents
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Clear All Documents?
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>This will permanently delete:</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    <li><strong>{documents.length}</strong> document(s)</li>
                    <li><strong>{totalChunks}</strong> indexed chunks</li>
                    <li>All embeddings from the database</li>
                  </ul>
                  <p className="text-destructive font-medium mt-2">
                    This action cannot be undone. Make sure you have the original files if needed.
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearAll}
                  disabled={isClearing}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isClearing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Clearing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear All Documents
                    </>
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          <div className="space-y-2 pr-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 relative">
                    <FileText className="h-5 w-5 text-primary" />
                    <div className="absolute -bottom-1 -right-1">
                      {getStatusIcon(doc.status)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground">
                        {new Date(doc.uploadedAt).toLocaleDateString()}
                      </p>
                      {getStatusBadge(doc)}
                    </div>
                    {doc.status === 'error' && doc.errorMessage && (
                      <p className="text-xs text-red-500 mt-1 truncate" title={doc.errorMessage}>
                        {doc.errorMessage}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(doc.id)}
                    title="Remove document"
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {/* Reprocess button on separate row */}
                {onReprocess && doc.status === 'ready' && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onReprocess(doc)}
                      title="Reprocess with different chunking settings"
                      className="h-7 px-3 text-xs gap-1.5 w-full"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Reprocess with different settings
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
