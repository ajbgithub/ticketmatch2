"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../lib/supabaseClient";

/* ===========================================================
   Ticketmatch — username+password auth, market charts & matches
   =========================================================== */

/* ---------- small UI helpers ---------- */
const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = "",
  children,
  ...rest
}) => (
  <div
    className={`rounded-2xl shadow-sm border border-gray-200 bg-white ${className}`}
    {...rest}
  >
    {children}
  </div>
);

const SectionTitle: React.FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle,
}) => (
  <div className="mb-4">
    <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    {subtitle ? (
      <p className="text-sm text-gray-500 leading-snug">{subtitle}</p>
    ) : null}
  </div>
);

const Label: React.FC<React.HTMLAttributes<HTMLLabelElement>> = ({
  className = "",
  children,
  ...rest
}) => (
  <label
    className={`block text-sm font-medium text-gray-700 ${className}`}
    {...rest}
  >
    {children}
  </label>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className = "",
  ...rest
}) => (
  <input
    className={`w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
    {...rest}
  />
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className = "",
  children,
  ...rest
}) => (
  <select
    className={`w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
    {...rest}
  >
    {children}
  </select>
);

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = "",
  children,
  ...rest
}) => (
  <button
    className={`rounded-xl px-3 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700 transition ${className}`}
    {...rest}
  >
    {children}
  </button>
);

const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = "",
  children,
  ...rest
}) => (
  <button
    className={`rounded-xl px-3 py-2 text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition ${className}`}
    {...rest}
  >
    {children}
  </button>
);

/* ---------- types & utils ---------- */
type Role = "buyer" | "seller";
interface Profile {
  id: string;
  username: string;
  wharton_email: string;
  recovery_email?: string; // if present in your schema
  cohort: "WG26" | "WG27";
  phone_e164: string;
  venmo_handle: string;
}
interface Posting {
  id: string;
  userId: string; // created_by (preferred) or device_id fallback
  eventId: string;
  role: Role;
  percent: number; // 0..100
  tickets: number; // 1..4
  name: string;
  phone: string;
}

const EVENTS = [{ id: "rb", label: "Red and Blue Ball - $60", price: 60 }];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const toMoney = (v: number) => `$${(Number.isFinite(v) ? v : 0).toFixed(2)}`;
const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");
const getDeviceId = () => {
  if (typeof window === "undefined") return "server";
  const k = "ticketmatch_device_id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = Math.random().toString(36).slice(2);
    localStorage.setItem(k, id);
  }
  return id;
};

function isValidUsername(u: string) {
  return /^[A-Za-z]+ [A-Za-z]+$/.test((u || "").trim());
}
function normalizeUsername(u: string) {
  return (u || "").trim().replace(/\s+/, " ");
}
function isWhartonEmail(e: string) {
  return /@wharton\.upenn\.edu$/i.test((e || "").trim());
}
function buildE164(code: string, digits: string) {
  const d = onlyDigits(digits);
  const c = code.startsWith("+") ? code : `+${onlyDigits(code)}`;
  return `${c}${d}`;
}
function isValidE164(e164: string) {
  // Allow international: +[country/area][6..14 digits]
  return /^\+\d{6,16}$/.test((e164 || "").trim());
}
function normalizeVenmo(h: string) {
  const v = (h || "").trim();
  return v.startsWith("@") ? v.slice(1) : v;
}
function isValidVenmo(h: string) {
  return /^[A-Za-z0-9_]{3,30}$/.test(normalizeVenmo(h));
}

/* Common area/country codes for dropdown */
const AREA_CODES = [
  "+1",  // US/Canada
  "+44", // UK
  "+61", // Australia
  "+81", // Japan
  "+82", // South Korea
  "+91", // India
  "+33", // France
  "+49", // Germany
  "+39", // Italy
  "+34", // Spain
  "+86", // China
  "+971",// UAE
  "+65", // Singapore
  "+852",// Hong Kong
  "+353" // Ireland
];

/* ---------- charts math ---------- */
function makeBins(step = 5) {
  const bins: { key: string; mid: number; min: number; max: number }[] = [];
  for (let min = 0; min < 100; min += step) {
    const max = min + step;
    const mid = min + step / 2;
    bins.push({ key: `${min}-${max}%`, min, max, mid });
  }
  bins.push({ key: `100%`, min: 100, max: 100, mid: 100 });
  return bins;
}

