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
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      throw new Error("No file provided");
    }

    console.log(`Processing prompt document: ${file.name}`);

    // Read the file content as text
    let promptText = "";
    
    // For plain text files
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      promptText = await file.text();
      console.log("Extracted text from plain text file");
    } 
    // For Word documents, inform that only plain text is supported
    else if (
      file.type === "application/msword" ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      throw new Error("Word documents are not directly supported. Please convert your prompt to a plain text (.txt) file or paste the content directly.");
    }
    else {
      throw new Error(`Unsupported file type: ${file.type}. Please use a plain text (.txt) file.`);
    }

    if (!promptText.trim()) {
      throw new Error("The uploaded file is empty");
    }

    console.log("Prompt text extracted successfully");

    return new Response(
      JSON.stringify({
        promptText: promptText,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Parse prompt document error:", error);
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
