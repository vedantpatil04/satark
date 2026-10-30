import React, { useEffect, useState } from "react";
import { notificationsApi, NotificationItem } from "@/api/notifications";
import { Bell, CheckCheck, Check, Clock, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const TeacherNotifications: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      const data = await notificationsApi.list();
      setNotifications(data);
    } catch {
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      toast.success("Notification marked as read");
    } catch {
      toast.error("Failed to mark as read");
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Teacher Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            System announcements, session status changes, and critical security notices.
          </p>
        </div>

        {unreadCount > 0 && (
          <Button size="sm" variant="outline" onClick={handleMarkAllRead} className="gap-1.5 text-xs font-semibold">
            <CheckCheck className="w-4 h-4" /> Mark All as Read ({unreadCount})
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card className="glass-card text-center py-16">
          <CardContent className="flex flex-col items-center gap-3">
            <Bell className="w-10 h-10 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-bold text-foreground">No Notifications</h3>
            <p className="text-sm text-muted-foreground">You are completely up to date.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={`glass-card transition-all ${
                n.is_read ? "opacity-75" : "border-primary/40 bg-primary/5"
              }`}
            >
              <CardContent className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl mt-0.5 ${n.is_read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-foreground">{n.title}</h4>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {n.notification_type}
                      </Badge>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{n.message}</p>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-2">
                      <Clock className="w-3 h-3" /> {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {!n.is_read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleMarkRead(n.id)}
                    className="h-8 text-xs font-semibold shrink-0"
                  >
                    <Check className="w-3.5 h-3.5 mr-1" /> Read
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
