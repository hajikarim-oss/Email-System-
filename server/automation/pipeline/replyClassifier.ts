export type AuditReplyLabel =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'OOO'
  | 'auto_reply'
  | 'unsubscribe'
  | 'hostile'
  | 'other';

export type DbReplyClassification =
  | 'INTERESTED'
  | 'NOT_NOW'
  | 'WRONG_PERSON'
  | 'OOO'
  | 'AUTO_RESPONDER'
  | 'UNSUBSCRIBE'
  | 'NONE';

export interface ReplyClassificationResult {
  auditLabel: AuditReplyLabel;
  dbClassification: DbReplyClassification;
  isInternalOrSupportNoise: boolean;
  reason: string;
}

export function stripHtmlToText(input: string): string {
  if (!input) return '';
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractLatestReplySegment(rawText: string): string {
  const clean = stripHtmlToText(rawText);
  // Strip quoted Gmail / Outlook thread history if present
  const splitMarkers = [
    /\bOn\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|[A-Z][a-z]{2}),?\s+/i,
    /\bFrom:\s+[^\n]+Sent:\s+/i,
    /-----Original Message-----/i,
  ];
  let segment = clean;
  for (const rx of splitMarkers) {
    const idx = segment.search(rx);
    if (idx > 15) {
      segment = segment.slice(0, idx).trim();
    }
  }
  return segment;
}

/**
 * Fix #2: Deterministic filter & classifier for both live Smartlead `EmailEvent` replies
 * and historical `EmailMessage` rows.
 */
