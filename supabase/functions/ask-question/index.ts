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

Instructions for your response:
- Provide a complete, detailed, and thorough answer based on ALL relevant information in the document
- Structure your response with clear section headings and subheadings when appropriate
- Include specific details: numbers, percentages, weights, page references, scoring ranges, and criteria descriptions
- Explain the context and relationships between different pieces of information
- Use formatting (bullet points, numbered lists, bold text) to organize complex information clearly
- When discussing scoring systems or guidelines, include the full range and what each score represents
- Reference related concepts, templates, or frameworks mentioned in the document
- Provide comprehensive explanations, not just lists - add context that helps understand the information
- If information relates to industry sectors or specific applications, explicitly highlight these connections
- Be concise rather than exhaustive - include all relevant details and supporting information from the document
- Only state that information cannot be found if it is genuinely absent after thoroughly reviewing the document`;

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
