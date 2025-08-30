'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { X, MessageCircle, Trophy, ChevronDown, ChevronUp, Users } from 'lucide-react';
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
type Tier = 'Limited' | 'Basic';

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
  id: string;
  userId: string;      // device_id
  eventId: string;     // event_id
  role: Role;
  percent: number;     // 0..100
  tickets: number;     // 1
  name: string;        // username
  phone: string;       // phone_e164
  cohort?: string;
  venmo?: string;
  email?: string;
}

interface ChatMessage {
  id: string;
  user_id: string;
  username: string;
  message: string;
  created_at: string;
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
type EventType = 'market' | 'ceiling';
type EventItem = { id: string; label: string; type: EventType; price?: number };
const BASE_EVENTS: EventItem[] = [
  { id: 'usopen', label: 'US Open (Market Pricing)', type: 'market' },
  { id: 'wp', label: 'White Party - Member Price $50', type: 'ceiling', price: 50 },
];

const TIER_INFO: Record<Tier, { price: string; features: string[] }> = {
  Limited: { price: '$0/mo', features: ['Limited features', 'Show all eligible matches'] },
  Basic:   { price: '$5/mo', features: ['Buy and sell 5 individual tickets at a time, match with entire market.'] },
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
// Allow letters, numbers, underscore, dash, and dot (2..32 chars)
const isValidVenmo = (h: string): boolean => /^[A-Za-z0-9._-]{2,32}$/.test(normalizeVenmo(h));
const copy = (text?: string) => text && navigator.clipboard?.writeText(text);

// Market posting (price-based) for market-type events (e.g., US Open)
interface MarketPosting {
  id: string;
  userId: string;      // device_id
  eventId: string;     // event_id
  role: Role;          // buyer or seller
  price: number;       // explicit price
  tickets: number;     // fixed 1
  description: string; // free text
  name: string;        // username
  phone: string;       // phone_e164
  cohort?: string;
  venmo?: string;
  email?: string;
  created_at?: string;
}

/* =========================
   Component
   ========================= */
export default function WTPInteractiveDiagram() {
  // DB-backed state
  const [postings, setPostings] = useState<Posting[]>([]);
  const [marketPostings, setMarketPostings] = useState<MarketPosting[]>([]);
  const [serverEvents, setServerEvents] = useState<EventItem[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);

  // UI state
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [authError, setAuthError] = useState<string>('');
  const [openTier, setOpenTier] = useState<Tier | null>(null);
  const [totalTradedTickets, setTotalTradedTickets] = useState<number>(17);
  const [newComment, setNewComment] = useState<string>('');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [postNotice, setPostNotice] = useState<string>(''); // success banner
  const [showUpgrade, setShowUpgrade] = useState<boolean>(false);

  // Auth fields
  const [username, setUsername] = useState<string>('');
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [cohort, setCohort] = useState<'WG26' | 'WG27'>('WG26');
  const [areaCode, setAreaCode] = useState<string>(AREA_CODES[0]);
  const [phoneDigits, setPhoneDigits] = useState<string>('');
  const [venmo, setVenmo] = useState<string>('');
  const [whartonEmail, setWhartonEmail] = useState<string>('');

  // Events and posting fields
  const [extraEvents, setExtraEvents] = useState<EventItem[]>([]);
  const allEvents = useMemo(() => {
    // Merge server events first, then base, then any extra (legacy fallback)
    const byId = new Map<string, EventItem>();
    [...serverEvents, ...BASE_EVENTS, ...extraEvents].forEach(e => byId.set(e.id, e));
    return Array.from(byId.values());
  }, [serverEvents, extraEvents]);
  // Default to WP for FOMO when logged out, else remember last
  const [eventId, setEventId] = useState<string>('wp');
  const [role, setRole] = useState<Role>('buyer');
  const [percent, setPercent] = useState<number>(100);
  const [marketDescription, setMarketDescription] = useState<string>('');
  const [selectedMarketPrice, setSelectedMarketPrice] = useState<number | null>(120);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminUser, setAdminUser] = useState<string>('');
  const [adminPass, setAdminPass] = useState<string>('');
  const [newEventName, setNewEventName] = useState<string>('');
  const [newEventType, setNewEventType] = useState<EventType>('market');
  const [newEventPrice, setNewEventPrice] = useState<number>(50);

  const currentEvent = useMemo(() => allEvents.find((e) => e.id === eventId), [allEvents, eventId]);
  const eventPrice = currentEvent?.price ?? 0;
  const showAdmin = process.env.NEXT_PUBLIC_SHOW_ADMIN === '1' || process.env.NEXT_PUBLIC_SHOW_ADMIN === 'true';
  const adminEnvUser = process.env.NEXT_PUBLIC_ADMIN_USER || 'admin';
  const adminEnvPass = process.env.NEXT_PUBLIC_ADMIN_PASS || 'marketmaker';

  // Choose the most recently added event for logged-out users (FOMO)
  const latestEventId = useMemo(() => {
    if (serverEvents.length) return serverEvents[serverEvents.length - 1].id;
    return BASE_EVENTS[BASE_EVENTS.length - 1].id; // fallback
  }, [serverEvents]);

  useEffect(() => {
    if (!currentUser && latestEventId && eventId !== latestEventId) setEventId(latestEventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestEventId, currentUser]);

  const ensureEventExists = async (): Promise<boolean> => {
    try {
      const { data: ev, error: evErr } = await supabase.from('events').select('id').eq('id', eventId).maybeSingle();
      if (!evErr && ev) return true;
    } catch {}
    try {
      const label = currentEvent?.label || (eventId === 'usopen' ? 'US Open (Market Pricing)' : eventId);
      const type: any = currentEvent?.type || 'market';
      const priceVal: any = currentEvent?.price ?? null;
      const { error } = await supabase.rpc('tm_create_event', {
        p_username: adminEnvUser,
        p_password: adminEnvPass,
        p_id: eventId,
        p_label: label,
        p_type: type,
        p_price: priceVal,
      });
      if (error) { console.warn('tm_create_event failed:', error.message); return false; }
      await refreshEvents();
      return true;
    } catch (e) {
      console.warn('ensureEventExists failed');
      return false;
    }
  };

  /* -------- Load session, profile, postings, chat; wire realtime -------- */
  useEffect(() => {
    let postsSub: ReturnType<typeof supabase.channel> | null = null;
    let marketSub: ReturnType<typeof supabase.channel> | null = null;
    let eventsSub: ReturnType<typeof supabase.channel> | null = null;
    let chatSub: ReturnType<typeof supabase.channel> | null = null;

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

      await Promise.all([refreshEvents(), refreshPostings(), refreshMarketPostings(), refreshChat()]);

      // Realtime: postings
      postsSub = supabase
        .channel('postings_public_stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'postings_public' }, (payload) => {
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
        })
        .subscribe();

      // Realtime: market_postings
      marketSub = supabase
        .channel('market_postings_stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'market_postings' }, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const r: any = payload.new;
            setMarketPostings((prev) => {
              const rest = prev.filter((p) => p.id !== String(r.id));
              return [
                ...rest,
                {
                  id: String(r.id), userId: r.device_id, eventId: r.event_id, role: r.role,
                  price: Number(r.price) || 0, tickets: r.tickets ?? 1, description: r.description ?? '',
                  name: r.username, phone: r.phone_e164, cohort: r.cohort ?? undefined,
                  venmo: r.venmo_handle ?? undefined, email: r.email ?? r.email_address ?? undefined,
                  created_at: r.created_at,
                },
              ];
            });
          } else if (payload.eventType === 'DELETE') {
            const r: any = payload.old;
            setMarketPostings((prev) => prev.filter((p) => p.id !== String(r.id)));
          }
        })
        .subscribe();

      // Realtime: events
      eventsSub = supabase
        .channel('events_stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, async () => {
          await refreshEvents();
        })
        .subscribe();

