import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Maximize2, Minimize2, XCircle, MessageSquare, StopCircle } from "lucide-react";
import FocusTimer from "./FocusTimer";
import CameraFeed from "./CameraFeed";
import ScreenShare from "./ScreenShare";
import DistractionAlert from "./DistractionAlert";
import Chatbot from "./Chatbot";
import FocusSessionSummary from "./FocusSessionSummary";

interface FocusModeProps {
  duration: number;
  goal: string;
  monitoringType: 'camera' | 'screen' | 'both';
  onExit: () => void;
}

const FocusMode = ({ duration, goal, monitoringType, onExit }: FocusModeProps) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [distraction, setDistraction] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [sessionStats, setSessionStats] = useState({
    distractions: 0,
    focusScore: 100,
    duration: duration
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullScreen(true);
    } else {
      document.exitFullscreen();
      setIsFullScreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleDistraction = (message: string) => {
    setDistraction(message);
    setSessionStats(prev => ({
      ...prev,
      distractions: prev.distractions + 1,
      focusScore: Math.max(0, prev.focusScore - 5)
    }));
    
    // Auto-dismiss alert after 5 seconds
    setTimeout(() => setDistraction(null), 5000);
  };

  const handleSessionComplete = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    setShowSummary(true);
    toast({
      title: "Session Complete! 🎉",
      description: "Great job staying focused. Check out your summary.",
    });
  };

  const handleEarlyExit = () => {
    if (window.confirm("Are you sure you want to end this session early? Progress won't be saved.")) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
      onExit();
    }
  };

  if (showSummary) {
    return <FocusSessionSummary stats={sessionStats} goal={goal} onClose={onExit} />;
  }

  return (
    <div ref={containerRef} className="min-h-screen bg-gray-950 text-white relative overflow-hidden flex flex-col">
      {/* Ambient Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-gray-900/0 to-gray-900/0 pointer-events-none" />

      {/* Top Bar */}
      <div className="relative z-10 flex justify-between items-start p-6">
        <div className="space-y-2">
           {/* CLEANUP: Removed the technical overlay div that was here */}
          <h2 className="text-xl font-semibold flex items-center gap-2 text-purple-300">
            🎯 Goal: <span className="text-white">{goal}</span>
          </h2>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`hover:bg-white/10 transition-colors ${isChatOpen ? 'bg-purple-500/20 text-purple-300' : ''}`}
          >
            <MessageSquare className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleFullScreen} className="hover:bg-white/10">
            {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleEarlyExit} className="gap-2 opacity-90 hover:opacity-100">
            <StopCircle className="w-4 h-4" /> End Session
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex relative z-10 p-6 gap-6 overflow-hidden">
        {/* Left/Main Panel - Timer & Screen Share */}
        <div className={`flex-1 flex flex-col gap-6 transition-all duration-300 ${isChatOpen ? 'mr-[400px]' : ''}`}>
          <div className="flex-1 flex items-center justify-center relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-500" />
            
            {(monitoringType === 'screen' || monitoringType === 'both') && (
              <ScreenShare onDistraction={handleDistraction} isActive={!showSummary} />
            )}
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <FocusTimer duration={duration} onComplete={handleSessionComplete} />
            </div>
          </div>
        </div>

        {/* Right Panel - Chatbot */}
        <div className={`fixed top-[88px] right-6 bottom-6 w-[400px] transition-transform duration-300 ease-in-out z-20 ${
          isChatOpen ? 'translate-x-0' : 'translate-x-[calc(100%+24px)]'
        }`}>
          <Chatbot onClose={() => setIsChatOpen(false)} />
        </div>

        {/* Floating Elements */}
        {(monitoringType === 'camera' || monitoringType === 'both') && (
          <CameraFeed onDistraction={handleDistraction} />
        )}
        <DistractionAlert message={distraction} onClose={() => setDistraction(null)} />
      </div>

      {/* CLEANUP: Removed the entire bottom status footer section here */}
    </div>
  );
};

export default FocusMode;