import { Card } from "@/components/ui/card";
import { Brain, AlertCircle, HelpCircle } from "lucide-react";

interface FocusStatusProps {
  focusState: string;
}

const FocusStatus = ({ focusState }: FocusStatusProps) => {
  const getStatusConfig = () => {
    switch (focusState) {
      case "Focused":
        return {
          icon: Brain,
          color: "text-success",
          bgColor: "bg-success/10",
          message: "Great! You're focused",
          tip: "Keep up the excellent work!",
        };
      case "Distracted":
        return {
          icon: AlertCircle,
          color: "text-destructive",
          bgColor: "bg-destructive/10",
          message: "You seem distracted",
          tip: "Try to refocus on your task",
        };
      case "Confused":
        return {
          icon: HelpCircle,
          color: "text-warning",
          bgColor: "bg-warning/10",
          message: "Need help?",
          tip: "Consider taking a short break or asking the AI assistant",
        };
      default:
        return {
          icon: Brain,
          color: "text-muted-foreground",
          bgColor: "bg-muted",
          message: "Detecting focus...",
          tip: "Please look at the camera",
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-full ${config.bgColor}`}>
          <Icon className={`w-6 h-6 ${config.color}`} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">{config.message}</h3>
          <p className="text-sm text-muted-foreground">{config.tip}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Current State</span>
          <span className={`font-semibold ${config.color}`}>{focusState}</span>
        </div>
      </div>
    </Card>
  );
};

export default FocusStatus;
