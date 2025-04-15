import { pipeline } from '@huggingface/transformers';

let embeddingModel: any = null;
let modelLoadAttempted = false;

export const initializeModel = async () => {
  if (!embeddingModel && !modelLoadAttempted) {
    try {
      modelLoadAttempted = true;
      embeddingModel = await pipeline(
        'feature-extraction',
        'mixedbread-ai/mxbai-embed-xsmall-v1',
        { device: 'wasm' } // Use WebAssembly instead of CPU
      );
      return embeddingModel;
    } catch (error) {
      console.error('Failed to load embedding model:', error);
      return null;
    }
  }
  return embeddingModel;
};

export const computeEmbedding = async (text: string) => {
  try {
    const model = await initializeModel();
    if (!model) {
      return Array(384).fill(0).map(() => Math.random() * 2 - 1);
    }
    const embedding = await model(text, { pooling: 'mean', normalize: true });
    return embedding.tolist()[0];
  } catch (error) {
    console.error('Error computing embedding:', error);
    return Array(384).fill(0).map(() => Math.random() * 2 - 1);
  }
};

export const cosineSimilarity = (a: number[], b: number[]): number => {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
};

const containsKeywords = (text: string, element: string): boolean => {
  const keywords = element.toLowerCase().split(' ');
  const textLower = text.toLowerCase();
  
  const matchCount = keywords.filter(word => textLower.includes(word)).length;
  return matchCount >= Math.ceil(keywords.length / 2);
};

const medicalContexts = {
  "Chief complaint": {
    patterns: ["presents with", "complains of", "came in for", "reports", "experiencing"],
    contextClues: ["symptoms", "since", "started", "ago"]
  },
  "History of present illness": {
    patterns: ["started", "began", "developed", "progression", "course"],
    contextClues: ["days ago", "weeks ago", "gradually", "suddenly", "previously"]
  },
  "Past medical history": {
    patterns: ["history of", "diagnosed with", "previous", "chronic", "known"],
    contextClues: ["condition", "surgery", "treatment", "managed with"]
  },
  "Current medications": {
    patterns: ["taking", "prescribed", "medications include", "daily", "current medications"],
    contextClues: ["mg", "dose", "tablet", "capsule"]
  },
  "Allergies": {
    patterns: ["allergic to", "allergies", "reactions", "sensitivity"],
    contextClues: ["medication allergy", "food allergy", "NKDA", "intolerance"]
  },
  "Physical examination findings": {
    patterns: ["examination reveals", "observed", "auscultation", "palpation"],
    contextClues: ["normal", "present", "absent", "bilateral"]
  },
  "Vital signs": {
    patterns: ["BP", "HR", "RR", "temperature", "SpO2"],
    contextClues: ["mmHg", "bpm", "/min", "degrees", "%"]
  }
};

const findContextualMatch = (text: string, section: string): boolean => {
  const context = medicalContexts[section as keyof typeof medicalContexts];
  if (!context) return false;

  const textLower = text.toLowerCase();
  
  const hasPattern = context.patterns.some(pattern => 
    textLower.includes(pattern.toLowerCase())
  );
  
  const hasContextClues = context.contextClues.some(clue => 
    textLower.includes(clue.toLowerCase())
  );

  if (section === "Vital signs") {
    const hasNumericValues = /\d+/.test(textLower) && 
      (textLower.includes("bp") || textLower.includes("hr") || 
       textLower.includes("temp") || textLower.includes("rr"));
    return hasNumericValues || (hasPattern && hasContextClues);
  }

  return hasPattern || (hasContextClues && textLower.length > 50);
};

export const findSimilarContent = async (notes: string, requiredElement: string) => {
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
    console.error('Error in findSimilarContent:', error);
    return findContextualMatch(notes, requiredElement) || 
           containsKeywords(notes, requiredElement);
  }
};
