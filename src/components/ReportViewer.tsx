import { Download, FileText, FileJson, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface ReportViewerProps {
  reportHtml: string | null;
  reportData: any;
}

export const ReportViewer = ({ reportHtml, reportData }: ReportViewerProps) => {
  const { toast } = useToast();

  const handleDownloadHtml = () => {
    if (!reportHtml) return;

    const blob = new Blob([reportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Audit_Review_Report_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Report Downloaded",
      description: "HTML audit report has been downloaded successfully",
    });
  };

  const handleDownloadJson = () => {
    if (!reportData) return;

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Audit_Review_Data_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Data Downloaded",
      description: "JSON report data has been downloaded successfully",
    });
  };

  const handleDownloadPdf = async () => {
    if (!reportHtml) return;

    toast({
      title: "PDF Generation",
      description: "Converting HTML to PDF... This may take a moment.",
    });

    try {
      // Use browser's print to PDF functionality
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(reportHtml);
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
          printWindow.print();
          toast({
            title: "Print Dialog Opened",
            description: "Use 'Save as PDF' option in the print dialog",
          });
        }, 250);
      }
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({
        title: "Error",
        description: "Failed to open print dialog",
        variant: "destructive",
      });
    }
  };

  if (!reportHtml) {
    return (
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Audit Review Report
          </CardTitle>
          <CardDescription>
            Your comprehensive compliance assessment will appear here
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-12">
          <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            No audit review report generated yet. Complete the workflow above to generate your report.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-soft">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Audit Review Report
          </CardTitle>
          <CardDescription className="mt-1">
            Comprehensive compliance assessment and gap analysis
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleDownloadJson}
            variant="outline"
            size="sm"
            className="gap-2"
            title="Download raw report data as JSON"
          >
            <FileJson className="h-4 w-4" />
            JSON
          </Button>
          <Button
            onClick={handleDownloadHtml}
            variant="outline"
            size="sm"
            className="gap-2"
            title="Download report as HTML"
          >
            <Download className="h-4 w-4" />
            HTML
          </Button>
          <Button
            onClick={handleDownloadPdf}
            variant="outline"
            size="sm"
            className="gap-2"
            title="Save report as PDF"
          >
            <Download className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden bg-white">
          <iframe
            srcDoc={reportHtml}
            className="w-full h-[600px] border-0"
            title="Audit Review Report"
            sandbox="allow-same-origin"
          />
        </div>
      </CardContent>
    </Card>
  );
};
