import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(400).optional().default(""),
  link: z.string().trim().max(500).optional().default(""),
});

/**
 * Admin-only: send a web-push notification to every subscribed device.
 * Also records the broadcast and creates in-app notifications for history.
 */
export const broadcastPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const webpush = (await import("web-push")).default;

    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return { ok: false, sent: 0, removed: 0, error: "VAPID keys not configured." };

    const { data: priv2 } = await supabaseAdmin
      .from("app_settings_private")
      .select("vapid_subject")
      .eq("id", 1)
      .maybeSingle();
    const subject = (priv2 as any)?.vapid_subject || "mailto:admin@example.com";
    webpush.setVapidDetails(subject, pub, priv);

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("enabled", true);

    const payload = JSON.stringify({
      title: data.title,
      body: data.body || "",
      link: data.link || "/",
      tag: "broadcast-" + Date.now(),
    });

    let sent = 0;
    const dead: string[] = [];
    for (const s of subs ?? []) {
      const sub: any = s;
      if (!sub.endpoint?.startsWith("http")) continue;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } } as any,
          payload,
        );
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) dead.push(sub.id);
      }
    }
    if (dead.length) await supabaseAdmin.from("push_subscriptions").update({ enabled: false, disabled_at: new Date().toISOString() } as any).in("id", dead);

    // Record the broadcast for history.
    await supabaseAdmin.from("broadcasts").insert({
      title: data.title,
      body: data.body || "",
      link: data.link || "",
      segment: "push",
      sent_count: sent,
      created_by: userId,
    });

    return { ok: true, sent, removed: dead.length, total: (subs ?? []).length };
  });

export const getPushSubscriberCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("enabled", true);
    return { count: count ?? 0 };
  });