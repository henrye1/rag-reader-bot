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

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      throw new Error("No file provided");
    }

    console.log(`Processing prompt document: ${file.name}`);

    // Upload file to Google's File API
    const boundary = "----boundary" + Date.now();
    const uploadResponse = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "multipart",
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: (() => {
          const metadataBlob = new Blob(
            [JSON.stringify({ file: { display_name: file.name } })],
            { type: "application/json" }
          );
          const fileBlob = new Blob([file], { type: file.type });

          const parts = [
            `--${boundary}\r\n`,
            'Content-Type: application/json; charset=UTF-8\r\n\r\n',
            metadataBlob,
            `\r\n--${boundary}\r\n`,
            `Content-Type: ${file.type}\r\n\r\n`,
            fileBlob,
            `\r\n--${boundary}--\r\n`,
          ];

          return new Blob(parts as BlobPart[]);
        })(),
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Google API upload error:", uploadResponse.status, errorText);
      throw new Error(`Failed to upload document: ${errorText}`);
    }

    const uploadData = await uploadResponse.json();
    const fileId = uploadData.file.name;

    console.log(`Document uploaded with ID: ${fileId}`);

    // Extract text from the document using Gemini
    const extractResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  file_data: {
                    file_uri: `https://generativelanguage.googleapis.com/v1beta/${fileId}`,
                    mime_type: file.type,
                  },
                },
                {
                  text: "Extract and return the complete text content of this document exactly as written, preserving all formatting instructions, structure, and content. Do not summarize or modify anything.",
                },
              ],
            },
          ],
        }),
      }
    );

    if (!extractResponse.ok) {
      const errorText = await extractResponse.text();
      console.error("Text extraction error:", extractResponse.status, errorText);
      throw new Error(`Failed to extract text: ${errorText}`);
    }

    const extractData = await extractResponse.json();
    const promptText = extractData.candidates?.[0]?.content?.parts?.[0]?.text || "";

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
