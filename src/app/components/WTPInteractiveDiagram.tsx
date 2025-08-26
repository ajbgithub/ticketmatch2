'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { X, MessageCircle, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

/* =========================
   Simple UI helpers
   ========================= */
type DivProps = React.HTMLAttributes<HTMLDivElement>;
const Card: React.FC<DivProps & { className?: string }> = ({ className = '', children, ...rest }) => (
  <div className={`rounded-2xl shadow-sm border border-gray-200 bg-white ${className}`} {...rest}>{children}</div>
);
const SectionTitle: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="mb-4">
    <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    {subtitle ? <p className="text-sm text-gray-500 leading-snug">{subtitle}</p> : null}
  </div>
);
const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className = '', children, ...rest }) => (
  <label className={`block text-sm font-medium text-gray-700 ${className}`} {...rest}>{children}</label>
);
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...rest }) => (
  <input className={`w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`} {...rest} />
);
const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', children, ...rest }) => (
  <select className={`w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`} {...rest}>{children}</select>
);
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }> = ({ className = '', children, ...rest }) => (
  <button className={`rounded-xl px-3 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700 transition ${className}`} {...rest}>{children}</button>
);
const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }> = ({ className = '', children, ...rest }) => (
  <button className={`rounded-xl px-3 py-2 text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition ${className}`} {...rest}>{children}</button>
);
const TradedButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="rounded-lg px-2 py-1 text-xs font-semibold bg-green-600 text-white hover:bg-green-500 transition">Traded</button>
);
const DeleteButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="rounded-lg p-1 text-red-600 hover:bg-red-50 transition" aria-label="Delete">
    <X size={16} />
  </button>
);
const WeTradedButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="rounded-lg px-3 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 transition">We Traded!</button>
);

/* =========================
   Types & constants
   ========================= */
type Role = 'buyer' | 'seller';
type Tier = 'Limited' | 'Basic' | 'Pro' | 'Max';

interface Profile {
  id: string;
  username: string;
  wharton_email: string;
  recovery_email?: string | null;
  cohort: 'WG26' | 'WG27';
  phone_e164: string;
  venmo_handle: string;
  tier: Tier;
}

interface Posting {
  id: string;          // DB id as string
  userId: string;      // device_id
  eventId: string;     // event_id
  role: Role;          // 'buyer' | 'seller'
  percent: number;     // 0..100
  tickets: number;     // always 1
  name: string;        // username
  phone: string;       // phone_e164
  cohort?: string;
  venmo?: string;
  email?: string;
}

interface Comment {
  id: string;
  username: string;
  message: string;
  timestamp: Date;
}
interface Trade {
  id: string;
  buyerName: string;
  sellerName: string;
  eventId: string;
  price: number;
  tickets: number;
  timestamp: Date;
}

const EVENTS = [
  { id: 'rb', label: 'Red and Blue Ball - $60', price: 60 },
  { id: 'wp', label: 'White Party - Member Price $50', price: 50 },
] as const;

const TIER_INFO: Record<Tier, { price: string; features: string[] }> = {
  Limited: { price: '$0/mo', features: ['Buy 1 and sell 1 at a time', 'Delete old posts to make new posts', 'See direct matches only', 'See 1-3 matches'] },
  Basic:   { price: '$5/mo', features: ['Buy 2 and sell 2 at a time', 'Delete old posts to make new posts', 'See direct and closest matches within 10%'] },
  Pro:     { price: '$10/mo', features: ['Buy 5 and sell 5 at a time', 'See direct matches and matches within 25%'] },
  Max:     { price: '$15/mo', features: ['SMS instant alerts', 'Unlimited trades', 'Match with entire market'] },
};

const AREA_CODES: string[] = ['+1', '+44', '+61', '+81', '+82', '+91', '+33', '+49', '+39', '+34', '+86', '+971', '+65', '+852', '+353'];

