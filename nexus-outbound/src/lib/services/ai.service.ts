import OpenAI from "openai";
import type { Sentiment } from "@prisma/client";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function classifySentiment(replyText: string): Promise<{ sentiment: Sentiment; confidence: number }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            'Classify cold email reply as INTERESTED, NOT_INTERESTED, or WRONG_PERSON. Return JSON: {"sentiment": "INTERESTED|NOT_INTERESTED|WRONG_PERSON", "confidence": 0.95}',
        },
        { role: "user", content: replyText },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    return {
      sentiment: (parsed.sentiment as Sentiment) || "INTERESTED",
      confidence: parsed.confidence || 0.85,
    };
  } catch (error) {
    console.error("OpenAI classification error:", error);
    throw error;
  }
}

export async function generateDraftReply(params: {
  originalSubject: string;
  originalBody: string;
  leadReply: string;
  leadName?: string;
}): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert sales assistant. Write a short, friendly, professional reply acknowledging the lead's response and proposing clear next steps.",
        },
        {
          role: "user",
          content: `Original Outreach Subject: ${params.originalSubject}\nOriginal Outreach Body: ${params.originalBody}\n\nLead's Reply: ${params.leadReply}`,
        },
      ],
      max_tokens: 300,
    });

    return response.choices[0].message.content || "";
  } catch (error) {
    console.error("OpenAI draft generation error:", error);
    throw error;
  }
}
