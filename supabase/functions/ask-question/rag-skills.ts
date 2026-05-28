// RAG Skills Implementation Module
// Each skill is a standalone function that can be enabled/disabled

import { callLLM, type LLMConfig } from "../_shared/llm.ts";

/**
 * HyDE: Hypothetical Document Embeddings
 * Generates a hypothetical answer to guide document search
 */
export async function generateHypotheticalAnswer(
  question: string,
  documentNames: string[],
  llm: LLMConfig,
  temperature: number = 0.5,
  maxTokens: number = 500
): Promise<string> {
  const hydePrompt = `You are analyzing documents: ${documentNames.join(', ')}.

Without access to the actual content, write what a comprehensive answer to this question WOULD look like:

Question: ${question}

Write a detailed hypothetical answer (2-3 paragraphs) that would be expected from these types of documents.
This will help guide the actual document analysis.

Hypothetical Answer:`;

  try {
    return await callLLM(hydePrompt, llm, { temperature, maxOutputTokens: maxTokens });
  } catch (error) {
    console.error("HyDE error:", error);
    return '';
  }
}

/**
 * Query Rewriting
 * Improves vague or poorly-formed questions
 */
export async function rewriteQuery(
  originalQuestion: string,
  documentContext: string,
  llm: LLMConfig
): Promise<string> {
  const rewritePrompt = `You are a query optimizer. Improve this question to be more specific and searchable.

Original Question: "${originalQuestion}"

Document Context: The user has uploaded documents related to: ${documentContext}

Rules:
1. Make the question more specific
2. Add relevant domain terminology if appropriate
3. If already clear, return the original
4. Keep the original intent
5. Do not add information not implied by the original question

Improved Question (return ONLY the improved question, nothing else):`;

  try {
    const improved = (await callLLM(rewritePrompt, llm, { temperature: 0.2, maxOutputTokens: 200 })).trim();

    if (improved && improved.length > 0) {
      console.log(`Query Rewrite: "${originalQuestion}" -> "${improved}"`);
      return improved;
    }
    return originalQuestion;
  } catch (error) {
    console.error("Query rewrite error:", error);
    return originalQuestion;
  }
}

/**
 * Query Decomposition
 * Breaks complex questions into simpler sub-questions
 */
export async function decomposeQuestion(
  question: string,
  llm: LLMConfig,
  maxSubquestions: number = 5
): Promise<string[]> {
  const decomposePrompt = `Analyze this question and determine if it should be broken into sub-questions.

Question: "${question}"

If the question is simple (single topic, single aspect), return:
{"decompose": false, "questions": ["${question}"]}

If the question is complex (multiple topics, comparisons, or multi-part), break it down into at most ${maxSubquestions} sub-questions:
{"decompose": true, "questions": ["sub-question 1", "sub-question 2", ...]}

Important: Each sub-question should be self-contained and answerable independently.

Return ONLY valid JSON, no other text:`;

  try {
    const responseText = await callLLM(decomposePrompt, llm, { temperature: 0, maxOutputTokens: 500 });

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.decompose && Array.isArray(parsed.questions) && parsed.questions.length > 1) {
        console.log(`Query decomposed into ${parsed.questions.length} sub-questions`);
        return parsed.questions;
      }
    }
    return [question];
  } catch (error) {
    console.error("Query decomposition error:", error);
    return [question];
  }
}

/**
 * Answer Verification
 * Checks the answer for hallucinations and unsupported claims
 */
