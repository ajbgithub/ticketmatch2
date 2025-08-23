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

/********************
 * Ticketmatch — Wharton resale at face value or less
 * --------------------------------------------------
 * This component is self-contained for local prototyping:
 *  - Auth: demo-only (localStorage). Username + password + @upenn.edu email + +1 phone.
 *  - Replace-mode postings: one BUY and one SELL per (user,event).
 *  - Public charts + private matches view.
 ********************/

/* ========== UI primitives (unstyled except Tailwind) ========== */
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

/* ========== Types & helpers ========== */
type Role = "buyer" | "seller";
interface Account {
  id: string;
  username: string; // normalized "First Last WG '26|27"
  password: string; // demo-only
  recoveryEmail: string; // @upenn.edu
  phone: string; // +1XXXXXXXXXX
}
interface Posting {
  id: string;
  userId: string;
  eventId: string;
  role: Role;
  percent: number; // 0..100
  tickets: number; // 1..4
  name: string; // from username
  phone: string; // E.164
}

const uid = () => Math.random().toString(36).slice(2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const toMoney = (v: number) => `$${(Number.isFinite(v) ? v : 0).toFixed(2)}`;
const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");
const e164FromDigits = (digits: string) => `+1${onlyDigits(digits).slice(0, 10)}`;

// Accept WG '26 / WG26 / WG 26 and normalize to WG '26
function isValidUsername(u: string) {
  return /^[A-Za-z]+\s+[A-Za-z]+\s+WG\s*'?\s*(26|27)$/i.test(u.trim());
}
function normalizeUsername(u: string) {
  return u.trim().replace(/\bWG\s*'?\s*(26|27)\b/i, "WG '$1");
}
function isValidEduEmail(e: string) {
  return /@upenn\.edu$/i.test((e || "").trim());
}
function isValidUSPhone(p: string) {
  return /^\+1\d{10}$/.test((p || "").trim());
}

/* ========== Event constant ========== */
const EVENTS = [{ id: "rb", label: "Red and Blue Ball - $60", price: 60 }];

/* ========== localStorage helpers ========== */
const LS_ACCOUNTS = "ticketmatch_accounts";
const LS_SESSION = "ticketmatch_session";
const LS_POSTINGS = "ticketmatch_postings";
function load<T>(k: string, d: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : d;
  } catch {
    return d;
  }
}
function save<T>(k: string, v: T) {
  localStorage.setItem(k, JSON.stringify(v));
}

/* ========== Charts math ========== */
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
  // pick best by matched, then by balance, then by higher p
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

function literalBrackets() {
  return " <> ";
}

/* ========== Auth (demo-only) ========== */
function useAccountAuth() {
  const [accounts, setAccounts] = useState<Account[]>(() =>
    load<Account[]>(LS_ACCOUNTS, [])
  );
  const [session, setSession] = useState<string | null>(() =>
    load<string | null>(LS_SESSION, null)
  );

  function createAccount(a: Omit<Account, "id">) {
    const errors: string[] = [];
    a.username = normalizeUsername(a.username);
    if (!isValidUsername(a.username))
      errors.push(
        "Username must be First Last WG '26 or WG '27 (WG26/WG 27 accepted)"
      );
    if (!isValidEduEmail(a.recoveryEmail))
      errors.push("Recovery email must be @upenn.edu");
    if (!isValidUSPhone(a.phone))
      errors.push("Phone must be a US number beginning with +1 and 10 digits");
    if (a.password.length < 8)
      errors.push("Password must be at least 8 characters");
    if (
      accounts.some(
        (u) =>
          u.username.toLowerCase() === a.username.trim().toLowerCase()
      )
    )
      errors.push("Username already exists");
    if (
      accounts.some(
        (u) => (u.phone || "").trim() === (a.phone || "").trim()
      )
    )
      errors.push("Phone number is already tied to an existing account");
    if (errors.length) throw new Error(errors.join("; "));

    const acc: Account = { id: uid(), ...a };
    const next = [acc, ...accounts];
    setAccounts(next);
    save(LS_ACCOUNTS, next);
    setSession(acc.id);
    save(LS_SESSION, acc.id);
    return acc;
  }

  function signIn(username: string, password: string) {
    const u = accounts.find(
      (a) =>
        a.username.toLowerCase() ===
          normalizeUsername(username).toLowerCase() && a.password === password
    );
    if (!u) throw new Error("Invalid credentials");
    setSession(u.id);
    save(LS_SESSION, u.id);
    return u;
  }

  function signOut() {
    setSession(null);
    save(LS_SESSION, null);
  }

  const currentUser = session
    ? accounts.find((a) => a.id === session) || null
    : null;

  return { accounts, currentUser, createAccount, signIn, signOut } as const;
}

/* ========== Postings (replace mode; one BUY and one SELL per user+event) ========== */
function usePostings() {
  const [postings, setPostings] = useState<Posting[]>(() =>
    load<Posting[]>(LS_POSTINGS, [])
  );
  useEffect(() => save(LS_POSTINGS, postings), [postings]);

  /**
   * upsertPosting — Replace mode per (user,event,role).
   * Returns { replaced } to show a friendly message.
   */
  function upsertPosting(
    p: Omit<Posting, "id"> & { id?: string }
  ): { replaced: boolean } {
    if (!p) throw new Error("Invalid posting payload");
    const phone = (p.phone || "").trim();
    const event = (p.eventId || "").trim();
    if (!phone || !isValidUSPhone(phone))
      throw new Error("Phone must be +1 followed by 10 digits");
    if (!event) throw new Error("Missing event");

    let replaced = false;
    setPostings((prev) => {
      const hadSame = prev.some(
        (x) => x.userId === p.userId && x.eventId === p.eventId && x.role === p.role
      );
      replaced = hadSame;
      const withoutSame = prev.filter(
        (x) => !(x.userId === p.userId && x.eventId === p.eventId && x.role === p.role)
      );
      return [...withoutSame, { id: p.id || uid(), ...p, phone }];
    });
    return { replaced };
  }

  return { postings, upsertPosting } as const;
}

/* ========== Matching (direct) ========== */
function computeDirectMatchesForUser(
  userId: string,
  eventId: string,
  postings: Posting[]
) {
  const mine = postings.filter((p) => p.userId === userId && p.eventId === eventId);
  const others = postings.filter((p) => p.userId !== userId && p.eventId === eventId);
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
        const agreedPct = Math.min(me.percent, best.percent); // no upcharge
        matches.push({
          me,
          other: best,
          agreedPct,
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
        const agreedPct = Math.min(best.percent, me.percent);
        matches.push({
          me,
          other: best,
          agreedPct,
          tickets: Math.min(me.tickets, best.tickets),
        });
      }
    }
  }
  return matches;
}

