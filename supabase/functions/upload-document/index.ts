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

    // Get the file from the form data
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      throw new Error("No file provided");
    }

    console.log(`Uploading file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);

    // Handle JSON and TXT files directly without Google API
    if (file.type === "application/json" || file.name.endsWith(".json")) {
      console.log("Processing JSON file directly");
      const jsonContent = await file.text();

      // Validate JSON
      try {
        JSON.parse(jsonContent);
      } catch (e) {
        throw new Error("Invalid JSON file");
      }

      // Return immediately for JSON files - no Google API processing needed
      return new Response(
        JSON.stringify({
          fileId: `json-${Date.now()}-${file.name}`,
          displayName: file.name,
          state: "ACTIVE",
          content: jsonContent,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle TXT files directly without Google API
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      console.log("Processing TXT file directly");
      const txtContent = await file.text();

      // Return immediately for TXT files - no Google API processing needed
      return new Response(
        JSON.stringify({
          fileId: `txt-${Date.now()}-${file.name}`,
          displayName: file.name,
          state: "ACTIVE",
          content: txtContent,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Determine mime type for Google API upload
    let mimeType = file.type;
    if (file.name.endsWith(".docx") && !mimeType) {
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else if (file.name.endsWith(".doc") && !mimeType) {
      mimeType = "application/msword";
    }

    // Step 1: Start resumable upload session for PDF and Word files
    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GOOGLE_API_KEY}`;

    const metadataHeaders = {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": file.size.toString(),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    };

    const metadata = {
      file: {
        display_name: file.name,
      },
    };

    const startResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: metadataHeaders,
      body: JSON.stringify(metadata),
    });

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      console.error("Start upload error:", startResponse.status, errorText);
      throw new Error(`Failed to start upload: ${errorText}`);
    }

    const uploadSessionUrl = startResponse.headers.get("X-Goog-Upload-URL");
    if (!uploadSessionUrl) {
      throw new Error("No upload session URL returned");
    }

    console.log("Upload session started");

    // Step 2: Upload the actual file content
    const fileBytes = await file.arrayBuffer();
    
    const uploadHeaders = {
      "Content-Length": file.size.toString(),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    };

    const uploadResponse = await fetch(uploadSessionUrl, {
      method: "POST",
      headers: uploadHeaders,
      body: fileBytes,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Upload error:", uploadResponse.status, errorText);
      throw new Error(`Failed to upload file: ${errorText}`);
    }

    const uploadData = await uploadResponse.json();
    console.log("Upload response:", uploadData);

    const fileName = uploadData.file?.name;
    if (!fileName) {
      throw new Error("No file name returned from upload");
    }

    // Step 3: Wait for file to be processed
    let fileState = uploadData.file?.state || "PROCESSING";
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max

    while (fileState === "PROCESSING" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const statusResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GOOGLE_API_KEY}`
      );

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        fileState = statusData.state;
        console.log(`File processing state: ${fileState}`);

        if (fileState === "FAILED") {
          throw new Error("File processing failed");
        }

        if (fileState === "ACTIVE") {
          break;
        }
      }

      attempts++;
    }

    if (fileState !== "ACTIVE") {
      throw new Error("File processing timeout");
    }

    console.log("File ready:", fileName);

    return new Response(
      JSON.stringify({
        fileId: fileName,
        displayName: file.name,
        state: fileState,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Upload document error:", error);
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