export async function verifyAnswer(
  question: string,
  answer: string,
  documentNames: string[],
  llm: LLMConfig
): Promise<{ verified: boolean; issues: string[]; severity: 'none' | 'minor' | 'major'; suggestion?: string }> {
  const verifyPrompt = `You are a fact-checker. Verify this answer against strict criteria.

QUESTION: ${question}

ANSWER TO VERIFY:
${answer}

AVAILABLE DOCUMENTS: ${documentNames.join(', ')}

CHECK FOR:
1. Does the answer cite documents that are NOT in the available list? (CRITICAL - this is hallucination)
2. Does the answer make specific claims without any citation? (MINOR if general, MAJOR if specific)
3. Does the answer contain obvious logical inconsistencies?
4. Does the answer contain information clearly not from the documents?

Return JSON only:
{
  "verified": true/false,
  "issues": ["issue 1", "issue 2"],
  "severity": "none" | "minor" | "major",
  "suggestion": "How to improve if issues found"
}`;

  try {
    const responseText = await callLLM(verifyPrompt, llm, { temperature: 0, maxOutputTokens: 500 });

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log(`Verification: verified=${result.verified}, severity=${result.severity}`);
      return {
        verified: result.verified ?? true,
        issues: result.issues ?? [],
        severity: result.severity ?? 'none',
        suggestion: result.suggestion,
      };
    }
    return { verified: true, issues: [], severity: 'none' };
  } catch (error) {
    console.error("Answer verification error:", error);
    return { verified: true, issues: [], severity: 'none' };
  }
}

/**
 * Confidence Scoring
 * Assesses how confident the answer is based on document coverage
 */
export async function assessConfidence(
  question: string,
  answer: string,
  documentNames: string[],
  sourcesCount: number,
  llm: LLMConfig
): Promise<{ score: number; label: 'High' | 'Medium' | 'Low'; reasoning: string; gaps: string[] }> {
  const confidencePrompt = `Assess the confidence level of this answer.

Question: ${question}

Answer: ${answer}

Documents used: ${documentNames.join(', ')}
Number of source chunks retrieved: ${sourcesCount}

Rate confidence from 0.0 to 1.0 based on:
- How well the answer addresses the question
- Strength of citations/evidence in the answer
- Number and quality of sources used
- Any apparent gaps or assumptions

Return JSON only:
{
  "score": 0.0-1.0,
  "reasoning": "Brief explanation of score",
  "gaps": ["Any information gaps identified"]
}`;

  try {
    const responseText = await callLLM(confidencePrompt, llm, { temperature: 0, maxOutputTokens: 300 });

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Math.min(1, Math.max(0, parsed.score ?? 0.5));
      const label = score >= 0.7 ? 'High' : score >= 0.4 ? 'Medium' : 'Low';
      console.log(`Confidence: ${score} (${label})`);
      return {
        score,
        label,
        reasoning: parsed.reasoning ?? '',
        gaps: parsed.gaps ?? [],
      };
    }
    return { score: 0.5, label: 'Medium', reasoning: 'Unable to assess', gaps: [] };
  } catch (error) {
    console.error("Confidence assessment error:", error);
    return { score: 0.5, label: 'Medium', reasoning: 'Unable to assess', gaps: [] };
  }
}

/**
 * Detect if a question is complex (for multi-step reasoning)
 */
export function isComplexQuestion(question: string): boolean {
  const complexIndicators = [
    'compare', 'contrast', 'analyze', 'evaluate', 'assess',
    'implications', 'relationship between', 'how does', 'why does',
    'impact', 'risk', 'compliance', 'recommend', 'difference',
    'pros and cons', 'advantages', 'disadvantages', 'trade-off',
    'multiple', 'several', 'various', 'different aspects',
    'step by step', 'process', 'methodology', 'framework'
  ];
  const lowerQuestion = question.toLowerCase();
  return complexIndicators.some(ind => lowerQuestion.includes(ind));
}

/**
 * Multi-Step Reasoning Prompt
 * Added to system prompt for complex questions
 */
export const REASONING_PROMPT = `
When answering this complex analytical question, use this reasoning framework:

STEP 1 - UNDERSTAND: Identify what the question is really asking
STEP 2 - LOCATE: Find relevant sections in the documents
STEP 3 - EXTRACT: Pull specific facts, figures, and quotes
STEP 4 - ANALYZE: Apply domain expertise to interpret findings
STEP 5 - SYNTHESIZE: Combine insights into a coherent answer
STEP 6 - CITE: Add proper citations for all claims

Structure your response as:
<reasoning>
Brief notes on your analysis process
</reasoning>

<answer>
Your final, well-cited answer
</answer>
`;

