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
    const enhancedPrompt = `You are analyzing a PDF document to answer questions comprehensively and accurately.

Question: ${question}

Instructions:
- Provide a complete and detailed answer based on the document content
- Include specific numbers, percentages, weights, and values when present in the document
- Organize information clearly with proper formatting
- If providing a list, include all relevant details (weights, percentages, descriptions) for each item
- Only state that information cannot be found if it is genuinely absent from the document
- Be thorough and don't omit details that are present in the source material`;

    parts.push({
      text: enhancedPrompt,
    });

    // Make request to Gemini API
    const response = await fetch(
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
      }
    );

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
      }
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
      }
    );
  }
});