function histogram(values: number[], step = 5) {
  const bins = makeBins(step);
  const counts = bins.map((b) => ({ ...b, count: 0 }));
  for (const v of values) {
    if (v < 0 || v > 100 || Number.isNaN(v)) continue;
    if (v === 100) {
      counts[counts.length - 1].count += 1;
      continue;
    }
    const idx = Math.floor(v / step);
    counts[idx].count += 1;
  }
  return counts;
}

function curves(sellers: number[], buyers: number[]) {
  const pts: { p: number; supply: number; demand: number; matched: number }[] =
    [];
  const sSorted = [...sellers].sort((a, b) => a - b);
  const bSorted = [...buyers].sort((a, b) => a - b);
  for (let p = 0; p <= 100; p += 1) {
    const supply = sSorted.filter((s) => s <= p).length;
    const demand = bSorted.filter((b) => b >= p).length;
    pts.push({ p, supply, demand, matched: Math.min(supply, demand) });
  }
  // choose p* by best matched, then by balance, then by higher p
  let best = pts[0];
  for (const pt of pts) {
    const betterMatched = pt.matched > best.matched;
    const tieMatched = pt.matched === best.matched;
    const betterBalance =
      Math.abs(pt.supply - pt.demand) < Math.abs(best.supply - best.demand);
    const tieBalance =
      Math.abs(pt.supply - pt.demand) === Math.abs(best.supply - best.demand);
    if (betterMatched || (tieMatched && (betterBalance || (tieBalance && pt.p > best.p))))
      best = pt;
  }
  return { points: pts, clearing: best };
}