/* =========================
   Utils
   ========================= */
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const toMoney = (v: number): string => `$${(Number.isFinite(v) ? v : 0).toFixed(2)}`;
const onlyDigits = (s: string): string => (s || '').replace(/\D+/g, '');
const getDeviceId = (): string => {
  if (typeof window === 'undefined') return 'server';
  const k = 'ticketmatch_device_id';
  let id = localStorage?.getItem(k);
  if (!id) { id = Math.random().toString(36).slice(2); localStorage?.setItem(k, id); }
  return id;
};
const isValidUsername = (u: string): boolean => /^[A-Za-z]+ [A-Za-z]+$/.test((u || '').trim());
const normalizeUsername = (u: string): string => (u || '').trim().replace(/\s+/, ' ');
const isWhartonEmail = (e: string): boolean => /@wharton\.upenn\.edu$/i.test((e || '').trim());
const buildE164 = (code: string, digits: string): string => {
  const d = onlyDigits(digits);
  const c = code.startsWith('+') ? code : `+${onlyDigits(code)}`;
  return `${c}${d}`;
};
const isValidE164 = (e164: string): boolean => /^\+\d{6,16}$/.test((e164 || '').trim());
const normalizeVenmo = (h: string): string => (h || '').trim().replace(/^@/, '');
const isValidVenmo = (h: string): boolean => /^[A-Za-z0-9_]{3,30}$/.test(normalizeVenmo(h));

/* =========================
   Component
   ========================= */
