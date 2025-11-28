import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY is not configured");
    }

    const { question, files, customPrompt, generateReport } = await req.json();

    if (!question || !files || files.length === 0) {
      throw new Error("Question and files are required");
    }

    console.log(`Asking question about ${files.length} file(s): ${question}`);
    console.log(`Generate report: ${generateReport}`);

    // Build the request with file references and question
    const parts = [];

    // Add file references (PDFs) or content (JSON)
    for (const file of files) {
      if (file.isJson && file.content) {
        // For JSON files, add the content as text
        parts.push({
          text: `JSON Document (${file.fileId}):\n${file.content}`,
        });
      } else {
        // For PDF files, use file_data reference
        parts.push({
          file_data: {
            file_uri: `https://generativelanguage.googleapis.com/v1beta/${file.fileId}`,
            mime_type: "application/pdf",
          },
        });
      }
    }

    // Use custom prompt if provided, otherwise use default enhanced prompt
    let defaultPrompt = `You are a professional document analyst providing comprehensive and well-structured answers.

Question: ${question}

You are an ICAAP and stress-testing specialist assisting with a gap assessment of Discovery Bank's ICAAP and stress testing framework.

You are given excerpts from the ICAAP / Stress Testing / Capital Management report as context (see below). Focus particularly on:
- The stress testing and capital management sections, and
- The assessment/checklist tables near the end (RAG "Red/Amber/Green" tables, "Criteria / Discovery / Rating" tables, and related narrative).

YOUR TASKS
1. For each of the following four ICAAP stress-testing objectives:
   - Risk mitigation and contingency planning
   - Strategic planning and budgeting
   - Capital planning and management
   - Stakeholder communication

   do ALL of the following:
   a) Describe how the current ICAAP framework addresses this objective, based ONLY on the text in the context.
   b) Identify strengths and weaknesses, referencing any assessment/checklist content (e.g. RAG tables, "Criteria / Discovery / Rating").
   c) Provide an overall RAG rating (Green / Amber / Red) for this objective, with clear justification.
   d) List the key gaps or issues relating to this objective.
   e) Propose specific, actionable recommendations to close those gaps and move towards best practice.

INSTRUCTIONS FOR YOUR RESPONSE (MUST-FOLLOW)
- Use ONLY the information in the provided ICAAP context. Do not invent or assume facts.
- Provide a COMPLETE, DETAILED, and THOROUGH answer based on ALL relevant information in the context.
- Structure your response with clear headings and subheadings.
- Include specific quantitative and qualitative details wherever available.
- When you see any RAG / rating / scoring system, EXPLAIN the full scale and what each rating means.
- Explain the CONTEXT.`;

    if (generateReport) {
      defaultPrompt += `

REPORT GENERATION:
Generate a structured HTML report following this exact format:
- Executive Summary section with critical findings
- Risk Assessment with color-coded indicators
- Detailed findings with tables
- Recommendations section
- Use professional styling with risk badges (CRITICAL, HIGH, MEDIUM, LOW)`;
    }

    const finalPrompt = customPrompt || defaultPrompt;

    parts.push({
      text: finalPrompt,
    });

    // Make request to Gemini API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

    let response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: parts,
              },
            ],
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        console.error("Request timeout - Gemini API took too long to respond");
        throw new Error(
          "Request timeout: The AI model took too long to process your question. Please try with a shorter question or fewer documents.",
        );
      }

      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      throw new Error(`Gemini API error: ${errorText}`);
    }

    const data = await response.json();
    console.log("Gemini response received");

    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "No answer generated";

    // Generate HTML report if requested
    let reportHtml = null;
    let reportData = null;

    if (generateReport && answer) {
      // Extract structured data from answer and generate HTML report
      reportHtml = generateReportHtml(answer, files);
      reportData = { answer, files };
    }

    return new Response(
      JSON.stringify({
        answer: answer,
        reportHtml: reportHtml,
        reportData: reportData,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Ask question error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

function generateReportHtml(answer: string, files: any[]): string {
  const timestamp = new Date().toISOString().split('T')[0];
  
  // Extract key information from the answer
  const lines = answer.split('\n');
  let entityName = "Entity Name Not Available";
  let registrationNo = "N/A";
  
  // Try to extract entity details from JSON files
  for (const file of files) {
    if (file.isJson && file.content) {
      try {
        const jsonData = JSON.parse(file.content);
        if (jsonData.relatedCompanies && jsonData.relatedCompanies[0]) {
          entityName = jsonData.relatedCompanies[0].registeredName || entityName;
          registrationNo = jsonData.relatedCompanies[0].registrationNumber || registrationNo;
        }
      } catch (e) {
        console.error("Error parsing JSON for report:", e);
      }
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KYC/AML Analysis Report - ${entityName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        .header { border-bottom: 4px solid #0066cc; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #0066cc; font-size: 28px; margin-bottom: 10px; }
        .header .subtitle { color: #666; font-size: 14px; }
        .section { margin: 30px 0; padding: 20px; background: #fafafa; border-radius: 8px; }
        .section h2 { color: #333; font-size: 20px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #ddd; }
        .content { white-space: pre-wrap; line-height: 1.8; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
        .badge-critical { background: #c00; color: white; }
        .badge-high { background: #ff8c00; color: white; }
        .badge-medium { background: #ffc107; color: black; }
        .badge-low { background: #4caf50; color: white; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; text-align: center; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>KYC/AML ANALYSIS REPORT</h1>
            <div class="subtitle">
                <strong>Entity:</strong> ${entityName}<br>
                <strong>Registration No:</strong> ${registrationNo}<br>
                <strong>Report Date:</strong> ${timestamp}<br>
                <strong>Files Analyzed:</strong> ${files.length}
            </div>
        </div>

        <div class="section">
            <h2>Analysis Results</h2>
            <div class="content">${answer.replace(/\n/g, '<br>')}</div>
        </div>

        <div class="footer">
            <p><strong>CONFIDENTIAL REPORT</strong></p>
            <p>Generated by: Automated Document Analysis System</p>
            <p>Report ID: RPT-${Date.now()}</p>
        </div>
    </div>
</body>
</html>`;
}
