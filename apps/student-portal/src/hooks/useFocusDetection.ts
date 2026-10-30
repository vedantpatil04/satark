import { useEffect, useState, useRef } from 'react';
import * as tmImage from '@teachablemachine/image';

interface FocusState {
  isFocused: boolean;
  confidence: number;
  status: 'loading' | 'ready' | 'detecting' | 'error';
  error?: string;
}

export const useFocusDetection = () => {
  const [focusState, setFocusState] = useState<FocusState>({
    isFocused: false,
    confidence: 0,
    status: 'loading',
  });
  const modelRef = useRef<tmImage.CustomMobileNet | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const loadModel = async () => {
      try {
        // Replace with your Teachable Machine model URL
        const modelURL = '/models/model.json';
        const metadataURL = '/models/metadata.json';
        
        const model = await tmImage.load(modelURL, metadataURL);
        modelRef.current = model;
        setFocusState(prev => ({ ...prev, status: 'ready' }));
      } catch (error) {
        console.error('Failed to load model:', error);
        setFocusState(prev => ({
          ...prev,
          status: 'error',
          error: 'Failed to load detection model',
        }));
      }
    };

    loadModel();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const detectFocus = async (videoElement: HTMLVideoElement) => {
    if (!modelRef.current || focusState.status !== 'ready') return;

    try {
      setFocusState(prev => ({ ...prev, status: 'detecting' }));

      const predictions = await modelRef.current.predict(videoElement);
      
      // Assuming first class is "focused" and second is "unfocused"
      const focusConfidence = predictions[0].probability;
      const isFocused = focusConfidence > 0.6;

      setFocusState({
        isFocused,
        confidence: focusConfidence,
        status: 'ready',
      });

      animationFrameRef.current = requestAnimationFrame(() => 
        detectFocus(videoElement)
      );
    } catch (error) {
      console.error('Detection error:', error);
      setFocusState(prev => ({
        ...prev,
        status: 'error',
        error: 'Detection failed',
      }));
    }
  };

  return { focusState, detectFocus };
};