export default function WTPInteractiveDiagram() {
  // DB-backed state
  const [postings, setPostings] = useState<Posting[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);

  // UI state
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [authError, setAuthError] = useState<string>('');
  const [showTierDropdown, setShowTierDropdown] = useState<Tier | null>(null);
  const [totalTradedTickets, setTotalTradedTickets] = useState<number>(47);
  const [comments, setComments] = useState<Comment[]>([
    { id: '1', username: 'Alice Chen', message: 'Looking forward to the Red Ball!', timestamp: new Date() },
    { id: '2', username: 'Bob Smith', message: 'Anyone selling White Party tickets below 80%?', timestamp: new Date() },
  ]);
  const [newComment, setNewComment] = useState<string>('');
  const [trades, setTrades] = useState<Trade[]>([]);

  // Auth fields
  const [username, setUsername] = useState<string>('');
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [cohort, setCohort] = useState<'WG26' | 'WG27'>('WG26');
  const [areaCode, setAreaCode] = useState<string>(AREA_CODES[0]);
  const [phoneDigits, setPhoneDigits] = useState<string>('');
  const [venmo, setVenmo] = useState<string>('');
  const [whartonEmail, setWhartonEmail] = useState<string>('');

  // Posting fields
  const [eventId, setEventId] = useState<(typeof EVENTS)[number]['id']>(EVENTS[0].id);
  const [role, setRole] = useState<Role>('buyer');
  const [percent, setPercent] = useState<number>(100);

  const currentEvent = useMemo(() => EVENTS.find((e) => e.id === eventId), [eventId]);
  const eventPrice = currentEvent?.price ?? 0;

  /* -------- Load session, profile, postings; wire realtime -------- */
  useEffect(() => {
    let sub: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const userId = s?.session?.user?.id;

      if (userId) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (prof) {
          setCurrentUser({
            id: userId,
            username: prof.username,
            wharton_email: prof.wharton_email,
            cohort: prof.cohort,
            phone_e164: prof.phone_e164,
            venmo_handle: prof.venmo_handle,
            tier: 'Limited',
          });
        }
      }

      await refreshPostings();

      sub = supabase
        .channel('postings_public_stream')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'postings_public' },
          (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const r: any = payload.new;
              setPostings((prev) => {
                const rest = prev.filter((p) => p.id !== String(r.id));
                return [
                  ...rest,
                  {
                    id: String(r.id),
                    userId: r.device_id,
                    eventId: r.event_id,
                    role: r.role,
                    percent: r.percent,
                    tickets: r.tickets,
                    name: r.username,
                    phone: r.phone_e164,
                    cohort: r.cohort ?? undefined,
                    venmo: r.venmo_handle ?? undefined,
                    email: r.email ?? r.email_address ?? undefined,
                  },
                ];
              });
            } else if (payload.eventType === 'DELETE') {
              const r: any = payload.old;
              setPostings((prev) => prev.filter((p) => p.id !== String(r.id)));
            }
          }
        )
        .subscribe();
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange(async (evt, sess) => {
      if (evt === 'SIGNED_IN' && sess?.user) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', sess.user.id).maybeSingle();
        if (prof) {
          setCurrentUser({
            id: sess.user.id,
            username: prof.username,
            wharton_email: prof.wharton_email,
            cohort: prof.cohort,
            phone_e164: prof.phone_e164,
            venmo_handle: prof.venmo_handle,
            tier: 'Limited',
          });
        }
      }
      if (evt === 'SIGNED_OUT') {
        setCurrentUser(null);
      }
    });

    return () => {
      authSub.subscription.unsubscribe();
      if (sub) supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshPostings = async () => {
    const { data, error } = await supabase
      .from('postings_public')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('Error fetching postings:', error);
      return;
    }
    if (data) {
      setPostings(
        data.map((r: any) => ({
          id: String(r.id),
          userId: r.device_id,
          eventId: r.event_id,
          role: r.role,
          percent: r.percent,
          tickets: r.tickets,
          name: r.username,
          phone: r.phone_e164,
          cohort: r.cohort ?? undefined,
          venmo: r.venmo_handle ?? undefined,
          email: r.email ?? r.email_address ?? undefined,
        }))
      );
    }
  };

  /* -------- Signup: auth + profile update (trigger pre-creates) -------- */
  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');

    const uname = normalizeUsername(username);
    if (!isValidUsername(uname)) {
      setAuthError('Username must be First Last (e.g., "John Smith").');
      return;
    }
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }
    if (!isWhartonEmail(whartonEmail)) {
      setAuthError('Email must end with @wharton.upenn.edu.');
      return;
    }

    const phoneE164 = buildE164(areaCode, phoneDigits);
    if (!isValidE164(phoneE164)) {
      setAuthError('Enter a valid phone number.');
      return;
    }

    const venmoId = normalizeVenmo(venmo);
    if (!isValidVenmo(venmoId)) {
      setAuthError('Enter a valid Venmo handle (3-30 characters, letters/numbers/underscore only).');
      return;
    }

    try {
      const { data: sign, error: signErr } = await supabase.auth.signUp({
        email: whartonEmail.trim(),
        password,
      });
      if (signErr) {
        setAuthError(`Sign up failed: ${signErr.message}`);
        return;
      }
      if (!sign?.user) {
        setAuthError('Sign up failed - no user returned');
        return;
      }

      // If email confirmations are ON, there might be no session yet.
      const hasSession = !!sign.session;

      if (hasSession) {
        const { error: profileErr } = await supabase
          .from('profiles')
          .update({
            username: uname,
            cohort,
            phone_e164: phoneE164,
            venmo_handle: venmoId,
            wharton_email: whartonEmail.trim(),
            recovery_email: '',
          })
          .eq('id', sign.user.id);

        if (profileErr) {
          console.error('Profile update error:', profileErr);
          setAuthError(`Profile update failed: ${profileErr.message}`);
          return;
        }

        setCurrentUser({
          id: sign.user.id,
          username: uname,
          wharton_email: whartonEmail.trim(),
          cohort,
          phone_e164: phoneE164,
          venmo_handle: venmoId,
          tier: 'Limited',
        });
      } else {
        // No session yet; the DB trigger already created a stub profile.
        setAuthError('Check your inbox to verify your email, then sign in to finish.');
      }

      setPassword('');
      setUsername('');
      setPhoneDigits('');
      setVenmo('');
      setWhartonEmail('');
    } catch (err: any) {
      console.error('Signup error:', err);
      setAuthError(`Signup failed: ${err.message || 'Unknown error'}`);
    }
  };

  /* -------- Login: email or username + password -------- */
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');

    let emailToUse = loginEmail.trim();

    if (!emailToUse.includes('@') && isValidUsername(loginEmail)) {
      const { data: profiles, error: lookupError } = await supabase
        .from('profiles')
        .select('wharton_email')
        .eq('username', normalizeUsername(loginEmail))
        .limit(1);

      if (lookupError) {
        setAuthError('Error looking up user. Please use your Wharton email address.');
        return;
      }
      if (!profiles || profiles.length === 0) {
        setAuthError('Username not found. Use your First Last or Wharton email.');
        return;
      }
      emailToUse = profiles[0].wharton_email;
    }

    if (!emailToUse.includes('@')) {
      setAuthError('Please enter your Wharton email address or a valid username.');
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      });

      if (error) {
        setAuthError(`Login failed: ${error.message}`);
        return;
      }
      if (!data?.user) {
        setAuthError('Login failed - no user returned');
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profErr) {
        console.error('Profile fetch error:', profErr);
        setAuthError('Error fetching profile. Please contact support.');
        return;
      }
      if (!prof) {
        setAuthError('Profile not found. Please contact support.');
        return;
      }

      setCurrentUser({
        id: data.user.id,
        username: prof.username,
        wharton_email: prof.wharton_email,
        cohort: prof.cohort,
        phone_e164: prof.phone_e164,
        venmo_handle: prof.venmo_handle,
        tier: 'Limited',
      });

      setPassword('');
      setLoginEmail('');
    } catch (err: any) {
      console.error('Login error:', err);
      setAuthError(`Login failed: ${err.message || 'Unknown error'}`);
    }
  };

  /* -------- Posting helpers -------- */
  const getTierLimits = (tier: Tier): { buy: number; sell: number } => {
    switch (tier) {
      case 'Basic': return { buy: 2, sell: 2 };
      case 'Pro':   return { buy: 5, sell: 5 };
      case 'Max':   return { buy: Number.POSITIVE_INFINITY, sell: Number.POSITIVE_INFINITY };
      default:      return { buy: 1, sell: 1 };
    }
  };

  const postIntent = async () => {
    if (!currentUser) {
      alert('Please sign in first.');
      return;
    }

    const limits = getTierLimits(currentUser.tier);
    const mine = postings.filter((p) => p.name === currentUser.username);
    const buyPosts = mine.filter((p) => p.role === 'buyer').length;
    const sellPosts = mine.filter((p) => p.role === 'seller').length;

    if (role === 'buyer' && buyPosts >= limits.buy) {
      alert(`Your ${currentUser.tier} tier allows only ${limits.buy} buy post(s). Delete old posts to make new ones.`);
      return;
    }
    if (role === 'seller' && sellPosts >= limits.sell) {
      alert(`Your ${currentUser.tier} tier allows only ${limits.sell} sell post(s). Delete old posts to make new ones.`);
      return;
    }

    const row = {
      device_id: getDeviceId(),
      event_id: eventId,
      role,
      percent: Math.round(clamp01((percent || 0) / 100) * 100),
      tickets: 1,
      username: currentUser.username,
      phone_e164: currentUser.phone_e164,
      cohort: currentUser.cohort,
      venmo_handle: currentUser.venmo_handle,
      email: currentUser.wharton_email,
    };

    try {
      const { data, error } = await supabase
        .from('postings_public')
        .upsert(row, {
          onConflict: 'device_id,event_id,role',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        console.error('Post creation error:', error);
        alert(`Post failed: ${error.message}. Please check your database schema and constraints.`);
        return;
      }
      if (!data) {
        alert('Post failed - no data returned');
        return;
      }

      setPostings((prev) => {
        const rest = prev.filter((p) => p.id !== String(data.id));
        return [
          {
            id: String(data.id),
            userId: data.device_id,
            eventId: data.event_id,
            role: data.role,
            percent: data.percent,
            tickets: data.tickets,
            name: data.username,
            phone: data.phone_e164,
            cohort: data.cohort ?? undefined,
            venmo: data.venmo_handle ?? undefined,
            email: data.email ?? undefined,
          },
          ...rest,
        ];
      });
    } catch (err: any) {
      console.error('Post creation error:', err);
      alert(`Post failed: ${err.message || 'Unknown error'}`);
    }
  };

  const deletePosting = async (id: string) => {
    try {
      const { error } = await supabase.from('postings_public').delete().eq('id', id);
      if (error) {
        console.error('Delete error:', error);
        alert(`Delete failed: ${error.message}`);
      } else {
        setPostings((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err: any) {
      console.error('Delete error:', err);
      alert(`Delete failed: ${err.message || 'Unknown error'}`);
    }
  };

  const markTraded = (id: string) => {
    const posting = postings.find((p) => p.id === id);
    if (posting) {
      setTotalTradedTickets((prev) => prev + posting.tickets);
      deletePosting(id);
    }
  };

  /* -------- Chat (local only) -------- */
  const addComment = () => {
    if (!currentUser || !newComment.trim()) return;
    setComments((prev) => [
      ...prev,
      { id: Math.random().toString(36), username: currentUser.username, message: newComment.trim(), timestamp: new Date() },
    ]);
    setNewComment('');
  };

  /* -------- Matches (computed) -------- */
  type Match = { me: Posting; other: Posting; agreedPct: number; tickets: number };
  const getMatches = (): Match[] => {
    if (!currentUser) return [];
    const mine = postings.filter((p) => p.name === currentUser.username && p.eventId === eventId);
    const others = postings.filter((p) => p.name !== currentUser.username && p.eventId === eventId);
    const out: Match[] = [];
    for (const me of mine) {
      const compatible = others.filter((o) =>
        (me.role === 'buyer' && o.role === 'seller') ? me.percent >= o.percent
        : (me.role === 'seller' && o.role === 'buyer') ? o.percent >= me.percent
        : false
      );
      if (!compatible.length) continue;
      let filtered = compatible;
      if (currentUser.tier === 'Limited') filtered = compatible.filter((o) => Math.abs(me.percent - o.percent) === 0);
      else if (currentUser.tier === 'Basic') filtered = compatible.filter((o) => Math.abs(me.percent - o.percent) <= 10);
      else if (currentUser.tier === 'Pro') filtered = compatible.filter((o) => Math.abs(me.percent - o.percent) <= 25);
      const maxMatches = currentUser.tier === 'Limited' ? 3 : currentUser.tier === 'Basic' ? 5 : currentUser.tier === 'Pro' ? 10 : Infinity;
      filtered
        .sort((a, b) => Math.abs(me.percent - a.percent) - Math.abs(me.percent - b.percent))
        .slice(0, maxMatches)
        .forEach((other) =>
          out.push({ me, other, agreedPct: Math.min(me.percent, other.percent), tickets: Math.min(me.tickets, other.tickets) })
        );
    }
    return out;
  };

  const myMatches = getMatches();
  const myListings = currentUser ? postings.filter((p) => p.name === currentUser.username) : [];

  /* -------- UI -------- */
  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-3xl font-extrabold tracking-tight">Ticketmatch</h1>
          <div className="mt-2 flex items-center gap-4">
            <p className="flex-1 text-gray-700">
              Buy and resell Wharton tickets at face value or lower. Create an account with your name and post your bid/ask.
            </p>
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="text-yellow-500" size={20} />
              <span className="font-semibold">{totalTradedTickets}</span>
              <span className="text-gray-600">tickets traded</span>
            </div>
          </div>
        </div>

        {/* Auth */}
        {!currentUser ? (
          <Card className="mb-6 p-5">
            <SectionTitle title={authMode === 'signup' ? 'Create an account' : 'Sign in to your account'} />
            {authMode === 'signup' ? (
              <form onSubmit={handleSignup} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label>Username (First Last)</Label>
                  <Input
                    placeholder="Joe Wharton"
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
                <div>
                  <Label>WG Cohort</Label>
                  <Select value={cohort} onChange={(e) => setCohort(e.target.value as 'WG26' | 'WG27')}>
                    <option value="WG26">WG26</option>
                    <option value="WG27">WG27</option>
                  </Select>
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <div className="flex items-center gap-2">
                    <Select className="w-28" value={areaCode} onChange={(e) => setAreaCode(e.target.value)}>
                      {AREA_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                    <Input placeholder="digits" value={phoneDigits} onChange={(e) => setPhoneDigits(onlyDigits(e.target.value))} required />
                  </div>
                </div>
                <div>
                  <Label>Venmo Handle</Label>
                  <Input placeholder="@yourhandle" value={venmo} onChange={(e) => setVenmo(e.target.value)} required />
                </div>
                <div>
                  <Label>Wharton Email</Label>
                  <Input type="email" placeholder="you@wharton.upenn.edu" value={whartonEmail} onChange={(e) => setWhartonEmail(e.target.value)} required />
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <Button type="submit">Create account</Button>
                  <GhostButton type="button" onClick={() => setAuthMode('login')}>
                    Have an account? Sign in
                  </GhostButton>
                  {authError && <span className="text-sm text-red-600">{authError}</span>}
                </div>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label>Username or Email</Label>
                  <Input
                    placeholder="Joe Wharton or you@wharton.upenn.edu"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Password</Label>
                  <Input 
                    type="password" 
                    placeholder="Your password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    required 
                  />
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <Button type="submit">Sign in</Button>
                  <GhostButton type="button" onClick={() => setAuthMode('signup')}>
                    New here? Create account
                  </GhostButton>
                  {authError && <span className="text-sm text-red-600">{authError}</span>}
                </div>
              </form>
            )}
          </Card>
        ) : (
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              Signed in as <strong>{currentUser.username}</strong>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                Tier: {currentUser.tier}
              </span>
            </div>
            <div className="flex gap-2">
              <GhostButton
                onClick={async () => {
                  await supabase.auth.signOut();
                  setCurrentUser(null);
                }}
              >
                Sign out
              </GhostButton>
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* LEFT: Inputs & Matches */}
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
                  <div className="flex items-center">
                    <Input value={currentUser.phone_e164} readOnly className="flex-1" />
                    <button
                      onClick={() => navigator.clipboard?.writeText(currentUser.phone_e164)}
                      className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200"
                      type="button"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div>
                  <Label>Role</Label>
                  <div className="mt-1 flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={role === 'buyer'} onChange={() => setRole('buyer')} />
                      Buyer
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={role === 'seller'} onChange={() => setRole('seller')} />
                      Seller
                    </label>
                  </div>
                </div>
                <div>
                  <Label>Event</Label>
                  <Select value={eventId} onChange={(e) => setEventId(e.target.value as (typeof EVENTS)[number]['id'])}>
                    {EVENTS.map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Percent (%) of Ticket Value</Label>
                  <div className="mt-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={percent}
                      onChange={(e) => setPercent(Number(e.target.value))}
                      className="slider h-3 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
                      style={{ background: `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${percent}%, #e5e7eb ${percent}%, #e5e7eb 100%)` }}
                    />
                    <div className="mt-1 flex justify-between text-xs text-gray-500">
                      <span>0%</span>
                      <span className="font-semibold text-indigo-600">{percent}%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Number of Tickets</Label>
                  <Input value="1" readOnly className="bg-gray-50" />
                  <p className="mt-1 text-xs text-gray-500">Fixed at 1 ticket per post</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" onClick={postIntent}>Post</Button>
                </div>

                <div className="pt-2">
                  <SectionTitle title="Matches" subtitle="Your tier determines match visibility and range." />
                  {myMatches.length === 0 ? (
                    <div className="text-sm text-gray-400">No matches yet</div>
                  ) : (
                    <div className="max-h-64 space-y-3 overflow-auto text-sm">
                      {myMatches.slice(0, 10).map((m, i) => {
                        const buyer = m.me.role === 'buyer' ? m.me : m.other;
                        const seller = m.me.role === 'seller' ? m.me : m.other;
                        const agreedPct = m.agreedPct;
                        return (
                          <div key={i} className="rounded-lg border bg-gray-50 p-3">
                            <div className="mb-2 flex items-center justify-between font-semibold">
                              <span>{seller.name} ↔ {buyer.name} at {agreedPct}%</span>
                              <WeTradedButton onClick={() => {
                                setTrades((prev) => [...prev, {
                                  id: Math.random().toString(36),
                                  buyerName: buyer.name,
                                  sellerName: seller.name,
                                  eventId,
                                  price: (agreedPct / 100) * eventPrice,
                                  tickets: Math.min(m.me.tickets, m.other.tickets),
                                  timestamp: new Date(),
                                }]);
                                setTotalTradedTickets((prev) => prev + 1);
                              }} />
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                              <div>
                                <div className="font-semibold">Seller</div>
                                <div>Name: {seller.name}</div>
                                <div className="flex items-center gap-1">Phone: {seller.phone}</div>
                              </div>
                              <div>
                                <div className="font-semibold">Buyer</div>
                                <div>Name: {buyer.name}</div>
                                <div className="flex items-center gap-1">Phone: {buyer.phone}</div>
                              </div>
                            </div>
                            <div className="mt-1 text-right text-xs text-gray-500">@ {toMoney((agreedPct / 100) * eventPrice)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Sign in to enter your inputs and see matches.</div>
            )}
          </Card>

          {/* MIDDLE: Charts */}
          <div className="grid gap-6 lg:col-span-2 lg:grid-cols-1">
            <Card className="p-5">
              <SectionTitle title="Market Distribution" subtitle={`Event: ${currentEvent?.label ?? ''} - Left bars = sellers (purple), right bars = buyers (green)`} />
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { bucket: '50-60%', seller: -Math.floor(Math.random() * 5), buyer: Math.floor(Math.random() * 3) },
                      { bucket: '60-70%', seller: -Math.floor(Math.random() * 8), buyer: Math.floor(Math.random() * 5) },
                      { bucket: '70-80%', seller: -Math.floor(Math.random() * 12), buyer: Math.floor(Math.random() * 8) },
                      { bucket: '80-90%', seller: -Math.floor(Math.random() * 10), buyer: Math.floor(Math.random() * 12) },
                      { bucket: '90-100%', seller: -Math.floor(Math.random() * 6), buyer: Math.floor(Math.random() * 15) },
                      { bucket: '100%',   seller: -Math.floor(Math.random() * 4), buyer: Math.floor(Math.random() * 10) },
                    ]}
                    layout="vertical"
                    margin={{ top: 10, right: 20, left: 20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[-20, 20]} tickFormatter={(v) => Math.abs(Number(v)).toString()} />
                    <YAxis dataKey="bucket" type="category" tick={{ fontSize: 12 }} width={70} />
                    <Tooltip formatter={(v: any, name: any) => [Math.abs(Number(v)), name]} />
                    <Legend />
                    <Bar dataKey="seller" name="Sellers" fill="#6366F1" />
                    <Bar dataKey="buyer"  name="Buyers"  fill="#10B981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle title="Supply vs Demand Curves" subtitle="Market clearing price and volume analysis" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={Array.from({ length: 21 }, (_, i) => ({
                          p: i * 5,
                          supply: Math.max(0, 15 - i * 0.8 + Math.random() * 3),
                          demand: Math.max(0, i * 0.6 + Math.random() * 2),
                        }))}
                        margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="p" tickFormatter={(v) => `${v}%`} />
                        <YAxis allowDecimals={false} />
                        <Tooltip
                          labelFormatter={(label) => `Price: ${label}%`}
                          formatter={(value, name) => [Math.round(Number(value)), name === 'supply' ? 'Supply (sellers)' : 'Demand (buyers)']}
                        />
                        <Legend />
                        <ReferenceLine x={75} stroke="#EF4444" strokeDasharray="5 3" label="p* = 75%" />
                        <Line type="monotone" dataKey="supply" name="Supply" stroke="#6366F1" dot={false} />
                        <Line type="monotone" dataKey="demand" name="Demand" stroke="#10B981" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="grid content-start gap-3 lg:col-span-1">
                  <Card className="p-4">
                    <div className="text-sm text-gray-500">Clearing Price</div>
                    <div className="text-2xl font-bold">75%</div>
                    <div className="text-sm text-gray-600">≈ {toMoney(eventPrice * 0.75)}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-gray-500">Matched Trades</div>
                    <div className="text-2xl font-bold">8</div>
                    <div className="text-xs text-gray-500">at clearing price</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-gray-500">Spread</div>
                    <div className="text-xl font-semibold">3.2%</div>
                    <div className="text-sm text-gray-600">≈ {toMoney(eventPrice * 0.032)}</div>
                  </Card>
                </div>
              </div>
            </Card>
          </div>

          {/* RIGHT: Chat */}
          <Card className="p-5 lg:col-span-1">
            <SectionTitle title="Community Chat" subtitle="Public discussion forum" />
            <div className="space-y-4">
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg bg-gray-50 p-3">
                {comments.map((c) => (
                  <div key={c.id} className="text-sm">
                    <div className="font-semibold text-indigo-600">{c.username}</div>
                    <div className="text-gray-700">{c.message}</div>
                    <div className="text-xs text-gray-500">{c.timestamp.toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
              {currentUser && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Type your message..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addComment(); }}
                    className="flex-1"
                  />
                    <Button onClick={addComment} type="button">
                      <MessageCircle size={16} />
                    </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* My Profile & Listings */}
        {currentUser && (
          <Card className="mt-6 p-5">
            <SectionTitle title="My Profile" />
            <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
              <div><strong>Username:</strong> {currentUser.username}</div>
              <div><strong>Email:</strong> {currentUser.wharton_email}</div>
              <div><strong>WG Cohort:</strong> {currentUser.cohort}</div>
              <div><strong>Phone:</strong> {currentUser.phone_e164}</div>
              <div><strong>Venmo:</strong> @{currentUser.venmo_handle}</div>
              <div><strong>Tier:</strong> {currentUser.tier}</div>
            </div>

            <div className="mt-6">
              <SectionTitle title="My Listings" subtitle="Active posts you created" />
              {myListings.length === 0 ? (
                <div className="text-sm text-gray-500">No active listings.</div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {myListings.map((l) => (
                    <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                      <span>{l.role} 1 ticket @ {l.percent}% — {EVENTS.find((ev) => ev.id === l.eventId)?.label}</span>
                      <div className="flex items-center gap-2">
                        <TradedButton onClick={() => markTraded(l.id)} />
                        <DeleteButton onClick={() => deletePosting(l.id)} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Slider thumb styling */}
      <style jsx>{`
        .slider::-webkit-slider-thumb { appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #4f46e5; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        .slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #4f46e5; cursor: pointer; border: none; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
      `}</style>
    </div>
  );
}