/**
 * RAG Configuration interface (matches database schema)
 */
export interface RagConfig {
  enable_hyde: boolean;
  enable_query_rewrite: boolean;
  enable_decomposition: boolean;
  enable_verification: boolean;
  enable_confidence: boolean;
  enable_reasoning: boolean;
  top_k: number;
  similarity_threshold: number;
}

/**
 * Default RAG configuration
 */
export const DEFAULT_RAG_CONFIG: RagConfig = {
  enable_hyde: false,
  enable_query_rewrite: true,             // was false — helps retrieval match terminology
  enable_decomposition: true,             // was false — helps complex multi-part questions
  enable_verification: false,
  enable_confidence: false,
  enable_reasoning: false,
  top_k: 25,                              // was 15 — gives the model more evidence per topic
  similarity_threshold: 0.3,
};

// =====================================================
// RETRIEVAL SKILLS
// =====================================================

/**
 * Retrieval Configuration interface
 */
export interface RetrievalConfig {
  // Full document mode - bypass chunking
  enable_full_document_mode: boolean;
  full_document_max_chars: number;

  enable_reranking: boolean;
  reranker_model: 'none' | 'cross-encoder' | 'llm-rerank';
  rerank_top_n: number;

  enable_fusion: boolean;
  fusion_strategy: 'rrf' | 'weighted' | 'linear';
  fusion_weights: {
    semantic: number;
    keyword: number;
  };

  enable_hierarchical: boolean;
  expand_to_parent: boolean;
  max_hierarchy_depth: number;

  enable_self_rag: boolean;
  max_self_rag_iterations: number;
  self_rag_threshold: number;

  enable_crag: boolean;
  crag_relevance_threshold: number;
  enable_web_fallback: boolean;

  enable_feedback_loop: boolean;
  feedback_learning_rate: number;
}

/**
 * Default Retrieval Configuration
 */
export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  // Full document mode - disabled by default
  enable_full_document_mode: false,
  full_document_max_chars: 100000,

  enable_reranking: true,                 // was false — re-orders retrieved chunks by relevance
  reranker_model: 'llm-rerank',           // was 'none' — uses Gemini to rerank
  rerank_top_n: 15,                       // was 10 — keep top 15 after rerank

  enable_fusion: false,
  fusion_strategy: 'rrf',
  fusion_weights: { semantic: 0.7, keyword: 0.3 },

  enable_hierarchical: false,
  expand_to_parent: true,
  max_hierarchy_depth: 1,

  enable_self_rag: false,
  max_self_rag_iterations: 2,
  self_rag_threshold: 0.6,

  enable_crag: false,
  crag_relevance_threshold: 0.4,
  enable_web_fallback: false,

  enable_feedback_loop: false,
  feedback_learning_rate: 0.1,
};

/**
 * Chunk interface for retrieval operations
 */
export interface RetrievalChunk {
  id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  similarity: number;
  parent_index?: number;
  is_parent?: boolean;
  // Additional scores from fusion/reranking
  keyword_score?: number;
  rerank_score?: number;
  final_score?: number;
}

/**
 * LLM-based Reranking
 * Uses Gemini to rerank retrieved chunks based on relevance to query
 */
