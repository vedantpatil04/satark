import React, { useEffect, useState } from "react";
import { notificationsApi, NotificationItem } from "@/api/notifications";
import {
  Bell,
  CheckCheck,
  Check,
  Calendar,
  AlertCircle,
  Brain,
  ShieldAlert,
  Loader2,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const StudentNotifications: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadNotifications = async () => {
    try {
      const data = await notificationsApi.list(filterUnreadOnly ? false : undefined);
      setNotifications(data);
    } catch {
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [filterUnreadOnly]);

  const handleMarkRead = async (id: string) => {
    setMarkingId(id);
    try {
      await notificationsApi.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      toast.success("Notification marked as read");
    } catch {
      toast.error("Failed to mark as read");
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading notifications...</p>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "exam_announcement":
        return <Calendar className="w-5 h-5 text-blue-400" />;
      case "focus_nudge":
        return <Brain className="w-5 h-5 text-emerald-400" />;
      case "security":
        return <ShieldAlert className="w-5 h-5 text-destructive" />;
      default:
        return <Bell className="w-5 h-5 text-primary" />;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Notification Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Exam schedules, course updates, and focus nudges.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={filterUnreadOnly ? "default" : "outline"}
            onClick={() => setFilterUnreadOnly(!filterUnreadOnly)}
            className="gap-1.5 text-xs font-semibold"
          >
            <Filter className="w-3.5 h-3.5" />
            {filterUnreadOnly ? "Showing Unread" : "Show Unread Only"} ({unreadCount})
          </Button>

          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleMarkAllRead}
              className="gap-1.5 text-xs font-semibold"
            >
              <CheckCheck className="w-3.5 h-3.5 text-primary" />
              Mark All Read
            </Button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <Card className="glass-card text-center py-16">
          <CardContent className="flex flex-col items-center gap-3">
            <Bell className="w-12 h-12 text-muted-foreground/30" />
            <h3 className="text-lg font-bold text-foreground">All Caught Up!</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              You have no new notifications or exam alerts at this moment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <Card
              key={item.id}
              className={`glass-card transition-all ${
                item.is_read
                  ? "border-border/30 opacity-75"
                  : "border-primary/40 bg-primary/5 shadow-sm"
              }`}
            >
              <CardContent className="p-5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-xl bg-muted/60 shrink-0 mt-0.5">
                    {getTypeIcon(item.notification_type)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm text-foreground">{item.title}</h4>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {item.notification_type.replace("_", " ")}
                      </Badge>
                      {!item.is_read && (
                        <Badge className="text-[10px] bg-primary text-primary-foreground font-semibold">
                          New
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {item.message}
                    </p>

                    <p className="text-[11px] text-muted-foreground/80 font-mono pt-1">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                {!item.is_read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleMarkRead(item.id)}
                    disabled={markingId === item.id}
                    className="shrink-0 text-xs font-semibold gap-1 text-muted-foreground hover:text-foreground"
                  >
                    {markingId === item.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    )}
                    Mark read
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
