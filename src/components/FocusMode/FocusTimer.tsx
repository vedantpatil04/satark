import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

interface FocusTimerProps {
  durationMinutes: number;
  onTimeUp: () => void;
}

const FocusTimer = ({ durationMinutes, onTimeUp }: FocusTimerProps) => {
  const [secondsLeft, setSecondsLeft] = useState(durationMinutes * 60);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onTimeUp]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = ((durationMinutes * 60 - secondsLeft) / (durationMinutes * 60)) * 100;

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-12 h-12">
        <svg className="w-full h-full -rotate-90">
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted"
          />
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 20}`}
            strokeDashoffset={`${2 * Math.PI * 20 * (1 - progress / 100)}`}
            className="text-primary transition-all duration-1000"
            strokeLinecap="round"
          />
        </svg>
        <Clock className="w-5 h-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" />
      </div>
      <div className="text-2xl font-mono font-bold tabular-nums">
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </div>
    </div>
  );
};

export default FocusTimer;
