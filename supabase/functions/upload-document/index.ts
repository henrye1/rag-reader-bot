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

    console.log(`Uploading file: ${file.name}, size: ${file.size} bytes`);

    // Convert file to base64 for Google API
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Upload file to Google Gemini Files API
    const uploadResponse = await fetch(
      "https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + GOOGLE_API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: {
            display_name: file.name,
            mime_type: "application/pdf",
          },
          inline_data: {
            data: base64Data,
            mime_type: "application/pdf",
          },
        }),
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Upload error:", uploadResponse.status, errorText);
      throw new Error(`Failed to upload file to Gemini: ${errorText}`);
    }

    const uploadData = await uploadResponse.json();
    console.log("Upload response:", uploadData);

    const fileName = uploadData.file?.name;
    if (!fileName) {
      throw new Error("No file name returned from upload");
    }

    // Wait for file to be processed
    let fileState = "PROCESSING";
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
