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

const identifySoapSections = (notes: string): Record<string, string> => {
  const sections: Record<string, string> = {
    S: "",
    O: "",
    A: "",
    P: "",
  };

  // Look for explicit section headers
  const subjectivePatterns = [
    /^subjective:?/im,
    /^history:?/im,
    /^hpi:?/im,
    /^s:?/im,
  ];
  const objectivePatterns = [
    /^objective:?/im,
    /^physical exam:?/im,
    /^findings:?/im,
    /^o:?/im,
  ];
  const assessmentPatterns = [/^assessment:?/im, /^impression:?/im, /^a:?/im];
  const planPatterns = [
    /^plan:?/im,
    /^treatment:?/im,
    /^recommendations:?/im,
    /^p:?/im,
  ];

  // Split the notes into lines to process section by section
  const lines = notes.split('\n');
  let currentSection: 'S' | 'O' | 'A' | 'P' | null = null;
  
  for (const line of lines) {
    // Determine if line is a section header
    if (subjectivePatterns.some(pattern => pattern.test(line))) {
      currentSection = 'S';
      continue;
    } else if (objectivePatterns.some(pattern => pattern.test(line))) {
      currentSection = 'O';
      continue;
    } else if (assessmentPatterns.some(pattern => pattern.test(line))) {
      currentSection = 'A';
      continue;
    } else if (planPatterns.some(pattern => pattern.test(line))) {
      currentSection = 'P';
      continue;
    }
    
    // Add content to the current section
    if (currentSection) {
      sections[currentSection] += line + '\n';
    } else {
      // If no section has been identified yet, default to Subjective
      sections['S'] += line + '\n';
    }
  }
  
  // If no explicit sections were found, attempt to infer sections
  if (!sections.S && !sections.O && !sections.A && !sections.P) {
    return inferSoapSections(notes);
  }

  return sections;
};

// Helper function to infer SOAP sections when no explicit headers are present
const inferSoapSections = (notes: string): Record<string, string> => {
  const sections: Record<string, string> = {
    S: "",
    O: "",
    A: "",
    P: "",
  };
  
  const lines = notes.split('\n');
  const totalLines = lines.length;
  
  // Simple heuristic: divide the note into approximately equal parts
  // with more weight given to S and O sections
  const sEndIndex = Math.floor(totalLines * 0.35);
  const oEndIndex = Math.floor(totalLines * 0.7);
  const aEndIndex = Math.floor(totalLines * 0.85);
  
  for (let i = 0; i < totalLines; i++) {
    if (i < sEndIndex) {
      sections.S += lines[i] + '\n';
    } else if (i < oEndIndex) {
      sections.O += lines[i] + '\n';
    } else if (i < aEndIndex) {
      sections.A += lines[i] + '\n';
    } else {
      sections.P += lines[i] + '\n';
    }
  }
  
  return sections;
};

export const analyzeMedicalText = async (
  notes: string,
  requiredElement: string
): Promise<{
  hasContent: boolean;
  matchedText: string | null;
  soapSection?: string;
}> => {
  try {
    // First identify SOAP sections
    const soapSections = identifySoapSections(notes);
    
    // Then use the appropriate section for the required element
    const relevantSection = medicalContexts[requiredElement as keyof typeof medicalContexts]?.soapSection;
    const sectionText = relevantSection ? soapSections[relevantSection] : "";
    
    // Prioritize searching in the relevant section if available, otherwise use the full notes
    const textToAnalyze = sectionText ? sectionText : notes;
    
    const client = await initializeGroqClient();
    if (!client) {
      return fallbackAnalysis(textToAnalyze, requiredElement, relevantSection);
    }

    const prompt = `
    You are an AI assistant helping to analyze medical notes using the SOAP format.
    Extract information related to "${requiredElement}" from the following clinical notes.
    Consider that this element would typically appear in the ${
      relevantSection || "unknown"
    } section of SOAP notes.
    If the information is present, respond with "YES: [extracted text]"
    If the information is missing, respond with "NO"
    
    Clinical notes:
    ${textToAnalyze}
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
      return { 
        hasContent: true, 
        matchedText: extractedText,
        soapSection: relevantSection
      };
    } else {
      return { 
        hasContent: false, 
        matchedText: null,
        soapSection: relevantSection 
      };
    }
  } catch (error) {
    console.error("Error using Groq API:", error);
    return fallbackAnalysis(notes, requiredElement);
  }
};

const fallbackAnalysis = (
  notes: string,
  requiredElement: string,
  soapSection?: string
): { hasContent: boolean; matchedText: string | null; soapSection?: string } => {
  const hasMatch =
    findContextualMatch(notes, requiredElement) ||
    containsKeywords(notes, requiredElement);

  if (hasMatch) {
    const textSnippet = extractTextSnippet(notes, requiredElement);
    return { hasContent: true, matchedText: textSnippet, soapSection };
  }

  return { hasContent: false, matchedText: null, soapSection };
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
      "CC:",
    ],
    contextClues: ["symptoms", "since", "started", "ago"],
    soapSection: "S",
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
    soapSection: "S",
  },
  "Past medical history": {
    patterns: ["history of", "diagnosed with", "previous", "chronic", "known"],
    contextClues: ["condition", "surgery", "treatment", "managed with"],
    soapSection: "S",
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
    soapSection: "S",
  },
  "Allergies": {
    patterns: ["allergic to", "allergies", "reactions", "sensitivity"],
    contextClues: [
      "medication allergy",
      "food allergy",
      "NKDA",
      "NKFDA",
      "intolerance",
    ],
    soapSection: "S",
  },
  "Physical examination findings": {
    patterns: ["examination reveals", "observed", "auscultation", "palpation"],
    contextClues: ["normal", "present", "absent", "bilateral"],
    soapSection: "O",
  },
  "Vital signs": {
    patterns: [
      "vitals",
      "vital signs",
      "VS:",
      "BP",
      "HR",
      "RR",
      "T:",
      "temp",
      "temperature",
      "pulse ox",
    ],
    contextClues: ["mmHg", "bpm", "°C", "°F", "%", "oxygen saturation"],
    soapSection: "O",
    regex:
      /(?:BP|HR|RR|temp|temperature|pulse|respiration|SpO2|O2 sat)[:\s-]+\d+(?:[/.]?\d+)?(?:\s*(?:mmHg|bpm|%|°[CF]|C|F))?/gi,
  },
  "Lab results": {
    patterns: ["lab", "laboratory", "results", "test", "value"],
    contextClues: ["elevated", "normal", "abnormal", "within range", "high", "low"],
    soapSection: "O",
  },
  "Diagnosis": {
    patterns: [
      "assessment:",
      "impression:",
      "diagnosis:",
      "diagnoses:",
      "A:",
      "dx:",
      "assessment and plan:",
    ],
    contextClues: [
      "likely",
      "consistent with",
      "rule out",
      "differential",
      "probable",
    ],
    soapSection: "A",
  },
  "Treatment plan": {
    patterns: [
      "plan:",
      "P:",
      "will",
      "prescribe",
      "recommended",
      "advised",
      "treatment:",
    ],
    contextClues: [
      "follow up",
      "refer",
      "mg",
      "daily",
      "continue",
      "start",
      "stop",
    ],
    soapSection: "P",
  },
  "Follow-up instructions": {
    patterns: [
      "follow up",
      "return",
      "schedule",
      "appointment",
      "check back",
    ],
    contextClues: [
      "weeks",
      "days",
      "months",
      "if symptoms",
      "as needed",
    ],
    soapSection: "P",
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
