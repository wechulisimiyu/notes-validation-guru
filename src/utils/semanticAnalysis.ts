import { Groq } from "groq-sdk";

let groqClient: Groq | null = null;
let modelLoadAttempted = false;

export const initializeGroqClient = async () => {
  if (!groqClient && !modelLoadAttempted) {
    try {
      modelLoadAttempted = true;
      const apiKey = process.env.GROQ_API_KEY || "";

      if (!apiKey) {
        console.warn("GROQ_API_KEY not found in environment variables");
        return null;
      }

      groqClient = new Groq({ apiKey });
      return groqClient;
    } catch (error) {
      console.error("Failed to initialize Groq client:", error);
      return null;
    }
  }
  return groqClient;
};

export const analyzeMedicalText = async (
  notes: string,
  requiredElement: string
): Promise<{ hasContent: boolean; matchedText: string | null }> => {
  try {
    const client = await initializeGroqClient();
    if (!client) {
      return fallbackAnalysis(notes, requiredElement);
    }

    const prompt = `
    You are an AI assistant helping to analyze medical notes. 
    Extract information related to "${requiredElement}" from the following clinical notes.
    If the information is present, respond with "YES: [extracted text]"
    If the information is missing, respond with "NO"
    
    Clinical notes:
    ${notes}
    `;

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are a specialized medical text analyzer. Answer with just YES or NO followed by the extracted content.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 300,
      temperature: 0.1,
    });

    const answer = response.choices[0]?.message?.content || "";

    if (answer.startsWith("YES:")) {
      const extractedText = answer.substring(4).trim();
      return { hasContent: true, matchedText: extractedText };
    } else {
      return { hasContent: false, matchedText: null };
    }
  } catch (error) {
    console.error("Error using Groq API:", error);
    return fallbackAnalysis(notes, requiredElement);
  }
};

const fallbackAnalysis = (
  notes: string,
  requiredElement: string
): { hasContent: boolean; matchedText: string | null } => {
  const hasMatch =
    findContextualMatch(notes, requiredElement) ||
    containsKeywords(notes, requiredElement);

  if (hasMatch) {
    const textSnippet = extractTextSnippet(notes, requiredElement);
    return { hasContent: true, matchedText: textSnippet };
  }

  return { hasContent: false, matchedText: null };
};

const containsKeywords = (text: string, element: string): boolean => {
  const keywords = element.toLowerCase().split(" ");
  const textLower = text.toLowerCase();

  const matchCount = keywords.filter((word) => textLower.includes(word)).length;
  return matchCount >= Math.ceil(keywords.length / 2);
};

const medicalContexts = {
  "Chief complaint": {
    patterns: [
      "presents with",
      "complains of",
      "came in for",
      "reports",
      "experiencing",
    ],
    contextClues: ["symptoms", "since", "started", "ago"],
  },
  "History of present illness": {
    patterns: ["started", "began", "developed", "progression", "course"],
    contextClues: [
      "days ago",
      "weeks ago",
      "gradually",
      "suddenly",
      "previously",
    ],
  },
  "Past medical history": {
    patterns: ["history of", "diagnosed with", "previous", "chronic", "known"],
    contextClues: ["condition", "surgery", "treatment", "managed with"],
  },
  "Current medications": {
    patterns: [
      "taking",
      "prescribed",
      "medications include",
      "daily",
      "current medications",
    ],
    contextClues: ["mg", "dose", "tablet", "capsule"],
  },
  Allergies: {
    patterns: ["allergic to", "allergies", "reactions", "sensitivity"],
    contextClues: [
      "medication allergy",
      "food allergy",
      "NKDA",
      "NKFDA",
      "intolerance",
    ],
  },
  "Physical examination findings": {
    patterns: ["examination reveals", "observed", "auscultation", "palpation"],
    contextClues: ["normal", "present", "absent", "bilateral"],
  },
  "Vital signs": {
    patterns: ["BP", "HR", "RR", "temperature", "SpO2"],
    contextClues: ["mmHg", "bpm", "/min", "degrees", "%"],
  },
};

const findContextualMatch = (text: string, section: string): boolean => {
  const context = medicalContexts[section as keyof typeof medicalContexts];
  if (!context) return false;

  const textLower = text.toLowerCase();

  const hasPattern = context.patterns.some((pattern) =>
    textLower.includes(pattern.toLowerCase())
  );

  const hasContextClues = context.contextClues.some((clue) =>
    textLower.includes(clue.toLowerCase())
  );

  if (section === "Vital signs") {
    const hasNumericValues =
      /\d+/.test(textLower) &&
      (textLower.includes("bp") ||
        textLower.includes("hr") ||
        textLower.includes("temp") ||
        textLower.includes("rr"));
    return hasNumericValues || (hasPattern && hasContextClues);
  }

  return hasPattern || (hasContextClues && textLower.length > 50);
};

const extractTextSnippet = (notes: string, requiredElement: string): string => {
  const context =
    medicalContexts[requiredElement as keyof typeof medicalContexts];
  if (!context) return "Content detected (no specific text extracted)";

  const sentences = notes.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const textLower = notes.toLowerCase();

  const relevantSentences: string[] = [];

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();

    const hasPattern = context.patterns.some((pattern) =>
      sentenceLower.includes(pattern.toLowerCase())
    );

    const hasClue = context.contextClues.some((clue) =>
      sentenceLower.includes(clue.toLowerCase())
    );

    if (hasPattern || hasClue) {
      relevantSentences.push(sentence.trim());
    }
  }

  if (requiredElement === "Vital signs") {
    const vitalSignRegex =
      /(?:BP|HR|RR|temp|temperature|pulse|respiration|SpO2|O2 sat)[:\s-]+\d+(?:[/.]?\d+)?(?:\s*(?:mmHg|bpm|%|°[CF]|C|F))?/gi;
    const vitalMatches = notes.match(vitalSignRegex) || [];

    if (vitalMatches.length > 0) {
      return vitalMatches.join("; ");
    }
  }

  if (relevantSentences.length > 0) {
    if (relevantSentences.length > 3) {
      return relevantSentences.slice(0, 3).join(". ") + "...";
    }
    return relevantSentences.join(". ");
  }

  const keywords = requiredElement.toLowerCase().split(" ");

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    for (const keyword of keywords) {
      if (sentenceLower.includes(keyword) && sentence.length < 200) {
        return sentence.trim();
      }
    }
  }

  return "Content detected (no specific text extracted)";
};
