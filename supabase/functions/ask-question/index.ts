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

    const { question, files, customPrompt, questionsTemplate, generateReport } = await req.json();

    if (!question || !files || files.length === 0) {
      throw new Error("Question and files are required");
    }

    console.log(`Asking question about ${files.length} file(s): ${question}`);
    console.log(`Generate report: ${generateReport}`);
    console.log(`Custom prompt provided: ${customPrompt ? 'YES' : 'NO'}`);
    console.log(`Questions template provided: ${questionsTemplate ? 'YES (' + questionsTemplate.length + ' questions)' : 'NO'}`);
    console.log(`Files being sent:`, files.map((f: any) => ({ fileId: f.fileId, fileName: f.fileName, isJson: f.isJson })));

    // Build the request with file references and question
    const parts = [];

    // Add file references (PDFs, Word docs) or content (JSON, TXT)
    for (const file of files) {
      // Check if file has content (JSON or TXT files)
      const hasDirectContent = file.content && (file.fileId?.startsWith('json-') || file.fileId?.startsWith('txt-'));

      if (hasDirectContent) {
        // For JSON and TXT files, add the content as text
        const fileType = file.fileId?.startsWith('json-') ? 'JSON' : 'TXT';
        parts.push({
          text: `${fileType} Document (${file.fileName || file.fileId}):\n${file.content}`,
        });
      } else {
        // For PDF and Word files, use file_data reference
        // Determine mime type from file name or ID
        let mimeType = "application/pdf";
        if (file.fileName) {
          if (file.fileName.endsWith(".docx")) {
            mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          } else if (file.fileName.endsWith(".doc")) {
            mimeType = "application/msword";
          }
        }

        parts.push({
          file_data: {
            file_uri: `https://generativelanguage.googleapis.com/v1beta/${file.fileId}`,
            mime_type: mimeType,
          },
        });
      }
    }

    // Build the prompt based on what's provided
    let finalPrompt = '';
    
    // Build list of actual document names for citation reference
    const documentList = files.map((f: any, idx: number) => {
      const docName = f.fileName || (f.fileId ? f.fileId.split('/').pop() : `Document_${idx + 1}`);
      return `${idx + 1}. ${docName}`;
    }).join('\n');
    
    // Add explicit instruction to read the uploaded files FIRST
    const documentsInstruction = `\n\n## UPLOADED DOCUMENTS TO ANALYZE:\nYou have been provided with ${files.length} document(s) that contain ALL the information you need to answer the questions below. These documents are attached to this request and you MUST read them thoroughly before responding.

**ACTUAL DOCUMENTS PROVIDED:**
${documentList}

**CRITICAL REQUIREMENTS:**
1. READ ALL uploaded documents completely and carefully before answering
2. SEARCH the documents for relevant information for each question
3. CITE specific sections, page numbers, tables, and figures from the documents
4. Quote exact text from the documents where relevant
5. **CITATIONS MUST ONLY REFERENCE THE ACTUAL DOCUMENTS LISTED ABOVE** - Do NOT make up or assume document names
6. Citation format: [Source: <Actual Document Name from list above>, section <X>, page <Y>]
7. If you cannot determine which specific document contains information, use: [Source: Uploaded Documents]
8. If specific information is not found after thorough search, state: "This information was not found in the uploaded documents after thorough review"
9. DO NOT use general knowledge - base your answers ONLY on what is explicitly stated in the uploaded documents
10. **NEVER hallucinate or fabricate document names in citations**\n\n`;
    
    // Default domain specialist prompt
    const defaultPrompt = `You are a domain specialist assistant.

You help the user draft formal, defensible written responses to structured questionnaires and requests for information.

You have access to:
- Organisation-specific technical frameworks, methodologies, policies, procedures and governance documents.
- Supporting quantitative analyses (e.g. models, tables, figures, parameter summaries).
- Historical versions of these documents so you can describe changes over time.
- The text of the questionnaire or information request itself.

# GENERAL PRINCIPLES

1. Answer each question directly and completely.
   - Treat the user's current query as a single question or sub-question.
   - Restate the question ID and title in your response (e.g. "Response to Question 8.1 – The Model").
   - If the question has bullet points or sub-clauses, respond to each explicitly, with clear sub-headings.

2. Base your response primarily on the retrieved organisation-specific documents.
   - First priority: the retrieved internal documents.
   - Second: use the requirements and definitions as they appear in those documents.

3. Use citations to supporting documentation.
   - For key statements (definitions, methodology, parameter values, governance arrangements), provide citations like:
     [Source: <Document Name>, section <X>, page <Y>]
   - **CRITICAL:** Only cite documents that were actually uploaded - do NOT invent or assume document names
   - Use the exact document names provided in the "ACTUAL DOCUMENTS PROVIDED" section
   - If you cannot determine the specific source document, use: [Source: Uploaded Documents]
   - If precise page numbers are unknown, cite section headings or table/figure labels instead.

4. Structure and tone.
   - Use a formal, professional tone.
   - Recommended structure:
     1. "Response to Question <ID>: <Title>"
     2. Short summary paragraph.
     3. Detailed response with sub-headings aligned to the question's bullets or themes.
     4. Key citations.
   - **Provide comprehensive, thorough responses with extensive detail from the documents**
   - Include all relevant information, data, methodologies, and context
   - Do NOT be overly brief - technical completeness requires sufficient detail and explanation
   - **CRITICAL WRITING QUALITY REQUIREMENTS:**
     * Before writing each sentence, identify the SINGLE main concept/methodology it will convey
     * Write clear, well-structured sentences with proper grammar
     * **ABSOLUTELY NEVER repeat any term, concept, methodology, or approach more than ONCE in the same sentence**
     * Each sentence conveys ONE clear idea with ONE mention of each technical term
     * Example of WRONG: "The model uses approach X, combining approach X with approach X methodology"
     * Example of CORRECT: "The model uses approach X as documented in the methodology"
     * Do NOT mention methodologies, approaches, or technical terms unless they are explicitly stated in the uploaded documents
     * After drafting, review each sentence to eliminate any repeated terms or redundancy

5. Handling missing or incomplete information.
   - If the specific detail requested is not available in the retrieved documents, clearly state: "This specific information was not found in the uploaded documents"
   - Where appropriate, suggest the exact type of document or evidence that should be attached.

6. No fabrication or hallucination.
   - Do not invent numeric values, policies, governance processes, methodologies, or technical approaches.
   - **NEVER fabricate or hallucinate document names in citations - only use the actual document names provided**
   - **NEVER mention methodologies, approaches, models, or techniques that are not explicitly stated in the uploaded documents**
   - Do NOT use industry standard terms or general knowledge about methodologies unless they appear in the documents
   - If you infer something from the documents, state that it is an inference.
   - If you cannot answer a part of the question from the available information, say so clearly and briefly explain the limitation.`;

    // If questions template is provided, use it to structure the response
    if (questionsTemplate && Array.isArray(questionsTemplate) && questionsTemplate.length > 0) {
      // Start with custom prompt as guardrails, or use default domain specialist prompt
      finalPrompt = customPrompt || defaultPrompt;
      
      finalPrompt += documentsInstruction;
      
      finalPrompt += `## USER QUESTION/INSTRUCTION:\n${question}\n\n## QUESTIONS TO ANSWER:\nA questions template has been provided. You MUST address EACH question from the template systematically and comprehensively. Here are the questions:\n\n`;
      
      questionsTemplate.forEach((q: any, index: number) => {
        const questionText = typeof q === 'string' ? q : (q.question || q.text || JSON.stringify(q));
        finalPrompt += `Question ${index + 1} [${q.question_id || index + 1}]: ${questionText}\n\n`;
      });
      
      finalPrompt += `\n## RESPONSE INSTRUCTIONS:
For EACH question above, you must:
1. First, SEARCH the uploaded documents for relevant information about this question
2. Provide a COMPLETE, DETAILED response using ONLY information found in the uploaded documents
3. Structure your answer with clear headings (format: "Response to Question X.X – <Title>")
4. CITE specific sources using ONLY the actual document names from the "ACTUAL DOCUMENTS PROVIDED" list above
5. Citation format: [Source: <Actual Document Name>, section <X>, page <Y>]
6. Include relevant quotes, data points, tables, and figures from the documents
7. If information is not found after thorough document search, state: "This specific information was not found in the uploaded documents"
8. Follow the format and structure shown in any example responses provided in the custom prompt
9. Be thorough and comprehensive - provide detailed, well-structured responses with evidence from documents

**CRITICAL WRITING QUALITY REQUIREMENTS:**
- Before writing each sentence, identify the ONE main point it will make
- Write clear, well-structured sentences with proper grammar
- **ABSOLUTELY NEVER use the same term, concept, methodology, or approach more than ONCE in a single sentence**
- Example of FORBIDDEN: "The model uses the hazard rate approach, combining duration/hazard rate approach and the hazard rate approach"
- Example of CORRECT: "The model uses a hazard rate approach with duration-based transitions"
- Do NOT mention ANY methodologies, models, approaches, or technical terms unless explicitly stated in the uploaded documents
- After drafting each sentence, review it to ensure no terms are repeated
- Eliminate all redundancy within sentences and paragraphs

**CRITICAL:** 
- You MUST answer ALL questions
- Do NOT acknowledge or summarize the task - provide actual detailed responses
- ALWAYS cite your sources from the uploaded documents using actual document names only
- **NEVER invent, fabricate, or hallucinate document names, methodologies, approaches, or technical terms**
- Review your complete response before finalizing to check for repeated terms in sentences
- If you cannot determine the specific source document, use: [Source: Uploaded Documents]
- If you cannot find information in the documents, explicitly say so - do not use general knowledge`;
    } else {
      // No questions template - use standard prompt with user's question
      finalPrompt = customPrompt || defaultPrompt;
      
      finalPrompt += documentsInstruction;
      
      finalPrompt += `## USER QUESTION:\n${question}\n\nINSTRUCTIONS FOR YOUR RESPONSE:
- READ the uploaded documents thoroughly first
- Use ONLY the information found in the provided documents
- Provide a COMPLETE, DETAILED, and THOROUGH answer based on ALL relevant information from the documents
- Structure your response with clear headings and subheadings
- Include specific quantitative and qualitative details wherever available
- CITE your sources using ONLY the actual document names from the "ACTUAL DOCUMENTS PROVIDED" list
- Citation format: [Source: <Actual Document Name>, section <X>, page <Y>]
- **NEVER invent or fabricate document names in your citations**
- If you cannot determine the specific source document, use: [Source: Uploaded Documents]

**CRITICAL WRITING QUALITY REQUIREMENTS:**
- Before writing each sentence, identify the ONE main point it will make
- Write clear, well-structured sentences with proper grammar
- **ABSOLUTELY NEVER use the same term, concept, methodology, or approach more than ONCE in a single sentence**
- Example of FORBIDDEN: "employs a transition rate approach, using a duration/hazard rate approach and the hazard rate approach"
- Example of CORRECT: "employs a transition rate approach based on hazard rates"
- Do NOT mention ANY methodologies, models, approaches, or technical terms unless explicitly stated in the uploaded documents
- After drafting each sentence, review it to ensure no terms are repeated
- Review your complete response before finalizing to eliminate any sentence-level redundancy`;

    }

    if (generateReport) {
      finalPrompt += `\n\n## REPORT GENERATION:
Generate a structured report following this format:
- Executive Summary section with critical findings
- Risk Assessment with color-coded indicators
- Detailed findings with tables and structured sections
- Recommendations section
- Use professional styling with appropriate emphasis on key findings`;
    }
    
    // Add final quality control instruction
    finalPrompt += `\n\n## FINAL QUALITY CONTROL (MANDATORY):
Before submitting your response, you MUST:
1. Review EVERY sentence for repeated terms (e.g., same methodology/approach mentioned twice in one sentence)
2. Verify ALL methodologies/approaches mentioned exist in the uploaded documents
3. Check that each citation uses actual document names from the "ACTUAL DOCUMENTS PROVIDED" list
4. Confirm no terms like "duration approach", "hazard rate approach" etc. appear more than once per sentence
5. If you find any violations, rewrite those sentences immediately

**EXAMPLES OF VIOLATIONS TO FIX:**
❌ "The model uses approach X, combining approach X with approach X" → ✅ "The model uses approach X"
❌ "employs a transition rate approach, using a duration/hazard rate approach and the hazard rate approach" → ✅ "employs a transition rate approach based on hazard rates"`;

    parts.push({
      text: finalPrompt,
    });

    console.log("=== PROMPT BEING SENT TO GEMINI ===");
    console.log("Prompt length:", finalPrompt.length, "characters");
    console.log("First 500 chars:", finalPrompt.substring(0, 500));
    console.log("Number of parts (files + prompt):", parts.length);
    console.log("Parts breakdown:");
    parts.forEach((part, idx) => {
      if (part.file_data) {
        console.log(`  Part ${idx + 1}: FILE - ${part.file_data.mime_type} - ${part.file_data.file_uri}`);
      } else if (part.text) {
        const preview = part.text.substring(0, 100).replace(/\n/g, ' ');
        console.log(`  Part ${idx + 1}: TEXT - ${preview}...`);
      }
    });
    console.log("===================================");

    // Make request to Gemini API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

    let response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GOOGLE_API_KEY}`,
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
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 8192, // Allow longer, more detailed responses
            },
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
    
    // Log if there are any issues with the response
    if (!data.candidates || data.candidates.length === 0) {
      console.error("No candidates in Gemini response:", JSON.stringify(data));
    }
    if (data.promptFeedback) {
      console.log("Gemini prompt feedback:", JSON.stringify(data.promptFeedback));
    }

    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "No answer generated";

    // Generate HTML report if requested
    let reportHtml = null;
    let reportData = null;

    if (generateReport && answer) {
      // Generate context-aware report metadata first
      const reportContext = await generateReportContext(answer, question, files, customPrompt, GOOGLE_API_KEY);
      reportHtml = generateReportHtml(answer, files, reportContext);
      reportData = { answer, files, reportContext };
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

async function generateReportContext(answer: string, question: string, files: any[], customPrompt: string | null, apiKey: string): Promise<any> {
  // Ask AI to generate contextual report metadata
  const contextPrompt = `Based on the following analysis and context, generate appropriate report metadata:

ANALYSIS PERFORMED:
${answer.substring(0, 1500)}

USER QUESTION/REQUEST:
${question}

CUSTOM PROMPT CONTEXT:
${customPrompt || 'General document analysis'}

NUMBER OF DOCUMENTS: ${files.length}

Generate a JSON object with the following structure:
{
  "reportTitle": "Short, descriptive title for this report (e.g., 'Financial Analysis Report', 'Compliance Review', 'Document Summary')",
  "reportType": "Type of analysis (e.g., 'Financial Analysis', 'Due Diligence', 'Compliance Review', 'Technical Assessment')",
  "entityName": "Main entity/subject being analyzed (extract from context, or 'Multiple Documents' if not specific)",
  "reportDescription": "Brief 1-2 sentence description of what this report covers",
  "keyMetrics": [
    {"label": "Metric name", "value": "Metric value", "status": "positive/neutral/negative/info"}
  ],
  "summary": "2-3 sentence executive summary of key findings"
}

Respond with ONLY the JSON object, no additional text.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: contextPrompt }] }],
          generationConfig: {
            temperature: 0.3,
          },
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const contextText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      // Extract JSON from potential markdown code blocks
      const jsonMatch = contextText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
  } catch (e) {
    console.error("Error generating report context:", e);
  }

  // Fallback to generic context
  return {
    reportTitle: "Document Analysis Report",
    reportType: "General Analysis",
    entityName: files.length === 1 ? files[0].fileId : `${files.length} Documents`,
    reportDescription: "Comprehensive analysis of uploaded documents based on provided questions and context.",
    keyMetrics: [
      { label: "Documents Analyzed", value: files.length.toString(), status: "info" }
    ],
    summary: "Analysis completed successfully based on the provided documents and questions."
  };
}

