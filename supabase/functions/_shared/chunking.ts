// Advanced Text Chunking Module for RAG
// Supports: Fixed, Semantic, Proposition, and Hierarchical chunking

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface Chunk {
  content: string;
  index: number;
  startChar: number;
  endChar: number;
  tokenCount: number;
  // Enhanced metadata
  metadata?: ChunkMetadata;
  parentIndex?: number;       // For hierarchical chunking
  isParent?: boolean;         // True for parent/summary chunks
  sectionTitle?: string;      // Extracted section heading
}

export interface ChunkMetadata {
  sectionTitle?: string;
  pageNumber?: number;
  entities?: string[];
  contextBefore?: string;
  contextAfter?: string;
}

export type ChunkingStrategy = 'fixed' | 'semantic' | 'proposition' | 'hierarchical';

export interface ChunkingOptions {
  strategy: ChunkingStrategy;
  chunkSize: number;        // Target chunk size in characters
  chunkOverlap: number;     // Overlap between chunks
  separators: string[];     // Preferred split points
  // Enhancement options
  enableContextEnrichment: boolean;
  enableMetadataExtraction: boolean;
  enableSummaryChunks: boolean;
  preserveTables: boolean;
  preserveLists: boolean;
  extractEntities: boolean;
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  strategy: 'fixed',
  chunkSize: 2000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' '],
  enableContextEnrichment: false,
  enableMetadataExtraction: false,
  enableSummaryChunks: false,
  preserveTables: true,
  preserveLists: true,
  extractEntities: false,
};

// Simple token estimation (~4 characters per token for English)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Main chunking function - routes to appropriate strategy
export async function chunkText(
  text: string,
  options: Partial<ChunkingOptions> = {},
  apiKey?: string
): Promise<Chunk[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!text || text.trim().length === 0) {
    return [];
  }

  // Normalize and clean text
  let normalizedText = cleanText(text);

  // Preserve special structures if enabled
  if (opts.preserveTables) {
    normalizedText = preserveTableStructure(normalizedText);
  }
  if (opts.preserveLists) {
    normalizedText = preserveListStructure(normalizedText);
  }

  let chunks: Chunk[];

  // Route to appropriate chunking strategy
  switch (opts.strategy) {
    case 'semantic':
      if (!apiKey) {
        console.warn("No API key provided for semantic chunking, falling back to fixed");
        chunks = fixedChunking(normalizedText, opts);
      } else {
        chunks = await semanticChunking(normalizedText, opts, apiKey);
      }
      break;

    case 'proposition':
      if (!apiKey) {
        console.warn("No API key provided for proposition chunking, falling back to fixed");
        chunks = fixedChunking(normalizedText, opts);
      } else {
        chunks = await propositionChunking(normalizedText, opts, apiKey);
      }
      break;

    case 'hierarchical':
      if (!apiKey) {
        console.warn("No API key provided for hierarchical chunking, falling back to fixed");
        chunks = fixedChunking(normalizedText, opts);
      } else {
        chunks = await hierarchicalChunking(normalizedText, opts, apiKey);
      }
      break;

    case 'fixed':
    default:
      chunks = fixedChunking(normalizedText, opts);
  }

  // Apply post-processing enhancements
  if (opts.enableContextEnrichment && chunks.length > 1) {
    chunks = enrichWithContext(chunks, normalizedText);
  }

  if (opts.enableMetadataExtraction) {
    chunks = extractMetadata(chunks, normalizedText);
  }

  return chunks;
}

// =====================================================
// FIXED SIZE CHUNKING (Default - Fast)
// =====================================================
function fixedChunking(text: string, opts: ChunkingOptions): Chunk[] {
  const chunks: Chunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    let endIndex = Math.min(startIndex + opts.chunkSize, text.length);

    // Find good split point if not at end
    if (endIndex < text.length) {
      const searchStart = Math.max(startIndex + opts.chunkSize - 300, startIndex);
      const searchEnd = Math.min(startIndex + opts.chunkSize + 100, text.length);
      const searchText = text.slice(searchStart, searchEnd);

      let bestSplitPos = -1;
      for (const separator of opts.separators) {
        const relativePos = searchText.lastIndexOf(separator);
        if (relativePos !== -1) {
          const absolutePos = searchStart + relativePos + separator.length;
          if (absolutePos > startIndex + opts.chunkSize / 2 && absolutePos < text.length) {
            bestSplitPos = absolutePos;
            break;
          }
        }
      }

      if (bestSplitPos !== -1) {
        endIndex = bestSplitPos;
      }
    }

    const chunkContent = text.slice(startIndex, endIndex).trim();

    if (chunkContent.length > 0) {
      chunks.push({
        content: chunkContent,
        index: chunkIndex,
        startChar: startIndex,
        endChar: endIndex,
        tokenCount: estimateTokens(chunkContent),
      });
      chunkIndex++;
    }

    // Move with overlap
    const nextStart = endIndex - opts.chunkOverlap;
    startIndex = nextStart <= startIndex ? endIndex : nextStart;
  }

  return chunks;
}

