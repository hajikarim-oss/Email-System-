import {
  getBrainFlags,
  loadBannedPhrases,
  loadBrandAcronyms,
  loadSanctionedLinks,
} from './config';

export interface ValidationIssue {
  code: string;
  field: 'subject' | 'body' | 'step';
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  wordCount: number;
  extractedNumbers: string[];
  extractedUrls: string[];
}

export interface ValidateDraftInput {
  subject: string;
  body: string;
  stepNumber: number; // 1, 2, or 3
  allowedProofPointMetrics?: Record<string, any>;
  strictOverride?: boolean;
  leadCategoryKey?: string;
  proofPointClientName?: string | null;
  proofPointCategories?: string[];
  hookSignal?: string | null;
  // Track 0 (T0-3): true when the lead is a free-mail address with no brand data,
  // so brand personalization ({{company}}, scraped signals) cannot safely resolve.
  leadIsFreeMailNoBrand?: boolean;
  // Track 0 (T0-2): send-time strict gate: blocks unresolved literal {{...}} variables at dispatch
  isSendTime?: boolean;
}

// Track 0 (T0-4): generic / vague client references that violate the proof
// specificity floor ("our F&B clients", "a beauty brand", "several brands").
const GENERIC_CLIENT_NAME =
  /\b(?:our|a|an|some|several|multiple|various|many)\b[^.]*\b(?:client|clients|brand|brands|company|companies|customer|customers)\b/i;

/**
 * Extracts numbers, currency figures, percentages, and multiples (e.g. "15%", "100M+", "₹1.5 Cr", "6x", "4,000+")
 */
export function extractNumericClaims(text: string): string[] {
  const matches = text.match(
    /(?:₹|\$)?\b\d+(?:[.,]\d+)?(?:\s*(?:Cr|Lakh|M|K|x|%))?\+?\b/gi
  );
  if (!matches) return [];
  // Filter out tiny common single digits like "1", "2", "3" if used in conversational steps
  return Array.from(new Set(matches.map((m) => m.trim())));
}

/**
 * Extracts URLs from body text, stripping trailing sentence punctuation.
 */
export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi);
  if (!matches) return [];
  return Array.from(new Set(matches.map((u) => u.replace(/[.,;:)]+$/, '').trim())));
}

/**
 * Computes word count stripping HTML tags and normalized whitespace
 */
export function countWords(text: string): number {
  const clean = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\{\{[^}]+\}\}/g, 'PLACEHOLDER')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 0;
  return clean.split(' ').length;
}

/**
 * Deterministic TypeScript validator (Fix #1 / Principle 5 & 6).
 * Code validates every fact, URL, syntax, and word count.
 */