/* ---------- postings (Supabase) ---------- */
function usePostings() {
  const [postings, setPostings] = useState<Posting[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [postingsError, setPostingsError] = useState<string>("");

  async function loadAll() {
    setLoading(true);
    setPostingsError("");
    try {
      const { data, error } = await supabase
        .from("postings_public")
        .select(
          "id, device_id, event_id, role, percent, tickets, username, phone_e164, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[postings_public select error]", error);
        setPostingsError(error.message || "Failed to load postings.");
        setPostings([]);
        setLoading(false);
        return;
      }

      const mapped: Posting[] = (data || []).map((r: any) => ({
        id: r.id,
        userId: r.device_id, // if you later add created_by, swap to r.created_by ?? r.device_id
        eventId: r.event_id,
        role: r.role,
        percent: r.percent,
        tickets: r.tickets,
        name: r.username,
        phone: r.phone_e164,
      }));

      setPostings(mapped);
      setLoading(false);
    } catch (e: any) {
      console.error("[postings_public loadAll catch]", e);
      setPostingsError(e?.message || "Failed to load postings.");
      setPostings([]);
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel("postings_public_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "postings_public" },
        () => loadAll()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /** Replace-mode upsert per (device,event,role) */
  async function upsertPosting(p: Omit<Posting, "id"> & { id?: string }) {
    const payload = {
      device_id: getDeviceId(),
      event_id: p.eventId,
      role: p.role,
      percent: p.percent,
      tickets: p.tickets,
      username: p.name,
      phone_e164: p.phone,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("postings_public").upsert(payload);
    if (error) throw error;
    await loadAll();
  }

  return { postings, loading, upsertPosting, postingsError } as const;
}

/* ---------- matching ---------- */
function computeDirectMatchesForUser(
  myUserId: string,
  eventId: string,
  postings: Posting[]
) {
  const mine = postings.filter((p) => p.userId === myUserId && p.eventId === eventId);
  const others = postings.filter((p) => p.userId !== myUserId && p.eventId === eventId);
  const matches: {
    me: Posting;
    other: Posting;
    agreedPct: number;
    tickets: number;
  }[] = [];

  for (const me of mine) {
    if (me.role === "buyer") {
      const feasible = others.filter(
        (o) => o.role === "seller" && me.percent >= o.percent
      );
      feasible.sort((a, b) => a.percent - b.percent);
      if (feasible.length) {
        const best = feasible[0];
        matches.push({
          me,
          other: best,
          agreedPct: Math.min(me.percent, best.percent), // no upcharge
          tickets: Math.min(me.tickets, best.tickets),
        });
      }
    } else {
      const feasible = others.filter(
        (o) => o.role === "buyer" && o.percent >= me.percent
      );
      feasible.sort((a, b) => b.percent - a.percent);
      if (feasible.length) {
        const best = feasible[0];
        matches.push({
          me,
          other: best,
          agreedPct: Math.min(best.percent, me.percent),
          tickets: Math.min(me.tickets, best.tickets),
        });
      }
    }
  }
  return matches;
}

/* ===========================================================
   COMPONENT
   =========================================================== */
export default function WTPInteractiveDiagram() {
  const { postings, upsertPosting, postingsError } = usePostings();

  /* ----- auth state & fields ----- */
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [authError, setAuthError] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [cohort, setCohort] = useState<"WG26" | "WG27">("WG26");

  // phone split: area code dropdown + digits input
  const [areaCode, setAreaCode] = useState<string>(AREA_CODES[0]);
  const [phoneDigits, setPhoneDigits] = useState<string>("");

  const [venmo, setVenmo] = useState("");
  const [whartonEmail, setWhartonEmail] = useState("");

  /* ----- posting fields ----- */
  const [eventId, setEventId] = useState(EVENTS[0].id);
  const currentEvent = EVENTS[0];
  const eventPrice = currentEvent.price;
  const [role, setRole] = useState<Role>("buyer");
  const [percent, setPercent] = useState<number>(100);
  const [tickets, setTickets] = useState<number>(1);
  const [postSuccess, setPostSuccess] = useState(false);
  const [postInfo, setPostInfo] = useState("");

  /* ----- bootstrap session ----- */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) {
        setCurrentUser(null);
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, username, wharton_email, cohort, phone_e164, venmo_handle")
        .eq("id", uid)
        .maybeSingle();
      if (prof) setCurrentUser(prof as Profile);
    })();

    const sub = supabase.auth.onAuthStateChange(async (_evt, session) => {
      const uid = session?.user?.id;
      if (!uid) {
        setCurrentUser(null);
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, username, wharton_email, cohort, phone_e164, venmo_handle")
        .eq("id", uid)
        .maybeSingle();
      if (prof) setCurrentUser(prof as Profile);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  /* ----- signup/login ----- */
  function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    (async () => {
      try {
        const uname = normalizeUsername(username);
        if (!isValidUsername(uname)) throw new Error("Username must be First Last.");
        if ((password || "").length < 8) throw new Error("Password must be at least 8 characters.");
        if (!isWhartonEmail(whartonEmail)) throw new Error("Email must end with @wharton.upenn.edu.");

        const phoneE164 = buildE164(areaCode, phoneDigits);
        if (!isValidE164(phoneE164)) throw new Error("Enter a valid phone number (select code + digits).");

        const venmoId = normalizeVenmo(venmo);
        if (!isValidVenmo(venmoId)) throw new Error("Enter a valid Venmo handle (letters, numbers, underscore).");

        // 1) Create auth user with wharton email
        const { error: signErr } = await supabase.auth.signUp({
          email: whartonEmail.trim(),
          password,
        });
        if (signErr) throw signErr;

        // ensure session (some projects need explicit sign-in)
        await supabase.auth.signOut().catch(() => {});
        const { error: loginErr } = await supabase.auth.signInWithPassword({
          email: whartonEmail.trim(),
          password,
        });
        if (loginErr) throw loginErr;

        // 2) get uid and insert profile
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;
        if (!uid) throw new Error("No session after signup.");

        const insertPayload: any = {
          id: uid,
          username: uname,
          cohort,
          phone_e164: phoneE164,
          venmo_handle: venmoId,
          wharton_email: whartonEmail.trim(),
        };
        // If your schema still has recovery_email NOT NULL, set it equal to wharton_email
        insertPayload.recovery_email = whartonEmail.trim();

        const { error: profErr } = await supabase.from("profiles").insert(insertPayload);
        if (profErr) {
          if ((profErr as any).code === "23505")
            throw new Error("Username or phone already in use.");
          throw profErr;
        }

        // 3) username->email mapping for future username-only logins
        await supabase.from("username_lookup").upsert({
          username_lower: uname.toLowerCase(),
          email: whartonEmail.trim().toLowerCase(),
        });

        setCurrentUser({
          id: uid,
          username: uname,
          wharton_email: whartonEmail.trim(),
          cohort,
          phone_e164: phoneE164,
          venmo_handle: venmoId,
        });
        setPassword("");
      } catch (err: any) {
        setAuthError(err.message || String(err));
      }
    })();
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    (async () => {
      try {
        const uname = normalizeUsername(username);

        // If they typed an email directly, allow email+password login (must be wharton email)
        if (uname.includes("@")) {
          if (!isWhartonEmail(uname)) throw new Error("Use your @wharton.upenn.edu email or your Username.");
          const { error: authErr } = await supabase.auth.signInWithPassword({
            email: uname.trim(),
            password,
          });
          if (authErr) throw new Error("Invalid email or password.");
        } else {
          // username → email
          if (!isValidUsername(uname)) throw new Error("Username must be First Last.");
          const { data: rec, error: findErr } = await supabase
            .from("username_lookup")
            .select("email")
            .eq("username_lower", uname.toLowerCase())
            .maybeSingle();
          if (findErr) throw findErr;
          if (!rec?.email) throw new Error("No account found for that username.");

          const { error: authErr } = await supabase.auth.signInWithPassword({
            email: rec.email,
            password,
          });
          if (authErr) throw new Error("Invalid username or password.");
        }

        // load profile
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;
        if (!uid) throw new Error("No active session.");
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, username, wharton_email, cohort, phone_e164, venmo_handle")
          .eq("id", uid)
          .maybeSingle();
        if (!prof) throw new Error("Profile not found.");
        setCurrentUser(prof as Profile);
        setPassword("");
      } catch (err: any) {
        setAuthError(err.message || String(err));
      }
    })();
  }

  /* ----- aggregates for charts/metrics ----- */
  const buyersPercents = useMemo(
    () => postings.filter((p) => p.eventId === eventId && p.role === "buyer").map((p) => p.percent),
    [postings, eventId]
  );
  const sellersPercents = useMemo(
    () => postings.filter((p) => p.eventId === eventId && p.role === "seller").map((p) => p.percent),
    [postings, eventId]
  );

  const distData = useMemo(() => {
    const sHist = histogram(sellersPercents, 5);
    const bHist = histogram(buyersPercents, 5);
    const len = Math.max(sHist.length, bHist.length);
    return Array.from({ length: len }).map((_, i) => {
      const s = sHist[i] ?? { key: "", count: 0 };
      const b = bHist[i] ?? { key: s.key, count: 0 };
      return {
        bucket: s.key || b.key,
        seller: -(s.count || 0), // left side
        buyer: b.count || 0,     // right side
      };
    });
  }, [buyersPercents, sellersPercents]);

  const maxCount = useMemo(
    () =>
      Math.max(
        1,
        ...distData.map((d) => Math.max(Math.abs(d.seller), Math.abs(d.buyer)))
      ),
    [distData]
  );

  const { curveData, clearing } = useMemo(() => {
    const { points, clearing } = curves(sellersPercents, buyersPercents);
    return { curveData: points, clearing };
  }, [buyersPercents, sellersPercents]);

  const clearingPriceDollars = useMemo(
    () => (clearing ? (clearing.p / 100) * eventPrice : 0),
    [clearing, eventPrice]
  );
  const matchedTrades = useMemo(() => clearing?.matched ?? 0, [clearing]);

  const spreadStats = useMemo(() => {
    if (!clearing)
      return { perUnitSpreadPct: 0, perUnitSpreadDollars: 0 };
    const p = clearing.p;
    const sEligible = sellersPercents.filter((s) => s <= p).sort((a, b) => a - b);
    const bEligible = buyersPercents.filter((b) => b >= p).sort((a, b) => b - a);
    const m = Math.min(sEligible.length, bEligible.length);
    if (m === 0) return { perUnitSpreadPct: 0, perUnitSpreadDollars: 0 };
    const avgSeller = sEligible.slice(0, m).reduce((a, c) => a + c, 0) / m;
    const perUnitSpreadPct = Math.max(0, p - avgSeller);
    return {
      perUnitSpreadPct,
      perUnitSpreadDollars: (perUnitSpreadPct / 100) * eventPrice,
    };
  }, [clearing, sellersPercents, buyersPercents, eventPrice]);

  const myMatches = useMemo(
    () =>
      currentUser
        ? computeDirectMatchesForUser(currentUser.id, eventId, postings)
        : [],
    [currentUser, eventId, postings]
  );

  /* ----- posting handler ----- */
  function postIntent() {
    if (!currentUser) {
      alert("Please sign in first.");
      return;
    }
    const p: Omit<Posting, "id"> = {
      userId: currentUser.id, // for matching (DB stores device_id; you can add created_by later)
      eventId,
      role,
      percent: Math.round(clamp01((percent || 0) / 100) * 100),
      tickets,
      name: currentUser.username,
      phone: currentUser.phone_e164,
    };
    (async () => {
      try {
        await upsertPosting(p);
        setPercent(100);
        setTickets(1);
        setPostSuccess(true);
        setPostInfo("Your post has been created/updated for this role & event.");
        setTimeout(() => {
          setPostSuccess(false);
          setPostInfo("");
        }, 3000);
      } catch (err: any) {
        alert(err.message || String(err));
      }
    })();
  }

  /* ----- render ----- */
  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900">
      <div className="max-w-7xl mx-auto p-6 md:p-8">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-3xl font-extrabold tracking-tight">Ticketmatch</h1>
          <p className="text-gray-700 mt-2 max-w-3xl">
            Plans at Wharton change all the time. Buy and resell Wharton tickets at face value or lower. Create an account, and buy/sell at your desired percentage price point. See market data update live, and match with others nearest your price point. No upcharging, large arbitrage or transaction fees. 
            Just matching peers at the closest level for big savings! Subscribe with $5 venmo to @payajb for a month's tiered accesses; highest tiers will receive data, SMS notifications, line-jump matching, and more after the free trial. 
          </p>
        </div>

        {postingsError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
            {postingsError}
          </div>
        )}

        {/* Auth */}
        {!currentUser ? (
          <Card className="p-5 mb-6">
            <SectionTitle
              title="Create an account or sign in"
              subtitle="Username must be First Last (letters only). Password 8+ chars. Signup requires WG cohort, phone, Venmo, and @wharton.upenn.edu email."
            />
            <form
              onSubmit={authMode === "signup" ? handleSignup : handleLogin}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div className="md:col-span-2">
                <Label>Username</Label>
                <Input
                  placeholder="Jane Doe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {authMode === "signup" && (
                <div className="contents">
                  <div>
                    <Label>WG Cohort</Label>
                    <Select value={cohort} onChange={(e) => setCohort(e.target.value as "WG26" | "WG27")}>
                      <option value="WG26">WG26</option>
                      <option value="WG27">WG27</option>
                    </Select>
                  </div>

                  <div>
                    <Label>Phone Number</Label>
                    <div className="flex items-center gap-2">
                      <Select
                        className="w-28"
                        value={areaCode}
                        onChange={(e) => setAreaCode(e.target.value)}
                      >
                        {AREA_CODES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </Select>
                      <Input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="digits"
                        value={phoneDigits}
                        onChange={(e) => setPhoneDigits(onlyDigits(e.target.value))}
                        required
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Stored as E.164. Example: {areaCode}
                      {phoneDigits || "XXXXXXXX"}
                    </div>
                  </div>

                  <div>
                    <Label>Venmo Handle</Label>
                    <Input
                      placeholder="@yourhandle"
                      value={venmo}
                      onChange={(e) => setVenmo(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label>Wharton Email</Label>
                    <Input
                      type="email"
                      placeholder="you@wharton.upenn.edu"
                      value={whartonEmail}
                      onChange={(e) => setWhartonEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="md:col-span-2 flex items-center gap-2">
                <Button type="submit">
                  {authMode === "signup" ? "Create account" : "Sign in"}
                </Button>
                <GhostButton
                  type="button"
                  onClick={() =>
                    setAuthMode(authMode === "signup" ? "login" : "signup")
                  }
                >
                  {authMode === "signup"
                    ? "Have an account? Sign in"
                    : "New here? Create account"}
                </GhostButton>
                {authError ? (
                  <span className="text-sm text-red-600">{authError}</span>
                ) : null}
              </div>
            </form>
          </Card>
        ) : (
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-700">
              Signed in as <strong>{currentUser.username}</strong>
            </div>
            <GhostButton onClick={() => supabase.auth.signOut()}>Sign out</GhostButton>
          </div>
        )}

        {/* Inputs & My Matches */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-5 lg:col-span-1">
            <SectionTitle title="Your Inputs" />
            {currentUser ? (
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input value={currentUser.username} readOnly />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={currentUser.phone_e164} readOnly />
                </div>
                <div>
                  <Label>Role</Label>
                  <div className="flex gap-4 items-center mt-1 text-sm">
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        checked={role === "buyer"}
                        onChange={() => setRole("buyer")}
                      />{" "}
                      Buyer
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        checked={role === "seller"}
                        onChange={() => setRole("seller")}
                      />{" "}
                      Seller
                    </label>
                  </div>
                </div>
                <div>
                  <Label>Event</Label>
                  <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                    {EVENTS.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Percent (%) of Ticket Value</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={percent}
                    onChange={(e) =>
                      setPercent(
                        Math.max(0, Math.min(100, Number(e.target.value)))
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Number of Tickets</Label>
                  <Select
                    value={tickets}
                    onChange={(e) => setTickets(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" onClick={postIntent}>
                    Post
                  </Button>
                  {postSuccess && (
                    <span className="text-green-600 text-sm font-semibold">
                      Success!
                    </span>
                  )}
                  {postInfo && (
                    <span className="text-xs text-gray-600">{postInfo}</span>
                  )}
                </div>

                {/* My Matches */}
                <div className="pt-2">
                  <SectionTitle
                    title="My Matches"
                    subtitle="Direct matches at your price appear here with contact info."
                  />
                  {myMatches.length === 0 ? (
                    <div className="text-sm text-gray-400">
                      No direct matches yet
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-auto text-sm">
                      {myMatches.slice(0, 10).map((m, i) => {
                        const buyerFirst = m.me.role === "buyer" ? m.me : m.other;
                        const sellerFirst =
                          m.me.role === "seller" ? m.me : m.other;
                        const agreedPct = m.agreedPct;
                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3"
                          >
                            <div>
                              {sellerFirst.name} {" <> "} {buyerFirst.name} —{" "}
                              <strong>{agreedPct}%</strong> value of ticket
                              <div className="text-xs text-gray-500">
                                {m.tickets} ticket(s) • Contact: {buyerFirst.phone}
                              </div>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              @ {toMoney((agreedPct / 100) * eventPrice)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Sign in to enter your inputs and see matches.
              </div>
            )}
          </Card>

          {/* Charts / Metrics side-by-side */}
          <div className="lg:col-span-2 grid lg:grid-cols-2 gap-6">
            {/* Public Distribution */}
            <Card className="p-5">
              <SectionTitle
                title="Public Distribution (Sellers vs Buyers)"
                subtitle="Left bars = sellers (purple, negative), right bars = buyers (green, positive)."
              />
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={distData}
                    layout="vertical"
                    margin={{ top: 10, right: 20, left: 20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      domain={[
                        -Math.max(2, maxCount + 1),
                        Math.max(2, maxCount + 1),
                      ]}
                      tickFormatter={(v) => Math.abs(Number(v)).toString()}
                    />
                    <YAxis dataKey="bucket" type="category" tick={{ fontSize: 12 }} width={70} />
                    <Tooltip formatter={(v: any, name: any) => [Math.abs(Number(v)), name]} />
                    <Legend />
                    <Bar dataKey="seller" name="Sellers" fill="#6366F1" />
                    <Bar dataKey="buyer" name="Buyers" fill="#10B981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Supply vs Demand + metrics */}
            <Card className="p-5">
              <SectionTitle
                title="Cumulative Supply vs Demand"
                subtitle={`Event: ${currentEvent.label}`}
              />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-3">
                <Card className="p-4 lg:col-span-2">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={curveData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="p" tickFormatter={(v) => `${v}%`} />
                        <YAxis allowDecimals={false} />
                        <Tooltip
                          labelFormatter={(label: any) => `Price: ${label}%`}
                          formatter={(value: any, name: any) => [
                            value,
                            name === "supply"
                              ? "Supply (sellers)"
                              : name === "demand"
                              ? "Demand (buyers)"
                              : name,
                          ]}
                        />
                        <Legend />
                        <ReferenceLine
                          x={clearing?.p ?? 0}
                          stroke="#EF4444"
                          strokeDasharray="5 3"
                          label={`p* = ${clearing?.p ?? 0}%`}
                        />
                        <Line type="monotone" dataKey="supply" name="Supply (sellers)" stroke="#6366F1" dot={false} />
                        <Line type="monotone" dataKey="demand" name="Demand (buyers)" stroke="#10B981" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <div className="lg:col-span-1 grid gap-3 content-start">
                  <Card className="p-4">
                    <div className="text-sm text-gray-500">Estimated Clearing Price</div>
                    <div className="text-2xl font-bold">{clearing?.p ?? 0}%</div>
                    <div className="text-sm text-gray-600">
                      ≈ {toMoney(clearingPriceDollars)} at face value {toMoney(eventPrice)}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-gray-500">Matched Trades at p*</div>
                    <div className="text-2xl font-bold">{matchedTrades}</div>
                    <div className="text-xs text-gray-500">min(supply, demand) at p*</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-gray-500">Per-Unit Spread (p* − avg seller)</div>
                    <div className="text-xl font-semibold">
                      {spreadStats.perUnitSpreadPct.toFixed(2)}%
                    </div>
                    <div className="text-sm text-gray-600">
                      ≈ {toMoney(spreadStats.perUnitSpreadDollars)} per ticket
                    </div>
                  </Card>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}