// =====================================================
// SEMANTIC CHUNKING (LLM-based boundaries)
// =====================================================
async function semanticChunking(
  text: string,
  opts: ChunkingOptions,
  apiKey: string
): Promise<Chunk[]> {
  // First, do a rough split into paragraphs/sections
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

  if (paragraphs.length <= 3) {
    // Too short for semantic analysis
    return fixedChunking(text, opts);
  }

  try {
    // Ask LLM to identify semantic boundaries
    const prompt = `Analyze this text and identify the major semantic sections or topic boundaries. Return a JSON array of section boundaries.

TEXT:
${text.substring(0, 8000)}

Return JSON in this format only:
{
  "sections": [
    {"start": 0, "end": 500, "title": "Introduction"},
    {"start": 500, "end": 1200, "title": "Main Topic"}
  ]
}

Rules:
1. Each section should be 500-2000 characters
2. Split at natural topic changes
3. Return ONLY valid JSON`;

    const response = await fetch(
      `${GEMINI_API_BASE}/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 2000 },
        }),
      }
    );

    if (!response.ok) {
      console.warn("Semantic chunking API failed, falling back to fixed");
      return fixedChunking(text, opts);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.sections && Array.isArray(parsed.sections)) {
        const chunks: Chunk[] = [];

        for (let i = 0; i < parsed.sections.length; i++) {
          const section = parsed.sections[i];
          const startIdx = Math.max(0, section.start);
          const endIdx = Math.min(text.length, section.end);
          const content = text.slice(startIdx, endIdx).trim();

          if (content.length > 0) {
            chunks.push({
              content: content,
              index: i,
              startChar: startIdx,
              endChar: endIdx,
              tokenCount: estimateTokens(content),
              sectionTitle: section.title,
            });
          }
        }

        if (chunks.length > 0) {
          console.log(`Semantic chunking created ${chunks.length} chunks`);
          return chunks;
        }
      }
    }
  } catch (error) {
    console.error("Semantic chunking error:", error);
  }

  return fixedChunking(text, opts);
}

// =====================================================
// PROPOSITION CHUNKING (Atomic facts)
// =====================================================
async function propositionChunking(
  text: string,
  opts: ChunkingOptions,
  apiKey: string
): Promise<Chunk[]> {
  // First do fixed chunking, then extract propositions from each chunk
  const baseChunks = fixedChunking(text, { ...opts, chunkSize: opts.chunkSize * 2 });
  const allPropositions: Chunk[] = [];
  let propIndex = 0;

  for (const baseChunk of baseChunks) {
    try {
      const prompt = `Extract atomic propositions (single facts) from this text. Each proposition should be a self-contained statement.

TEXT:
${baseChunk.content}

Return JSON array of propositions:
["Proposition 1", "Proposition 2", ...]

Rules:
1. Each proposition should be a single, verifiable fact
2. Include context needed to understand the proposition
3. Keep entity names and specific values
4. Return ONLY the JSON array`;

      const response = await fetch(
        `${GEMINI_API_BASE}/gemini-2.5-pro:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 2000 },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const propositions = JSON.parse(jsonMatch[0]);
          for (const prop of propositions) {
            if (typeof prop === 'string' && prop.trim().length > 0) {
              allPropositions.push({
                content: prop.trim(),
                index: propIndex,
                startChar: baseChunk.startChar,
                endChar: baseChunk.endChar,
                tokenCount: estimateTokens(prop),
              });
              propIndex++;
            }
          }
        }
      }
    } catch (error) {
      console.error("Proposition extraction error:", error);
      // Fall back to adding the base chunk
      allPropositions.push({
        ...baseChunk,
        index: propIndex,
      });
      propIndex++;
    }
  }

  if (allPropositions.length > 0) {
    console.log(`Proposition chunking created ${allPropositions.length} chunks`);
    return allPropositions;
  }

  return fixedChunking(text, opts);
}