export function validateEmailDraft(input: ValidateDraftInput): ValidationResult {
  const { subject, body, stepNumber, allowedProofPointMetrics = {} } = input;
  const flags = getBrainFlags();
  const isStrict =
    input.strictOverride !== undefined ? input.strictOverride : flags.VALIDATOR_STRICT;

  const issues: ValidationIssue[] = [];
  const fullText = `${subject} ${body}`;

  // 0. Subject Word Count Gate (Fix Problem 3: Max 7 words)
  const subjectWords = countWords(subject);
  if (subjectWords > 7) {
    issues.push({
      code: 'SUBJECT_EXCEEDS_WORD_COUNT',
      field: 'subject',
      message: `Subject exceeds 7 words (${subjectWords} words): "${subject}"`,
      severity: isStrict ? 'ERROR' : 'WARNING',
    });
  }

  // 1. Syntax Check: Variable Preservation
  const requiredTags = ['{{firstName}}', '{{company}}'];
  const brokenTagPattern = /\{\{(?!\s*(?:firstName|company|First Name|Company)\s*\}\})[^}]+\}\}/g;
  const unclosedTagPattern = /\{[^{]|(?<!\{)\{firstName\}|(?<!\{)\{company\}/;

  if (stepNumber === 1 && !input.isSendTime) {
    if (!body.includes('{{firstName}}') && !body.includes('{{First Name}}')) {
      issues.push({
        code: 'MISSING_FIRST_NAME_TAG',
        field: 'body',
        message: 'Step 1 email must include {{firstName}} placeholder.',
        severity: 'ERROR',
      });
    }
  }

  const brokenMatches = fullText.match(brokenTagPattern);
  if (brokenMatches) {
    issues.push({
      code: 'INVALID_VARIABLE_SYNTAX',
      field: 'body',
      message: `Invalid template variable syntax found: ${brokenMatches.join(', ')}`,
      severity: 'ERROR',
    });
  }

  // 2. Word Count Gates
  const wordCount = countWords(body);
  const maxWords = stepNumber === 1 ? 150 : 80;
  if (wordCount > maxWords) {
    issues.push({
      code: 'EXCEEDED_WORD_COUNT',
      field: 'body',
      message: `Step ${stepNumber} body word count (${wordCount}) exceeds maximum limit (${maxWords} words).`,
      severity: 'ERROR',
    });
  }

  // 3. Banned Phrases Gate
  const bannedList = loadBannedPhrases();
  const bodyLower = body.toLowerCase();
  for (const phrase of bannedList) {
    if (bodyLower.includes(phrase)) {
      issues.push({
        code: 'BANNED_PHRASE_DETECTED',
        field: 'body',
        message: `Body contains prohibited marketing phrase: "${phrase}".`,
        severity: 'ERROR',
      });
    }
  }

  // 4. Sanctioned Links Gate
  const { allowedDomains, sanctionedLinks } = loadSanctionedLinks();
  const extractedUrls = extractUrls(body);
  for (const urlStr of extractedUrls) {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (!allowedDomains.has(host) && !allowedDomains.has(parsed.hostname.toLowerCase())) {
        issues.push({
          code: 'UNSANCTIONED_LINK_DOMAIN',
          field: 'body',
          message: `Disallowed link domain detected: ${parsed.hostname}`,
          severity: 'ERROR',
        });
      }
    } catch {
      issues.push({
        code: 'MALFORMED_URL',
        field: 'body',
        message: `Malformed URL in draft body: ${urlStr}`,
        severity: 'ERROR',
      });
    }
  }

  // 5. Numeric Claims Verification
  const extractedNumbers = extractNumericClaims(body);
  const allowedValuesSet = new Set<string>();

  // Extract all string and numeric representations from allowed metrics
  function collectAllowedValues(obj: any) {
    if (!obj) return;
    for (const val of Object.values(obj)) {
      if (typeof val === 'string' || typeof val === 'number') {
        allowedValuesSet.add(String(val).toLowerCase().trim());
        const extracted = extractNumericClaims(String(val));
        for (const num of extracted) allowedValuesSet.add(num.toLowerCase().trim());
      } else if (typeof val === 'object') {
        collectAllowedValues(val);
      }
    }
  }
  collectAllowedValues(allowedProofPointMetrics);

  // Common conversational numbers permitted (e.g. "90-second", "2-page", "3-5 options", agency network "4,000+")
  const standardPermittedNumbers = new Set([
    '1',
    '2',
    '3',
    '4',
    '5',
    '10',
    '15',
    '20',
    '30',
    '90',
    '4,000',
    '4000',
    '4,000+',
    '4000+',
    '3-5',
  ]);

  for (const num of extractedNumbers) {
    const norm = num.toLowerCase().trim();
    const isPermitted = standardPermittedNumbers.has(norm) || allowedValuesSet.has(norm);

    if (!isPermitted) {
      if (isStrict) {
        issues.push({
          code: 'UNVERIFIED_NUMERIC_CLAIM',
          field: 'body',
          message: `Unverified numeric claim "${num}" not found in attached ProofPoint metrics.`,
          severity: 'ERROR',
        });
      } else {
        issues.push({
          code: 'UNVERIFIED_NUMERIC_CLAIM_WARN',
          field: 'body',
          message: `[STRICT=false warning] Numeric claim "${num}" not in ProofPoint allowlist.`,
          severity: 'WARNING',
        });
      }
    }
  }

  // 6. Formatting & Aggression Check
  if (/!{2,}/.test(fullText)) {
    issues.push({
      code: 'MULTIPLE_EXCLAMATION_MARKS',
      field: 'body',
      message: 'Draft contains excessive exclamation marks.',
      severity: 'ERROR',
    });
  }

  // 7. High-Friction CTA Gate (Fix Problem 1: Zero Meeting Asks in Step 1/2)
  const highFrictionPattern = /\b(?:google meet|15[- ]minute(?:s)?|20[- ]minute(?:s)?|30[- ]minute(?:s)?|quick call|schedule a call|hop on a call|free for a call|book a call|calendar link)\b/i;
  if (highFrictionPattern.test(body)) {
    issues.push({
      code: 'HIGH_FRICTION_CTA_DETECTED',
      field: 'body',
      message: 'High-friction meeting ask detected in body. System mandates zero-friction permission ask.',
      severity: 'ERROR',
    });
  }

  // 8. Proof Point Category Alignment Gate (Fix Problem 2: Hard Category Match)
  if (input.leadCategoryKey && input.proofPointCategories && input.proofPointCategories.length > 0) {
    const superMap: Record<string, string[]> = {
      luggage_travel: ['luggage_travel', 'travel'],
      food_beverages: ['food_beverages', 'fmcg'],
      fashion_apparel: ['fashion_apparel', 'apparel', 'fashion'],
      beauty_personal_care: ['beauty_personal_care', 'personal_care', 'cosmetics'],
      fitness_wellness: ['fitness_wellness', 'wellness', 'health'],
      healthcare_pharma: ['healthcare_pharma', 'health', 'pharma'],
      consumer_tech: ['consumer_tech', 'tech', 'electronics'],
      ecommerce_retail: ['ecommerce_retail', 'retail'],
      jewelry_accessories: ['jewelry_accessories', 'accessories'],
    };
    const allowed = new Set([
      input.leadCategoryKey,
      ...(superMap[input.leadCategoryKey] || []),
      'consumer_brand'
    ]);
    const matchesCategory = input.proofPointCategories.some((c) => allowed.has(c));
    if (!matchesCategory) {
      issues.push({
        code: 'PROOF_CATEGORY_MISMATCH',
        field: 'body',
        message: `Proof point "${input.proofPointClientName || 'Unknown'}" categories (${input.proofPointCategories.join(', ')}) do not match lead category "${input.leadCategoryKey}".`,
        severity: 'ERROR',
      });
    }
  }

  // 9. Research Hook Signal Usage Check (Fix Problem 4: Signal Grounding)
  if (stepNumber === 1 && input.hookSignal) {
    const signalKeywords = input.hookSignal
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const bodyLower = body.toLowerCase();
    const used = signalKeywords.some((k) => bodyLower.includes(k));
    if (!used && signalKeywords.length > 0) {
      issues.push({
        code: 'HOOK_SIGNAL_NOT_USED',
        field: 'body',
        message: `Scraped research signal keywords not found in Step 1 copy: "${input.hookSignal.slice(0, 60)}..."`,
        severity: 'WARNING',
      });
    }
  }

  // 10. Proof Specificity Floor (Track 0 / T0-4): named client required, no vague refs.
  if (input.proofPointClientName && GENERIC_CLIENT_NAME.test(input.proofPointClientName)) {
    issues.push({
      code: 'PROOF_GENERIC_CLIENT',
      field: 'body',
      message: `Proof client name is generic/vague ("${input.proofPointClientName}"). A named client is required.`,
      severity: 'ERROR',
    });
  }

  // 11. Free-mail Re-engagement Guard (Track 0 / T0-3): block brand personalization
  //     for a free-mail lead with no brand data (prevents fabricated signals like
  //     "your focus on {{company}}" reaching a lead that has no company to resolve).
  if (input.leadIsFreeMailNoBrand) {
    const refsBrand =
      body.includes('{{company}}') ||
      body.includes('{{Company}}') ||
      Boolean(input.hookSignal && input.hookSignal.trim().length > 0);
    if (refsBrand) {
      issues.push({
        code: 'REENGAGE_NO_BRAND',
        field: 'body',
        message:
          'Free-mail lead with no brand data cannot carry brand personalization ({{company}} / scraped signal). Draft withheld.',
        severity: 'ERROR',
      });
    }
  }

  // 12. Send-Time Unresolved Variable Gate (Track 0 / T0-2):
  //     Any unresolved literal {{variable}} in the subject or body at dispatch time
  //     is a catastrophic personalization failure and must be hard-blocked.
  if (input.isSendTime) {
    const unmergedTags = fullText.match(/\{\{[^}]+\}\}/g);
    if (unmergedTags && unmergedTags.length > 0) {
      const distinct = Array.from(new Set(unmergedTags));
      issues.push({
        code: 'UNRESOLVED_TEMPLATE_VARIABLE',
        field: 'body',
        message: `Unresolved template variable(s) detected at send time: ${distinct.join(', ')}. Dispatch blocked.`,
        severity: 'ERROR',
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === 'ERROR');

  return {
    valid: !hasErrors,
    issues,
    wordCount,
    extractedNumbers,
    extractedUrls,
  };
}

/**
 * Deterministic Send-Time Validator (T0-2)
 * Call immediately before handing an email payload to Smartlead dispatch.
 */
export function validateSendTimeDraft(subject: string, body: string): ValidationResult {
  return validateEmailDraft({
    subject,
    body,
    stepNumber: 1,
    isSendTime: true,
  });
}
