import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Skill Creator system prompt
const SKILL_CREATOR_PROMPT = `You are the Skill Creator - a meta-expert that generates new expert skills for a Document Q&A RAG system.

Your task is to analyze the user's description and generate a complete skill definition.

## OUTPUT FORMAT
You MUST respond with valid JSON in this exact structure:
{
  "skill": {
    "name": "Short descriptive name (3-5 words)",
    "description": "2-3 sentences describing the skill's purpose and capabilities",
    "category": "Best fitting category (see options below)",
    "icon": "Single emoji that represents the skill",
    "skill_type": "expert",
    "output_format": "text",
    "prompt_content": "Full expert knowledge framework (see structure below)"
  },
  "reasoning": "Brief explanation of your design choices",
  "suggested_use_cases": ["Use case 1", "Use case 2", "Use case 3"]
}

## CATEGORY OPTIONS
Choose the most appropriate:
- Financial Regulation
- Risk Management
- Compliance
- Audit
- Legal
- Technical
- Operations
- Document Generation
- Research
- Custom

## PROMPT_CONTENT STRUCTURE
The prompt_content should follow this framework:

You are an expert in [DOMAIN]. Your expertise includes:

## Core Competencies:
- [Area 1]: [Description]
- [Area 2]: [Description]
- [Area 3]: [Description]

## Assessment Framework:
When analyzing documents, evaluate:
1. [Criterion 1]
2. [Criterion 2]
3. [Criterion 3]
4. [Criterion 4]
5. [Criterion 5]

## Response Guidelines:
- [Style guideline 1]
- [Style guideline 2]
- [Style guideline 3]
- Always cite specific sections from the documents
- Provide actionable insights and recommendations

## Key Considerations:
- [Important factor 1]
- [Important factor 2]
- [Industry standards or regulations if applicable]

## INSTRUCTIONS
1. Parse the user's description to understand the domain and requirements
2. Generate a comprehensive expert profile
3. Include domain-specific terminology and standards
4. Create actionable assessment criteria
5. Ensure the skill is practical for document analysis
6. Output ONLY valid JSON - no markdown code blocks, no additional text`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY is not configured");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request
    const { description, saveSkill = false } = await req.json();

    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      throw new Error("Please provide a description of the skill you need (at least 10 characters)");
    }

    console.log(`Generating skill from description: "${description.substring(0, 100)}..."`);
    const startTime = Date.now();

    // Build the prompt
    const userPrompt = `## USER REQUEST
${description}

Generate a complete skill definition for this request. Remember to output ONLY valid JSON.`;

    // Call Gemini API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: SKILL_CREATOR_PROMPT }]
              },
              {
                role: "model",
                parts: [{ text: "I understand. I will generate skill definitions in valid JSON format only. Please provide the skill description." }]
              },
              {
                role: "user",
                parts: [{ text: userPrompt }]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4096,
            },
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timeout: The AI took too long to respond");
      }
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error("No response generated from AI");
    }

    console.log("Raw AI response:", rawText.substring(0, 500));

    // Parse the JSON response
    let generatedSkill;
    try {
      // Clean up the response - remove markdown code blocks if present
      let cleanJson = rawText.trim();
      if (cleanJson.startsWith("```json")) {
        cleanJson = cleanJson.slice(7);
      } else if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.slice(3);
      }
      if (cleanJson.endsWith("```")) {
        cleanJson = cleanJson.slice(0, -3);
      }
      cleanJson = cleanJson.trim();

      generatedSkill = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.error("Raw text was:", rawText);
      throw new Error("AI generated invalid response format. Please try again.");
    }

    // Validate the response structure
    if (!generatedSkill.skill || !generatedSkill.skill.name || !generatedSkill.skill.prompt_content) {
      throw new Error("AI generated incomplete skill definition. Please try again with more detail.");
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(`Skill generated in ${processingTimeMs}ms: ${generatedSkill.skill.name}`);

    // Optionally save the skill to database
    let savedSkillId = null;
    if (saveSkill) {
      const { data: savedSkill, error: saveError } = await supabase
        .from('skills')
        .insert({
          name: generatedSkill.skill.name,
          description: generatedSkill.skill.description,
          category: generatedSkill.skill.category || 'Custom',
          icon: generatedSkill.skill.icon || '🎯',
          skill_type: generatedSkill.skill.skill_type || 'expert',
          output_format: generatedSkill.skill.output_format || 'text',
          prompt_content: generatedSkill.skill.prompt_content,
          is_active: true,
          is_default: false,
          user_id: null, // Global skill for now (no auth)
        })
        .select('id')
        .single();

      if (saveError) {
        console.error("Failed to save skill:", saveError);
        throw new Error(`Failed to save skill: ${saveError.message}`);
      }

      savedSkillId = savedSkill?.id;
      console.log(`Skill saved with ID: ${savedSkillId}`);
    }

    // Return the generated skill
    return new Response(
      JSON.stringify({
        success: true,
        skill: generatedSkill.skill,
        reasoning: generatedSkill.reasoning,
        suggested_use_cases: generatedSkill.suggested_use_cases,
        savedSkillId,
        processingTimeMs,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error in create-skill:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