// =====================================================
// HIERARCHICAL CHUNKING (Parent-Child)
// =====================================================
async function hierarchicalChunking(
  text: string,
  opts: ChunkingOptions,
  apiKey: string
): Promise<Chunk[]> {
  // Create parent chunks (larger, with summaries) and child chunks (detailed)
  const parentChunks = fixedChunking(text, {
    ...opts,
    chunkSize: opts.chunkSize * 3,
    chunkOverlap: 0,
  });

  const allChunks: Chunk[] = [];
  let childIndex = 0;

  for (let parentIdx = 0; parentIdx < parentChunks.length; parentIdx++) {
    const parent = parentChunks[parentIdx];

    // Generate summary for parent chunk
    let parentSummary = parent.content.substring(0, 500);
    try {
      const prompt = `Summarize this text in 2-3 sentences, capturing the key points:

${parent.content}

Return ONLY the summary, no other text.`;

      const response = await fetch(
        `${GEMINI_API_BASE}/gemini-2.5-pro:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 200 },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (summary) {
          parentSummary = summary.trim();
        }
      }
    } catch (error) {
      console.error("Summary generation error:", error);
    }

    // Add parent chunk (summary)
    allChunks.push({
      content: parentSummary,
      index: allChunks.length,
      startChar: parent.startChar,
      endChar: parent.endChar,
      tokenCount: estimateTokens(parentSummary),
      isParent: true,
    });

    // Create child chunks from parent content
    const childChunks = fixedChunking(parent.content, {
      ...opts,
      chunkSize: opts.chunkSize,
    });

    for (const child of childChunks) {
      allChunks.push({
        content: child.content,
        index: allChunks.length,
        startChar: parent.startChar + child.startChar,
        endChar: parent.startChar + child.endChar,
        tokenCount: child.tokenCount,
        parentIndex: parentIdx,
        isParent: false,
      });
      childIndex++;
    }
  }

  console.log(`Hierarchical chunking created ${allChunks.length} chunks (${parentChunks.length} parents)`);
  return allChunks;
}

// =====================================================
// ENHANCEMENT FUNCTIONS
// =====================================================

function enrichWithContext(chunks: Chunk[], fullText: string): Chunk[] {
  const contextWindow = 200; // Characters of context to add

  return chunks.map((chunk, idx) => {
    const contextBefore = idx > 0
      ? fullText.slice(Math.max(0, chunk.startChar - contextWindow), chunk.startChar).trim()
      : '';

    const contextAfter = idx < chunks.length - 1
      ? fullText.slice(chunk.endChar, Math.min(fullText.length, chunk.endChar + contextWindow)).trim()
      : '';

    return {
      ...chunk,
      metadata: {
        ...chunk.metadata,
        contextBefore: contextBefore || undefined,
        contextAfter: contextAfter || undefined,
      },
    };
  });
}

function extractMetadata(chunks: Chunk[], fullText: string): Chunk[] {
  // Extract section titles from headings
  const headingPattern = /^#+\s+(.+)$|^(.+)\n[=-]+$/gm;
  const headings: { title: string; position: number }[] = [];

  let match;
  while ((match = headingPattern.exec(fullText)) !== null) {
    headings.push({
      title: (match[1] || match[2]).trim(),
      position: match.index,
    });
  }

  return chunks.map((chunk) => {
    // Find the most recent heading before this chunk
    const relevantHeading = headings
      .filter((h) => h.position <= chunk.startChar)
      .pop();

    return {
      ...chunk,
      sectionTitle: chunk.sectionTitle || relevantHeading?.title,
      metadata: {
        ...chunk.metadata,
        sectionTitle: chunk.sectionTitle || relevantHeading?.title,
      },
    };
  });
}

function preserveTableStructure(text: string): string {
  // Mark tables to prevent splitting
  return text.replace(
    /(\|[^\n]+\|[\n\r]+)+/g,
    (match) => `\n<<<TABLE_START>>>\n${match}\n<<<TABLE_END>>>\n`
  );
}

function preserveListStructure(text: string): string {
  // Mark continuous list items
  return text.replace(
    /((?:^[\s]*[-*•]\s+.+$\n?)+)/gm,
    (match) => `\n<<<LIST_START>>>\n${match}\n<<<LIST_END>>>\n`
  );
}

// Clean and normalize text
export function cleanText(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
