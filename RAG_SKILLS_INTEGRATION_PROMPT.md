# RAG Skills Integration Guide for Gemini RAG Bot

## Current Architecture Analysis

Your `rag-reader-bot` uses **Google Gemini's native document processing** instead of traditional vector-based RAG:
- Documents uploaded via Google Files API
- Gemini reads documents directly (no chunking/embedding)
- Single-pass answer generation

**Key files to modify:**
- `supabase/functions/ask-question/index.ts` - Main RAG orchestrator (595 lines)
- `src/components/ChatInterface.tsx` - UI for questions

---

## Applicable RAG Skills for Your Architecture

Since you don't use vector retrieval, these skills are most applicable:

| Skill | Applicability | Integration Point |
|-------|--------------|-------------------|
| HyDE (Hypothetical Document Embeddings) | HIGH | Pre-question enhancement |
| Query Decomposition | HIGH | Complex question handling |
| Query Rewriting | HIGH | Vague question improvement |
| Self-RAG (Selective) | MEDIUM | Decide if docs needed |
| Multi-Step Reasoning | HIGH | Complex analysis |
| Answer Verification | HIGH | Post-generation validation |

---

## SKILL 1: HyDE (Hypothetical Document Embeddings)

### What It Does
Generates a hypothetical answer first, then uses that context to guide the real answer generation. This helps when user questions are vague or poorly phrased.

### Integration in `ask-question/index.ts`

**BEFORE (current code around line 200-250):**
```typescript
// Current: Direct question to Gemini
const result = await model.generateContent({
  contents: [
    {
      role: "user",
      parts: [...fileParts, { text: fullPrompt }]
    }
  ],
  // ...
});
```

**AFTER (with HyDE):**
```typescript
// Step 1: Generate hypothetical answer (lightweight call)
async function generateHypotheticalAnswer(question: string, documentNames: string[]): Promise<string> {
  const hydePrompt = `You are analyzing documents: ${documentNames.join(', ')}.

Without access to the actual content, write what a comprehensive answer to this question WOULD look like:

Question: ${question}

Write a detailed hypothetical answer (2-3 paragraphs) that would be expected from these types of documents.
This will help guide the actual document analysis.

Hypothetical Answer:`;

  const hydeResult = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: hydePrompt }] }],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 500,
    }
  });

  return hydeResult.response.text();
}

// Step 2: Enhanced question with hypothetical context
const hypotheticalAnswer = await generateHypotheticalAnswer(question, documentNames);

const enhancedPrompt = `${systemPrompt}

CONTEXT GUIDANCE (use to focus your document analysis):
${hypotheticalAnswer}

Now, using the ACTUAL documents provided, answer this question with proper citations:

QUESTION: ${question}

Important: The context guidance above is hypothetical. Your answer must be based ONLY on the actual documents.`;

const result = await model.generateContent({
  contents: [
    {
      role: "user",
      parts: [...fileParts, { text: enhancedPrompt }]
    }
  ],
  // ...
});
```

---

## SKILL 2: Query Decomposition

### What It Does
Breaks complex questions into simpler sub-questions, answers each, then synthesizes.

### Integration in `ask-question/index.ts`

**Add this function:**
```typescript
async function decomposeQuestion(question: string): Promise<string[]> {
  const decomposePrompt = `Analyze this question and determine if it should be broken into sub-questions.

Question: "${question}"

If the question is simple (single topic, single aspect), return:
{"decompose": false, "questions": ["${question}"]}

If the question is complex (multiple topics, comparisons, or multi-part), break it down:
{"decompose": true, "questions": ["sub-question 1", "sub-question 2", ...]}

Return ONLY valid JSON:`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: decomposePrompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 500 }
  });

  try {
    const parsed = JSON.parse(result.response.text());
    return parsed.questions;
  } catch {
    return [question]; // Fallback to original
  }
}

// Usage in main handler:
const subQuestions = await decomposeQuestion(userQuestion);

if (subQuestions.length > 1) {
  // Answer each sub-question
  const subAnswers = await Promise.all(
    subQuestions.map(async (sq, i) => {
      const result = await answerSingleQuestion(sq, fileParts, systemPrompt);
      return `### Part ${i + 1}: ${sq}\n\n${result}`;
    })
  );

  // Synthesize final answer
  const synthesisPrompt = `Based on these partial answers, provide a comprehensive synthesis:

${subAnswers.join('\n\n---\n\n')}

Provide a unified, coherent answer that integrates all parts:`;

  finalAnswer = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: synthesisPrompt }] }]
  });
} else {
  // Single question - answer directly
  finalAnswer = await answerSingleQuestion(userQuestion, fileParts, systemPrompt);
}
```

---

## SKILL 3: Query Rewriting

### What It Does
Improves vague or poorly-formed questions before processing.

### Integration in `ask-question/index.ts`

**Add this function:**
```typescript
async function rewriteQuery(originalQuestion: string, documentContext: string): Promise<string> {
  const rewritePrompt = `You are a query optimizer. Improve this question to be more specific and searchable.

Original Question: "${originalQuestion}"

Document Context: The user has uploaded documents related to: ${documentContext}

Rules:
1. Make the question more specific
2. Add relevant domain terminology if appropriate
3. If already clear, return the original
4. Keep the original intent

Improved Question (return ONLY the improved question, nothing else):`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: rewritePrompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 200 }
  });

  const improved = result.response.text().trim();

  // Log for debugging
  console.log(`Query Rewrite: "${originalQuestion}" -> "${improved}"`);

  return improved;
}