function generateReportHtml(answer: string, files: any[], reportContext: any): string {
  const timestamp = new Date().toISOString().split('T')[0];
  
  // Use context-aware report metadata
  const reportTitle = reportContext.reportTitle || "Document Analysis Report";
  const entityName = reportContext.entityName || "Analysis Subject";
  const reportDescription = reportContext.reportDescription || "Comprehensive document analysis";
  const reportType = reportContext.reportType || "General Analysis";
  const summary = reportContext.summary || "Analysis completed successfully.";
  
  // Determine primary color based on status in key metrics
  let primaryColor = "#2196f3"; // Default blue
  const hasNegative = reportContext.keyMetrics?.some((m: any) => m.status === "negative");
  const hasPositive = reportContext.keyMetrics?.some((m: any) => m.status === "positive");
  
  if (hasNegative) {
    primaryColor = "#ff8c00"; // Orange for caution
  } else if (hasPositive) {
    primaryColor = "#4caf50"; // Green for positive
  }
  
  // Build key metrics section
  let metricsHtml = '';
  if (reportContext.keyMetrics && reportContext.keyMetrics.length > 0) {
    const statusColors: any = {
      positive: '#4caf50',
      negative: '#ff8c00',
      neutral: '#666',
      info: '#2196f3'
    };
    
    metricsHtml = `
        <div class="risk-summary">
            ${reportContext.keyMetrics.map((metric: any) => `
                <div class="risk-card" style="background: ${statusColors[metric.status] || '#666'};">
                    <h3>${metric.label}</h3>
                    <div class="value">${metric.value}</div>
                </div>
            `).join('')}
        </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${reportTitle} - ${entityName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        .header { border-bottom: 4px solid ${primaryColor}; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: ${primaryColor}; font-size: 28px; margin-bottom: 10px; }
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
            <h1>${reportTitle.toUpperCase()}</h1>
            <div class="subtitle">
                <strong>Subject:</strong> ${entityName}<br>
                <strong>Analysis Type:</strong> ${reportType}<br>
                <strong>Report Date:</strong> ${timestamp}<br>
                <strong>Documents Analyzed:</strong> ${files.length}
            </div>
        </div>

        <div class="alert-box alert-medium">
            <h2 style="color: ${primaryColor}; margin-bottom: 10px;">EXECUTIVE SUMMARY</h2>
            <p><strong>Description:</strong> ${reportDescription}</p>
            <p style="margin-top: 10px;"><strong>Key Findings:</strong> ${summary}</p>
        </div>

        ${metricsHtml}

        <div class="section">
            <h2>DETAILED ANALYSIS</h2>
            ${formatAnalysisContent(answer)}
        </div>

        <div class="footer">
            <p><strong>CONFIDENTIAL REPORT</strong></p>
            <p>Generated by: Document Analysis System</p>
            <p>Report ID: RPT-${Date.now()}</p>
        </div>
    </div>
</body>
</html>`;
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
