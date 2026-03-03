import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    a.download = `Document_Report_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Report Downloaded",
      description: "HTML report has been downloaded successfully",
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

  const handleDownloadWord = async () => {
    if (!reportHtml) return;

    toast({
      title: "Word Generation",
      description: "Converting to Word document...",
    });

    try {
      // Create Word-compatible HTML with proper Microsoft Office namespace
      const wordHtml = `
        <!DOCTYPE html>
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            @page {
              size: A4;
              margin: 2.54cm;
            }
            body {
              font-family: 'Calibri', 'Arial', sans-serif;
              font-size: 11pt;
              line-height: 1.5;
              color: #333;
            }
            h1 { font-size: 18pt; color: #2c3e50; margin-bottom: 12pt; font-weight: bold; }
            h2 { font-size: 14pt; color: #2c3e50; margin-top: 18pt; margin-bottom: 6pt; font-weight: bold; }
            h3 { font-size: 12pt; color: #34495e; margin-top: 12pt; margin-bottom: 6pt; font-weight: bold; }
            p { margin: 6pt 0; }
            ul, ol { margin: 6pt 0 6pt 18pt; }
            li { margin: 3pt 0; }
            table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
            th, td { border: 1px solid #ddd; padding: 8pt; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .header { border-bottom: 2pt solid #3498db; padding-bottom: 12pt; margin-bottom: 18pt; }
            .section { margin: 18pt 0; }
            strong { font-weight: bold; }
          </style>
        </head>
        <body>
          ${extractBodyContent(reportHtml)}
        </body>
        </html>
      `;

      // Create blob with Word MIME type
      const blob = new Blob(['\ufeff', wordHtml], {
        type: 'application/msword'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Document_Report_${Date.now()}.doc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Report Downloaded",
        description: "Word document has been downloaded successfully",
      });
    } catch (error) {
      console.error("Word generation error:", error);
      toast({
        title: "Error",
        description: "Failed to generate Word document",
        variant: "destructive",
      });
    }
  };

  // Helper function to extract body content from full HTML
  const extractBodyContent = (html: string): string => {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      return bodyMatch[1];
    }
    // If no body tags, return the content within the container div
    const containerMatch = html.match(/<div class="container"[^>]*>([\s\S]*?)<\/div>\s*<\/body>/i);
    if (containerMatch) {
      return containerMatch[1];
    }
    // Fallback: return the whole HTML (stripped of html/head/body tags)
    return html
      .replace(/<html[^>]*>/gi, '')
      .replace(/<\/html>/gi, '')
      .replace(/<head>[\s\S]*?<\/head>/gi, '')
      .replace(/<body[^>]*>/gi, '')
      .replace(/<\/body>/gi, '');
  };

  if (!reportHtml) {
    return (
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Generated Report</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-12">
          <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            No report generated yet. Ask a question to generate a report.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-soft">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Generated Report</CardTitle>
        <div className="flex gap-2">
          <Button
            onClick={handleDownloadWord}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Word
          </Button>
          <Button
            onClick={handleDownloadHtml}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            HTML
          </Button>
          <Button
            onClick={handleDownloadPdf}
            variant="outline"
            size="sm"
            className="gap-2"
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
            title="Generated Report"
            sandbox="allow-same-origin"
          />
        </div>
      </CardContent>
    </Card>
  );
};
