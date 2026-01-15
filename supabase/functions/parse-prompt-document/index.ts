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

    console.log("Received request, parsing formData...");
    const formData = await req.formData();
    console.log("FormData parsed successfully");

    const file = formData.get("file") as File;

    if (!file) {
      console.error("No file in formData. FormData keys:", Array.from(formData.keys()));
      throw new Error("No file provided");
    }

    console.log(`Processing prompt document: ${file.name}, type: ${file.type}, size: ${file.size}`);

    let promptText = "";

    // For plain text files - read directly
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      promptText = await file.text();
      console.log("Extracted text from plain text file");
    }
    // For JSON files - read and extract text content
    else if (file.type === "application/json" || file.name.endsWith(".json")) {
      const jsonContent = await file.text();
      try {
        const parsed = JSON.parse(jsonContent);
        // If JSON has a "prompt" or "text" field, use that; otherwise stringify the whole object
        if (parsed.prompt) {
          promptText = parsed.prompt;
        } else if (parsed.text) {
          promptText = parsed.text;
        } else if (parsed.content) {
          promptText = parsed.content;
        } else if (typeof parsed === 'string') {
          promptText = parsed;
        } else {
          // For other JSON structures, stringify with formatting
          promptText = JSON.stringify(parsed, null, 2);
        }
        console.log("Extracted text from JSON file");
      } catch (e) {
        throw new Error("Invalid JSON file");
      }
    }
    // For PDF and Word files - use Gemini to extract text
    else if (file.type === "application/pdf" || file.name.endsWith(".pdf") ||
             file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
             file.name.endsWith(".docx") ||
             file.type === "application/msword" ||
             file.name.endsWith(".doc")) {
      console.log(`Processing ${file.type || 'unknown type'} file with Gemini`);

      // Determine mime type - check file extension if type is missing or incorrect
      let mimeType = file.type;
      if (file.name.endsWith(".docx")) {
        mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        console.log("Detected .docx file, setting MIME type:", mimeType);
      } else if (file.name.endsWith(".doc")) {
        mimeType = "application/msword";
        console.log("Detected .doc file, setting MIME type:", mimeType);
      } else if (!mimeType) {
        console.error("No MIME type detected and file extension not recognized");
        throw new Error("Could not determine file type");
      }

      console.log("Final MIME type for upload:", mimeType);

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
            const fileBlob = new Blob([file], { type: mimeType });

            const parts = [
              `--${boundary}\r\n`,
              'Content-Type: application/json; charset=UTF-8\r\n\r\n',
              metadataBlob,
              `\r\n--${boundary}\r\n`,
              `Content-Type: ${mimeType}\r\n\r\n`,
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GOOGLE_API_KEY}`,
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
                      mime_type: mimeType,
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
        console.error("Document text extraction error:", extractResponse.status, errorText);
        throw new Error(`Failed to extract text from document: ${errorText}`);
      }

      const extractData = await extractResponse.json();
      promptText = extractData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      console.log("Document text extracted successfully");
    }
    else {
      throw new Error(`Unsupported file type: ${file.type}. Please use a plain text (.txt), JSON (.json), PDF (.pdf), or Word (.doc, .docx) file.`);
    }

    if (!promptText.trim()) {
      throw new Error("The uploaded file is empty or no text could be extracted");
    }

    console.log("Prompt text ready");

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