/* ========== Main component ========== */
export default function WTPInteractiveDiagram() {
  const { currentUser, createAccount, signIn, signOut } = useAccountAuth();
  const { postings, upsertPosting } = usePostings();

  // Auth UI state
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [authError, setAuthError] = useState<string>("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [phoneDigits, setPhoneDigits] = useState(""); // user-typed 10 digits only

  // Posting inputs
  const [eventId, setEventId] = useState<string>(EVENTS[0].id);
  const currentEvent = EVENTS[0];
  const eventPrice = currentEvent.price;
  const [role, setRole] = useState<Role>("buyer");
  const [percent, setPercent] = useState<number>(100);
  const [tickets, setTickets] = useState<number>(1);
  const [postSuccess, setPostSuccess] = useState<boolean>(false);
  const [postInfo, setPostInfo] = useState<string>("");

  // Aggregates for charts
  const buyersPercents = useMemo(
    () =>
      postings
        .filter((p) => p.eventId === eventId && p.role === "buyer")
        .map((p) => p.percent),
    [postings, eventId]
  );
  const sellersPercents = useMemo(
    () =>
      postings
        .filter((p) => p.eventId === eventId && p.role === "seller")
        .map((p) => p.percent),
    [postings, eventId]
  );

  const { histData, maxCount, curveData, clearing } = useMemo(() => {
    const sHist = histogram(sellersPercents, 5);
    const bHist = histogram(buyersPercents, 5);
    const len = Math.max(sHist.length, bHist.length);
    const combined = Array.from({ length: len }).map((_, i) => {
      const sBin: any = sHist[i] ?? { key: "", mid: 0, count: 0 };
      const bBin: any = bHist[i] ?? {
        key: sBin.key || "",
        mid: sBin.mid || 0,
        count: 0,
      };
      return {
        bucket: sBin.key || bBin.key,
        y: sBin.mid || bBin.mid,
        seller: -(sBin.count || 0),
        buyer: bBin.count || 0,
      };
    });
    const mc = Math.max(
      1,
      ...combined.map((d) => Math.max(Math.abs(d.seller), Math.abs(d.buyer)))
    );
    const { points, clearing } = curves(sellersPercents, buyersPercents);
    return { histData: combined, maxCount: mc, curveData: points, clearing };
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
    const sEligible = sellersPercents
      .filter((s) => s <= p)
      .sort((a, b) => a - b);
    const bEligible = buyersPercents
      .filter((b) => b >= p)
      .sort((a, b) => b - a);
    const m = Math.min(sEligible.length, bEligible.length);
    if (m === 0) return { perUnitSpreadPct: 0, perUnitSpreadDollars: 0 };
    const matchedSellers = sEligible.slice(0, m);
    const avgMatchedSellerPct =
      matchedSellers.reduce((a, c) => a + c, 0) / m;
    const perUnitSpreadPct = Math.max(0, p - avgMatchedSellerPct);
    const perUnitSpreadDollars = (perUnitSpreadPct / 100) * eventPrice;
    return { perUnitSpreadPct, perUnitSpreadDollars };
  }, [clearing, sellersPercents, buyersPercents, eventPrice]);

  const myMatches = useMemo(
    () =>
      currentUser
        ? computeDirectMatchesForUser(currentUser.id, eventId, postings)
        : [],
    [currentUser, eventId, postings]
  );

  /* ===== Auth handlers ===== */
  function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    try {
      const fullPhone = e164FromDigits(phoneDigits);
      if (!isValidUSPhone(fullPhone))
        throw new Error("Phone must be +1 and 10 digits");
      createAccount({
        username: username.trim(),
        password,
        recoveryEmail: recoveryEmail.trim(),
        phone: fullPhone,
      });
      setPassword("");
    } catch (err: any) {
      setAuthError(err.message || String(err));
    }
  }
  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    try {
      signIn(username.trim(), password);
      setPassword("");
    } catch (err: any) {
      setAuthError(err.message || String(err));
    }
  }

  /* ===== Posting handler ===== */
  function postIntent() {
    if (!currentUser) {
      alert("Please sign in first");
      return;
    }
    const name = currentUser.username;
    const p: Omit<Posting, "id"> = {
      userId: currentUser.id,
      eventId,
      role,
      percent: Math.round(clamp01((percent || 0) / 100) * 100),
      tickets,
      name,
      phone: currentUser.phone,
    };
    try {
      const { replaced } = upsertPosting(p);
      setPercent(100);
      setTickets(1);
      setPostSuccess(true);
      setPostInfo(
        replaced
          ? "Updated your previous post for this event & role."
          : "Your post has been created."
      );
      setTimeout(() => {
        setPostSuccess(false);
        setPostInfo("");
      }, 3000);
    } catch (err: any) {
      alert(err.message || String(err));
    }
  }

  /* ===== Self-tests (console only) ===== */
  useEffect(() => {
    const h = histogram([0, 4, 5, 6, 100], 5);
    console.assert(
      h[0].count === 2 && h[1].count === 2 && h[h.length - 1].count === 1,
      "hist ok"
    );
    const { clearing: c } = curves([50, 60], [70, 80]);
    console.assert(c.matched >= 0, "curves ok");
    console.assert(isValidUsername("Jane Doe WG '26"), "username '26 ok");
    console.assert(isValidUsername("John Smith WG26"), "username WG26 ok");
    console.assert(isValidUsername("Ann Lee WG 27"), "username WG 27 ok");
    console.assert(isValidUSPhone("+11234567890"), "+1 phone valid");
    console.assert(!isValidUSPhone("123-456-7890"), "non +1 invalid");
    console.assert(isValidEduEmail("a@upenn.edu"), "upenn email ok");
    console.assert(!isValidEduEmail("a@mit.edu"), "non-upenn invalid");
    console.assert(
      e164FromDigits("215-555-1212") === "+12155551212",
      "digits->E.164 ok"
    );
    const lbl = `Seller${literalBrackets()}Buyer`;
    console.assert(
      lbl.includes(" <> ") && lbl.includes("Seller") && lbl.includes("Buyer"),
      "label literal <> ok"
    );
  }, []);

  /* ===== Render ===== */
  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900">
      <div className="max-w-7xl mx-auto p-6 md:p-8">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-3xl font-extrabold tracking-tight">Ticketmatch</h1>
          <p className="text-gray-700 mt-2 max-w-3xl">
            <strong>Plans change all the time at Wharton.</strong> This helps
            you buy and sell tickets on the resale market at your price point.  Subscribe for market data, notifications and better connections with your peers. No
            upcharging, no large arbitrage, and no transaction fees. 
          </p>

          {/* Subscribe (informational) */}
          <Card className="p-4 mt-4">
            <div className="text-sm text-gray-700 max-w-3xl space-y-2">
              <p className="text-gray-700">
                <strong>Subscribe.</strong>{" "}
                <em>This is a free trial</em>.
              </p>
              <p className="text-gray-700">
                <em>Venmo @payajb $5 to maintain one month of this subscription
                access</em> that provides you with market data and matches in order to save big! 
              </p>
              <p className="text-gray-700">
                Highest tier subscribers will soon receive SMS match notifications, closest matches, 
                and priority matches. Let us know if there's
                something you want to see!
              </p>
            </div>
          </Card>
        </div>

        {/* Auth */}
        {!currentUser ? (
          <Card className="p-5 mb-6">
            <SectionTitle
              title="Create an account or sign in"
              subtitle="Usernames must be First Last WG '26 or WG '27 (WG26/WG 27 variations accepted). Recovery email must be @upenn.edu. US phone must begin with +1."
            />
            <form
              onSubmit={authMode === "signup" ? handleSignup : handleLogin}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div className="md:col-span-2">
                <Label>Username</Label>
                <Input
                  placeholder="Joe Wharton WG '26"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <div className="text-xs text-gray-500 mt-1">
                  Format required: First Last WG '26 or WG '27. Accounts
                  violating this will be deleted.
                </div>
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
                    <Label>Recovery Email (@upenn.edu)</Label>
                    <Input
                      type="email"
                      placeholder="you@upenn.edu"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>US Phone Number</Label>
                    <div className="flex items-center gap-2">
                      <div className="px-3 py-2 rounded-xl border border-gray-300 bg-gray-50 text-gray-700 select-none">
                        +1
                      </div>
                      <Input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={12}
                        placeholder="2155551212"
                        value={phoneDigits}
                        onChange={(e) =>
                          setPhoneDigits(onlyDigits(e.target.value).slice(0, 10))
                        }
                        required
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      We will store it as +1XXXXXXXXXX.
                    </div>
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
            <GhostButton onClick={signOut}>Sign out</GhostButton>
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
                  <Label>Phone for SMS</Label>
                  <Input value={currentUser.phone} readOnly />
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
                  <Select
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                  >
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
                      {" "}
                      Success!
                    </span>
                  )}
                  {postInfo && (
                    <span className="text-xs text-gray-600"> {postInfo}</span>
                  )}
                </div>

                {/* My Matches */}
                <div className="pt-2">
                  <SectionTitle
                    title="My Matches"
                    subtitle="If someone else matches at this percent for the event, their contact will appear below."
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
                              {sellerFirst.name}
                              {literalBrackets()}
                              {buyerFirst.name} — <strong>{agreedPct}%</strong>{" "}
                              value of ticket
                              <div className="text-xs text-gray-500">
                                {m.tickets} ticket(s) • Contact:{" "}
                                {buyerFirst.phone}
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
                subtitle="Left bars = sellers (negative), right bars = buyers. Aggregated for Red and Blue Ball."
              />
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={histData}
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
                    <YAxis
                      dataKey="bucket"
                      type="category"
                      tick={{ fontSize: 12 }}
                      width={70}
                    />
                    <Tooltip
                      formatter={(value: any, name: any) => [
                        Math.abs(Number(value)),
                        name === "seller" ? "Sellers" : "Buyers",
                      ]}
                    />
                    <Legend />
                    <Bar dataKey="seller" name="Sellers" fill="#6366F1" />
                    <Bar dataKey="buyer" name="Buyers" fill="#10B981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Supply vs Demand + Metrics */}
            <Card className="p-5">
              <SectionTitle
                title="Cumulative Supply vs Demand"
                subtitle={`Event: ${currentEvent.label}`}
              />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-3">
                <Card className="p-4 lg:col-span-2">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={curveData}
                        margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                      >
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
                        <Line
                          type="monotone"
                          dataKey="supply"
                          name="Supply (sellers)"
                          stroke="#6366F1"
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="demand"
                          name="Demand (buyers)"
                          stroke="#10B981"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <div className="lg:col-span-1 grid gap-3 content-start">
                  <Card className="p-4">
                    <div className="text-sm text-gray-500">
                      Estimated Clearing Price
                    </div>
                    <div className="text-2xl font-bold">{clearing?.p ?? 0}%</div>
                    <div className="text-sm text-gray-600">
                      ≈ {toMoney(clearingPriceDollars)} at face value{" "}
                      {toMoney(eventPrice)}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-gray-500">
                      Matched Trades at p*
                    </div>
                    <div className="text-2xl font-bold">{matchedTrades}</div>
                    <div className="text-xs text-gray-500">
                      min(supply, demand) at p*
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-gray-500">
                      Per-Unit Spread (p* − avg seller)
                    </div>
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
