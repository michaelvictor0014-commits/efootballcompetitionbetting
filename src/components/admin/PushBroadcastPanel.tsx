import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { broadcastPush } from "@/lib/push-admin.functions";
import { toast } from "sonner";

export function PushBroadcastPanel() {
  const send = useServerFn(broadcastPush);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const loadCount = () => {
    supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("enabled", true)
      .then(({ count }) => setCount(count ?? 0));
  };
  useEffect(() => { loadCount(); }, []);

  const submit = async () => {
    if (!title.trim()) { toast.error("Add a title for the notification."); return; }
    setBusy(true);
    try {
      const res: any = await send({ data: { title: title.trim(), body: body.trim(), link: link.trim() } });
      if (res?.ok) {
        toast.success(`Push sent to ${res.sent} device${res.sent === 1 ? "" : "s"}.`);
        setTitle(""); setBody(""); setLink("");
        loadCount();
      } else {
        toast.error(res?.error || "Failed to send push.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to send push.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-1.5">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <div className="font-bold">Push to all subscribers</div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Type a message and send it instantly to every device that allowed notifications.
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
          <Users className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground tabular-nums">{count ?? "—"}</span> subscribed device{count === 1 ? "" : "s"}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Title</label>
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="🔥 Big match starting now!" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Message</label>
          <Textarea value={body} maxLength={400} rows={3} onChange={(e) => setBody(e.target.value)} placeholder="Tap to watch the action live and place your bets." />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Link (optional)</label>
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/matches" />
        </div>
        <Button className="btn-luxury w-full gap-2" disabled={busy} onClick={submit}>
          <Send className="h-4 w-4" />
          {busy ? "Sending…" : "Send push to everyone"}
        </Button>
      </Card>
    </div>
  );
}