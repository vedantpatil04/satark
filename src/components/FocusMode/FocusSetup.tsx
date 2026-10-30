import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Monitor, Camera, Sparkles } from "lucide-react";

interface FocusSetupProps {
  onStart: (duration: number, goal: string, monitoringType: 'camera' | 'screen' | 'both') => void;
}

const FocusSetup = ({ onStart }: FocusSetupProps) => {
  const [duration, setDuration] = useState(25);
  const [customDuration, setCustomDuration] = useState("");
  const [goal, setGoal] = useState("");
  const [monitoringType, setMonitoringType] = useState<'camera' | 'screen' | 'both'>('both');
  const [showStartDialog, setShowStartDialog] = useState(false);

  const handleStartClick = () => {
    if (goal.trim()) {
      setShowStartDialog(true);
    }
  };

  const confirmStart = () => {
    setShowStartDialog(false);
    onStart(duration, goal, monitoringType);
  };

  const handleCustomDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomDuration(val);
    const numVal = parseInt(val);
    if (!isNaN(numVal) && numVal > 0) {
      setDuration(numVal);
    }
  };

  const quickSelectOptions = [15, 25, 45, 60];

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
          Start a Focus Session
        </h1>
        {/* CLEANUP: Removed helper text here */}
      </div>

      <div className="glass-card p-8 space-y-8 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500" />
        
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Label className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-400" />
              Duration (minutes)
            </Label>
            <span className="text-2xl font-bold text-purple-400">{duration} min</span>
          </div>
          
          <Slider
            value={[duration]}
            onValueChange={(vals) => {
              setDuration(vals[0]);
              setCustomDuration(vals[0].toString());
            }}
            max={120}
            min={5}
            step={5}
            className="py-4"
          />

          <div className="flex gap-3 items-center">
            {/* CLEANUP: Used flex-1 and gap-3 for better fitting */}
            <div className="flex-1 grid grid-cols-4 gap-3">
              {quickSelectOptions.map((mins) => (
                <Button
                  key={mins}
                  variant={duration === mins ? "default" : "outline"}
                  onClick={() => {
                    setDuration(mins);
                    setCustomDuration(mins.toString());
                  }}
                  className={`w-full ${duration === mins ? 'bg-purple-600 hover:bg-purple-700' : 'hover:bg-white/10'}`}
                >
                  {mins} m
                </Button>
              ))}
            </div>
            <Input
              type="number"
              placeholder="Custom"
              value={customDuration}
              onChange={handleCustomDurationChange}
              className="w-24 bg-white/5 border-white/10 focus:border-purple-400"
            />
          </div>
        </div>

        <div className="space-y-4">
          <Label className="text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-pink-400" />
            What are you working on?
          </Label>
          <Input
            placeholder="e.g., Finish math homework, Write essay draft..."
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="text-lg p-6 bg-white/5 border-white/10 focus:border-pink-400 transition-colors"
          />
        </div>

        <div className="space-y-4">
          <Label className="text-lg">AI Monitoring Preference</Label>
          <Select
            value={monitoringType}
            onValueChange={(val: 'camera' | 'screen' | 'both') => setMonitoringType(val)}
          >
            <SelectTrigger className="bg-white/5 border-white/10">
              <SelectValue placeholder="Select monitoring type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4" /> + <Monitor className="w-4 h-4" />
                  <span>Both Camera & Screen (Recommended)</span>
                </div>
              </SelectItem>
              <SelectItem value="camera">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  <span>Camera Only (Posture & Distraction)</span>
                </div>
              </SelectItem>
              <SelectItem value="screen">
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4" />
                  <span>Screen Only (Content detection)</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full text-lg h-14 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 transform transition-all hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group"
          onClick={handleStartClick}
          disabled={!goal.trim()}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            Begin Focus Session <Sparkles className="w-5 h-5 animate-pulse" />
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-pink-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </Button>
      </div>

      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="bg-[#1a1b26] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Monitor className="w-6 h-6 text-purple-400" />
              Select Your Study Screen
            </DialogTitle>
            {/* CLEANUP: Removed DialogDescription helper text here */}
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
             <div className="bg-purple-500/10 p-4 rounded-lg border border-purple-500/20 flex items-start gap-3">
               <Sparkles className="w-5 h-5 text-purple-400 mt-1 flex-shrink-0" />
               <div>
                 <h4 className="font-semibold text-purple-300 mb-1">Ready to Focus?</h4>
                 <p className="text-sm text-gray-300">
                   Click "Start Session" and select the screen or window where you'll be studying. 
                 </p>
               </div>
             </div>
          </div>

          <DialogFooter className="sm:justify-center">
            <Button 
              onClick={confirmStart}
              size="lg"
              className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg h-12 px-8"
            >
              Start Session & Share Screen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FocusSetup;