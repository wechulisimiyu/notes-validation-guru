import { pipeline } from "@huggingface/transformers";

let embeddingModel: any = null;
let modelLoadAttempted = false;

export const initializeModel = async () => {
  if (!embeddingModel && !modelLoadAttempted) {
    try {
      modelLoadAttempted = true;
      embeddingModel = await pipeline(
        "feature-extraction",
        "mixedbread-ai/mxbai-embed-xsmall-v1",
        { device: "wasm" } // Use WebAssembly instead of CPU
      );
      return embeddingModel;
    } catch (error) {
      console.error("Failed to load embedding model:", error);
      return null;
    }
  }
  return embeddingModel;
};

export const computeEmbedding = async (text: string) => {
  try {
    const model = await initializeModel();
    if (!model) {
      return Array(384)
        .fill(0)
        .map(() => Math.random() * 2 - 1);
    }
    const embedding = await model(text, { pooling: "mean", normalize: true });
    return embedding.tolist()[0];
  } catch (error) {
    console.error("Error computing embedding:", error);
    return Array(384)
      .fill(0)
      .map(() => Math.random() * 2 - 1);
  }
};

export const cosineSimilarity = (a: number[], b: number[]): number => {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
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

export const findSimilarContent = async (
  notes: string,
  requiredElement: string
) => {
  try {
    const model = await initializeModel();

    const hasContextMatch = findContextualMatch(notes, requiredElement);
    if (hasContextMatch) return true;

    if (model) {
      const notesEmbedding = await computeEmbedding(notes);
      const elementEmbedding = await computeEmbedding(requiredElement);

      const similarity = cosineSimilarity(notesEmbedding, elementEmbedding);
      return similarity > 0.5;
    }

    return containsKeywords(notes, requiredElement);
  } catch (error) {
    console.error("Error in findSimilarContent:", error);
    return (
      findContextualMatch(notes, requiredElement) ||
      containsKeywords(notes, requiredElement)
    );
  }
};

export const findMatchingText = async (
  notes: string,
  requiredElement: string
): Promise<{ hasContent: boolean; matchedText: string | null }> => {
  try {
    const model = await initializeModel();
    const context =
      medicalContexts[requiredElement as keyof typeof medicalContexts];

    // First check if we have a contextual match
    const hasContextMatch = findContextualMatch(notes, requiredElement);

    if (hasContextMatch) {
      // Try to extract the most relevant text snippet
      const textSnippet = extractTextSnippet(notes, requiredElement);
      return { hasContent: true, matchedText: textSnippet };
    }

    // If we have an embedding model, use semantic similarity
    if (model) {
      const notesEmbedding = await computeEmbedding(notes);
      const elementEmbedding = await computeEmbedding(requiredElement);
      const similarity = cosineSimilarity(notesEmbedding, elementEmbedding);

      if (similarity > 0.5) {
        const textSnippet = extractTextSnippet(notes, requiredElement);
        return { hasContent: true, matchedText: textSnippet };
      }
    }

    // Fall back to keyword matching
    const keywordMatch = containsKeywords(notes, requiredElement);
    if (keywordMatch) {
      const textSnippet = extractTextSnippet(notes, requiredElement);
      return { hasContent: true, matchedText: textSnippet };
    }

    return { hasContent: false, matchedText: null };
  } catch (error) {
    console.error("Error in findMatchingText:", error);
    // Fallback methods if there's an error
    const hasMatch =
      findContextualMatch(notes, requiredElement) ||
      containsKeywords(notes, requiredElement);

    if (hasMatch) {
      const textSnippet = extractTextSnippet(notes, requiredElement);
      return { hasContent: true, matchedText: textSnippet };
    }

    return { hasContent: false, matchedText: null };
  }
};

// Helper function to extract relevant text snippet based on patterns
const extractTextSnippet = (notes: string, requiredElement: string): string => {
  const context =
    medicalContexts[requiredElement as keyof typeof medicalContexts];
  if (!context) return "Content detected (no specific text extracted)";

  const sentences = notes.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const textLower = notes.toLowerCase();

  // Look for sentences containing patterns or context clues
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

  // Special handling for vital signs which might appear in a structured format
  if (requiredElement === "Vital signs") {
    const vitalSignRegex =
      /(?:BP|HR|RR|temp|temperature|pulse|respiration|SpO2|O2 sat)[:\s-]+\d+(?:[/.]?\d+)?(?:\s*(?:mmHg|bpm|%|°[CF]|C|F))?/gi;
    const vitalMatches = notes.match(vitalSignRegex) || [];

    if (vitalMatches.length > 0) {
      return vitalMatches.join("; ");
    }
  }

  // If we found relevant sentences, return them
  if (relevantSentences.length > 0) {
    // If there are too many sentences, just return the first few
    if (relevantSentences.length > 3) {
      return relevantSentences.slice(0, 3).join(". ") + "...";
    }
    return relevantSentences.join(". ");
  }

  // If no specific sentences were found but we know the content is there,
  // try to extract the closest thing we can find to the element
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