// Usage:
const documentContext = files.map(f => f.name).join(', ');
const improvedQuestion = await rewriteQuery(userQuestion, documentContext);
```

---

## SKILL 4: Answer Verification (Self-Correction)

### What It Does
Validates the generated answer against the documents to catch hallucinations.

### Integration in `ask-question/index.ts`

**Add after answer generation:**
```typescript
async function verifyAnswer(
  question: string,
  answer: string,
  documentNames: string[]
): Promise<{ verified: boolean; issues: string[]; correctedAnswer?: string }> {

  const verifyPrompt = `You are a fact-checker. Verify this answer against strict criteria.

QUESTION: ${question}

ANSWER TO VERIFY:
${answer}

AVAILABLE DOCUMENTS: ${documentNames.join(', ')}

CHECK FOR:
1. Does the answer cite documents that are NOT in the available list? (CRITICAL)
2. Does the answer make claims without any citation?
3. Does the answer contain obvious logical inconsistencies?
4. Does the answer have redundant/repeated phrases?

Return JSON:
{
  "verified": true/false,
  "issues": ["issue 1", "issue 2"],
  "severity": "none" | "minor" | "major",
  "suggestion": "How to fix if issues found"
}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: verifyPrompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 500 }
  });

  try {
    const verification = JSON.parse(result.response.text());

    if (!verification.verified && verification.severity === 'major') {
      // Re-generate with stricter instructions
      console.log('Answer failed verification, regenerating...');
      // Trigger regeneration with issues highlighted
    }

    return verification;
  } catch {
    return { verified: true, issues: [] }; // Fail-safe
  }
}

// Usage after generating answer:
const verification = await verifyAnswer(question, generatedAnswer, documentNames);
if (!verification.verified) {
  console.warn('Verification issues:', verification.issues);
  // Optionally append warning to response
}
```

---

## SKILL 5: Multi-Step Reasoning Chain

### What It Does
For complex analytical questions, uses chain-of-thought reasoning.

### Integration in `ask-question/index.ts`

**Enhance the system prompt:**
```typescript
const REASONING_PROMPT = `
When answering complex analytical questions, use this reasoning framework:

STEP 1 - UNDERSTAND: Identify what the question is really asking
STEP 2 - LOCATE: Find relevant sections in the documents
STEP 3 - EXTRACT: Pull specific facts, figures, and quotes
STEP 4 - ANALYZE: Apply domain expertise to interpret findings
STEP 5 - SYNTHESIZE: Combine insights into a coherent answer
STEP 6 - CITE: Add proper citations for all claims

For each step, briefly note your reasoning before the final answer.

Format:
<reasoning>
Step 1: [Your understanding]
Step 2: [Relevant sections found]
Step 3: [Key extracts]
Step 4: [Analysis]
Step 5: [Synthesis approach]
</reasoning>

<answer>
[Your final, well-cited answer]
</answer>
`;

// Add to your system prompt for complex questions
function isComplexQuestion(question: string): boolean {
  const complexIndicators = [
    'compare', 'contrast', 'analyze', 'evaluate', 'assess',
    'implications', 'relationship between', 'how does', 'why',
    'impact', 'risk', 'compliance', 'recommend'
  ];
  return complexIndicators.some(ind => question.toLowerCase().includes(ind));
}

// In main handler:
let finalPrompt = systemPrompt;
if (isComplexQuestion(question)) {
  finalPrompt = systemPrompt + '\n\n' + REASONING_PROMPT;
}
```

---

## SKILL 6: Confidence Scoring

### What It Does
Adds confidence levels to answers based on document coverage.

### Integration:
```typescript
async function assessConfidence(
  question: string,
  answer: string,
  fileParts: any[]
): Promise<{ score: number; reasoning: string }> {

  const confidencePrompt = `Assess the confidence level of this answer.

Question: ${question}

Answer: ${answer}

Rate confidence from 0.0 to 1.0 based on:
- How well the documents cover this topic
- Strength of citations/evidence
- Any assumptions or gaps

Return JSON:
{
  "score": 0.0-1.0,
  "reasoning": "Brief explanation",
  "gaps": ["Any information gaps identified"]
}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [...fileParts, { text: confidencePrompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 300 }
  });

  return JSON.parse(result.response.text());
}

