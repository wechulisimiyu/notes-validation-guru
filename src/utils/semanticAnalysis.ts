
import { pipeline } from '@huggingface/transformers';
import { useToast } from '@/hooks/use-toast';

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
      // Return a placeholder embedding if model failed to load
      return Array(384).fill(0).map(() => Math.random() * 2 - 1);
    }
    const embedding = await model(text, { pooling: 'mean', normalize: true });
    return embedding.tolist()[0];
  } catch (error) {
    console.error('Error computing embedding:', error);
    // Return a random embedding as fallback
    return Array(384).fill(0).map(() => Math.random() * 2 - 1);
  }
};

export const cosineSimilarity = (a: number[], b: number[]): number => {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
};

// Simple fallback for semantic similarity when model isn't available
const containsKeywords = (text: string, element: string): boolean => {
  const keywords = element.toLowerCase().split(' ');
  const textLower = text.toLowerCase();
  
  // Check if at least half of the keywords are present
  const matchCount = keywords.filter(word => textLower.includes(word)).length;
  return matchCount >= Math.ceil(keywords.length / 2);
};

export const findSimilarContent = async (notes: string, requiredElement: string) => {
  try {
    const model = await initializeModel();
    
    // If model failed to load, use keyword matching as fallback
    if (!model) {
      return containsKeywords(notes, requiredElement);
    }
    
    const notesEmbedding = await computeEmbedding(notes);
    const elementEmbedding = await computeEmbedding(requiredElement);
    
    const similarity = cosineSimilarity(notesEmbedding, elementEmbedding);
    return similarity > 0.6; // Threshold for similarity
  } catch (error) {
    console.error('Error in findSimilarContent:', error);
    // Fall back to simple keyword matching
    return containsKeywords(notes, requiredElement);
  }
};