export async function rerankChunks(
  query: string,
  chunks: RetrievalChunk[],
  topN: number,
  llm: LLMConfig
): Promise<RetrievalChunk[]> {
  if (chunks.length === 0) return [];
  if (chunks.length <= topN) return chunks;

  // Prepare chunks for reranking prompt
  const chunkList = chunks.slice(0, Math.min(chunks.length, 30)).map((c, i) => ({
    id: i,
    preview: c.content.substring(0, 500),
    doc: c.document_name,
  }));

  const rerankPrompt = `You are a relevance ranker. Given a query and document chunks, rank the chunks by relevance.

QUERY: "${query}"

CHUNKS:
${chunkList.map(c => `[${c.id}] (${c.doc}): ${c.preview}...`).join('\n\n')}

Return a JSON array of chunk IDs in order of relevance (most relevant first):
{"ranking": [id1, id2, id3, ...]}

Only return the top ${topN} most relevant chunks. Return ONLY valid JSON.`;

  try {
    const responseText = await callLLM(rerankPrompt, llm, { temperature: 0, maxOutputTokens: 500 });
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      if (Array.isArray(result.ranking)) {
        const reranked: RetrievalChunk[] = [];
        for (const idx of result.ranking.slice(0, topN)) {
          if (typeof idx === 'number' && idx >= 0 && idx < chunks.length) {
            const chunk = { ...chunks[idx] };
            chunk.rerank_score = 1 - (reranked.length / topN);
            chunk.final_score = chunk.rerank_score;
            reranked.push(chunk);
          }
        }
        if (reranked.length > 0) {
          console.log(`Reranked ${chunks.length} chunks to top ${reranked.length}`);
          return reranked;
        }
      }
    }
  } catch (error) {
    console.error("Reranking error:", error);
  }

  return chunks.slice(0, topN);
}

/**
 * Keyword Search using BM25-like scoring
 * Simple implementation for fusion retrieval
 */
export function keywordSearch(
  query: string,
  chunks: RetrievalChunk[],
  topK: number
): RetrievalChunk[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  const scored = chunks.map(chunk => {
    const content = chunk.content.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      // Count occurrences
      const regex = new RegExp(term, 'gi');
      const matches = content.match(regex);
      const termFreq = matches ? matches.length : 0;

      // BM25-like scoring (simplified)
      const docLength = content.length;
      const avgDocLength = 1500; // Approximate average chunk size
      const k1 = 1.5;
      const b = 0.75;

      if (termFreq > 0) {
        const tf = (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * (docLength / avgDocLength)));
        score += tf;
      }
    }

    return { ...chunk, keyword_score: score };
  });

  // Sort by keyword score and return top K
  return scored
    .sort((a, b) => (b.keyword_score || 0) - (a.keyword_score || 0))
    .slice(0, topK);
}

/**
 * Fusion Retrieval - Reciprocal Rank Fusion (RRF)
 * Combines semantic and keyword search results
 */
export function fusionRRF(
  semanticResults: RetrievalChunk[],
  keywordResults: RetrievalChunk[],
  k: number = 60  // RRF constant
): RetrievalChunk[] {
  const scores = new Map<string, { chunk: RetrievalChunk; score: number }>();

  // Score semantic results
  semanticResults.forEach((chunk, rank) => {
    const key = `${chunk.document_id}-${chunk.chunk_index}`;
    const rrfScore = 1 / (k + rank + 1);
    scores.set(key, { chunk, score: rrfScore });
  });

  // Add keyword results
  keywordResults.forEach((chunk, rank) => {
    const key = `${chunk.document_id}-${chunk.chunk_index}`;
    const rrfScore = 1 / (k + rank + 1);
    const existing = scores.get(key);

    if (existing) {
      existing.score += rrfScore;
      existing.chunk.keyword_score = chunk.keyword_score;
    } else {
      scores.set(key, { chunk: { ...chunk }, score: rrfScore });
    }
  });

  // Sort by combined score
  const fused = Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(item => ({
      ...item.chunk,
      final_score: item.score,
    }));

  console.log(`Fusion RRF: Combined ${semanticResults.length} semantic + ${keywordResults.length} keyword results`);
  return fused;
}

/**
 * Weighted Fusion
 * Combines results using explicit weights
 */