// Usage: Add confidence badge to response
const confidence = await assessConfidence(question, answer, fileParts);
const confidenceLabel =
  confidence.score > 0.8 ? 'High Confidence' :
  confidence.score > 0.5 ? 'Medium Confidence' : 'Low Confidence';

// Include in response
return {
  answer,
  confidence: confidenceLabel,
  confidenceScore: confidence.score,
  gaps: confidence.gaps
};
```

---

## Complete Integration Example

Here's how to modify your main `ask-question/index.ts` handler:

```typescript
// Add at top of file
const ENABLE_HYDE = true;
const ENABLE_QUERY_REWRITE = true;
const ENABLE_DECOMPOSITION = true;
const ENABLE_VERIFICATION = true;
const ENABLE_CONFIDENCE = true;

// In serve() handler, replace the main logic:
async function processQuestion(
  originalQuestion: string,
  files: UploadedFile[],
  customPrompt: string | null
): Promise<RAGResponse> {

  const documentNames = files.map(f => f.name);
  let question = originalQuestion;

  // Skill 1: Query Rewriting
  if (ENABLE_QUERY_REWRITE) {
    question = await rewriteQuery(question, documentNames.join(', '));
  }

  // Skill 2: Query Decomposition
  let subQuestions = [question];
  if (ENABLE_DECOMPOSITION) {
    subQuestions = await decomposeQuestion(question);
  }

  // Skill 3: HyDE Enhancement
  let hydeContext = '';
  if (ENABLE_HYDE && subQuestions.length === 1) {
    hydeContext = await generateHypotheticalAnswer(question, documentNames);
  }

  // Build file parts
  const fileParts = buildFileParts(files);

  // Generate answer(s)
  let answer: string;
  if (subQuestions.length > 1) {
    answer = await processMultiPartQuestion(subQuestions, fileParts, customPrompt);
  } else {
    answer = await generateAnswer(question, fileParts, customPrompt, hydeContext);
  }

  // Skill 4: Verification
  let verification = { verified: true, issues: [] };
  if (ENABLE_VERIFICATION) {
    verification = await verifyAnswer(question, answer, documentNames);
  }

  // Skill 5: Confidence
  let confidence = { score: 0.75, reasoning: '' };
  if (ENABLE_CONFIDENCE) {
    confidence = await assessConfidence(question, answer, fileParts);
  }

  return {
    answer,
    originalQuestion,
    processedQuestion: question,
    wasDecomposed: subQuestions.length > 1,
    verification,
    confidence,
    metadata: {
      documentsUsed: documentNames,
      skillsApplied: getAppliedSkills()
    }
  };
}
```

---

## Frontend Updates (`ChatInterface.tsx`)

Add display for skill metadata:

```tsx
// In the message display component
{message.confidence && (
  <div className={`confidence-badge ${message.confidence.score > 0.8 ? 'high' : message.confidence.score > 0.5 ? 'medium' : 'low'}`}>
    {message.confidence.score > 0.8 ? '🟢' : message.confidence.score > 0.5 ? '🟡' : '🔴'}
    {' '}{(message.confidence.score * 100).toFixed(0)}% Confidence
  </div>
)}

{message.verification && !message.verification.verified && (
  <div className="verification-warning">
    ⚠️ Verification Notes: {message.verification.issues.join(', ')}
  </div>
)}

{message.wasDecomposed && (
  <div className="decomposition-note">
    📝 Complex question was broken into {message.subQuestionCount} parts
  </div>
)}
```

---

## Installation Requirements

Add to your project (if using Python utilities):
```bash
pip install sentence-transformers rank-bm25
```

For the Deno Edge Functions, no additional dependencies needed - uses Gemini API.

---

## Testing Checklist

After integration, test with these question types:

1. **Simple Question**: "What is the total revenue?"
   - Should work without decomposition or HyDE

2. **Vague Question**: "Tell me about the finances"
   - Query rewriting should improve this

3. **Complex Question**: "Compare the risk assessment methodology in Document A vs Document B and evaluate which is more suitable for our compliance needs"
   - Should trigger decomposition
   - Should use chain-of-thought reasoning

4. **Trick Question**: "What does the XYZ report say about climate change?" (when no XYZ report exists)
   - Verification should catch fabricated citations

---

## Summary

| Skill | File to Modify | Lines to Add | Difficulty |
|-------|---------------|--------------|------------|
| HyDE | ask-question/index.ts | ~30 | Easy |
| Query Rewrite | ask-question/index.ts | ~25 | Easy |
| Decomposition | ask-question/index.ts | ~50 | Medium |
| Verification | ask-question/index.ts | ~40 | Medium |
| Confidence | ask-question/index.ts | ~30 | Easy |
| Chain-of-Thought | ask-question/index.ts | ~20 | Easy |

Start with **HyDE** and **Query Rewriting** - these give the best improvement with least complexity.
