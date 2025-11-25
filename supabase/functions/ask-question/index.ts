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

    const { question, fileIds } = await req.json();

    if (!question || !fileIds || fileIds.length === 0) {
      throw new Error("Question and fileIds are required");
    }

    console.log(`Asking question about ${fileIds.length} file(s): ${question}`);

    // Build the request with file references and question
    const parts = [];

    // Add file references
    for (const fileId of fileIds) {
      parts.push({
        file_data: {
          file_uri: `https://generativelanguage.googleapis.com/v1beta/${fileId}`,
          mime_type: "application/pdf",
        },
      });
    }

    // Add the enhanced prompt
    const enhancedPrompt = `You are a professional document analyst providing comprehensive and well-structured answers.

Question: ${question}

You are an ICAAP and stress-testing specialist assisting with a gap assessment of Discovery Bank’s ICAAP and stress testing framework.

You are given excerpts from the ICAAP / Stress Testing / Capital Management report as context (see below). Focus particularly on:
- The stress testing and capital management sections, and
- The assessment/checklist tables near the end (RAG “Red/Amber/Green” tables, “Criteria / Discovery / Rating” tables, and related narrative).

CONTEXT:
{{context}}

YOUR TASKS
1. For each of the following four ICAAP stress-testing objectives:
   - Risk mitigation and contingency planning
   - Strategic planning and budgeting
   - Capital planning and management
   - Stakeholder communication

   do ALL of the following:
   a) Describe how the current ICAAP framework addresses this objective, based ONLY on the text in the context.
   b) Identify strengths and weaknesses, referencing any assessment/checklist content (e.g. RAG tables, “Criteria / Discovery / Rating”).
   c) Provide an overall RAG rating (Green / Amber / Red) for this objective, with clear justification.
   d) List the key gaps or issues relating to this objective.
   e) Propose specific, actionable recommendations to close those gaps and move towards best practice.

INSTRUCTIONS FOR YOUR RESPONSE (MUST-FOLLOW)
- Use ONLY the information in the provided ICAAP context. Do not invent or assume facts.
- Provide a COMPLETE, DETAILED, and THOROUGH answer based on ALL relevant information in the context.
- Structure your response with clear headings and subheadings. Use the following top-level structure:
  1. Objective: Risk Mitigation and Contingency Planning
  2. Objective: Strategic Planning and Budgeting
  3. Objective: Capital Planning and Management
  4. Objective: Stakeholder Communication

  Under EACH objective, use these subheadings:
  - Objective Definition
  - Current Coverage (from ICAAP)
  - RAG Assessment (for this objective)
  - Identified Gaps / Weaknesses
  - Recommended Enhancements (Target-State Suggestions)

- Include specific quantitative and qualitative details wherever available, such as:
  - Numbers and monetary values (e.g. capital amounts, RWE, funding plan amounts, surplus).
  - Percentages and ratios (e.g. CET1 ratios, total CAR, SCR cover ratios, leverage ratio, buffer sizes).
  - Scenario magnitudes and weightings (e.g. +20% shocks, 50 bps, “25% negative / 75% base”, “1‑in‑25‑year severity”).
  - Time horizons (e.g. FY2025–FY2030, 12‑month PD horizon).
  - Page or section references where they appear in the text (e.g. “(Page 137)”, “Section 7.1: Credit Risk”, “Table 6: RAG Status”).

- When you see any RAG / rating / scoring system, EXPLAIN the full scale and what each rating means. For example, if the table shows:
  - NO ISSUE – In full compliance with IFRS 9 requirements; recommendation: None.
  - MODERATE ISSUE – Generally complies with IFRS 9 requirements, but minimal enhancements required; recommendation: To be addressed in the course of business-as-usual.
  - SIGNIFICANT ISSUE – Failure to comply with IFRS 9 requirements; recommendation: To be addressed immediately.
  Then:
  - Restate that scale in your answer, and
  - Explicitly link your Green/Amber/Red assessment for each objective back to this scale and the underlying criteria.

- Explain the CONTEXT;

    parts.push({
      text: enhancedPrompt,
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

    return new Response(
      JSON.stringify({
        answer: answer,
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