export function fusionWeighted(
  semanticResults: RetrievalChunk[],
  keywordResults: RetrievalChunk[],
  weights: { semantic: number; keyword: number }
): RetrievalChunk[] {
  const scores = new Map<string, { chunk: RetrievalChunk; score: number }>();

  // Normalize semantic scores (they're already similarity scores 0-1)
  semanticResults.forEach(chunk => {
    const key = `${chunk.document_id}-${chunk.chunk_index}`;
    const weightedScore = chunk.similarity * weights.semantic;
    scores.set(key, { chunk, score: weightedScore });
  });

  // Normalize and add keyword scores
  const maxKeyword = Math.max(...keywordResults.map(c => c.keyword_score || 0), 1);
  keywordResults.forEach(chunk => {
    const key = `${chunk.document_id}-${chunk.chunk_index}`;
    const normalizedKeyword = (chunk.keyword_score || 0) / maxKeyword;
    const weightedScore = normalizedKeyword * weights.keyword;

    const existing = scores.get(key);
    if (existing) {
      existing.score += weightedScore;
      existing.chunk.keyword_score = chunk.keyword_score;
    } else {
      scores.set(key, { chunk: { ...chunk }, score: weightedScore });
    }
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(item => ({
      ...item.chunk,
      final_score: item.score,
    }));
}

/**
 * Self-RAG: Self-Reflective Retrieval
 * Iteratively improves retrieval by reflecting on initial results
 */
export async function selfRAG(
  query: string,
  initialChunks: RetrievalChunk[],
  threshold: number,
  maxIterations: number,
  llm: LLMConfig,
  retrieveFn: (q: string) => Promise<RetrievalChunk[]>
): Promise<{ chunks: RetrievalChunk[]; iterations: number; refined: boolean }> {
  let currentChunks = initialChunks;
  let iterations = 0;
  let refined = false;

  for (let i = 0; i < maxIterations; i++) {
    // Assess retrieval quality
    const assessment = await assessRetrievalQuality(query, currentChunks, llm);

    if (assessment.score >= threshold) {
      console.log(`Self-RAG: Quality sufficient (${assessment.score.toFixed(2)}) after ${iterations} iterations`);
      break;
    }

    iterations++;
    refined = true;

    // Generate refined query based on gaps
    const refinedQuery = await refineQueryForGaps(query, assessment.gaps, llm);

    if (refinedQuery !== query) {
      console.log(`Self-RAG iteration ${iterations}: Refining query to: "${refinedQuery}"`);

      // Retrieve with refined query
      const newChunks = await retrieveFn(refinedQuery);

      // Merge results (deduplicated)
      const seen = new Set(currentChunks.map(c => `${c.document_id}-${c.chunk_index}`));
      for (const chunk of newChunks) {
        const key = `${chunk.document_id}-${chunk.chunk_index}`;
        if (!seen.has(key)) {
          currentChunks.push(chunk);
          seen.add(key);
        }
      }
    }
  }

  return { chunks: currentChunks, iterations, refined };
}

/**
 * Assess Retrieval Quality
 * Used by Self-RAG and CRAG
 */
export async function assessRetrievalQuality(
  query: string,
  chunks: RetrievalChunk[],
  llm: LLMConfig
): Promise<{ score: number; gaps: string[]; isRelevant: boolean }> {
  if (chunks.length === 0) {
    return { score: 0, gaps: ['No chunks retrieved'], isRelevant: false };
  }

  const chunkPreviews = chunks.slice(0, 5).map((c, i) =>
    `[${i + 1}] ${c.content.substring(0, 300)}...`
  ).join('\n\n');

  const assessPrompt = `Assess how well these retrieved document chunks can answer the query.

QUERY: "${query}"

RETRIEVED CHUNKS:
${chunkPreviews}

Evaluate:
1. Do the chunks contain information directly relevant to the query?
2. Is there enough information to fully answer the query?
3. What information gaps exist?

Return JSON:
{
  "score": 0.0-1.0,
  "isRelevant": true/false,
  "gaps": ["gap 1", "gap 2"]
}`;

  try {
    const responseText = await callLLM(assessPrompt, llm, { temperature: 0, maxOutputTokens: 300 });
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        score: Math.min(1, Math.max(0, result.score ?? 0.5)),
        gaps: result.gaps ?? [],
        isRelevant: result.isRelevant ?? true,
      };
    }
  } catch (error) {
    console.error("Quality assessment error:", error);
  }

  return { score: 0.5, gaps: [], isRelevant: true };
}

