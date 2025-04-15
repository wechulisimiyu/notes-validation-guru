
import { pipeline } from '@huggingface/transformers';

let embeddingModel: any = null;

export const initializeModel = async () => {
  if (!embeddingModel) {
    embeddingModel = await pipeline(
      'feature-extraction',
      'mixedbread-ai/mxbai-embed-xsmall-v1',
      { device: 'cpu' }
    );
  }
  return embeddingModel;
};

export const computeEmbedding = async (text: string) => {
  const model = await initializeModel();
  const embedding = await model(text, { pooling: 'mean', normalize: true });
  return embedding.tolist()[0];
};

export const cosineSimilarity = (a: number[], b: number[]): number => {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
};

export const findSimilarContent = async (notes: string, requiredElement: string) => {
  const notesEmbedding = await computeEmbedding(notes);
  const elementEmbedding = await computeEmbedding(requiredElement);
  
  const similarity = cosineSimilarity(notesEmbedding, elementEmbedding);
  return similarity > 0.6; // Threshold for similarity
};
