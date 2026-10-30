// src/components/TestTextClassifier.tsx
import { useEffect, useState } from "react";
import { textClassifier } from "@/lib/textClassifier";

export default function TestTextClassifier() {
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const test = async () => {
      await textClassifier.load();
      
      const testText = "python for loop code function programming";
      const prediction = await textClassifier.predict(testText);
      
      setResult(`${prediction.class} (${(prediction.confidence * 100).toFixed(1)}%)`);
      setLoading(false);
    };
    
    test();
  }, []);

  return (
    <div className="p-4 bg-white rounded shadow">
      <h3 className="font-bold">Text Classifier Test</h3>
      {loading ? "Loading model..." : `Result: ${result}`}
    </div>
  );
}
