/**
 * LlamaParse Integration Module
 * Handles PDF and DOCX parsing via LlamaCloud API
 */

export interface LlamaParseResult {
  text: string;
  metadata?: {
    pages?: number;
    language?: string;
    file_type?: string;
  };
}

export interface LlamaParseOptions {
  resultType?: 'markdown' | 'text';
  language?: string;
  parsingInstruction?: string;
  skipDiagonalText?: boolean;
  invalidateCache?: boolean;
  doNotUnrollColumns?: boolean;
  pageSeperator?: string;
}

const LLAMAPARSE_API_URL = 'https://api.cloud.llamaindex.ai/api/parsing';

/**
 * Check if LlamaParse is available (API key configured)
 */
export function isLlamaParseAvailable(): boolean {
  return !!Deno.env.get('LLAMA_CLOUD_API_KEY');
}

/**
 * Parse a document using LlamaParse
 * Supports PDF, DOCX, DOC, PPTX, XLSX files
 */
export async function parseWithLlamaParse(
  file: File,
  options: LlamaParseOptions = {}
): Promise<LlamaParseResult> {
  const apiKey = Deno.env.get('LLAMA_CLOUD_API_KEY');

  if (!apiKey) {
    throw new Error('LLAMA_CLOUD_API_KEY is not configured');
  }

  const {
    resultType = 'markdown',
    language = 'en',
    parsingInstruction,
    skipDiagonalText = false,
    invalidateCache = false,
    doNotUnrollColumns = false,
    pageSeperator = '\n\n---\n\n',
  } = options;

  // Step 1: Upload the file to LlamaParse
  console.log(`[LlamaParse] Uploading ${file.name} (${file.size} bytes)...`);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('result_type', resultType);
  formData.append('language', language);
  formData.append('skip_diagonal_text', String(skipDiagonalText));
  formData.append('invalidate_cache', String(invalidateCache));
  formData.append('do_not_unroll_columns', String(doNotUnrollColumns));
  formData.append('page_separator', pageSeperator);

  if (parsingInstruction) {
    formData.append('parsing_instruction', parsingInstruction);
  }

  const uploadResponse = await fetch(`${LLAMAPARSE_API_URL}/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`LlamaParse upload failed: ${uploadResponse.status} - ${errorText}`);
  }

  const uploadResult = await uploadResponse.json();
  const jobId = uploadResult.id;

  if (!jobId) {
    throw new Error('LlamaParse did not return a job ID');
  }

  console.log(`[LlamaParse] Job created: ${jobId}`);

  // Step 2: Poll for job completion
  let status = 'PENDING';
  let attempts = 0;
  const maxAttempts = 120; // 2 minutes max (polling every second)

  while (status === 'PENDING' && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const statusResponse = await fetch(`${LLAMAPARSE_API_URL}/job/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      throw new Error(`LlamaParse status check failed: ${statusResponse.status} - ${errorText}`);
    }

    const statusResult = await statusResponse.json();
    status = statusResult.status;

    if (status === 'ERROR') {
      throw new Error(`LlamaParse job failed: ${statusResult.error || 'Unknown error'}`);
    }

    attempts++;

    if (attempts % 10 === 0) {
      console.log(`[LlamaParse] Still processing... (${attempts}s)`);
    }
  }

  if (status !== 'SUCCESS') {
    throw new Error(`LlamaParse job timed out after ${maxAttempts} seconds`);
  }

  console.log(`[LlamaParse] Job completed successfully`);

  // Step 3: Get the result
  const resultResponse = await fetch(`${LLAMAPARSE_API_URL}/job/${jobId}/result/${resultType}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!resultResponse.ok) {
    const errorText = await resultResponse.text();
    throw new Error(`LlamaParse result fetch failed: ${resultResponse.status} - ${errorText}`);
  }

  const resultData = await resultResponse.json();

  // Extract text from result
  let extractedText = '';

  if (resultType === 'markdown') {
    extractedText = resultData.markdown || '';
  } else {
    extractedText = resultData.text || '';
  }

  // If result is an array of pages, join them
  if (Array.isArray(resultData)) {
    extractedText = resultData
      .map((page: { text?: string; markdown?: string }) =>
        resultType === 'markdown' ? page.markdown : page.text
      )
      .filter(Boolean)
      .join(pageSeperator);
  }

  console.log(`[LlamaParse] Extracted ${extractedText.length} characters`);

  return {
    text: extractedText,
    metadata: {
      pages: resultData.pages || resultData.length,
      file_type: file.type || file.name.split('.').pop(),
    },
  };
}

/**
 * Check if a file type is supported by LlamaParse
 */
export function isLlamaParseSupported(fileName: string, mimeType?: string): boolean {
  const supportedExtensions = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls'];
  const lowerName = fileName.toLowerCase();

  return supportedExtensions.some(ext => lowerName.endsWith(ext));
}
