import { useState, useRef, useEffect } from "react";
import { Send, Bot, Loader2, Mic, MicOff, Volume2, VolumeX, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface Message {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: Date;
}

const AIFocusAssistant = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hi! 👋 I'm your AI focus assistant. Say 'Hey Helper' followed by your question to ask me hands-free!",
      sender: "assistant",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Voice feature states
  const [isWakeWordActive, setIsWakeWordActive] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const isWakeWordActiveRef = useRef(isWakeWordActive); // Ref for loop access

  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";

  useEffect(() => {
    isWakeWordActiveRef.current = isWakeWordActive;
  }, [isWakeWordActive]);

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error("Speech recognition not supported in this browser");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    
    // CONTINUOUS LISTENING FOR WAKE WORD
    recognitionRef.current.continuous = true; 
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onstart = () => {
      console.log("🎤 Wake word listener active...");
    };

    recognitionRef.current.onresult = (event: any) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript.toLowerCase();
      console.log("📝 Heard:", transcript);

      // WAKE WORD LOGIC
      if (transcript.includes("hey helper")) {
        // Extract everything said AFTER "hey helper"
        const parts = transcript.split("hey helper");
        const question = parts[parts.length - 1].trim();

        if (question.length > 2) {
          toast.success("🤖 Helper is answering...");
          handleSendMessage(question);
        } else {
          speakText("I'm listening. How can I help you?");
        }
      }
    };

    recognitionRef.current.onerror = (event: any) => {
      if (event.error !== 'no-speech') {
        console.error("Speech error:", event.error);
      }
    };

    recognitionRef.current.onend = () => {
      // Auto-restart loop if wake word feature is enabled
      if (isWakeWordActiveRef.current) {
        try { recognitionRef.current.start(); } catch(e) {}
      }
    };

    synthRef.current = window.speechSynthesis;

    // Start listening automatically
    if (isWakeWordActive) {
      try { recognitionRef.current.start(); } catch(e) {}
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null; // Prevent restart on unmount
        recognitionRef.current.stop();
      }
      if (synthRef.current) synthRef.current.cancel();
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const toggleWakeWord = () => {
    if (isWakeWordActive) {
      setIsWakeWordActive(false);
      recognitionRef.current?.stop();
      toast("Hands-free listening disabled.");
    } else {
      setIsWakeWordActive(true);
      try { recognitionRef.current?.start(); } catch(e) {}
      toast.success("Listening for 'Hey Helper'...");
    }
  };

  const speakText = (text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();

    // Clean up text (remove markdown asterisks before speaking)
    const cleanText = text.replace(/\*/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.1;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthRef.current.speak(utterance);
  };

  const stopSpeaking = () => {
    synthRef.current?.cancel();
    setIsSpeaking(false);
  };

  const generateResponse = async (userInput: string): Promise<string> => {
    try {
      const systemPrompt = `You are a helpful AI focus assistant for students called Helper. 
Keep responses brief, conversational, and encouraging (1-3 sentences max). 
Help with: focus techniques, study tips, solving logic problems, and motivation.`;

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map(m => ({
              role: m.sender === "user" ? "user" : "assistant",
              content: m.text
            })),
            { role: "user", content: userInput }
          ]
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "API error");
      
      return data.choices[0].message.content;
    } catch (error) {
      console.error("Groq error:", error);
      return "I'm sorry, I'm having trouble connecting to my brain right now! Take a deep breath and stay focused.";
    }
  };

  const handleSendMessage = async (textOverride?: string) => {
    const messageText = textOverride || inputValue;
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: messageText,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const assistantResponse = await generateResponse(messageText);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: assistantResponse,
        sender: "assistant",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      
      if (autoSpeak) {
        speakText(assistantResponse);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[500px] bg-white/5 rounded-lg border border-white/10">
      <div className="p-3 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-purple-300" />
          <span className="text-sm font-semibold text-purple-200">Hey Helper Assistant</span>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoSpeak(!autoSpeak)}
            className="text-purple-300 hover:text-purple-100 p-2"
          >
            {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleWakeWord}
            className={`${isWakeWordActive ? 'text-green-400' : 'text-gray-400'} hover:text-white p-2`}
            title={isWakeWordActive ? "Wake word ON" : "Wake word OFF"}
          >
            {isWakeWordActive ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg p-3 ${message.sender === "user" ? "bg-purple-500 text-white" : "bg-white/10 text-white backdrop-blur-sm"}`}>
                {message.sender === "assistant" && <Bot className="h-4 w-4 inline mr-2" />}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
                <span className="text-xs opacity-70 mt-1 block">
                  {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-white/10">
        <div className="flex gap-2 mb-2">
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isWakeWordActive ? "Say 'Hey Helper...' or type here" : "Type your question..."}
            disabled={isLoading}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
          />

          <Button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || isLoading}
            size="icon"
            className="bg-purple-500 hover:bg-purple-600"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>

          {isSpeaking && (
            <Button onClick={stopSpeaking} size="icon" variant="destructive" className="animate-pulse">
              <VolumeX className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <div className="flex items-center justify-between text-xs text-white/50">
          <span className="flex items-center gap-1">
            {isWakeWordActive ? (
              <><Sparkles className="h-3 w-3 text-green-400" /> Listening for "Hey Helper"</>
            ) : "Mic disabled"}
          </span>
          {isSpeaking && <span className="text-green-400 animate-pulse">🔊 Speaking...</span>}
        </div>
      </div>
    </div>
  );
};

export default AIFocusAssistant;