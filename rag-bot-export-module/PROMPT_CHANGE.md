# Prompt Change — Make the bot return structured JSON

To enable the Word/PDF download buttons, the bot needs to emit a structured JSON object alongside its human-readable response. The download component looks for a fenced code block (```assessment-json``` or ```json```) at the end of the response and parses it.

## The change

In `supabase/functions/ask-question/index.ts`, locate the block that builds the `finalPrompt` for the questions-template path (around line 1018–1044 — see the FIX_PATCH document for the area in context). After the existing instructions, append a JSON-output requirement.

Find this section (currently):

```ts
finalPrompt += `\n${outputFormatInstructions}\n\n## RESPONSE INSTRUCTIONS:
For EACH question above:
1. Search the retrieved sections for relevant information
2. Provide a COMPLETE, DETAILED response using ONLY information from the retrieved sections
3. Structure your answer according to the OUTPUT FORMAT specified above
4. CITE specific sources using the CITATION FORMAT specified above
5. If information is not in the retrieved sections, state so clearly

**CRITICAL:** Answer ALL questions. Follow the output format. Cite your sources. Never fabricate information.`;
```

Change to:

```ts
finalPrompt += `\n${outputFormatInstructions}\n\n## RESPONSE INSTRUCTIONS:
For EACH question above:
1. Search the retrieved sections for relevant information
2. Provide a COMPLETE, DETAILED response using ONLY information from the retrieved sections
3. Structure your answer according to the OUTPUT FORMAT specified above
4. CITE specific sources using the CITATION FORMAT specified above
5. If information is not in the retrieved sections, state so clearly

**CRITICAL:** Answer ALL questions. Follow the output format. Cite your sources. Never fabricate information.

## STRUCTURED EXPORT (REQUIRED)

After your human-readable response, append a fenced code block containing a JSON object that captures the same content in machine-readable form. The frontend uses this to generate Word and PDF working papers. Use the EXACT structure shown below. Do not omit fields. Do not include explanatory text inside the JSON fence.

\`\`\`assessment-json
{
  "title": "<Entity name short title>",
  "entity": "<Full entity name>",
  "reportingDate": "<e.g. March 2025>",
  "sourceDocuments": ["<Document 1 — author, date, version>", "<Document 2 — ...>"],
  "documentContext": {
    "entity": "<verbatim>",
    "jurisdiction": "<verbatim>",
    "portfolioType": "<verbatim>",
    "currency": "<verbatim>",
    "reportingDate": "<verbatim>",
    "totalGrossExposure": "<verbatim>",
    "totalProvision": "<verbatim>",
    "coverageRatios": { "stage1": "X%", "stage2": "X%", "stage3": "X%", "overall": "X%" },
    "provisionBySegment": [["Segment name", "Amount"]],
    "peerBenchmark": {
      "present": true,
      "peers": [["Bank name", "As-of", "Stage 1 %", "Stage 2 %", "Stage 3 %", "Total %"]]
    },
    "priorReviews": ["<Firm (year) — scope>"],
    "modelMetrics": [["Metric label", "Verbatim value"]],
    "tablesObserved": ["<Table caption>"],
    "knownInconsistencies": ["<Inconsistency description>"]
  },
  "topics": [
    {
      "num": 2,
      "title": "<Topic name>",
      "status": "Partially Compliant",
      "requirement": "<2-3 sentence IFRS 9 requirement>",
      "methodology": [
        { "type": "bullet", "text": "<methodology point>", "cite": "<source citation>" },
        { "type": "table", "caption": "<Table caption (verbatim from source)>", "headers": ["col1","col2"], "rows": [["v1","v2"]] }
      ],
      "modelPerformance": ["<commentary for PD/LGD/EAD/FLI topics>"],
      "gaps": ["<gap 1>", "<gap 2>"],
      "actions": [{ "text": "<action>", "prio": "High" }],
      "coverage": "<chunks retrieved; tables referenced; figures cited>"
    }
  ],
  "summary": {
    "counts": { "compliant": 0, "partial": 0, "nonCompliant": 0, "evidenceNotFound": 0 },
    "headline": "<3-5 sentence conclusion>",
    "priorities": ["<priority 1>", "<priority 2>"],
    "sequencing": {
      "shortTerm": "<0-3 month actions>",
      "mediumTerm": "<3-9 month actions>",
      "longTerm": "<9-18 month actions>"
    }
  }
}
\`\`\`

Rules for the JSON:
- "status" must be one of: "Compliant" | "Partially Compliant" | "Non-Compliant" | "Evidence Not Found".
- "prio" must be one of: "High" | "Medium" | "Low".
- "methodology" items have type "bullet" (with optional "cite"), "table" (with optional "caption" and "headers" plus required "rows"), or "note" (italic note such as "Evidence not found after full corpus scan.").
- Use verbatim numerical values from the source — do not paraphrase percentages or amounts.
- Reproduce every row of source tables in the "rows" arrays — do not summarise tables into prose.
- Produce a topic block for EVERY question in the questionsTemplate, even those for which evidence was not found.`;
```

That's the entire change — it appends a new section to the prompt that requires the JSON output alongside the human-readable text. The bot's existing response continues to render in the chat panel; the JSON powers the downloads.

## Optional: also add to the non-template branch

If users sometimes run single-question assessments (no questionsTemplate), apply the same JSON-export requirement to the `else` branch around line 1083. In that branch, the JSON object should contain a single topic in the `topics` array.
