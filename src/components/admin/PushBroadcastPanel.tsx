import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Filter, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { broadcastPush, getPushSubscriberCount } from "@/lib/push-admin.functions";
import { toast } from "sonner";

const roles = ["any", "viewer", "shooter", "gang_leader", "registered", "moderator", "admin", "sponsor"];
const activityOptions = [
  { value: "any", label: "Any last-active date" },
  { value: "1", label: "Active in 24 hours" },
  { value: "7", label: "Active in 7 days" },
  { value: "30", label: "Active in 30 days" },
  { value: "90", label: "Active in 90 days" },
];

function normalizeLocale(value: string) {
  return value.trim().replace("_", "-");
}

export function PushBroadcastPanel() {
  const send = useServerFn(broadcastPush);
  const readCount = useServerFn(getPushSubscriberCount);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [role, setRole] = useState("any");
  const [locale, setLocale] = useState("");
  const [lastActiveDays, setLastActiveDays] = useState("any");

  const filters = {
    role: role === "any" ? "any" : role,
    locale: normalizeLocale(locale),
    lastActiveDays: lastActiveDays === "any" ? null : Number(lastActiveDays),
  };

  const loadCount = () => {
    readCount({ data: filters }).then((r: any) => setCount(r?.count ?? 0)).catch(() => setCount(0));
  };
  useEffect(() => { loadCount(); }, [role, locale, lastActiveDays]);

  const submit = async () => {
    if (!title.trim()) { toast.error("Add a title for the notification."); return; }
    setBusy(true);
    try {
      const res: any = await send({ data: { title: title.trim(), body: body.trim(), link: link.trim(), ...filters } });
      if (res?.ok) {
        toast.success(`Push sent to ${res.sent} of ${res.total} targeted device${res.total === 1 ? "" : "s"}.`);
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
          Type a message and send it instantly to devices that match your audience filters.
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
          <Users className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground tabular-nums">{count ?? "—"}</span> subscribed device{count === 1 ? "" : "s"}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <div className="font-bold text-sm">Audience filters</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue placeholder="Any role" /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => <SelectItem key={r} value={r}>{r === "any" ? "Any role" : r.replaceAll("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Locale</label>
            <Input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="Any, en, en-US" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Last active</label>
            <Select value={lastActiveDays} onValueChange={setLastActiveDays}>
              <SelectTrigger><SelectValue placeholder="Any activity" /></SelectTrigger>
              <SelectContent>
                {activityOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Matching now: <span className="font-bold text-foreground tabular-nums">{count ?? "—"}</span> active subscribed device{count === 1 ? "" : "s"}.
        </p>
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
          {busy ? "Sending…" : "Send push to filtered audience"}
        </Button>
      </Card>
    </div>
  );
}