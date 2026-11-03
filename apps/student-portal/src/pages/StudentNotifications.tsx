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
      setNotifications(Array.isArray(data) ? data : []);
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
        <Loader2 className="w-8 h-8 animate-spin text-[#D97706]" />
        <p className="text-xs text-stone-500 font-medium">Loading notifications...</p>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "exam_announcement":
        return <Calendar className="w-4 h-4 text-blue-600" />;
      case "focus_nudge":
        return <Brain className="w-4 h-4 text-emerald-600" />;
      case "security":
        return <ShieldAlert className="w-4 h-4 text-rose-600" />;
      default:
        return <Bell className="w-4 h-4 text-[#D97706]" />;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Notification Inbox
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Exam schedules, classroom announcements, and focus nudges.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFilterUnreadOnly(!filterUnreadOnly)}
            className={`gap-1.5 text-xs font-semibold rounded-xl h-8.5 ${
              filterUnreadOnly
                ? "bg-[#D97706] text-white border-[#D97706] hover:bg-[#B45309]"
                : "border-stone-200 bg-white hover:bg-stone-50 text-slate-700"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            {filterUnreadOnly ? "Showing Unread" : "Unread Only"} ({unreadCount})
          </Button>

          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleMarkAllRead}
              className="gap-1.5 text-xs font-semibold rounded-xl h-8.5 border-stone-200 bg-white hover:bg-stone-50"
            >
              <CheckCheck className="w-3.5 h-3.5 text-[#D97706]" /> Mark All Read
            </Button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-3xl bg-white border border-stone-200/80 p-12 text-center text-stone-400">
          <Bell className="w-10 h-10 mx-auto mb-2 opacity-30 text-stone-400" />
          <h3 className="text-sm font-bold text-slate-800">Inbox is Clear</h3>
          <p className="text-xs text-stone-400 mt-1">No notifications matched your active filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`rounded-2xl border p-4 transition-all bg-white shadow-xs flex items-start justify-between gap-4 ${
                n.is_read ? "border-stone-200/60 opacity-75" : "border-amber-300 bg-[#FFFDF9]"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#FFF2E5] flex items-center justify-center shrink-0 mt-0.5">
                  {getTypeIcon(n.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-xs sm:text-sm text-slate-900">{n.title}</h4>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-[#D97706]" />
                    )}
                  </div>
                  <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">{n.message}</p>
                  <span className="text-[10px] text-stone-400 block mt-1 font-medium">
                    {new Date(n.created_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>

              {!n.is_read && (
                <button
                  disabled={markingId === n.id}
                  onClick={() => handleMarkRead(n.id)}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors shrink-0"
                  title="Mark as Read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default StudentNotifications;
