/**
 * POPIA (Protection of Personal Information Act) Compliance Utilities
 *
 * This module provides PII detection, redaction, and compliance tracking
 * for data being sent to external AI APIs.
 *
 * Key POPIA principles enforced:
 * 1. Data minimization - only send necessary data
 * 2. Purpose limitation - data used only for stated purpose
 * 3. Security safeguards - redaction of sensitive information
 * 4. Accountability - audit logging of what was sent
 */

// South African specific PII patterns
const SA_ID_PATTERN = /\b\d{13}\b/g;  // SA ID number (13 digits)
const SA_PASSPORT_PATTERN = /\b[A-Z]\d{8}\b/gi;  // SA Passport
const SA_PHONE_PATTERN = /\b(?:\+27|0)[1-9]\d{8,9}\b/g;  // SA phone numbers
const SA_BANK_ACCOUNT_PATTERN = /\b\d{10,16}\b/g;  // Bank account numbers (contextual)

// General PII patterns
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const CREDIT_CARD_PATTERN = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
const IP_ADDRESS_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const DATE_OF_BIRTH_PATTERN = /\b(?:DOB|Date of Birth|Born|Birth Date)[:\s]*\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b/gi;

// Name patterns (contextual - used with keywords)
const NAME_KEYWORDS = ['name:', 'naam:', 'full name:', 'surname:', 'first name:', 'last name:', 'applicant:', 'client:', 'customer:', 'employee:'];
const ADDRESS_KEYWORDS = ['address:', 'adres:', 'street:', 'road:', 'avenue:', 'postal:', 'physical address:', 'residential:'];

