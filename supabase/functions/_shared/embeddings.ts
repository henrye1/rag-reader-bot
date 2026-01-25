// Embedding generation using Gemini text-embedding-004

export interface EmbeddingResult {
  embedding: number[];
}

// Generate embedding for a single text (document content)
export async function generateEmbedding(
  text: string,
  apiKey: string
): Promise<EmbeddingResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: {
          parts: [{ text }],
        },
        taskType: 'RETRIEVAL_DOCUMENT',
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${error}`);
  }

  const data = await response.json();
  return {
    embedding: data.embedding.values,
  };
}

// Generate embedding optimized for queries
export async function generateQueryEmbedding(
  query: string,
  apiKey: string
): Promise<EmbeddingResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: {
          parts: [{ text: query }],
        },
        taskType: 'RETRIEVAL_QUERY',
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Query embedding API error: ${error}`);
  }

  const data = await response.json();
  return {
    embedding: data.embedding.values,
  };
}

// Batch embedding for efficiency (up to 100 texts per call)
export async function generateEmbeddingsBatch(
  texts: string[],
  apiKey: string
): Promise<EmbeddingResult[]> {
  if (texts.length === 0) {
    return [];
  }

  // Gemini batch limit is 100
  if (texts.length > 100) {
    // Process in batches of 100
    const results: EmbeddingResult[] = [];
    for (let i = 0; i < texts.length; i += 100) {
      const batch = texts.slice(i, i + 100);
      const batchResults = await generateEmbeddingsBatch(batch, apiKey);
      results.push(...batchResults);
    }
    return results;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: 'models/text-embedding-004',
          content: {
            parts: [{ text }],
          },
          taskType: 'RETRIEVAL_DOCUMENT',
        })),
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Batch embedding API error: ${error}`);
  }

  const data = await response.json();
  return data.embeddings.map((e: { values: number[] }) => ({
    embedding: e.values,
  }));
}