/**
 * Refine Query for Gaps
 * Generates a new query targeting information gaps
 */
async function refineQueryForGaps(
  originalQuery: string,
  gaps: string[],
  llm: LLMConfig
): Promise<string> {
  if (gaps.length === 0) return originalQuery;

  const refinePrompt = `Given the original query and identified information gaps, generate a refined query.

ORIGINAL QUERY: "${originalQuery}"

INFORMATION GAPS:
${gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Generate a refined query that would better retrieve the missing information.
Return ONLY the refined query, nothing else.`;

  try {
    const refined = (await callLLM(refinePrompt, llm, { temperature: 0.3, maxOutputTokens: 200 })).trim();
    if (refined && refined.length > 0) {
      return refined;
    }
  } catch (error) {
    console.error("Query refinement error:", error);
  }

  return originalQuery;
}

/**
 * CRAG: Corrective RAG
 * Detects low-quality retrieval and triggers correction
 */
export async function correctiveRAG(
  query: string,
  chunks: RetrievalChunk[],
  threshold: number,
  llm: LLMConfig,
  retrieveFn: (q: string) => Promise<RetrievalChunk[]>
): Promise<{
  chunks: RetrievalChunk[];
  corrected: boolean;
  action: 'use' | 'refine' | 'ambiguous';
  refinedQuery?: string;
}> {
  // Assess initial retrieval
  const assessment = await assessRetrievalQuality(query, chunks, llm);

  // CORRECT: Good retrieval
  if (assessment.isRelevant && assessment.score >= threshold) {
    return { chunks, corrected: false, action: 'use' };
  }

  // INCORRECT: Poor retrieval - need to refine
  if (!assessment.isRelevant || assessment.score < threshold * 0.5) {
    console.log(`CRAG: Poor retrieval (${assessment.score.toFixed(2)}), refining query...`);

    // Try query transformation
    const refinedQuery = await transformQueryForCRAG(query, llm);

    if (refinedQuery !== query) {
      const newChunks = await retrieveFn(refinedQuery);

      // Merge unique chunks
      const seen = new Set(chunks.map(c => `${c.document_id}-${c.chunk_index}`));
      const merged = [...chunks];

      for (const chunk of newChunks) {
        const key = `${chunk.document_id}-${chunk.chunk_index}`;
        if (!seen.has(key)) {
          merged.push(chunk);
          seen.add(key);
        }
      }

      return {
        chunks: merged,
        corrected: true,
        action: 'refine',
        refinedQuery,
      };
    }
  }

  // AMBIGUOUS: Partially relevant - use but flag
  return {
    chunks,
    corrected: false,
    action: 'ambiguous',
  };
}

/**
 * Transform Query for CRAG
 * Decomposes and reformulates query for better retrieval
 */
async function transformQueryForCRAG(
  query: string,
  llm: LLMConfig
): Promise<string> {
  const transformPrompt = `The following query did not retrieve good results. Transform it to be more effective.

ORIGINAL QUERY: "${query}"

Strategies to try:
1. Break into simpler sub-questions
2. Use different terminology
3. Make more specific or more general
4. Add context clues

Return ONLY the transformed query, nothing else.`;

  try {
    const transformed = (await callLLM(transformPrompt, llm, { temperature: 0.4, maxOutputTokens: 200 })).trim();
    if (transformed && transformed.length > 0) {
      console.log(`CRAG query transform: "${query}" -> "${transformed}"`);
      return transformed;
    }
  } catch (error) {
    console.error("CRAG transform error:", error);
  }

  return query;
}

