import * as tf from '@tensorflow/tfjs';

class TextActivityClassifier {
  private model: tf.LayersModel | null = null;
  private readonly VOCAB_SIZE = 20000;
  private readonly CLASSES = ['Studying', 'Coding', 'Gaming'];
  private isLoaded = false;

  async load() {
    if (this.isLoaded) return;
    
    try {
      this.model = await tf.loadLayersModel('/models/text-activity/model.json');
      this.isLoaded = true;
      console.log('✅ Text classifier loaded');
    } catch (error) {
      console.error('Failed to load text model:', error);
      // Model not found - that's okay, will use fallback
    }
  }

  private hashText(text: string): number[] {
    const features = new Array(this.VOCAB_SIZE).fill(0);
    const tokens = text.toLowerCase().split(/\s+/);
    
    tokens.forEach(token => {
      if (token.length > 2) {
        const hash = this.simpleHash(token) % this.VOCAB_SIZE;
        features[hash] += 1;
      }
    });

    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]} ${tokens[i+1]}`;
      const hash = this.simpleHash(bigram) % this.VOCAB_SIZE;
      features[hash] += 1;
    }

    const magnitude = Math.sqrt(features.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? features.map(val => val / magnitude) : features;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  async predict(text: string): Promise<{ 
    class: string; 
    confidence: number; 
    probabilities: number[] 
  }> {
    if (!this.model || !this.isLoaded) {
      // Fallback to rule-based classification
      return this.fallbackPredict(text);
    }

    const features = this.hashText(text);
    const tensor = tf.tensor2d([features]);
    const prediction = this.model.predict(tensor) as tf.Tensor;
    const probabilities = await prediction.data();
    const maxIndex = probabilities.indexOf(Math.max(...probabilities));
    
    tensor.dispose();
    prediction.dispose();

    return {
      class: this.CLASSES[maxIndex],
      confidence: probabilities[maxIndex],
      probabilities: Array.from(probabilities)
    };
  }

  private fallbackPredict(text: string) {
    const lower = text.toLowerCase();
    let studyScore = 0;
    let codingScore = 0;
    let gamingScore = 0;

    // Study keywords
    if (/(chapter|lesson|study|homework|exam|notes|ncert|class)/i.test(lower)) studyScore += 3;
    if (/(mathematics|science|biology|chemistry|physics)/i.test(lower)) studyScore += 2;

    // Coding keywords
    if (/(function|def|class|import|print|code|python|javascript)/i.test(lower)) codingScore += 3;
    if (/(loop|variable|array|if|else|return)/i.test(lower)) codingScore += 2;

    // Gaming keywords
    if (/(level|score|game|play|player|win|lose)/i.test(lower)) gamingScore += 3;
    if (/(attack|health|inventory|mission)/i.test(lower)) gamingScore += 2;

    const total = studyScore + codingScore + gamingScore || 1;
    const probs = [studyScore/total, codingScore/total, gamingScore/total];
    const maxIndex = probs.indexOf(Math.max(...probs));

    return {
      class: this.CLASSES[maxIndex],
      confidence: probs[maxIndex],
      probabilities: probs
    };
  }
}

export const textClassifier = new TextActivityClassifier();
