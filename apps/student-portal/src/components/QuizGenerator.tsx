import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Brain, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  ChevronRight,
  RotateCcw,
  Sparkles
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Question {
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
}

const QuizGenerator = () => {
  const [step, setStep] = useState<'concepts' | 'generating' | 'quiz' | 'results'>('concepts');
  const [concepts, setConcepts] = useState("");
  const [questionCount, setQuestionCount] = useState("5");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";

  const generateQuiz = async () => {
    if (!concepts.trim()) {
      setError("Please enter the concepts you learned");
      return;
    }

    // FIX: Increased limit validation to 100
    const count = parseInt(questionCount);
    if (isNaN(count) || count < 1 || count > 100) {
      setError("Please enter a number between 1 and 100");
      return;
    }

    setIsGenerating(true);
    setError("");
    setStep('generating');

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.5, // Lower temperature for more structured output
          // FIX: Increased max_tokens significantly to ensure large JSON arrays don't get cut off
          max_tokens: 8000, 
          messages: [{
            role: "user",
            content: `Generate exactly ${count} multiple-choice quiz questions about: "${concepts}"\n\nRules:\n- Create exactly ${count} questions testing understanding of these concepts\n- Each question must have exactly 4 options labeled A, B, C, D\n- Provide the correct answer as a single letter (A, B, C, or D)\n- Add a brief explanation for why the answer is correct\n\nIMPORTANT: Return ONLY a JSON array with no markdown formatting, no code blocks, no extra text:\n\n[\n  {\n    "question": "What is Python?",\n    "options": ["A) A snake", "B) A programming language", "C) A calculator", "D) A game"],\n    "correctAnswer": "B",\n    "explanation": "Python is a high-level programming language used for software development."\n  }\n]\n\nReturn ONLY the JSON array, nothing else.`
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("API Error:", errorData);
        throw new Error(`API Error ${response.status}`);
      }

      const data = await response.json();
      const generatedText = data.choices[0].message.content;
      console.log("Raw AI response length:", generatedText.length);

      let jsonText = generatedText.trim();
      // Cleanup potential markdown if the AI still adds it
      jsonText = jsonText.replace(/```json\s*/gi, '');
      jsonText = jsonText.replace(/```\s*/g, '');
      jsonText = jsonText.replace(/`/g, '');
      
      // Attempt to find array brackets if there's surrounding text
      const startIndex = jsonText.indexOf('[');
      const endIndex = jsonText.lastIndexOf(']');
      
      if (startIndex === -1 || endIndex === -1) {
        console.error("Could not find JSON brackets in response:", jsonText);
        throw new Error("AI response was not valid JSON");
      }
      
      jsonText = jsonText.substring(startIndex, endIndex + 1);
      
      let parsedQuestions;
      try {
          parsedQuestions = JSON.parse(jsonText);
      } catch (parseError) {
          console.error("JSON Parse Error:", parseError, "JSON Text:", jsonText);
          throw new Error("Failed to parse AI response. Try fewer questions or different concepts.");
      }
      
      if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
        throw new Error("No questions generated correctly");
      }

      // Verify count roughly matches (allow small variance if model miscounts slightly)
      if (Math.abs(parsedQuestions.length - count) > 2 && count < 10) {
         console.warn(`Requested ${count} but got ${parsedQuestions.length}`);
      }

      setQuestions(parsedQuestions);
      setUserAnswers(new Array(parsedQuestions.length).fill(""));
      setStep('quiz');
      
    } catch (err: any) {
      console.error("Quiz generation error:", err);
      setError(`Failed: ${err.message || "Could not generate quiz"}`);
      setStep('concepts');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnswerSelect = (answer: string) => {
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = answer;
    setUserAnswers(newAnswers);
  };

  const nextQuestion = () => {
    setShowAnswer(false);
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setStep('results');
    }
  };

  const restartQuiz = () => {
    setConcepts("");
    setQuestionCount("5");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setUserAnswers([]);
    setShowAnswer(false);
    setStep('concepts');
  };

  const calculateScore = () => {
    let correct = 0;
    questions.forEach((q, i) => {
      if (userAnswers[i] === q.correctAnswer) {
        correct++;
      }
    });
    return correct;
  };

  if (step === 'concepts') {
    return (
      <Card className="p-8 max-w-2xl mx-auto bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 mb-4">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-2">Test Your Knowledge! 🎯</h2>
          <p className="text-muted-foreground">
            Let's create a custom quiz based on what you just learned
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              What concepts did you learn during this session?
            </label>
            <Textarea
              placeholder="e.g., Python loops, Photosynthesis, Quadratic equations, pH scale"
              value={concepts}
              onChange={(e) => setConcepts(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Be specific - the better your description, the better the questions!
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              How many questions do you want? (Max 100)
            </label>
            <div className="flex gap-2">
              {["5", "10", "20"].map((num) => (
                <Button
                  key={num}
                  variant={questionCount === num ? "default" : "outline"}
                  onClick={() => setQuestionCount(num)}
                  className="flex-1"
                >
                  {num}
                </Button>
              ))}
              <Input
                type="number"
                min="1"
                // FIX: Updated max input to 100
                max="100"
                value={questionCount}
                onChange={(e) => setQuestionCount(e.target.value)}
                className="w-24"
                placeholder="Custom"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <Button
            onClick={generateQuiz}
            className="w-full"
            size="lg"
            disabled={!concepts.trim() || isGenerating}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {isGenerating ? `Generating ${questionCount} questions...` : "Generate Quiz with AI"}
          </Button>
        </div>
      </Card>
    );
  }

  if (step === 'generating') {
    return (
      <Card className="p-8 max-w-2xl mx-auto">
        <div className="text-center space-y-4">
          <Loader2 className="w-16 h-16 mx-auto animate-spin text-purple-500" />
          <h3 className="text-2xl font-bold">Generating Your Quiz...</h3>
          <p className="text-muted-foreground">
            AI is creating {questionCount} custom questions based on: <br />
            <span className="font-semibold text-foreground">"{concepts}"</span>
          </p>
          {parseInt(questionCount) > 20 && (
             <p className="text-sm text-muted-foreground animate-pulse">
                Generating many questions may take a bit longer...
             </p>
          )}
        </div>
      </Card>
    );
  }

  if (step === 'quiz' && questions.length > 0) {
    const currentQ = questions[currentQuestionIndex];
    const isAnswered = userAnswers[currentQuestionIndex] !== "";

    return (
      <Card className="p-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
            <span>{Math.round(((currentQuestionIndex + 1) / questions.length) * 100)}%</span>
          </div>
          <Progress value={((currentQuestionIndex + 1) / questions.length) * 100} />
        </div>

        <div className="mb-6">
          <h3 className="text-2xl font-bold mb-4">{currentQ.question}</h3>
          
          <div className="space-y-3">
            {currentQ.options?.map((option, idx) => {
              // Ensure option is a string before trying to get charAt
              const optionText = typeof option === 'string' ? option : JSON.stringify(option);
              const letter = optionText.charAt(0);
              const isSelected = userAnswers[currentQuestionIndex] === letter;
              const isCorrectOption = letter === currentQ.correctAnswer;
              
              let bgClass = "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700";
              
              if (showAnswer) {
                if (isCorrectOption) {
                  bgClass = "bg-green-100 dark:bg-green-900/30 border-green-500";
                } else if (isSelected && !isCorrectOption) {
                  bgClass = "bg-red-100 dark:bg-red-900/30 border-red-500";
                }
              } else if (isSelected) {
                bgClass = "bg-purple-100 dark:bg-purple-900/30 border-purple-500";
              }

              return (
                <button
                  key={idx}
                  onClick={() => !showAnswer && handleAnswerSelect(letter)}
                  disabled={showAnswer}
                  className={`w-full p-4 text-left rounded-lg border-2 transition-all ${bgClass} ${
                    !showAnswer && 'cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1">{optionText}</div>
                    {showAnswer && isCorrectOption && (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                    {showAnswer && isSelected && !isCorrectOption && (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {showAnswer && currentQ.explanation && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
            <p className="font-semibold mb-1">💡 Explanation:</p>
            <p className="text-sm">{currentQ.explanation}</p>
          </div>
        )}

        <div className="flex gap-3">
          {!showAnswer && isAnswered && (
            <Button onClick={() => setShowAnswer(true)} className="flex-1">
              Check Answer
            </Button>
          )}
          
          {showAnswer && (
            <Button onClick={nextQuestion} className="flex-1">
              {currentQuestionIndex < questions.length - 1 ? (
                <>Next Question <ChevronRight className="w-4 h-4 ml-2" /></>
              ) : (
                "See Results"
              )}
            </Button>
          )}
        </div>
      </Card>
    );
  }

  if (step === 'results') {
    const score = calculateScore();
    const percentage = (score / questions.length) * 100;

    return (
      <Card className="p-8 max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full mb-4 ${
            percentage >= 70 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-orange-100 dark:bg-orange-900/30'
          }`}>
            <span className="text-4xl font-bold">
              {percentage >= 70 ? '🎉' : '💪'}
            </span>
          </div>
          
          <h2 className="text-3xl font-bold mb-2">Quiz Complete!</h2>
          <p className="text-5xl font-bold mb-4">{score}/{questions.length}</p>
          <p className="text-xl text-muted-foreground">
            {percentage >= 90 ? "Outstanding! 🌟" :
             percentage >= 70 ? "Great job! 👏" :
             percentage >= 50 ? "Good effort! 📚" :
             "Keep practicing! 💪"}
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {questions.map((q, idx) => {
            const isCorrect = userAnswers[idx] === q.correctAnswer;
            return (
              <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded">
                {isCorrect ? (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                )}
                <span className="text-sm flex-1 truncate">{q.question}</span>
                <Badge variant={isCorrect ? "default" : "destructive"}>
                  {isCorrect ? "Correct" : "Wrong"}
                </Badge>
              </div>
            );
          })}
        </div>

        <Button onClick={restartQuiz} className="w-full" size="lg">
          <RotateCcw className="w-4 h-4 mr-2" />
          Take Another Quiz
        </Button>
      </Card>
    );
  }

  return null;
};

export default QuizGenerator;