export function classifyReplyDeterministic(params: {
  text?: string | null;
  subject?: string | null;
  contactEmail?: string | null;
  brandDomain?: string | null;
}): ReplyClassificationResult {
  const fullText = stripHtmlToText(params.text || '');
  const latestText = extractLatestReplySegment(params.text || '').toLowerCase();
  const fullLower = fullText.toLowerCase();
  const subjectLower = (params.subject || '').toLowerCase().trim();
  const contactLower = (params.contactEmail || '').toLowerCase().trim();
  const domainLower = (
    params.brandDomain ||
    (contactLower.includes('@') ? contactLower.split('@')[1] : '') ||
    ''
  )
    .toLowerCase()
    .trim();

  // 1. Check for Internal / Vendor / KYC / Support / Refund / Personal noise (contaminates historical EmailMessage)
  const noiseDomains = new Set([
    'theboredmonkey.com',
    'theboredmonkey.in',
    'tbmtroop.com',
    'dhl.com',
    'yamm.zendesk.com',
    'importexportindia.org',
    'neosapien.xyz',
    'pgp.isb.edu',
  ]);
  const noiseSubjectOrBodyPatterns = [
    /\bkyc\b/i,
    /unable to upload kyc/i,
    /consignment address/i,
    /vendor registration/i,
    /change ownership of yamm/i,
    /not able to make a payment/i,
    /\bi need refund\b/i,
    /\bi want refund\b/i,
    /your journey with neo 1 begins/i,
    /order #\d+ confirmed/i,
    /linkedin growth experiment/i,
    /gst certificate details/i,
    /nda\s*&\s*agreement/i,
  ];

  if (
    noiseDomains.has(domainLower) ||
    contactLower.startsWith('kyc') ||
    contactLower.startsWith('support@') ||
    noiseSubjectOrBodyPatterns.some((rx) => rx.test(subjectLower) || rx.test(fullLower))
  ) {
    return {
      auditLabel: 'other',
      dbClassification: 'NONE',
      isInternalOrSupportNoise: true,
      reason: 'Internal/KYC/Support/Vendor administrative thread excluded from B2B outreach brain',
    };
  }

  // Empty body check
  if (!latestText || latestText.length < 3) {
    return {
      auditLabel: 'other',
      dbClassification: 'NONE',
      isInternalOrSupportNoise: false,
      reason: 'Empty reply body',
    };
  }

  // 2. Auto-responder / Challenge-Response / Postmaster / Ticket system
  const autoReplyPatterns = [
    /verify that you are a real live human being/i,
    /not a spam source/i,
    /\[#[a-z0-9-]+\]/i,
    /couldn't be delivered/i,
    /recipient unknown/i,
    /delivery status notification/i,
    /\bdsn\b/i,
    /we are working on your email\. our concerned department\/team will revert/i,
    /email confidentiality notice:\s*this email message is for the sole use/i,
  ];
  if (
    contactLower.startsWith('postmaster@') ||
    contactLower.startsWith('customercare@') ||
    contactLower.startsWith('mailer-daemon@') ||
    autoReplyPatterns.some((rx) => rx.test(latestText))
  ) {
    return {
      auditLabel: 'auto_reply',
      dbClassification: 'AUTO_RESPONDER',
      isInternalOrSupportNoise: false,
      reason: 'Automated system / challenge-response / bounce / ticket auto-responder',
    };
  }

  // 3. Out-Of-Office (OOO) / On Leave / Holiday / Business Trip
  const oooPatterns = [
    /\bi am on (?:planned |diwali |personal |sick |long |annual |casual )?leave\b/i,
    /\bi'm on (?:planned |diwali |personal |sick |long |annual |casual )?leave\b/i,
    /\bi’m on (?:planned |diwali |personal |sick |long |annual |casual )?leave\b/i,
    /\bi am currently on (?:personal )?leave\b/i,
    /\bi’m currently on (?:personal )?leave\b/i,
    /\bi'm currently on (?:personal )?leave\b/i,
    /\bout of office\b/i,
    /\bi am ooo\b/i,
    /\bi will be out of office\b/i,
    /\bi am currently away conducting audits\b/i,
    /\bon a (?:work|business) trip with limited (?:internet )?access\b/i,
    /\bi am on a business trip\b/i,
    /\blimited access to (?:my )?(?:emails?|mails)\b/i,
    /\bexpect (?:a )?delay(?:ed)? (?:in )?respon(?:se|e)\b/i,
  ];
  if (oooPatterns.some((rx) => rx.test(latestText))) {
    return {
      auditLabel: 'OOO',
      dbClassification: 'OOO',
      isInternalOrSupportNoise: false,
      reason: 'Out-of-Office / Leave auto-reply',
    };
  }

  // 4. Unsubscribe / Remove me
  const unsubPatterns = [
    /\bunsubscribe\b/i,
    /\bremove me from (?:your )?(?:mailing )?list\b/i,
    /\bstop emailing me\b/i,
    /\bdo not email me\b/i,
    /\opt[\s-]out\b/i,
  ];
  if (unsubPatterns.some((rx) => rx.test(latestText))) {
    return {
      auditLabel: 'unsubscribe',
      dbClassification: 'UNSUBSCRIBE',
      isInternalOrSupportNoise: false,
      reason: 'Explicit unsubscribe request',
    };
  }

  // 5. Hostile / Wrong-company callout
  const hostilePatterns = [
    /put in zero effort to understand what we do/i,
    /do you think i work with/i,
    /stop spamming/i,
    /reported as spam/i,
  ];
  if (hostilePatterns.some((rx) => rx.test(latestText))) {
    return {
      auditLabel: 'hostile',
      dbClassification: 'WRONG_PERSON',
      isInternalOrSupportNoise: false,
      reason: 'Hostile / callout reply',
    };
  }

  // 6. Negative / Not Interested / Wrong Person / Left Company
  const negativePatterns = [
    /\bnot looking for (?:these services|collaborations)\b/i,
    /\bcurrently not looking for\b/i,
    /\bnot interested\b/i,
    /\bno longer associated with\b/i,
    /\bi don['’]t work with\b/i,
    /\bi do not work with\b/i,
    /\bno requirement\b/i,
    /\bpass on this\b/i,
  ];
  if (negativePatterns.some((rx) => rx.test(latestText))) {
    const isWrongPerson =
      /no longer associated with|don['’]t work with|do not work with/i.test(latestText);
    return {
      auditLabel: 'negative',
      dbClassification: isWrongPerson ? 'WRONG_PERSON' : 'NOT_NOW',
      isInternalOrSupportNoise: false,
      reason: isWrongPerson ? 'Wrong person / left company' : 'Polite decline / not looking right now',
    };
  }

  // 7. Neutral / Redirect / Broken link / Clarification question without explicit meeting/deck request
  const neutralPatterns = [
    /please email [a-z0-9._%+-]+@[a-z0-9.-]+\s+for any and all collaboration/i,
    /unable to open the link/i,
    /link not found/i,
    /forwarding from .* outbound workflow/i,
  ];
  if (neutralPatterns.some((rx) => rx.test(latestText))) {
    return {
      auditLabel: 'neutral',
      dbClassification: 'NONE',
      isInternalOrSupportNoise: false,
      reason: 'Neutral redirect or link clarification',
    };
  }

  // 8. Positive / Interested (Requests details, creds deck, call, meeting, shares phone number)
  const positivePatterns = [
    /\bgive me more details\b/i,
    /\bshare (?:more )?details\b/i,
    /\bsend me your creds deck\b/i,
    /\bshare your creds\b/i,
    /\bcan we connect over a call\b/i,
    /\blet['’]?s connect\b/i,
    /\bschedule a (?:\d+-minute )?call\b/i,
    /\bshare your availability\b/i,
    /\bwhen you['’]?re available for a (?:quick )?(?:phone )?call\b/i,
    /\bhere['’]?s my number\b/i,
    /\bmy contact number is\b/i,
    /\blove to explore potential collaboration\b/i,
    /\bopen to hearing about relevant .* campaigns\b/i,
    /\bwould like to discuss this further\b/i,
    /\blet['’]?s have a detailed conversation\b/i,
    /\bblocking \d+ mins for that time\b/i,
    /\bg-meet invite to block our calendars\b/i,
    /\bas discussed, you wanted me to email about the playbook\b/i,
  ];
  if (positivePatterns.some((rx) => rx.test(latestText))) {
    return {
      auditLabel: 'positive',
      dbClassification: 'INTERESTED',
      isInternalOrSupportNoise: false,
      reason: 'Positive prospect interest (call, meeting, creds deck, or details request)',
    };
  }

  return {
    auditLabel: 'other',
    dbClassification: 'NONE',
    isInternalOrSupportNoise: false,
    reason: 'Unclassified general message',
  };
}