      // Realtime: chat
      chatSub = supabase
        .channel('chat_messages_stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            const r: any = payload.new;
            setChat((prev) => [{ id: String(r.id), user_id: r.user_id, username: r.username, message: r.message, created_at: r.created_at }, ...prev].slice(0, 200));
          } else if (payload.eventType === 'DELETE') {
            const r: any = payload.old;
            setChat((prev) => prev.filter((m) => m.id !== String(r.id)));
          }
        })
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
      if (postsSub) supabase.removeChannel(postsSub);
      if (marketSub) supabase.removeChannel(marketSub);
      if (eventsSub) supabase.removeChannel(eventsSub);
      if (chatSub) supabase.removeChannel(chatSub);
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

  const refreshMarketPostings = async () => {
    const { data, error } = await supabase
      .from('market_postings')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error('Error fetching market postings:', error); return; }
    if (data) {
      setMarketPostings(
        data.map((r: any) => ({
          id: String(r.id), userId: r.device_id, eventId: r.event_id, role: r.role,
          price: Number(r.price) || 0, tickets: r.tickets ?? 1, description: r.description ?? '',
          name: r.username, phone: r.phone_e164, cohort: r.cohort ?? undefined,
          venmo: r.venmo_handle ?? undefined, email: r.email ?? r.email_address ?? undefined,
          created_at: r.created_at,
        }))
      );
    }
  };

  const refreshEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) { console.warn('events fetch error (fallback to base):', error.message); return; }
    if (data) {
      const items: EventItem[] = data.map((r: any) => ({ id: r.id, label: r.label, type: r.type, price: r.price ?? undefined }));
      setServerEvents(items);
    }
  };

  const refreshChat = async () => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('Error fetching chat:', error);
      return;
    }
    if (data) {
      setChat(
        data.map((r: any) => ({
          id: String(r.id),
          user_id: r.user_id,
          username: r.username,
          message: r.message,
          created_at: r.created_at,
        }))
      );
    }
  };

  /* -------- Signup -------- */
  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');

    const uname = normalizeUsername(username);
    if (!isValidUsername(uname)) { setAuthError('Username must be First Last (e.g., "John Smith").'); return; }
    if (password.length < 8)     { setAuthError('Password must be at least 8 characters.'); return; }
    if (!isWhartonEmail(whartonEmail)) { setAuthError('Email must end with @wharton.upenn.edu.'); return; }

    const phoneE164 = buildE164(areaCode, phoneDigits);
    if (!isValidE164(phoneE164)) { setAuthError('Enter a valid phone number.'); return; }

    const venmoId = normalizeVenmo(venmo);
    if (!isValidVenmo(venmoId)) { setAuthError('Enter a valid Venmo handle (3-30 chars).'); return; }

    try {
      const { data: sign, error: signErr } = await supabase.auth.signUp({ email: whartonEmail.trim(), password });
      if (signErr) { setAuthError(`Sign up failed: ${signErr.message}`); return; }
      if (!sign?.user) { setAuthError('Sign up failed - no user returned'); return; }

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
        if (profileErr) { console.error('Profile update error:', profileErr); setAuthError(`Profile update failed: ${profileErr.message}`); return; }

        setCurrentUser({ id: sign.user.id, username: uname, wharton_email: whartonEmail.trim(), cohort, phone_e164: phoneE164, venmo_handle: venmoId, tier: 'Limited' });
      } else {
        setAuthError('Check your inbox to verify your email, then sign in to finish.');
      }

      setPassword(''); setUsername(''); setPhoneDigits(''); setVenmo(''); setWhartonEmail('');
    } catch (err: any) {
      console.error('Signup error:', err);
      setAuthError(`Signup failed: ${err.message || 'Unknown error'}`);
    }
  };

  /* -------- Login -------- */
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');

    const emailToUse = loginEmail.trim();
    if (!emailToUse.includes('@')) { setAuthError('Please enter your Wharton email address.'); return; }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: emailToUse, password });
      if (error) { setAuthError(`Login failed: ${error.message}`); return; }
      if (!data?.user) { setAuthError('Login failed - no user returned'); return; }

      const { data: prof, error: profErr } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
      if (profErr) { console.error('Profile fetch error:', profErr); setAuthError('Error fetching profile.'); return; }
      if (!prof)   { setAuthError('Profile not found.'); return; }

      setCurrentUser({
        id: data.user.id,
        username: prof.username,
        wharton_email: prof.wharton_email,
        cohort: prof.cohort,
        phone_e164: prof.phone_e164,
        venmo_handle: prof.venmo_handle,
        tier: 'Limited',
      });

      setPassword(''); setLoginEmail('');
    } catch (err: any) {
      console.error('Login error:', err);
      setAuthError(`Login failed: ${err.message || 'Unknown error'}`);
    }
  };

  /* -------- Posting helpers -------- */
  // No limits for now (all tiers)
  const getTierLimits = (_tier: Tier): { buy: number; sell: number } => ({
    buy: Number.POSITIVE_INFINITY,
    sell: Number.POSITIVE_INFINITY,
  });

  const postIntent = async () => {
    if (!currentUser) { alert('Please sign in first.'); return; }

    const limits = getTierLimits(currentUser.tier);
    const mine = postings.filter((p) => p.name === currentUser.username);
    const buyPosts = mine.filter((p) => p.role === 'buyer').length;
    const sellPosts = mine.filter((p) => p.role === 'seller').length;

    if (role === 'buyer' && buyPosts >= limits.buy) { alert(`Posting limit reached.`); return; }
    if (role === 'seller' && sellPosts >= limits.sell) { alert(`Posting limit reached.`); return; }

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
        .upsert(row, { onConflict: 'device_id,event_id,role', ignoreDuplicates: false })
        .select()
        .single();

      if (error) { console.error('Post creation error:', error); alert(`Post failed: ${error.message}`); return; }
      if (!data) { alert('Post failed - no data returned'); return; }

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

      // success banner
      setPostNotice('Success! Your post is on the market. Scroll to bottom to delete old posts');
      setTimeout(() => setPostNotice(''), 5000);
    } catch (err: any) {
      console.error('Post creation error:', err);
      alert(`Post failed: ${err.message || 'Unknown error'}`);
    }
  };

  const deletePosting = async (id: string, source: 'ceiling' | 'market' = 'ceiling') => {
    try {
      if (source === 'market') {
        const { error } = await supabase.from('market_postings').delete().eq('id', id);
        if (error) { console.error('Delete error:', error); alert(`Delete failed: ${error.message}`); }
        else { setMarketPostings((prev) => prev.filter((p) => p.id !== id)); }
      } else {
        const { error } = await supabase.from('postings_public').delete().eq('id', id);
        if (error) { console.error('Delete error:', error); alert(`Delete failed: ${error.message}`); }
        else { setPostings((prev) => prev.filter((p) => p.id !== id)); }
      }
    } catch (err: any) {
      console.error('Delete error:', err);
      alert(`Delete failed: ${err.message || 'Unknown error'}`);
    }
  };

  const markTraded = async (id: string, source: 'ceiling' | 'market' = 'ceiling') => {
    if (source === 'market') {
      const posting = marketPostings.find((p) => p.id === id);
      if (posting) {
        try { await supabase.rpc('tm_mark_traded', { p_posting_id: id, p_source: 'market' }); } catch {}
        setTotalTradedTickets((prev) => prev + posting.tickets);
        deletePosting(id, 'market');
      }
    } else {
      const posting = postings.find((p) => p.id === id);
      if (posting) {
        try { await supabase.rpc('tm_mark_traded', { p_posting_id: id, p_source: 'ceiling' }); } catch {}
        setTotalTradedTickets((prev) => prev + posting.tickets);
        deletePosting(id, 'ceiling');
      }
    }
  };

  /* -------- Live chat: insert a message and optimistically append -------- */
  const addComment = async () => {
    if (!currentUser) { alert('Please sign in first.'); return; }

    const msg = (newComment || '').trim();
    if (!msg) return;
    if (msg.length > 250) { alert('Max 250 characters'); return; }

    const optimistic: ChatMessage = {
      id: `tmp_${Date.now()}`,
      user_id: currentUser.id,
      username: currentUser.username,
      message: msg,
      created_at: new Date().toISOString(),
    };

    setChat((prev) => [optimistic, ...prev].slice(0, 200));
    setNewComment('');

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: currentUser.id,
        username: currentUser.username,
        message: msg,
      })
      .select()
      .single();

    if (error) {
      setChat((prev) => prev.filter((m) => m.id !== optimistic.id));
      alert(`Message failed: ${error.message}`);
      return;
    }

    setChat((prev) => [
      { ...optimistic, id: String(data.id), created_at: data.created_at },
      ...prev.filter((m) => m.id !== optimistic.id),
    ]);
  };

  /* -------- Matches (all eligible; no tier filtering) -------- */
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
      compatible
        .sort((a, b) => Math.abs(me.percent - a.percent) - Math.abs(me.percent - b.percent))
        .forEach((other) =>
          out.push({ me, other, agreedPct: Math.min(me.percent, other.percent), tickets: Math.min(me.tickets, other.tickets) })
        );
    }
    return out;
  };

  // Market (price-based) matches
  type MarketMatch = { me: MarketPosting; other: MarketPosting; agreedPrice: number; tickets: number };
  const getMarketMatches = (): MarketMatch[] => {
    if (!currentUser) return [];
    const mine = marketPostings.filter((p) => p.name === currentUser.username && p.eventId === eventId);
    const others = marketPostings.filter((p) => p.name !== currentUser.username && p.eventId === eventId);
    const out: MarketMatch[] = [];
    for (const me of mine) {
      const compatible = others.filter((o) => (me.role === 'buyer' && o.role === 'seller') || (me.role === 'seller' && o.role === 'buyer'));
      compatible
        .sort((a, b) => Math.abs(me.price - a.price) - Math.abs(me.price - b.price))
        .forEach((other) => {
          const tickets = Math.min(me.tickets, other.tickets);
          const agreedPrice = Math.round(((me.price + other.price) / 2) * 100) / 100;
          out.push({ me, other, agreedPrice, tickets });
        });
    }
    return out;
  };

  const myMatches = currentEvent?.type === 'market' ? [] : getMatches();
  const myMarketMatches = currentEvent?.type === 'market' ? getMarketMatches() : [];

  type ListingItem = (
    { source: 'ceiling'; id: string; label: string; role: Role; percent: number; tickets: number } |
    { source: 'market';  id: string; label: string; role: Role; price: number;  tickets: number }
  );
  const myListings: ListingItem[] = useMemo(() => {
    if (!currentUser) return [] as ListingItem[];
    const a: ListingItem[] = postings
      .filter(p => p.name === currentUser.username)
      .map(p => ({ source: 'ceiling' as const, id: p.id, label: allEvents.find(e => e.id === p.eventId)?.label || p.eventId, role: p.role, percent: p.percent, tickets: p.tickets }));
    const b: ListingItem[] = marketPostings
      .filter(p => p.name === currentUser.username)
      .map(p => ({ source: 'market' as const, id: p.id, label: allEvents.find(e => e.id === p.eventId)?.label || p.eventId, role: p.role, price: p.price, tickets: p.tickets }));
    return [...b, ...a];
  }, [currentUser, postings, marketPostings, allEvents]);

  /* -------- Market options (for market-type events) -------- */
  // For US Open – draw real circles from market postings (no fakes)
  type MarketPoint = { price: number; role: Role; label: string; username: string };
  const marketPoints: MarketPoint[] = useMemo(() => {
    return marketPostings
      .filter(p => p.eventId === eventId)
      .map(p => ({ price: p.price, role: p.role, label: (p.description || '').trim(), username: p.name }));
  }, [marketPostings, eventId]);

  /* -------- Market charts -------- */
  const filtered = useMemo(() => postings.filter(p => p.eventId === eventId), [postings, eventId]);
  const marketFiltered = useMemo(() => marketPostings.filter(p => p.eventId === eventId), [marketPostings, eventId]);

  const marketDistribution = useMemo(() => {
    const buckets = ['50-60%', '60-70%', '70-80%', '80-90%', '90-100%', '100%'] as const;
    const rangeFor = (pct: number): typeof buckets[number] | null => {
      if (pct === 100) return '100%';
      if (pct >= 50 && pct < 60) return '50-60%';
      if (pct >= 60 && pct < 70) return '60-70%';
      if (pct >= 70 && pct < 80) return '70-80%';
      if (pct >= 80 && pct < 90) return '80-90%';
      if (pct >= 90 && pct < 100) return '90-100%';
      return null;
    };
    const acc = new Map<string, { seller: number; buyer: number }>();
    buckets.forEach(b => acc.set(b, { seller: 0, buyer: 0 }));
    for (const p of filtered) {
      const b = rangeFor(p.percent);
      if (!b) continue;
      const slot = acc.get(b)!;
      if (p.role === 'seller') slot.seller += 1;
      else slot.buyer += 1;
    }
    return buckets.map(b => ({ bucket: b, seller: -(acc.get(b)!.seller), buyer: acc.get(b)!.buyer }));
  }, [filtered]);

  const supplyDemand = useMemo(() => {
    const sellers = filtered.filter(p => p.role === 'seller').map(p => p.percent).sort((a, b) => a - b);
    const buyers  = filtered.filter(p => p.role === 'buyer').map(p => p.percent).sort((a, b) => a - b);
    const points: { p: number; supply: number; demand: number }[] = [];
    for (let p = 0; p <= 100; p += 5) {
      const supply = sellers.filter(s => s <= p).length;
      const demand = buyers.filter(b => b >= p).length;
      points.push({ p, supply, demand });
    }
    return points;
  }, [filtered]);

  const clearing = useMemo(() => {
    for (const pt of supplyDemand) { if (pt.supply >= pt.demand) return pt.p; }
    return 0;
  }, [supplyDemand]);

  /* -------- UI -------- */
  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-3xl font-extrabold tracking-tight">Ticketmatch</h1>
          <div className="mt-2 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
            <p className="md:flex-1 text-gray-700">
              Buy and resell Wharton tickets at face value or lower. Create an account with your email and post your bid/ask.
            </p>
            <div className="flex items-center gap-4 text-base sm:text-lg">
              <Trophy className="text-yellow-500" size={24} />
              <span className="font-extrabold text-2xl">{totalTradedTickets}</span>
              <span className="text-gray-700">tickets traded</span>
              <span className="mx-2 h-5 w-px bg-gray-300" />
              <Users className="text-indigo-600" size={22} />
              <span className="font-extrabold text-2xl">63</span>
              <span className="text-gray-700">active accounts</span>
            </div>
          </div>
        </div>

        {/* Tier dropdowns */}
        <Card className="mb-6 p-5">
          <SectionTitle title="Membership Tiers" subtitle="Limited and Basic available" />
          <div className="space-y-3">
            {(Object.keys(TIER_INFO) as Tier[]).map(tier => {
              const open = openTier === tier;
              const info = TIER_INFO[tier];
              return (
                <div key={tier} className="rounded-xl border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setOpenTier(open ? null : tier)}
                    className="flex w-full items-center justify-between px-4 py-3"
                  >
                    <div className="text-sm font-semibold">
                      {tier} <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{info.price}</span>
                    </div>
                    {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {open && (
                    <div className="px-4 pb-4 text-sm text-gray-700">
                      <ul className="list-inside list-disc space-y-1">
                        {info.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span>{f}</span>
                            {tier === 'Basic' && /entire market/i.test(f) && (
                              <Button type="button" className="bg-blue-600 hover:bg-blue-500 px-2 py-1 text-xs" onClick={() => setShowUpgrade(true)}>
                                Upgrade to Basic
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Auth */}
        {!currentUser ? (
          <Card className="mb-6 p-5">
            <SectionTitle title={authMode === 'signup' ? 'Create an account' : 'Sign in to your account'} />
            {authMode === 'signup' ? (
              <form onSubmit={handleSignup} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label>Name (First Last)</Label>
                  <Input placeholder="Joe Wharton" value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
                  <GhostButton type="button" onClick={() => setAuthMode('login')}>Have an account? Sign in</GhostButton>
                  {authError && <span className="text-sm text-red-600">{authError}</span>}
                </div>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label>School Email</Label>
                  <Input placeholder="you@wharton.upenn.edu" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                </div>
                <div className="md:col-span-2">
                  <Label>Password</Label>
                  <Input type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <Button type="submit">Sign in</Button>
                  <GhostButton type="button" onClick={() => setAuthMode('signup')}>New here? Create account</GhostButton>
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
              <GhostButton onClick={async () => { await supabase.auth.signOut(); setCurrentUser(null); }}>
                Sign out
              </GhostButton>
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* LEFT: Inputs */}
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
                    <button onClick={() => copy(currentUser.phone_e164)} className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200" type="button">
                      Copy
                    </button>
                  </div>
                </div>
                <div>
                  <Label>Role</Label>
                  <div className="mt-1 flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-1"><input type="radio" checked={role === 'buyer'} onChange={() => setRole('buyer')} />Buyer</label>
                    <label className="flex items-center gap-1"><input type="radio" checked={role === 'seller'} onChange={() => setRole('seller')} />Seller</label>
                  </div>
                </div>
                <div>
                  <Label>Event</Label>
                  <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                    {allEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
                  </Select>
                </div>
                {currentEvent?.type === 'ceiling' && (
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
                        <span>0%</span><span className="font-semibold text-indigo-600">{percent}%</span><span>100%</span>
                      </div>
                    </div>
                  </div>
                )}
                {currentEvent?.type === 'market' && (
                  <>
                    <div>
                      <Label>Price ($)</Label>
                      <Input type="number" min={1} step={1} value={selectedMarketPrice ?? ''}
                        onChange={(e) => setSelectedMarketPrice(Number(e.target.value))} placeholder="120" />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input placeholder="Row 70, Thursday night" value={marketDescription} onChange={(e) => setMarketDescription(e.target.value)} />
                      <div className="text-xs text-gray-500">Price is a hard number; description helps others assess.</div>
                    </div>
                  </>
                )}
                <div>
                  <Label>Number of Tickets</Label>
                  <Input value="1" readOnly className="bg-gray-50" />
                  <p className="mt-1 text-xs text-gray-500">Fixed at 1 ticket per post</p>
                </div>
                <div className="flex flex-col gap-2">
                  {currentEvent?.type === 'ceiling' ? (
                    <Button type="button" onClick={postIntent}>Post</Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={async () => {
                        if (!currentUser) { alert('Please sign in first.'); return; }
                        const desc = (marketDescription || '').trim();
                        const price = Number(selectedMarketPrice);
                        if (!price || price <= 0) { alert('Enter a valid price'); return; }
                        if (!desc) { alert('Please add a short description'); return; }
                        const ok = await ensureEventExists();
                        if (!ok) { alert('Event not found and could not be created. Please seed events via SQL or admin RPC.'); return; }
                        try {
                          const row = {
                            device_id: getDeviceId(),
                            event_id: eventId,
                            role,
                            price,
                            tickets: 1,
                            description: desc,
                            username: currentUser.username,
                            phone_e164: currentUser.phone_e164,
                            cohort: currentUser.cohort,
                            venmo_handle: currentUser.venmo_handle,
                            email: currentUser.wharton_email,
                          };
                          const { data, error } = await supabase.from('market_postings').insert(row).select().single();
                          if (error) { alert(`Post failed: ${error.message}`); return; }
                          if (data) {
                            setMarketPostings((prev) => ([
                              {
                                id: String(data.id), userId: data.device_id, eventId: data.event_id, role: data.role,
                                price: Number(data.price)||0, tickets: data.tickets ?? 1, description: data.description ?? '',
                                name: data.username, phone: data.phone_e164, cohort: data.cohort ?? undefined,
                                venmo: data.venmo_handle ?? undefined, email: data.email ?? undefined,
                                created_at: data.created_at,
                              },
                              ...prev,
                            ]));
                            setPostNotice('Success! Your ticket is live.');
                            setTimeout(() => setPostNotice(''), 5000);
                            setMarketDescription('');
                          }
                        } catch (e: any) {
                          alert(`Failed to post: ${e?.message || 'Unknown error'}`);
                        }
                      }}
                    >
                      Post
                    </Button>
                  )}
                  {postNotice && (
                    <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                      {postNotice}
                    </div>
                  )}
                </div>

                {/* Matches moved to its own card below */}
              </div>
            ) : (
              <div className="text-sm text-gray-500">Sign in to enter your inputs and see matches.</div>
            )}
          </Card>

          {/* Matches: Make wide on desktop for readability */}
          <Card className="p-5 lg:col-span-3">
            <SectionTitle title="Matches" subtitle="All closest matches by price/percent" />
            {!currentUser ? (
              <div className="text-sm text-gray-400">Sign in to see your matches.</div>
            ) : currentEvent?.type === 'market' ? (
              (() => {
                const mm = myMarketMatches;
                if (!mm.length) return <div className="text-sm text-gray-400">No matches yet</div>;
                return (
                  <div className="space-y-3 text-sm">
                    {mm.slice(0, 50).map((m, i) => {
                      const buyer = m.me.role === 'buyer' ? m.me : m.other;
                      const seller = m.me.role === 'seller' ? m.me : m.other;
                      return (
                        <div key={i} className="rounded-lg border bg-gray-50 p-3">
                          <div className="mb-2 flex items-center justify-between font-semibold">
                            <span>{seller.name} ↔ {buyer.name} at ${m.agreedPrice}</span>
                            <WeTradedButton onClick={async () => {
                              try {
                                await supabase.rpc('tm_we_traded', { p_buyer: buyer.userId, p_seller: seller.userId, p_event_id: eventId, p_price: m.agreedPrice, p_tickets: 1 });
                              } catch {}
                              setTrades((prev) => [...prev, { id: String(Date.now()), buyerName: buyer.name, sellerName: seller.name, eventId, price: m.agreedPrice, tickets: 1, timestamp: new Date() }]);
                              setTotalTradedTickets((prev) => prev + 1);
                            }} />
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs text-gray-700">
                            <div>
                              <div className="font-semibold mb-1">Seller</div>
                              <div className="flex justify-between"><span className="text-gray-500">Name:</span><span>{seller.name}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Phone:</span><span>{seller.phone}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Email:</span><span>{seller.email}</span></div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Buyer</div>
                              <div className="flex justify-between"><span className="text-gray-500">Name:</span><span>{buyer.name}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Phone:</span><span>{buyer.phone}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Email:</span><span>{buyer.email}</span></div>
                            </div>
                          </div>
                          <div className="mt-1 text-right text-xs text-gray-500">@ {toMoney(m.agreedPrice)}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              (() => {
                const mm = myMatches;
                if (!mm.length) return <div className="text-sm text-gray-400">No matches yet</div>;
                return (
                  <div className="space-y-3 text-sm">
                    {mm.slice(0, 50).map((m, i) => {
                      const buyer = m.me.role === 'buyer' ? m.me : m.other;
                      const seller = m.me.role === 'seller' ? m.me : m.other;
                      const agreedPct = m.agreedPct;
                      return (
                        <div key={i} className="rounded-lg border bg-gray-50 p-3">
                          <div className="mb-2 flex items-center justify-between font-semibold">
                            <span>{seller.name} ↔ {buyer.name} at {agreedPct}%</span>
                            <WeTradedButton onClick={async () => {
                              try {
                                await supabase.rpc('tm_we_traded', { p_buyer: buyer.userId, p_seller: seller.userId, p_event_id: eventId, p_price: (agreedPct/100)*eventPrice, p_tickets: 1 });
                              } catch {}
                              setTrades((prev) => [...prev, { id: String(Date.now()), buyerName: buyer.name, sellerName: seller.name, eventId, price: (agreedPct/100)*eventPrice, tickets: 1, timestamp: new Date() }]);
                              setTotalTradedTickets((prev) => prev + 1);
                            }} />
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs text-gray-700">
                            <div>
                              <div className="font-semibold mb-1">Seller</div>
                              <div className="flex justify-between"><span className="text-gray-500">Name:</span><span>{seller.name}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Phone:</span><span>{seller.phone}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Email:</span><span>{seller.email}</span></div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Buyer</div>
                              <div className="flex justify-between"><span className="text-gray-500">Name:</span><span>{buyer.name}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Phone:</span><span>{buyer.phone}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Email:</span><span>{buyer.email}</span></div>
                            </div>
                          </div>
                          <div className="mt-1 text-right text-xs text-gray-500">@ {toMoney((agreedPct/100)*eventPrice)}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </Card>

          {/* My Listings under Matches */}
          {currentUser && (
            <Card className="p-5 lg:col-span-3">
              <SectionTitle title="My Listings" subtitle="Active posts you created" />
              {myListings.length === 0 ? (
                <div className="text-sm text-gray-500">No active listings.</div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {myListings.map((l) => (
                    <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                      {l.source === 'market' ? (
                        <span>{l.role} 1 ticket @ ${l.price} — {l.label}</span>
                      ) : (
                        <span>{l.role} 1 ticket @ {l.percent}% — {l.label}</span>
                      )}
                      <div className="flex items-center gap-2">
                        <TradedButton onClick={() => markTraded(l.id, l.source)} />
                        <DeleteButton onClick={() => deletePosting(l.id, l.source)} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {/* MIDDLE: Charts */}
          <div className="grid gap-6 lg:col-span-2 lg:grid-cols-1">
            {currentEvent?.type === 'ceiling' ? (
              <>
                <Card className="p-5">
                  <SectionTitle title="Market Distribution" subtitle={`Event: ${currentEvent?.label ?? ''} — left bars = sellers, right bars = buyers`} />
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={marketDistribution} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
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
                  {/* Hide 'no postings' message for public FOMO view */}
                </Card>

                <Card className="p-5">
                  <SectionTitle title="Supply vs Demand" subtitle="Calculated from current postings" />
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={supplyDemand} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="p" tickFormatter={(v) => `${v}%`} />
                            <YAxis allowDecimals={false} />
                            <Tooltip labelFormatter={(label) => `Price: ${label}%`} />
                            <Legend />
                            <ReferenceLine x={clearing} stroke="#EF4444" strokeDasharray="5 3" label={`p* = ${clearing}%`} />
                            <Line type="monotone" dataKey="supply" name="Supply (sellers ≤ p)" stroke="#6366F1" dot={false} />
                            <Line type="monotone" dataKey="demand" name="Demand (buyers ≥ p)" stroke="#10B981" dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="grid content-start gap-3 lg:col-span-1">
                      <Card className="p-4">
                        <div className="text-sm text-gray-500">Clearing Price</div>
                        <div className="text-2xl font-bold">{currentUser ? `${clearing}%` : '-%'}</div>
                        <div className="text-sm text-gray-600">≈ {currentUser ? toMoney(eventPrice * (clearing / 100)) : '—'}</div>
                      </Card>
                      <Card className="p-4">
                        <div className="text-sm text-gray-500">Active Buyers</div>
                        <div className="text-2xl font-bold">{filtered.filter(p => p.role === 'buyer').length}</div>
                      </Card>
                      <Card className="p-4">
                        <div className="text-sm text-gray-500">Active Sellers</div>
                        <div className="text-2xl font-bold">{filtered.filter(p => p.role === 'seller').length}</div>
                      </Card>
                    </div>
                  </div>
                </Card>
              </>
            ) : (
              <>
              <Card className="p-5">
                  <SectionTitle title="Market Options" subtitle="Discrete supply (sellers) and demand (buyers) at price; hover for details" />
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
                          <line x1="5" y1="80" x2="95" y2="80" stroke="#d1d5db" strokeWidth="1" />
                          {/* price ticks every $100 from domain min..max */}
                          {(() => {
                            const prices = marketPoints.map(p => p.price);
                            const step = 100;
                            const min = prices.length ? Math.min(...prices) : 0;
                            const max = prices.length ? Math.max(...prices) : step;
                            const lo = Math.floor(min / step) * step;
                            const hi = Math.max(lo + step, Math.ceil(max / step) * step);
                            const ticks = [] as number[];
                            for (let v = lo; v <= hi; v += step) ticks.push(v);
                            return (
                              <g>
                                {ticks.map((v, i) => {
                                  const x = 5 + ((v - lo) / Math.max(1, (hi - lo))) * 90;
                                  return (
                                    <g key={i}>
                                      <line x1={x} y1={80} x2={x} y2={82} stroke="#9ca3af" strokeWidth="0.5" />
                                      <text x={x} y={86} textAnchor="middle" fontSize="3" fill="#6b7280">${v}</text>
                                    </g>
                                  );
                                })}
                              </g>
                            );
                          })()}
                          {/* circles */}
                          {(() => {
                            const prices = marketPoints.map(p => p.price);
                            const step = 100;
                            const min = prices.length ? Math.min(...prices) : 0;
                            const max = prices.length ? Math.max(...prices) : step;
                            const lo = Math.floor(min / step) * step;
                            const hi = Math.max(lo + step, Math.ceil(max / step) * step);
                            return marketPoints.map((pt, idx) => {
                              const x = 5 + ((pt.price - lo) / Math.max(1, (hi - lo))) * 90;
                              const y = 78 - ((idx % 4) * 8); // small vertical staggering
                              const fill = pt.role === 'seller' ? '#6366F1' : '#10B981';
                              const stroke = pt.role === 'seller' ? '#4338CA' : '#059669';
                              const selected = selectedMarketPrice === pt.price;
                              return (
                                <g key={idx} onClick={() => setSelectedMarketPrice(pt.price)} style={{ cursor: 'pointer' }}>
                                  <circle cx={x} cy={y} r={selected ? 5 : 4} fill={fill} stroke={stroke} strokeWidth={selected ? 2 : 1}>
                                    <title>{pt.username}: ${pt.price}\n{pt.label || '(no description)'}</title>
                                  </circle>
                                </g>
                              );
                            });
                          })()}
                        </svg>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">Click a circle to set the price input above</div>
                  </div>
                  <div className="grid content-start gap-3 lg:col-span-1">
                    <Card className="p-4">
                      <div className="text-sm text-gray-500">Selected Price</div>
                      <div className="text-2xl font-bold">{selectedMarketPrice ? `$${selectedMarketPrice}` : '—'}</div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-gray-500">Counts</div>
                      <div className="text-sm text-gray-700 space-y-1">
                        <div className="flex items-center justify-between"><span>Buyers</span><span>{marketFiltered.filter(p => p.role==='buyer').length}</span></div>
                        <div className="flex items-center justify-between"><span>Sellers</span><span>{marketFiltered.filter(p => p.role==='seller').length}</span></div>
                      </div>
                    </Card>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <SectionTitle title="Average Price" subtitle="Simple average across recent postings (market events)" />
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={(() => {
                      const data = marketFiltered.slice().reverse();
                      const buckets: Record<string, { sum: number; n: number }> = {};
                      for (const r of data) {
                        const t = r.created_at ? new Date(r.created_at) : new Date();
                        const key = `${t.getFullYear()}-${t.getMonth()+1}-${t.getDate()} ${t.getHours()}:00`;
                        if (!buckets[key]) buckets[key] = { sum: 0, n: 0 };
                        buckets[key].sum += r.price; buckets[key].n += 1;
                      }
                      return Object.entries(buckets).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>({ t:k, avg: Math.round((v.sum/v.n)*100)/100 }));
                    })()} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={true} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="avg" name="Avg Price" stroke="#4f46e5" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Hide 'no postings' message for public FOMO view */}
              </Card>
              </>
            )}
          </div>

          {/* RIGHT: Chat (live) */}
          <Card className="p-5 lg:col-span-1">
            <SectionTitle title="Community Chat" subtitle="Messages are public to signed-in users (max 250 chars)" />
            <div className="space-y-4">
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg bg-gray-50 p-3">
                {chat.map((c) => (
                  <div key={c.id} className="text-sm">
                    <div className="font-semibold text-indigo-600">{c.username}</div>
                    <div className="text-gray-700 break-words">{c.message}</div>
                    <div className="text-xs text-gray-500">{new Date(c.created_at).toLocaleTimeString()}</div>
                  </div>
                ))}
                {chat.length === 0 && <div className="text-xs text-gray-500">No messages yet.</div>}
              </div>
              {currentUser && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Type your message (max 250 chars)..."
                    value={newComment}
                    maxLength={250}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addComment(); }}
                    className="flex-1"
                  />
                  <Button onClick={addComment} type="button" disabled={!newComment.trim()}>
                    <MessageCircle size={16} />
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Admin (hidden by default; enable with NEXT_PUBLIC_SHOW_ADMIN=1) */}
        {showAdmin && (
        <Card className="mt-6 p-5">
          <SectionTitle title="Admin" subtitle="Seed new events (market or ceiling pricing)" />
          {!isAdmin ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label>Username</Label>
                <Input value={adminUser} onChange={(e) => setAdminUser(e.target.value)} placeholder="admin" />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} placeholder="••••••••" />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      const { data, error } = await supabase.rpc('tm_admin_login', { p_username: adminUser, p_password: adminPass });
                      if (error) { alert(`Login failed: ${error.message}`); return; }
                      if (data && data.ok) setIsAdmin(true); else alert('Invalid admin credentials');
                    } catch (e: any) {
                      alert('Admin RPC not configured. See db/migrations.sql');
                    }
                  }}
                >
                  Sign In
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <div className="md:col-span-2">
                <Label>Event Name</Label>
                <Input value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="Event name" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={newEventType} onChange={(e) => setNewEventType(e.target.value as any)}>
                  <option value="market">Market pricing (US Open)</option>
                  <option value="ceiling">Ceiling pricing (White Party)</option>
                </Select>
              </div>
              {newEventType === 'ceiling' && (
                <div>
                  <Label>Member Price ($)</Label>
                  <Input type="number" value={newEventPrice} onChange={(e) => setNewEventPrice(Number(e.target.value))} />
                </div>
              )}
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={async () => {
                    const name = newEventName.trim();
                    if (!name) { alert('Enter an event name'); return; }
                    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `evt-${Date.now()}`;
                    if ([...allEvents].some(e => e.id === id)) { alert('Event with similar name already exists'); return; }
                    try {
                      const label = newEventType === 'market' ? `${name} (Market Pricing)` : `${name} - Member Price $${newEventPrice}`;
                      const priceVal = newEventType === 'market' ? null : newEventPrice;
                      const { error } = await supabase.rpc('tm_create_event', {
                        p_username: adminUser,
                        p_password: adminPass,
                        p_id: id,
                        p_label: label,
                        p_type: newEventType,
                        p_price: priceVal,
                      });
                      if (error) { alert(`Failed to add event: ${error.message}`); return; }
                      await refreshEvents();
                      setNewEventName('');
                    } catch (e: any) {
                      alert('tm_create_event RPC not configured. See db/migrations.sql');
                    }
                  }}
                >
                  Add Event
                </Button>
              </div>
            </div>
          )}
        </Card>
        )}

        {/* My Profile */}
        {currentUser && (
          <Card className="mt-6 p-5">
            <SectionTitle title="My Profile" />
            <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3 items-center">
              <div><strong>Full Name:</strong> {currentUser.username}</div>
              <div><strong>Email/Username:</strong> {currentUser.wharton_email}</div>
              <div><strong>WG Cohort:</strong> {currentUser.cohort}</div>
              <div><strong>Phone:</strong> {currentUser.phone_e164}</div>
              <div><strong>Venmo:</strong> @{currentUser.venmo_handle}</div>
              <div className="flex items-center gap-2">
                <span><strong>Tier:</strong> {currentUser.tier}</span>
                {currentUser.tier === 'Limited' && (
                  <Button className="bg-blue-600 hover:bg-blue-500" type="button" onClick={() => setShowUpgrade(true)}>Upgrade to Basic</Button>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Slider thumb styling */}
      <style jsx>{`
        .slider::-webkit-slider-thumb { appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #4f46e5; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        .slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #4f46e5; cursor: pointer; border: none; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
      `}</style>
      {showUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowUpgrade(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-lg font-semibold">Upgrade to Basic</h3>
            <p className="text-sm text-gray-700">Venmo <span className="font-semibold">@payajb</span> <span className="font-semibold">$5</span> for a month of Basic.</p>
            <div className="mt-4 flex justify-end gap-2">
              <GhostButton onClick={() => setShowUpgrade(false)}>Close</GhostButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