export interface PIIDetectionResult {
  hasPII: boolean;
  detectedTypes: string[];
  matches: PIIMatch[];
  riskLevel: 'none' | 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface PIIMatch {
  type: string;
  pattern: string;
  count: number;
  sample: string;  // Partially masked sample for logging
}

export interface RedactionOptions {
  redactEmails: boolean;
  redactPhones: boolean;
  redactIDNumbers: boolean;
  redactBankAccounts: boolean;
  redactCreditCards: boolean;
  redactAddresses: boolean;
  redactNames: boolean;
  customPatterns?: RegExp[];
  replacementChar?: string;
}

export const DEFAULT_REDACTION_OPTIONS: RedactionOptions = {
  redactEmails: true,
  redactPhones: true,
  redactIDNumbers: true,
  redactBankAccounts: false,  // Too many false positives with numbers
  redactCreditCards: true,
  redactAddresses: false,  // Context-dependent
  redactNames: false,  // Context-dependent
  replacementChar: '*',
};

/**
 * Detect PII in text content
 */
export function detectPII(text: string): PIIDetectionResult {
  const matches: PIIMatch[] = [];
  const detectedTypes: string[] = [];

  // Check SA ID Numbers
  const idMatches = text.match(SA_ID_PATTERN);
  if (idMatches && idMatches.length > 0) {
    // Validate SA ID format (basic Luhn check could be added)
    const validIds = idMatches.filter(id => isValidSAID(id));
    if (validIds.length > 0) {
      matches.push({
        type: 'SA ID Number',
        pattern: 'XXXXXX****XXX',
        count: validIds.length,
        sample: maskPII(validIds[0], 'id'),
      });
      detectedTypes.push('SA ID Number');
    }
  }

  // Check Email Addresses
  const emailMatches = text.match(EMAIL_PATTERN);
  if (emailMatches && emailMatches.length > 0) {
    matches.push({
      type: 'Email Address',
      pattern: 'x***@***.***',
      count: emailMatches.length,
      sample: maskPII(emailMatches[0], 'email'),
    });
    detectedTypes.push('Email Address');
  }

  // Check Phone Numbers
  const phoneMatches = text.match(SA_PHONE_PATTERN);
  if (phoneMatches && phoneMatches.length > 0) {
    matches.push({
      type: 'Phone Number',
      pattern: '+27*****XXXX',
      count: phoneMatches.length,
      sample: maskPII(phoneMatches[0], 'phone'),
    });
    detectedTypes.push('Phone Number');
  }

  // Check Credit Cards
  const ccMatches = text.match(CREDIT_CARD_PATTERN);
  if (ccMatches && ccMatches.length > 0) {
    matches.push({
      type: 'Credit Card',
      pattern: '****-****-****-XXXX',
      count: ccMatches.length,
      sample: maskPII(ccMatches[0], 'credit_card'),
    });
    detectedTypes.push('Credit Card');
  }

  // Check for contextual PII (names, addresses)
  const lowerText = text.toLowerCase();
  const hasNameContext = NAME_KEYWORDS.some(kw => lowerText.includes(kw));
  const hasAddressContext = ADDRESS_KEYWORDS.some(kw => lowerText.includes(kw));

  if (hasNameContext) {
    detectedTypes.push('Potential Name Reference');
  }
  if (hasAddressContext) {
    detectedTypes.push('Potential Address Reference');
  }

  // Check Date of Birth
  const dobMatches = text.match(DATE_OF_BIRTH_PATTERN);
  if (dobMatches && dobMatches.length > 0) {
    matches.push({
      type: 'Date of Birth',
      pattern: 'DOB: **/**/****',
      count: dobMatches.length,
      sample: '[DATE OF BIRTH]',
    });
    detectedTypes.push('Date of Birth');
  }

  // Calculate risk level
  const riskLevel = calculateRiskLevel(detectedTypes, matches);

  // Generate recommendations
  const recommendations = generateRecommendations(detectedTypes, riskLevel);

  return {
    hasPII: detectedTypes.length > 0,
    detectedTypes,
    matches,
    riskLevel,
    recommendations,
  };
}

/**
 * Redact PII from text based on options
 */
export function redactPII(text: string, options: Partial<RedactionOptions> = {}): string {
  const opts = { ...DEFAULT_REDACTION_OPTIONS, ...options };
  let redacted = text;
  const char = opts.replacementChar || '*';

  if (opts.redactIDNumbers) {
    redacted = redacted.replace(SA_ID_PATTERN, (match) => {
      if (isValidSAID(match)) {
        return match.slice(0, 6) + char.repeat(4) + match.slice(10);
      }
      return match;
    });
  }

  if (opts.redactEmails) {
    redacted = redacted.replace(EMAIL_PATTERN, (match) => {
      const [local, domain] = match.split('@');
      return local[0] + char.repeat(Math.min(local.length - 1, 5)) + '@' + char.repeat(3) + '.' + domain.split('.').pop();
    });
  }

  if (opts.redactPhones) {
    redacted = redacted.replace(SA_PHONE_PATTERN, (match) => {
      return match.slice(0, 3) + char.repeat(match.length - 7) + match.slice(-4);
    });
  }

  if (opts.redactCreditCards) {
    redacted = redacted.replace(CREDIT_CARD_PATTERN, (match) => {
      const digits = match.replace(/[-\s]/g, '');
      return char.repeat(12) + digits.slice(-4);
    });
  }

  // Custom patterns
  if (opts.customPatterns) {
    for (const pattern of opts.customPatterns) {
      redacted = redacted.replace(pattern, char.repeat(8));
    }
  }

  return redacted;
}

/**
 * Create a compliance audit log entry
 */
export interface ComplianceAuditEntry {
  timestamp: string;
  action: string;
  dataType: string;
  piiDetected: PIIDetectionResult;
  redactionApplied: boolean;
  dataSentBytes: number;
  destinationService: string;
  purpose: string;
  userConsented: boolean;
}

export function createAuditEntry(
  action: string,
  dataType: string,
  piiResult: PIIDetectionResult,
  redactionApplied: boolean,
  dataSentBytes: number,
  destinationService: string,
  purpose: string,
): ComplianceAuditEntry {
  return {
    timestamp: new Date().toISOString(),
    action,
    dataType,
    piiDetected: piiResult,
    redactionApplied,
    dataSentBytes,
    destinationService,
    purpose,
    userConsented: true,  // Consent assumed through app usage
  };
}

/**
 * Generate a compliance summary for the user
 */
export function generateComplianceSummary(auditEntry: ComplianceAuditEntry): string {
  const lines: string[] = [];

  lines.push(`=== POPIA Compliance Summary ===`);
  lines.push(`Timestamp: ${auditEntry.timestamp}`);
  lines.push(`Action: ${auditEntry.action}`);
  lines.push(`Destination: ${auditEntry.destinationService}`);
  lines.push(`Purpose: ${auditEntry.purpose}`);
  lines.push(`Data Size: ${(auditEntry.dataSentBytes / 1024).toFixed(2)} KB`);

  if (auditEntry.piiDetected.hasPII) {
    lines.push(`\nPII Detected: YES`);
    lines.push(`Risk Level: ${auditEntry.piiDetected.riskLevel.toUpperCase()}`);
    lines.push(`Types Found: ${auditEntry.piiDetected.detectedTypes.join(', ')}`);
    lines.push(`Redaction Applied: ${auditEntry.redactionApplied ? 'YES' : 'NO'}`);

    if (!auditEntry.redactionApplied && auditEntry.piiDetected.riskLevel !== 'none') {
      lines.push(`\n⚠️ WARNING: PII was sent without redaction`);
    }
  } else {
    lines.push(`\nPII Detected: NO`);
  }

  return lines.join('\n');
}

// Helper functions

function isValidSAID(id: string): boolean {
  // Basic SA ID validation
  // Format: YYMMDD SSSS C A Z
  // YY = Year, MM = Month, DD = Day
  // SSSS = Sequence, C = Citizenship, A = Usually 8, Z = Checksum

  if (id.length !== 13) return false;

  const year = parseInt(id.slice(0, 2));
  const month = parseInt(id.slice(2, 4));
  const day = parseInt(id.slice(4, 6));

  // Basic date validation
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Luhn algorithm check
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = parseInt(id[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  return sum % 10 === 0;
}

function maskPII(value: string, type: string): string {
  switch (type) {
    case 'id':
      return value.slice(0, 6) + '****' + value.slice(10);
    case 'email':
      const [local, domain] = value.split('@');
      return local[0] + '***@***.' + domain.split('.').pop();
    case 'phone':
      return value.slice(0, 3) + '*****' + value.slice(-4);
    case 'credit_card':
      return '****-****-****-' + value.replace(/[-\s]/g, '').slice(-4);
    default:
      return '***';
  }
}

function calculateRiskLevel(types: string[], matches: PIIMatch[]): 'none' | 'low' | 'medium' | 'high' {
  if (types.length === 0) return 'none';

  const highRiskTypes = ['SA ID Number', 'Credit Card', 'Bank Account'];
  const mediumRiskTypes = ['Email Address', 'Phone Number', 'Date of Birth'];

  const hasHighRisk = types.some(t => highRiskTypes.includes(t));
  const hasMediumRisk = types.some(t => mediumRiskTypes.includes(t));
  const totalMatches = matches.reduce((sum, m) => sum + m.count, 0);

  if (hasHighRisk || totalMatches > 10) return 'high';
  if (hasMediumRisk || totalMatches > 5) return 'medium';
  return 'low';
}

function generateRecommendations(types: string[], riskLevel: string): string[] {
  const recommendations: string[] = [];

  if (riskLevel === 'high') {
    recommendations.push('Consider enabling PII redaction before sending to external APIs');
    recommendations.push('Review document content for unnecessary personal information');
  }

  if (types.includes('SA ID Number')) {
    recommendations.push('SA ID numbers detected - ensure compliance with POPIA Section 26 (Special Personal Information)');
  }

  if (types.includes('Email Address') || types.includes('Phone Number')) {
    recommendations.push('Contact information detected - verify purpose limitation compliance');
  }

  if (riskLevel !== 'none') {
    recommendations.push('Consider using anonymized or aggregated data where possible');
    recommendations.push('Ensure data retention policies are followed');
  }

  return recommendations;
}

/**
 * Prepare text for API call with POPIA compliance
 * Returns the processed text and compliance metadata
 */
export interface PreparedDataResult {
  text: string;
  originalLength: number;
  processedLength: number;
  piiDetection: PIIDetectionResult;
  wasRedacted: boolean;
  auditEntry: ComplianceAuditEntry;
}

export function prepareForAPICall(
  text: string,
  options: {
    enableRedaction: boolean;
    redactionOptions?: Partial<RedactionOptions>;
    purpose: string;
    destinationService: string;
  }
): PreparedDataResult {
  const originalLength = text.length;

  // Detect PII
  const piiDetection = detectPII(text);

  // Apply redaction if enabled and PII detected
  let processedText = text;
  let wasRedacted = false;

  if (options.enableRedaction && piiDetection.hasPII) {
    processedText = redactPII(text, options.redactionOptions);
    wasRedacted = true;
  }

  // Create audit entry
  const auditEntry = createAuditEntry(
    'API_CALL',
    'document_text',
    piiDetection,
    wasRedacted,
    processedText.length,
    options.destinationService,
    options.purpose,
  );

  return {
    text: processedText,
    originalLength,
    processedLength: processedText.length,
    piiDetection,
    wasRedacted,
    auditEntry,
  };
}
