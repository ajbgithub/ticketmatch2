'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { X, MessageCircle, Trophy, ChevronDown, ChevronUp, Users, Share2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

/* =========================
   Simple UI helpers
   ========================= */
type DivProps = React.HTMLAttributes<HTMLDivElement>;
const Card: React.FC<DivProps & { className?: string }> = ({ className = '', children, ...rest }) => (
  <div className={`rounded-none shadow-none border-0 bg-transparent ${className}`} {...rest}>{children}</div>
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
  <input className={`w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`} {...rest} />
);
const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', children, ...rest }) => (
  <select className={`w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`} {...rest}>{children}</select>
);
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }> = ({ className = '', children, ...rest }) => (
  <button className={`rounded-xl px-3 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 transition ${className}`} {...rest}>{children}</button>
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
const WeTradedButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({ onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`rounded-lg px-3 py-2 text-sm font-semibold text-white transition ${disabled ? 'bg-green-400 opacity-60 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500'}`}
  >
    We Traded!
  </button>
);

/* =========================
   Types & constants
   ========================= */
type Role = 'buyer' | 'seller';
interface Profile {
  id: string;
  full_name: string;
  email: string; // auth email
  school: 'Wharton' | 'Penn' | 'HBS' | 'GSB';
  phone_e164: string;
  venmo_handle: string;
  school_email: string;
  bio: string;
}

interface Posting {
  id: string;
  userId: string;      // device_id
  userUid?: string;    // supabase auth user_id
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
  { id: 'colombia-trek', label: 'Colombia Trek - Face Value $0', type: 'ceiling', price: 0 },
];

// Membership removed

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
// Allow letters, numbers, and common symbols (2..64 chars)
const isValidVenmo = (h: string): boolean => /^[A-Za-z0-9!@#$%^&*()_+\-=.:@]{2,64}$/.test(normalizeVenmo(h));
const copy = (text?: string) => {
  if (!text) return;
  const fallbackCopy = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {}
  };
  try {
    // Use Clipboard API when available and in a secure context; fallback otherwise
    if (navigator.clipboard && (window as any).isSecureContext) {
      navigator.clipboard.writeText(text).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  } catch {
    fallbackCopy();
  }
};

// Parse an E.164 phone into country code + local digits (best-effort)
const parseE164 = (e164?: string): { code: string; digits: string } => {
  const v = (e164 || '').trim();
  if (!v.startsWith('+')) return { code: AREA_CODES[0], digits: onlyDigits(v) };
  // Choose the longest matching known code
  let best = AREA_CODES[0];
  for (const c of AREA_CODES) {
    if (v.startsWith(c) && c.length > best.length) best = c;
  }
  const digits = onlyDigits(v.slice(best.length));
  return { code: best, digits };
};

// Market posting (price-based) for market-type events (e.g., US Open)
interface MarketPosting {
  id: string;
  userId: string;      // device_id
  userUid?: string;    // supabase auth user_id
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
export default function TicketMarket() {
  // DB-backed state
  const [postings, setPostings] = useState<Posting[]>([]);
  const [marketPostings, setMarketPostings] = useState<MarketPosting[]>([]);
  const [serverEvents, setServerEvents] = useState<EventItem[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);

  // UI state
  const [totalTradedTickets, setTotalTradedTickets] = useState<number>(17);
  const [newComment, setNewComment] = useState<string>('');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [postNotice, setPostNotice] = useState<string>(''); // success banner
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [showBanner, setShowBanner] = useState<boolean>(false);
  // Profile completion state
  const [pfFullName, setPfFullName] = useState<string>('');
  const [pfEmail, setPfEmail] = useState<string>('');
  const [pfSchool, setPfSchool] = useState<'Wharton' | 'Penn' | 'HBS' | 'GSB'>('Wharton');
  const [pfAreaCode, setPfAreaCode] = useState<string>(AREA_CODES[0]);
  const [pfPhoneDigits, setPfPhoneDigits] = useState<string>('');
  const [pfVenmo, setPfVenmo] = useState<string>('');
  const [pfSchoolEmail, setPfSchoolEmail] = useState<string>('');
  const [pfBio, setPfBio] = useState<string>('');
  const [pfError, setPfError] = useState<string>('');

  // Legacy auth fields removed

  // Events and posting fields
  const [extraEvents, setExtraEvents] = useState<EventItem[]>([]);
  const allEvents = useMemo(() => {
    // Prefer server events; fallback to base. Hide legacy US Open / White Party.
    const merged = [...serverEvents, ...BASE_EVENTS, ...extraEvents];
    const byId = new Map<string, EventItem>();
    merged.forEach(e => {
      const label = (e.label || '').toLowerCase();
      if (e.id === 'usopen' || e.id === 'wp' || label.includes('us open') || label.includes('white party')) return;
      byId.set(e.id, e);
    });
    return Array.from(byId.values());
  }, [serverEvents, extraEvents]);
  // Blank default so user actively selects an event
  const [eventId, setEventId] = useState<string>('');
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
  const [weTradedSet, setWeTradedSet] = useState<Set<string>>(new Set());

  const currentEvent = useMemo(() => allEvents.find((e) => e.id === eventId), [allEvents, eventId]);
  const eventPrice = currentEvent?.price ?? 0;
  const showAdmin = true;
  const adminEnvUser = process.env.NEXT_PUBLIC_ADMIN_USER || 'admin';
  const adminEnvPass = process.env.NEXT_PUBLIC_ADMIN_PASS || 'marketmaker';

  // Choose the most recently added event for logged-out users (FOMO)
  const latestEventId = useMemo(() => {
    if (serverEvents.length) return serverEvents[serverEvents.length - 1].id;
    return BASE_EVENTS[BASE_EVENTS.length - 1].id; // fallback
  }, [serverEvents]);

  // Do not auto-select for signed-out; allow signed-in to auto-select if none chosen
  useEffect(() => {
    if (currentUser && !eventId && latestEventId) setEventId(latestEventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestEventId, currentUser]);

  const ensureEventExists = async (): Promise<boolean> => {
    try {
      const { data: ev, error: evErr } = await supabase.from('events').select('id').eq('id', eventId).maybeSingle();
      if (!evErr && ev) return true;
    } catch {}
    try {
      const label = currentEvent?.label || eventId;
      const type: any = 'ceiling';
      const priceVal: any = currentEvent?.price ?? 0;
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
      const authEmail = s?.session?.user?.email ?? '';

      if (userId) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (prof) {
          setCurrentUser({
            id: userId,
            full_name: prof.username,
            email: authEmail,
            school: (prof.cohort as any) ?? 'Wharton',
            phone_e164: prof.phone_e164,
            venmo_handle: prof.venmo_handle,
            school_email: prof.wharton_email ?? '',
            bio: prof.bio ?? '',
          });
          // Ensure we persist the auth email to profiles.recovery_email for notifications/support
          try {
            if (!prof.recovery_email || prof.recovery_email !== authEmail) {
              await supabase.from('profiles').update({ recovery_email: authEmail }).eq('id', userId);
            }
          } catch {}
          // Require: name, phone, Venmo, school .edu email, and bio
          const needs =
            !isValidUsername((prof.username || '').trim()) ||
            !isValidE164(prof.phone_e164 || '') ||
            !isValidVenmo(prof.venmo_handle || '') ||
            !(prof.wharton_email || '').endsWith('.edu') ||
            !(prof.bio ?? '').trim();
          if (needs) {
            setPfFullName(prof.username ?? '');
            setPfEmail(authEmail);
            setPfSchool(((prof.cohort as any) ?? 'Wharton'));
            setPfVenmo(prof.venmo_handle ?? '');
            setPfSchoolEmail(prof.wharton_email ?? '');
            setPfBio(prof.bio ?? '');
            try {
              const ph = parseE164(prof.phone_e164);
              setPfAreaCode(ph.code);
              setPfPhoneDigits(ph.digits);
            } catch {}
            setShowProfileModal(true);
          }
        } else {
          // No profile row yet: create one with recovery_email captured from auth
          try {
            await supabase.from('profiles').upsert({ id: userId, recovery_email: authEmail }, { onConflict: 'id' });
          } catch {}
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
                  userUid: r.user_id ?? undefined,
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
                  id: String(r.id), userId: r.device_id, userUid: r.user_id ?? undefined, eventId: r.event_id, role: r.role,
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
        const authEmail2 = sess.user.email ?? '';
        if (prof) {
          setCurrentUser({
            id: sess.user.id,
            full_name: prof.username,
            email: authEmail2,
            school: (prof.cohort as any) ?? 'Wharton',
            phone_e164: prof.phone_e164,
            venmo_handle: prof.venmo_handle,
            school_email: prof.wharton_email ?? '',
            bio: prof.bio ?? '',
          });
          // Persist auth email to profiles.recovery_email if missing or outdated
          try {
            if (!prof.recovery_email || prof.recovery_email !== authEmail2) {
              await supabase.from('profiles').update({ recovery_email: authEmail2 }).eq('id', sess.user.id);
            }
          } catch {}
          // Require: name, phone, Venmo, school .edu email, and bio
          const needs =
            !isValidUsername((prof.username || '').trim()) ||
            !isValidE164(prof.phone_e164 || '') ||
            !isValidVenmo(prof.venmo_handle || '') ||
            !(prof.wharton_email || '').endsWith('.edu') ||
            !(prof.bio ?? '').trim();
          if (needs) {
            setPfFullName(prof.username ?? '');
            setPfEmail(authEmail2);
            setPfSchool(((prof.cohort as any) ?? 'Wharton'));
            setPfVenmo(prof.venmo_handle ?? '');
            setPfSchoolEmail(prof.wharton_email ?? '');
            setPfBio(prof.bio ?? '');
            try {
              const ph = parseE164(prof.phone_e164);
              setPfAreaCode(ph.code);
              setPfPhoneDigits(ph.digits);
            } catch {}
            setShowProfileModal(true);
          }
        } else {
          // Seed profile with recovery_email on first sign-in
          try {
            await supabase.from('profiles').upsert({ id: sess.user.id, recovery_email: authEmail2 }, { onConflict: 'id' });
          } catch {}
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
          userUid: r.user_id ?? undefined,
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
          id: String(r.id), userId: r.device_id, userUid: r.user_id ?? undefined, eventId: r.event_id, role: r.role,
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

  /* -------- Google Sign-In -------- */
  const signInWithGoogle = async () => {
    try {
      await supabase.auth.signInWithOAuth({ provider: 'google' });
    } catch (e) {
      console.error('Google sign-in failed', e);
      alert('Unable to start Google sign-in. Please try again.');
    }
  };

  /* -------- Save Profile (validate only changed fields) -------- */
  const [pfSuccess, setPfSuccess] = useState<string>('');
  const saveProfile = async () => {
    setPfError('');
    setPfSuccess('');

    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!uid || !currentUser) { setPfError('Not signed in'); return; }

    // Effective values (fallback to existing profile if input left blank)
    const nameRaw = pfFullName.trim() || currentUser.full_name;
    const school = (pfSchool || currentUser.school) as any;
    const schoolEmail = (pfSchoolEmail.trim() || currentUser.school_email).trim();
    const ven = normalizeVenmo(pfVenmo.trim() || currentUser.venmo_handle);
    let e164 = currentUser.phone_e164;
    if (pfPhoneDigits.trim()) {
      e164 = buildE164(pfAreaCode, pfPhoneDigits);
    }
    const bio = pfBio !== '' ? pfBio : currentUser.bio;

    // Validate only changed fields (general case)
    if (pfFullName.trim() && !isValidUsername(normalizeUsername(nameRaw))) { setPfError('Please enter First Last'); return; }
    if (pfSchoolEmail.trim() && !schoolEmail.toLowerCase().endsWith('.edu')) { setPfError('School email must end in .edu'); return; }
    if (pfVenmo.trim() && !isValidVenmo(ven)) { setPfError('Enter a valid Venmo'); return; }
    if (pfPhoneDigits.trim() && !isValidE164(e164)) { setPfError('Enter a valid phone number'); return; }

    // When completing initial profile, require all fields
    if (showProfileModal) {
      if (!isValidUsername(normalizeUsername(nameRaw))) { setPfError('Please enter First Last'); return; }
      if (!isValidE164(e164)) { setPfError('Enter a valid phone number'); return; }
      if (!schoolEmail.toLowerCase().endsWith('.edu')) { setPfError('School email must end in .edu'); return; }
      if (!(bio || '').trim()) { setPfError('Bio is required'); return; }
      if (!ven || !isValidVenmo(ven)) { setPfError('Enter a valid Venmo'); return; }
    }

    try {
      const { error } = await supabase.from('profiles').upsert({
        id: uid,
        username: normalizeUsername(nameRaw),
        cohort: school,
        phone_e164: e164,
        venmo_handle: ven,
        wharton_email: schoolEmail,
        recovery_email: currentUser.email,
        bio,
      }, { onConflict: 'id' });
      if (error) { setPfError(error.message); return; }

      setCurrentUser({
        id: uid,
        full_name: normalizeUsername(nameRaw),
        email: currentUser.email,
        school,
        phone_e164: e164,
        venmo_handle: ven,
        school_email: schoolEmail,
        bio,
      });
      // Sync contact details to user's postings so matches reflect immediately
      const contactEmail = schoolEmail || currentUser.email;
      try {
        await Promise.allSettled([
          supabase.from('postings_public').update({
            username: normalizeUsername(nameRaw),
            phone_e164: e164,
            venmo_handle: ven,
            email: contactEmail,
          }).eq('user_id', uid),
          supabase.from('market_postings').update({
            username: normalizeUsername(nameRaw),
            phone_e164: e164,
            venmo_handle: ven,
            email: contactEmail,
          }).eq('user_id', uid),
        ]);
        await Promise.allSettled([refreshPostings(), refreshMarketPostings()]);
      } catch {}

      // Update transient inputs to reflect saved values (so they show on screen)
      const parsed = parseE164(e164);
      setPfAreaCode(parsed.code);
      setPfPhoneDigits(parsed.digits);
      setPfFullName(normalizeUsername(nameRaw));
      setPfVenmo(ven);
      setPfSchoolEmail(schoolEmail);
      setPfBio(bio);

      setPfSuccess('Success, your profile is updated!');
      if (showProfileModal) setShowProfileModal(false);
    } catch (e: any) {
      setPfError(e.message || 'Failed to save profile');
    }
  };

  /* -------- Posting helpers -------- */
  const postIntent = async () => {
    if (!currentUser) { alert('Please sign in first.'); return; }

    const row = {
      device_id: getDeviceId(),
      event_id: eventId,
      role,
      percent: Math.round(clamp01((percent || 0) / 100) * 100),
      tickets: 1,
      username: currentUser.full_name,
      phone_e164: currentUser.phone_e164,
      cohort: currentUser.school,
      venmo_handle: currentUser.venmo_handle,
      email: currentUser.school_email || currentUser.email,
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
            userUid: data.user_id ?? undefined,
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
      setPostNotice("Success! Your post is live. Ensure to review My Listings if you've traded a ticket already.");
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
      username: currentUser.full_name,
      message: msg,
      created_at: new Date().toISOString(),
    };

    setChat((prev) => [optimistic, ...prev].slice(0, 200));
    setNewComment('');

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ user_id: currentUser.id, username: currentUser.full_name, message: msg })
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
    const mine = postings.filter((p) => p.userUid === currentUser.id && p.eventId === eventId);
    const others = postings.filter((p) => p.userUid !== currentUser.id && p.eventId === eventId);
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
    const mine = marketPostings.filter((p) => p.userUid === currentUser.id && p.eventId === eventId);
    const others = marketPostings.filter((p) => p.userUid !== currentUser.id && p.eventId === eventId);
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
      .filter(p => p.userUid === currentUser.id)
      .map(p => ({ source: 'ceiling' as const, id: p.id, label: allEvents.find(e => e.id === p.eventId)?.label || p.eventId, role: p.role, percent: p.percent, tickets: p.tickets }));
    const b: ListingItem[] = marketPostings
      .filter(p => p.userUid === currentUser.id)
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

  // Supply/demand removed

  /* -------- UI -------- */
  return (
    <div className="min-h-screen w-full bg-white text-gray-900">
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center">
            <img
              src="/ticketmatch-banner.png"
              alt="Ticketmatch"
              className="h-24 md:h-32 w-auto cursor-pointer"
              onClick={() => setShowBanner(true)}
            />
          </div>
          <div className="mt-2 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
            <p className="md:flex-1 text-gray-700">
              Buy and resell campus tickets at face value or lower, with live data and automation.
            </p>
            <div className="flex items-center gap-4 text-base sm:text-lg">
              <span className="mx-2 h-5 w-px bg-gray-300" />
              <Users className="text-blue-600" size={22} />
              <span className="font-extrabold text-2xl">100+</span>
              <span className="text-gray-700">traders</span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (navigator.share) {
                      await navigator.share({ url: 'https://ticketmatch.vercel.app', title: 'Ticketmatch' });
                    } else {
                      await navigator.clipboard.writeText('https://ticketmatch.vercel.app');
                      alert('Link copied to clipboard');
                    }
                  } catch {}
                }}
                className="inline-flex items-center"
                aria-label="Share Ticketmatch"
                title="Share"
              >
                <Share2 className="text-green-600" size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Membership removed */}

        {/* Event selection moved below Matches for signed-out users */}

        {/* Auth */}
        {!currentUser ? (
          <Card className="mb-6 p-5">
            <SectionTitle title="Sign in" subtitle="Use Google, then complete your profile" />
            <div className="flex items-center gap-2">
              <Button type="button" onClick={signInWithGoogle}>Continue with Google</Button>
            </div>
          </Card>
        ) : (
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              Signed in as <strong>{currentUser.full_name}</strong>
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
            <SectionTitle title="My Inputs" />
            {currentUser ? (
              <div className="space-y-4">
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
                        <span>0%</span><span className="font-semibold text-blue-600">{percent}%</span><span>100%</span>
                      </div>
                    </div>
                  </div>
                )}
                {/* Market inputs removed; ceiling-only */}
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
                            username: currentUser.full_name,
                            phone_e164: currentUser.phone_e164,
                            cohort: currentUser.school,
                            venmo_handle: currentUser.venmo_handle,
                            email: currentUser.school_email || currentUser.email,
                          };
                          const { data, error } = await supabase.from('market_postings').insert(row).select().single();
                          if (error) { alert(`Post failed: ${error.message}`); return; }
                          if (data) {
                            setMarketPostings((prev) => ([
                              {
                                id: String(data.id), userId: data.device_id, userUid: data.user_id ?? undefined, eventId: data.event_id, role: data.role,
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

          {/* My Listings above Matches */}
          {currentUser && (
            <Card className="p-5 lg:col-span-3">
              <SectionTitle title="My Listings" subtitle="Active posts you created" />
              {myListings.length === 0 ? (
                <div className="text-sm text-gray-500">No active listings.</div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {myListings.map((l) => (
                    <li key={l.id} className="flex items-center justify-between py-3 text-base">
                      {l.source === 'market' ? (
                        <span>{l.role} 1 ticket @ ${l.price} — {l.label}</span>
                      ) : (
                        <span>{l.role} 1 ticket @ {l.percent}% — {l.label}</span>
                      )}
                      <div className="flex items-center gap-3">
                        <button onClick={() => markTraded(l.id, l.source)} className="rounded-lg px-3 py-2 text-sm font-semibold bg-green-600 text-white hover:bg-green-500 transition">Traded</button>
                        <button onClick={() => deletePosting(l.id, l.source)} className="rounded-lg p-2 text-red-600 hover:bg-red-50 transition" aria-label="Delete">
                          <X size={20} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

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
                  <div className="text-sm flex gap-3 overflow-x-auto snap-x snap-mandatory pr-2">
                    {mm.slice(0, 50).map((m, i) => {
                      const buyer = m.me.role === 'buyer' ? m.me : m.other;
                      const seller = m.me.role === 'seller' ? m.me : m.other;
                      return (
                        <div key={i} className="rounded-lg border border-purple-700 bg-purple-700 p-4 text-white snap-start min-w-[85%]">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-base font-bold">{seller.name} ↔ {buyer.name}</span>
                      {(() => {
                        const mk = `market:${eventId}:${buyer.userId}:${seller.userId}`;
                        const disabled = weTradedSet.has(mk);
                        return (
                          <WeTradedButton
                            disabled={disabled}
                            onClick={async () => {
                              if (weTradedSet.has(mk)) return;
                              try {
                                await supabase.rpc('tm_we_traded', { p_buyer: buyer.userId, p_seller: seller.userId, p_event_id: eventId, p_price: m.agreedPrice, p_tickets: m.tickets, p_source: 'market' });
                              } catch {}
                              setWeTradedSet(prev => new Set(prev).add(mk));
                              setTrades((prev) => [...prev, { id: String(Date.now()), buyerName: buyer.name, sellerName: seller.name, eventId, price: m.agreedPrice, tickets: m.tickets, timestamp: new Date() }]);
                              setTotalTradedTickets((prev) => prev + m.tickets);
                              setPostNotice('Thanks for telling us!');
                              setTimeout(() => setPostNotice(''), 3000);
                            }}
                          />
                        );
                      })()}
                          </div>
                          <div className="space-y-2 text-sm md:text-base">
                            <div>
                              <div className="font-semibold">Seller</div>
                              <div>{seller.name}</div>
                              <div className="flex items-center gap-2"><a className="truncate underline" target="_blank" rel="noopener noreferrer" href={seller.email ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(seller.email)}` : undefined}>{seller.email}</a></div>
                              <div className="flex items-center gap-2"><a className="truncate underline" href={seller.phone ? `sms:${seller.phone}` : undefined}>{seller.phone}</a></div>
                              <div className="flex items-center gap-2"><a className="truncate underline" target="_blank" rel="noopener noreferrer" href={seller.venmo ? `https://venmo.com/${normalizeVenmo(seller.venmo)}` : undefined}>@{seller.venmo}</a></div>
                            </div>
                            <div>
                              <div className="font-semibold">Buyer</div>
                              <div>{buyer.name}</div>
                              <div className="flex items-center gap-2"><a className="truncate underline" target="_blank" rel="noopener noreferrer" href={buyer.email ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(buyer.email)}` : undefined}>{buyer.email}</a></div>
                              <div className="flex items-center gap-2"><a className="truncate underline" href={buyer.phone ? `sms:${buyer.phone}` : undefined}>{buyer.phone}</a></div>
                              <div className="flex items-center gap-2"><a className="truncate underline" target="_blank" rel="noopener noreferrer" href={buyer.venmo ? `https://venmo.com/${normalizeVenmo(buyer.venmo)}` : undefined}>@{buyer.venmo}</a></div>
                            </div>
                          </div>
                          {/* price hidden inside ticket per requirements */}
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
                  <div className="text-sm flex gap-3 overflow-x-auto snap-x snap-mandatory pr-2">
                    {mm.slice(0, 50).map((m, i) => {
                      const buyer = m.me.role === 'buyer' ? m.me : m.other;
                      const seller = m.me.role === 'seller' ? m.me : m.other;
                      const agreedPct = m.agreedPct;
                      return (
                        <div key={i} className="rounded-lg border border-purple-700 bg-purple-700 p-4 text-white snap-start min-w-[85%]">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-base font-bold">{seller.name} ↔ {buyer.name}</span>
                            {(() => {
                              const mk = `ceiling:${eventId}:${buyer.userId}:${seller.userId}`;
                              const disabled = weTradedSet.has(mk);
                              return (
                                <WeTradedButton
                                  disabled={disabled}
                                  onClick={async () => {
                                    if (weTradedSet.has(mk)) return;
                                    try {
                                      await supabase.rpc('tm_we_traded', { p_buyer: buyer.userId, p_seller: seller.userId, p_event_id: eventId, p_price: (agreedPct/100)*eventPrice, p_tickets: m.tickets, p_source: 'ceiling' });
                                    } catch {}
                                    setWeTradedSet(prev => new Set(prev).add(mk));
                                    setTrades((prev) => [...prev, { id: String(Date.now()), buyerName: buyer.name, sellerName: seller.name, eventId, price: (agreedPct/100)*eventPrice, tickets: m.tickets, timestamp: new Date() }]);
                                    setTotalTradedTickets((prev) => prev + m.tickets);
                                    setPostNotice('Thanks for telling us!');
                                    setTimeout(() => setPostNotice(''), 3000);
                                  }}
                                />
                              );
                            })()}
                          </div>
                          <div className="space-y-2 text-sm md:text-base">
                            <div>
                              <div className="font-semibold">Seller</div>
                              <div>{seller.name}</div>
                              <div className="flex items-center gap-2"><a className="truncate underline" target="_blank" rel="noopener noreferrer" href={seller.email ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(seller.email)}` : undefined}>{seller.email}</a></div>
                              <div className="flex items-center gap-2"><a className="truncate underline" href={seller.phone ? `sms:${seller.phone}` : undefined}>{seller.phone}</a></div>
                              <div className="flex items-center gap-2"><a className="truncate underline" target="_blank" rel="noopener noreferrer" href={seller.venmo ? `https://venmo.com/${normalizeVenmo(seller.venmo)}` : undefined}>@{seller.venmo}</a></div>
                            </div>
                            <div>
                              <div className="font-semibold">Buyer</div>
                              <div>{buyer.name}</div>
                              <div className="flex items-center gap-2"><a className="truncate underline" target="_blank" rel="noopener noreferrer" href={buyer.email ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(buyer.email)}` : undefined}>{buyer.email}</a></div>
                              <div className="flex items-center gap-2"><a className="truncate underline" href={buyer.phone ? `sms:${buyer.phone}` : undefined}>{buyer.phone}</a></div>
                              <div className="flex items-center gap-2"><a className="truncate underline" target="_blank" rel="noopener noreferrer" href={buyer.venmo ? `https://venmo.com/${normalizeVenmo(buyer.venmo)}` : undefined}>@{buyer.venmo}</a></div>
                            </div>
                          </div>
                          {/* price hidden inside ticket per requirements */}
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </Card>

          {/* My Listings was moved above */}

          {/* Event selector (signed-out): place here under Matches and above Market Distribution */}
          {!currentUser && (
            <Card className="mb-4 lg:col-span-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-6 md:items-end">
                <div className="md:col-span-3">
                  <Label>Event</Label>
                  <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                    <option value="">Select an event…</option>
                    {allEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
                  </Select>
                </div>
              </div>
            </Card>
          )}

          {/* For signed-in users, show event selector here (after Matches) */}
          {currentUser && (
            <Card className="mb-4 lg:col-span-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-6 md:items-end">
                <div className="md:col-span-3">
                  <Label>Event</Label>
                  <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                    <option value="">Select an event…</option>
                    {allEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
                  </Select>
                </div>
                {currentUser && (
                  <>
                    <div className="md:col-span-2">
                      <Label>Create an Event</Label>
                      <Input placeholder="Event name" value={newEventName} onChange={(e)=>setNewEventName(e.target.value)} />
                    </div>
                    <div>
                      <Label>Face Value</Label>
                      <Input type="number" placeholder="Face Value $" value={newEventPrice} onChange={(e)=>setNewEventPrice(Number(e.target.value))} />
                    </div>
                    <div>
                      <Label>&nbsp;</Label>
                      <Button
                        type="button"
                        onClick={async () => {
                          const name = (newEventName || '').trim();
                          const price = Number(newEventPrice);
                          if (!name) { alert('Enter an event name'); return; }
                          if (!Number.isFinite(price) || price < 0) { alert('Enter a valid face value'); return; }
                          const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `evt-${Date.now()}`;
                          const label = `${name} - Face Value $${price}`;
                          try {
                            const { error } = await supabase.rpc('tm_create_event', {
                              p_username: adminEnvUser,
                              p_password: adminEnvPass,
                              p_id: id,
                              p_label: label,
                              p_type: 'ceiling',
                              p_price: price,
                            });
                            if (error) { alert(`Failed to create event: ${error.message}`); return; }
                            await refreshEvents();
                            setEventId(id);
                            setNewEventName('');
                          } catch (e: any) {
                            alert(e?.message || 'Failed to create event');
                          }
                        }}
                      >
                        Create
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}

          {/* MIDDLE: Charts (Market Distribution only) */}
          <div className="grid gap-6 lg:col-span-2 lg:grid-cols-1">
            {eventId ? (
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
                      <Bar dataKey="seller" name="Sellers" fill="#3B82F6" />
                      <Bar dataKey="buyer"  name="Buyers"  fill="#10B981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            ) : (
              <Card className="p-5">
                <SectionTitle title="Market Distribution" subtitle="Select an event to see the live market" />
                <div className="text-sm text-gray-500">No event selected.</div>
              </Card>
            )}
          </div>

          {/* RIGHT: Chat (live) */}
          <Card className="p-5 lg:col-span-1">
            <SectionTitle title="Community Chat" subtitle="Messages are public; be respectful." />
            <div className="space-y-4">
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg bg-gray-50 p-3">
                {chat.map((c) => (
                  <div key={c.id} className="text-sm">
                    <div className="font-semibold text-blue-600">{c.username}</div>
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

        {/* Admin (visible to mbamoveteam@gmail.com) */}
        {showAdmin && currentUser?.email === 'mbamoveteam@gmail.com' && (
        <Card className="mt-6 p-5">
          <SectionTitle title="Admin" subtitle="Seed new events (market or ceiling pricing)" />
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
                  <Label> Face Price ($)</Label>
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
                        p_username: adminEnvUser,
                        p_password: adminEnvPass,
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

          {/* Market monitor table */}
          <div className="mt-6">
            <SectionTitle title="Market Monitor" subtitle="Live buyers and sellers" />
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-2 py-1">When</th>
                    <th className="px-2 py-1">Event</th>
                    <th className="px-2 py-1">Role</th>
                    <th className="px-2 py-1">Name</th>
                    <th className="px-2 py-1">Email</th>
                    <th className="px-2 py-1">Phone</th>
                    <th className="px-2 py-1">Venmo</th>
                    <th className="px-2 py-1">Price/%</th>
                    <th className="px-2 py-1">Desc</th>
                  </tr>
                </thead>
                <tbody>
                  {marketPostings.slice(0,200).map((r) => (
                    <tr key={`m_${r.id}`} className="border-t">
                      <td className="px-2 py-1">{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</td>
                      <td className="px-2 py-1">{allEvents.find(e=>e.id===r.eventId)?.label || r.eventId}</td>
                      <td className="px-2 py-1 capitalize">{r.role}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">{r.email}</td>
                      <td className="px-2 py-1">{r.phone}</td>
                      <td className="px-2 py-1">@{r.venmo}</td>
                      <td className="px-2 py-1">${'{'}r.price{'}'}</td>
                      <td className="px-2 py-1">{r.description}</td>
                    </tr>
                  ))}
                  {postings.slice(0,200).map((r) => (
                    <tr key={`c_${r.id}`} className="border-t">
                      <td className="px-2 py-1">{/* ceiling postings may lack created_at */}</td>
                      <td className="px-2 py-1">{allEvents.find(e=>e.id===r.eventId)?.label || r.eventId}</td>
                      <td className="px-2 py-1 capitalize">{r.role}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">{r.email}</td>
                      <td className="px-2 py-1">{r.phone}</td>
                      <td className="px-2 py-1">@{r.venmo}</td>
                      <td className="px-2 py-1">{r.percent}%</td>
                      <td className="px-2 py-1">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
        )}

        {/* My Profile */}
        {currentUser && (
          <Card className="mt-6 p-5">
            <SectionTitle title="My Profile" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Full Name</Label>
                <Input value={pfFullName || currentUser.full_name || ''} onChange={(e)=>setPfFullName(e.target.value)} />
              </div>
              <div>
                <Label>Auth Email</Label>
                <Input value={currentUser.email} readOnly />
              </div>
              <div>
                <Label>School</Label>
                <Select value={pfSchool || currentUser.school} onChange={(e)=>setPfSchool(e.target.value as any)}>
                  <option value="Wharton">Wharton</option>
                  <option value="Penn">Penn</option>
                  <option value="HBS">HBS</option>
                  <option value="GSB">GSB</option>
                </Select>
              </div>
              <div>
                <Label>School Email (.edu)</Label>
                <Input value={pfSchoolEmail || currentUser.school_email || ''} onChange={(e)=>setPfSchoolEmail(e.target.value)} />
              </div>
              <div>
                <Label>Phone (WhatsApp)</Label>
                <div className="flex gap-2">
                  <Select className="w-28" value={pfAreaCode} onChange={(e)=>setPfAreaCode(e.target.value)}>
                    {AREA_CODES.map((c)=> <option key={c} value={c}>{c}</option>)}
                  </Select>
                  <Input
                    value={pfPhoneDigits}
                    onChange={(e)=>setPfPhoneDigits(e.target.value)}
                    placeholder={parseE164(currentUser.phone_e164 || '').digits}
                  />
                </div>
              </div>
              <div>
                <Label>Venmo</Label>
                <Input value={pfVenmo || currentUser.venmo_handle || ''} onChange={(e)=>setPfVenmo(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Bio</Label>
                <input className="w-full rounded-xl border border-gray-300 px-3 py-2" value={pfBio || currentUser.bio || ''} onChange={(e)=>setPfBio(e.target.value)} />
              </div>
              {pfError && <div className="text-red-600 text-sm md:col-span-2">{pfError}</div>}
              {pfSuccess && (
                <div className="md:col-span-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                  Success: your profile is updated
                </div>
              )}
              <div className="md:col-span-2">
                <Button type="button" onClick={saveProfile}>Update Profile</Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Banner modal with video */}
      {showBanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowBanner(false)}>
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-5 shadow" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-3 top-3 text-gray-500 hover:text-gray-700" aria-label="Close" onClick={() => setShowBanner(false)}>
              <X size={18} />
            </button>
            <h3 className="mb-2 text-lg font-semibold">Ticketmatch</h3>
            <div className="mb-4 text-base md:text-lg text-gray-700 leading-relaxed">
              <p>
                Trade tickets with data and automation; born out of necessity at Wharton as an MVP for
                {' '}<a href="https://mbamove.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">mbamove.com</a>.
              </p>
              <p className="mt-2">
                <a href="http://linkedin.com/in/andrewjbilden" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Andrew J. Bilden, WG26</a>
              </p>
            </div>
            <div className="aspect-video w-full">
              <iframe
                className="h-full w-full rounded-lg"
                width="560"
                height="315"
                src="https://www.youtube.com/embed/vN5r8brp1Bo?si=ZgKcDPTtLhTr6umL"
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* Slider thumb styling */}
      <style jsx>{`
        .slider::-webkit-slider-thumb { appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #4f46e5; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        .slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #4f46e5; cursor: pointer; border: none; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
      `}</style>
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowProfileModal(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-lg font-semibold">Complete Your Profile</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Full Name</Label>
                <Input value={pfFullName} onChange={(e)=>setPfFullName(e.target.value)} placeholder="First Last" />
              </div>
              <div>
                <Label>Auth Email</Label>
                <Input value={pfEmail} readOnly />
              </div>
              <div className="md:col-span-2">
                <Label>Phone (WhatsApp)</Label>
                <div className="flex gap-2">
                  <Select className="w-28" value={pfAreaCode} onChange={(e)=>setPfAreaCode(e.target.value)}>
                    {AREA_CODES.map((c)=> <option key={c} value={c}>{c}</option>)}
                  </Select>
                  <Input value={pfPhoneDigits} onChange={(e)=>setPfPhoneDigits(e.target.value)} placeholder="5551234567" />
                </div>
              </div>
              <div className="md:col-span-2">
                <Label>School Email (.edu)</Label>
                <Input value={pfSchoolEmail} onChange={(e)=>setPfSchoolEmail(e.target.value)} placeholder="you@school.edu" />
              </div>
              <div>
                <Label>School</Label>
                <Select value={pfSchool} onChange={(e)=>setPfSchool(e.target.value as any)}>
                  <option value="Wharton">Wharton</option>
                  <option value="Penn">Penn</option>
                  <option value="HBS">HBS</option>
                  <option value="GSB">GSB</option>
                </Select>
              </div>
              <div>
                <Label>Venmo</Label>
                <Input value={pfVenmo} onChange={(e)=>setPfVenmo(e.target.value)} placeholder="@yourhandle" />
              </div>
              <div className="md:col-span-2">
                <Label>Bio</Label>
                <input className="w-full rounded-xl border border-gray-300 px-3 py-2" value={pfBio} onChange={(e)=>setPfBio(e.target.value)} placeholder="Short intro (required)" />
              </div>
            </div>
            {pfError && <div className="mt-2 text-sm text-red-600">{pfError}</div>}
            {pfSuccess && <div className="mt-2 text-sm text-green-700 bg-green-50 rounded px-3 py-2">Success: your profile is updated</div>}
            <div className="mt-4 flex justify-end gap-2">
              <GhostButton onClick={() => setShowProfileModal(false)}>Close</GhostButton>
              <Button onClick={saveProfile}>Update Profile</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