/**
 * Expand to Parent Chunks
 * For hierarchical retrieval - gets parent context
 */
export async function expandToParentChunks(
  chunks: RetrievalChunk[],
  maxDepth: number,
  supabaseClient: any  // Supabase client type
): Promise<RetrievalChunk[]> {
  if (chunks.length === 0 || maxDepth <= 0) return chunks;

  const parentIndices = new Set<number>();
  const documentIds = new Set<string>();

  // Collect parent indices from child chunks
  for (const chunk of chunks) {
    if (chunk.parent_index !== undefined && chunk.parent_index !== null) {
      parentIndices.add(chunk.parent_index);
      documentIds.add(chunk.document_id);
    }
  }

  if (parentIndices.size === 0) {
    console.log("No parent chunks to expand");
    return chunks;
  }

  try {
    // Fetch parent chunks
    const { data: parentChunks, error } = await supabaseClient
      .from('document_chunks')
      .select('id, document_id, chunk_index, content, is_parent')
      .in('document_id', Array.from(documentIds))
      .in('chunk_index', Array.from(parentIndices))
      .eq('is_parent', true);

    if (error) {
      console.error("Error fetching parent chunks:", error);
      return chunks;
    }

    if (parentChunks && parentChunks.length > 0) {
      // Get document names
      const { data: docs } = await supabaseClient
        .from('documents')
        .select('id, name')
        .in('id', Array.from(documentIds));

      const docMap = new Map<string, string>(docs?.map((d: { id: string; name: string }) => [d.id, d.name]) || []);

      // Add parent chunks with lower relevance
      const expanded: RetrievalChunk[] = [...chunks];
      const seen = new Set(chunks.map(c => `${c.document_id}-${c.chunk_index}`));

      for (const parent of parentChunks) {
        const key = `${parent.document_id}-${parent.chunk_index}`;
        if (!seen.has(key)) {
          expanded.push({
            id: parent.id,
            document_id: parent.document_id,
            document_name: docMap.get(parent.document_id) || 'Unknown',
            chunk_index: parent.chunk_index,
            content: parent.content,
            similarity: 0.5, // Lower score for parent context
            is_parent: true,
          });
          seen.add(key);
        }
      }

      console.log(`Expanded ${chunks.length} chunks to ${expanded.length} with parent context`);
      return expanded;
    }
  } catch (error) {
    console.error("Parent expansion error:", error);
  }

  return chunks;
}

/**
 * Retrieval Feedback - Track and learn from retrieval quality
 */
export interface RetrievalFeedback {
  queryHash: string;
  avgSimilarity: number;
  chunksRetrieved: number;
  wasUseful: boolean;
  timestamp: number;
}

/**
 * Update Retrieval Weights based on feedback
 * Simple exponential moving average adjustment
 */
export function updateRetrievalWeights(
  currentWeights: { semantic: number; keyword: number },
  feedback: RetrievalFeedback,
  learningRate: number
): { semantic: number; keyword: number } {
  // If retrieval was useful and had high semantic scores, increase semantic weight
  // Otherwise, shift toward keyword
  const adjustment = feedback.wasUseful
    ? learningRate * (feedback.avgSimilarity - 0.5)
    : -learningRate * 0.1;

  let newSemantic = Math.max(0.3, Math.min(0.9, currentWeights.semantic + adjustment));
  let newKeyword = 1 - newSemantic;

  // Normalize
  const total = newSemantic + newKeyword;
  newSemantic /= total;
  newKeyword /= total;

  console.log(`Feedback weights update: semantic ${currentWeights.semantic.toFixed(2)} -> ${newSemantic.toFixed(2)}`);

  return { semantic: newSemantic, keyword: newKeyword };
}
