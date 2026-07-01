import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(400).optional().default(""),
  link: z.string().trim().max(500).optional().default(""),
  role: z.string().trim().optional().default("any"),
  locale: z.string().trim().max(40).optional().default(""),
  lastActiveDays: z.number().int().positive().max(3650).nullable().optional(),
});

const audienceSchema = z.object({
  role: z.string().trim().optional().default("any"),
  locale: z.string().trim().max(40).optional().default(""),
  lastActiveDays: z.number().int().positive().max(3650).nullable().optional(),
}).optional().default({});

type Audience = z.infer<typeof audienceSchema>;

async function getAudienceSubscriptions(supabaseAdmin: any, audience: Audience) {
  let query = supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key, locale, last_seen_at")
    .eq("enabled", true);

  const locale = audience.locale?.trim();
  if (locale) query = query.ilike("locale", `${locale.replace("_", "-")}%`);

  const { data: initial, error } = await query;
  if (error) throw error;
  let subs = (initial ?? []) as any[];
  const userIds = Array.from(new Set(subs.map((s) => s.user_id).filter(Boolean)));

  const role = audience.role && audience.role !== "any" ? audience.role : "";
  if (role) {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", role)
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const allowed = new Set((roles ?? []).map((r: any) => r.user_id));
    subs = subs.filter((s) => allowed.has(s.user_id));
  }

  if (audience.lastActiveDays) {
    const since = new Date(Date.now() - audience.lastActiveDays * 24 * 60 * 60 * 1000).toISOString();
    const ids = Array.from(new Set(subs.map((s) => s.user_id).filter(Boolean)));
    const { data: sessions } = await supabaseAdmin
      .from("user_sessions")
      .select("user_id")
      .gte("last_seen", since)
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const active = new Set((sessions ?? []).map((s: any) => s.user_id));
    subs = subs.filter((s) => active.has(s.user_id));
  }

  return subs;
}

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

    const subs = await getAudienceSubscriptions(supabaseAdmin, data);

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

    return { ok: true, sent, removed: dead.length, total: subs.length };
  });

export const getPushSubscriberCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => audienceSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const subs = await getAudienceSubscriptions(supabaseAdmin, data as Audience);
    return { count: subs.length };
  });