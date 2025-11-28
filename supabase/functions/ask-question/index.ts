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
  
  let entityName = "Entity Name Not Available";
  let registrationNo = "N/A";
  let screeningData: any = null;
  
  // Extract entity details from JSON files
  for (const file of files) {
    if (file.isJson && file.content) {
      try {
        const jsonData = JSON.parse(file.content);
        if (jsonData.relatedCompanies && jsonData.relatedCompanies[0]) {
          entityName = jsonData.relatedCompanies[0].registeredName || entityName;
          registrationNo = jsonData.relatedCompanies[0].registrationNumber || registrationNo;
        }
        if (jsonData.screenings && jsonData.screenings[0]) {
          screeningData = jsonData.screenings[0];
        }
      } catch (e) {
        console.error("Error parsing JSON for report:", e);
      }
    }
  }

  // Parse the answer to extract structured sections
  const sections = parseAnswerSections(answer);
  
  // Determine risk level based on screening data or answer content
  let riskLevel = "MEDIUM";
  let riskColor = "#ffc107";
  let recommendation = "REFER FOR REVIEW";
  
  if (screeningData?.responsePayload) {
    const payload = screeningData.responsePayload;
    if (payload.application_status === "decline") {
      riskLevel = "CRITICAL";
      riskColor = "#c00";
      recommendation = "DECLINE - DO NOT ONBOARD";
    } else if (payload.screeningPEPHit || payload.screeningSpecialInterestCategoriesHit) {
      riskLevel = "HIGH";
      riskColor = "#ff8c00";
      recommendation = "REFER FOR ENHANCED DUE DILIGENCE";
    }
  }

  // Build screening hits section
  let screeningHits = '';
  if (screeningData?.responsePayload) {
    const payload = screeningData.responsePayload;
    screeningHits = `
        <div class="risk-summary">
            <div class="risk-card" style="background: ${payload.screeningSanctionsHit ? '#c00' : '#4caf50'};"><h3>Sanctions Hit</h3><div class="value">${payload.screeningSanctionsHit ? 'YES' : 'NO'}</div></div>
            <div class="risk-card" style="background: ${payload.screeningPEPHit ? '#ff8c00' : '#4caf50'};"><h3>PEP Hit</h3><div class="value">${payload.screeningPEPHit ? 'YES' : 'NO'}</div></div>
            <div class="risk-card" style="background: ${payload.screeningSpecialInterestCategoriesHit ? '#c00' : '#4caf50'};"><h3>Special Interest</h3><div class="value">${payload.screeningSpecialInterestCategoriesHit ? 'YES' : 'NO'}</div></div>
            <div class="risk-card" style="background: #666;"><h3>Files Analyzed</h3><div class="value">${files.length}</div></div>
        </div>`;
  }

  // Build rules fired section
  let rulesFired = '';
  if (screeningData?.responsePayload?.rules_fired && screeningData.responsePayload.rules_fired.length > 0) {
    rulesFired = `
        <div class="section">
            <h2>2. SCREENING ALERTS</h2>
            <h3>Rules Fired</h3>
            <table>
                <thead><tr><th>Rule ID</th><th>Category</th><th>Description</th></tr></thead>
                <tbody>
                    ${screeningData.responsePayload.rules_fired.map((rule: any) => `
                    <tr>
                        <td>${rule.rule_id}</td>
                        <td><span class="badge ${rule.description.includes('PEP') ? 'badge-high' : 'badge-critical'}">${rule.description.includes('PEP') ? 'PEP' : 'Special Interest'}</span></td>
                        <td>${rule.detail || rule.description}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KYC/AML Screening Report - ${entityName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        .header { border-bottom: 4px solid ${riskColor}; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: ${riskColor}; font-size: 28px; margin-bottom: 10px; }
        .header .subtitle { color: #666; font-size: 14px; line-height: 1.8; }
        .alert-box { padding: 20px; margin: 20px 0; border-left: 5px solid; border-radius: 4px; }
        .alert-critical { background: #ffe6e6; border-color: #c00; }
        .alert-high { background: #fff3cd; border-color: #ff8c00; }
        .alert-medium { background: #e3f2fd; border-color: #2196f3; }
        .section { margin: 30px 0; padding: 20px; background: #fafafa; border-radius: 8px; }
        .section h2 { color: #333; font-size: 20px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #ddd; }
        .section h3 { color: #555; font-size: 16px; margin: 15px 0 10px 0; }
        .section p { margin: 10px 0; line-height: 1.8; }
        .section ul { margin: 10px 0 10px 20px; line-height: 2; }
        .section li { margin: 5px 0; }
        .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin: 15px 0; }
        .info-item { background: white; padding: 12px; border-radius: 4px; border-left: 3px solid #0066cc; }
        .info-label { font-weight: bold; color: #666; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; }
        .info-value { color: #333; font-size: 14px; word-wrap: break-word; }
        table { width: 100%; border-collapse: collapse; background: white; font-size: 13px; margin: 15px 0; }
        th { background: #333; color: white; padding: 12px; text-align: left; font-weight: 600; }
        td { padding: 10px 12px; border-bottom: 1px solid #ddd; vertical-align: top; }
        tr:hover { background: #f5f5f5; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
        .badge-critical { background: #c00; color: white; }
        .badge-high { background: #ff8c00; color: white; }
        .badge-medium { background: #ffc107; color: black; }
        .badge-low { background: #4caf50; color: white; }
        .risk-summary { display: flex; gap: 15px; margin: 20px 0; flex-wrap: wrap; }
        .risk-card { flex: 1; min-width: 200px; padding: 20px; border-radius: 8px; text-align: center; color: white; }
        .risk-card h3 { font-size: 14px; margin-bottom: 10px; opacity: 0.9; text-transform: uppercase; }
        .risk-card .value { font-size: 32px; font-weight: bold; }
        .highlight-text { background: #ffeb3b; padding: 2px 4px; font-weight: bold; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; text-align: center; color: #666; font-size: 12px; }
        strong { font-weight: 600; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>KYC/AML SCREENING REPORT</h1>
            <div class="subtitle">
                <strong>Entity:</strong> ${entityName}<br>
                <strong>Registration No:</strong> ${registrationNo}<br>
                <strong>Report Date:</strong> ${timestamp}<br>
                <strong>Files Analyzed:</strong> ${files.length}
            </div>
        </div>

        <div class="alert-box ${riskLevel === 'CRITICAL' ? 'alert-critical' : riskLevel === 'HIGH' ? 'alert-high' : 'alert-medium'}">
            <h2 style="color: ${riskColor}; margin-bottom: 10px;">${riskLevel} RISK ASSESSMENT</h2>
            <p><strong>Recommendation:</strong> <span class="highlight-text">${recommendation}</span></p>
            <p style="margin-top: 10px;"><strong>Summary:</strong> ${sections.summary || 'Comprehensive analysis of uploaded documents completed.'}</p>
        </div>

        ${screeningHits}
        ${rulesFired}

        <div class="section">
            <h2>3. DETAILED ANALYSIS</h2>
            ${formatAnalysisContent(answer)}
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

function parseAnswerSections(answer: string): any {
  const sections: any = { summary: '' };
  
  // Extract summary/executive summary
  const summaryMatch = answer.match(/(?:executive summary|summary)[:\n]+(.*?)(?:\n\n|$)/is);
  if (summaryMatch) {
    sections.summary = summaryMatch[1].trim().substring(0, 300);
  }
  
  return sections;
}

function formatAnalysisContent(answer: string): string {
  // Convert markdown-style headers and formatting to HTML
  let html = answer;
  
  // Convert headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  
  // Convert bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Convert bullet points
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  // Convert line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*<h/g, '<h');
  html = html.replace(/<\/h[23]>\s*<\/p>/g, '</h$1>');
  
  return html;
}
