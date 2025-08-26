'use client';

import React, { useMemo, useState, useEffect } from 'react';
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
} from 'recharts';
import { X, MessageCircle, Trophy } from 'lucide-react';

/* ===========================================================
   UI Components
   =========================================================== */
type DivProps = React.HTMLAttributes<HTMLDivElement>;
const Card: React.FC<DivProps & { className?: string }> = ({ className = '', children, ...rest }) => (
  <div className={`rounded-2xl shadow-sm border border-gray-200 bg-white ${className}`} {...rest}>
    {children}
  </div>
);

const SectionTitle: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="mb-4">
    <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    {subtitle ? <p className="text-sm text-gray-500 leading-snug">{subtitle}</p> : null}
  </div>
);

const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className = '', children, ...rest }) => (
  <label className={`block text-sm font-medium text-gray-700 ${className}`} {...rest}>
    {children}
  </label>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...rest }) => (
  <input
    className={`w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
    {...rest}
  />
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', children, ...rest }) => (
  <select
    className={`w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
    {...rest}
  >
    {children}
  </select>
);

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }> = ({
  className = '',
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

const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }> = ({
  className = '',
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

const TradedButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="rounded-lg px-2 py-1 text-xs font-semibold bg-green-600 text-white hover:bg-green-500 transition"
  >
    Traded
  </button>
);

const DeleteButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="rounded-lg p-1 text-red-600 hover:bg-red-50 transition" aria-label="Delete">
    <X size={16} />
  </button>
);

const WeTradedButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="rounded-lg px-3 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 transition"
  >
    We Traded!
  </button>
);

/* ===========================================================
   Types and Constants
   =========================================================== */
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
  id: string;
  userId: string;
  eventId: string;
  role: Role;
  percent: number;
  tickets: number;
  name: string;
  phone: string;
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

const TIER_INFO: Record<
  Tier,
  {
    price: string;
    features: string[];
  }
> = {
  Limited: {
    price: '$0/mo',
    features: ['Buy 1 and sell 1 at a time', 'Delete old posts to make new posts', 'See direct matches only', 'See 1-3 matches'],
  },
  Basic: {
    price: '$5/mo',
    features: ['Buy 2 and sell 2 at a time', 'Delete old posts to make new posts', 'See direct and closest matches within 10%'],
  },
  Pro: {
    price: '$10/mo',
    features: ['Buy 5 and sell 5 at a time', 'See direct matches and matches within 25%'],
  },
  Max: {
    price: '$15/mo',
    features: ['SMS instant alerts', 'Unlimited trades', 'Match with entire market'],
  },
};

const AREA_CODES: string[] = [
  '+1',
  '+44',
  '+61',
  '+81',
  '+82',
  '+91',
  '+33',
  '+49',
  '+39',
  '+34',
  '+86',
  '+971',
  '+65',
  '+852',
  '+353',
];

/* ===========================================================
   Utility Functions
   =========================================================== */
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const toMoney = (v: number): string => `$${(Number.isFinite(v) ? v : 0).toFixed(2)}`;
const onlyDigits = (s: string): string => (s || '').replace(/\D+/g, '');

const getDeviceId = (): string => {
  if (typeof window === 'undefined') return 'server';
  const k = 'ticketmatch_device_id';
  let id = localStorage?.getItem(k);
  if (!id) {
    id = Math.random().toString(36).slice(2);
    localStorage?.setItem(k, id);
  }
  return id;
};

function isValidUsername(u: string): boolean {
  return /^[A-Za-z]+ [A-Za-z]+$/.test((u || '').trim());
}

function normalizeUsername(u: string): string {
  return (u || '').trim().replace(/\s+/, ' ');
}

function isWhartonEmail(e: string): boolean {
  return /@wharton\.upenn\.edu$/i.test((e || '').trim());
}

function buildE164(code: string, digits: string): string {
  const d = onlyDigits(digits);
  const c = code.startsWith('+') ? code : `+${onlyDigits(code)}`;
  return `${c}${d}`;
}

function isValidE164(e164: string): boolean {
  return /^\+\d{6,16}$/.test((e164 || '').trim());
}

function normalizeVenmo(h: string): string {
  const v = (h || '').trim();
  return v.startsWith('@') ? v.slice(1) : v;
}

function isValidVenmo(h: string): boolean {
  return /^[A-Za-z0-9_]{3,30}$/.test(normalizeVenmo(h));
}

/* ===========================================================
   Seeded Test Data
   =========================================================== */
const generateTestPostings = (): Posting[] => {
  const testData: Posting[] = [];
  const names = [
    'Alice Chen',
    'Bob Smith',
    'Carol Davis',
    'David Brown',
    'Emma Wilson',
    'Frank Miller',
    'Grace Taylor',
    'Henry Lee',
    'Ivy Johnson',
    'Jack Wilson',
    'Kate Davis',
    'Liam Brown',
  ];

  EVENTS.forEach((event) => {
    names.forEach((name, idx) => {
      if (Math.random() > 0.3) {
        testData.push({
          id: `test-${event.id}-${idx}`,
          userId: `device-${idx}`,
          eventId: event.id,
          role: Math.random() > 0.5 ? 'buyer' : 'seller',
          percent: Math.floor(Math.random() * 50) + 50,
          tickets: 1,
          name,
          phone: `+1555${String(Math.floor(Math.random() * 1_000_000)).padStart(7, '0')}`,
          cohort: Math.random() > 0.5 ? 'WG26' : 'WG27',
          venmo: `${name.toLowerCase().replace(' ', '')}`,
          email: `${name.toLowerCase().replace(' ', '.')}@wharton.upenn.edu`,
        });
      }
    });
  });

  testData.push({
    id: 'joe-seller-rb',
    userId: 'joe-device',
    eventId: 'rb',
    role: 'seller',
    percent: 85,
    tickets: 1,
    name: 'Joe Wharton',
    phone: '+15551234567',
    cohort: 'WG26',
    venmo: 'joewharton',
    email: 'joe@wharton.upenn.edu',
  });

  testData.push({
    id: 'andrew-buyer-rb',
    userId: 'andrew-device',
    eventId: 'rb',
    role: 'buyer',
    percent: 90,
    tickets: 1,
    name: 'Andrew Bilden',
    phone: '+15559876543',
    cohort: 'WG27',
    venmo: 'andrewb',
    email: 'andrew.bilden@wharton.upenn.edu',
  });

  testData.push({
    id: 'seller-match-1',
    userId: 'seller-1',
    eventId: 'wp',
    role: 'seller',
    percent: 75,
    tickets: 1,
    name: 'Sarah Johnson',
    phone: '+15555551111',
    cohort: 'WG26',
    venmo: 'sarahj',
    email: 'sarah.johnson@wharton.upenn.edu',
  });

  return testData;
};

/* ===========================================================
   Main Component
   =========================================================== */
export default function WTPInteractiveDiagram() {
  // State
  const [postings, setPostings] = useState<Posting[]>(generateTestPostings());
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
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

  // Init: ensure logged-out for demo
  useEffect(() => {
    setCurrentUser(null);
  }, []);

  // Auth handlers
  const handleSignup = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');

    const uname = normalizeUsername(username);
    if (!isValidUsername(uname)) {
      setAuthError('Username must be First Last.');
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
      setAuthError('Enter a valid Venmo handle.');
      return;
    }

    setCurrentUser({
      id: Math.random().toString(36),
      username: uname,
      wharton_email: whartonEmail.trim(),
      cohort,
      phone_e164: phoneE164,
      venmo_handle: venmoId,
      tier: 'Limited',
    });
    setPassword('');
  };

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');

    if (username === 'joe@wharton.upenn.edu' && password === 'wharton2025') {
      setCurrentUser({
        id: 'joe-wharton-id',
        username: 'Joe Wharton',
        wharton_email: 'joe@wharton.upenn.edu',
        cohort: 'WG26',
        phone_e164: '+15551234567',
        venmo_handle: 'joewharton',
        tier: 'Limited',
      });
      setPassword('');
      setUsername('');
      return;
    }
    if (username === 'Joe Wharton' && password === 'wharton2025') {
      setCurrentUser({
        id: 'joe-wharton-id',
        username: 'Joe Wharton',
        wharton_email: 'joe@wharton.upenn.edu',
        cohort: 'WG26',
        phone_e164: '+15551234567',
        venmo_handle: 'joewharton',
        tier: 'Limited',
      });
      setPassword('');
      setUsername('');
      return;
    }
    if (username === 'andrew.bilden@wharton.upenn.edu' && password === 'andrew2025') {
      setCurrentUser({
        id: 'andrew-bilden-id',
        username: 'Andrew Bilden',
        wharton_email: 'andrew.bilden@wharton.upenn.edu',
        cohort: 'WG27',
        phone_e164: '+15559876543',
        venmo_handle: 'andrewb',
        tier: 'Basic',
      });
      setPassword('');
      setUsername('');
      return;
    }
    if (username === 'Andrew Bilden' && password === 'andrew2025') {
      setCurrentUser({
        id: 'andrew-bilden-id',
        username: 'Andrew Bilden',
        wharton_email: 'andrew.bilden@wharton.upenn.edu',
        cohort: 'WG27',
        phone_e164: '+15559876543',
        venmo_handle: 'andrewb',
        tier: 'Basic',
      });
      setPassword('');
      setUsername('');
      return;
    }

    setAuthError(`Invalid credentials. Available test accounts:
• joe@wharton.upenn.edu / wharton2025
• andrew.bilden@wharton.upenn.edu / andrew2025
• Joe Wharton / wharton2025
• Andrew Bilden / andrew2025`);
  };

  // Helpers
  const getTierLimits = (tier: Tier): { buy: number; sell: number } => {
    switch (tier) {
      case 'Basic':
        return { buy: 2, sell: 2 };
      case 'Pro':
        return { buy: 5, sell: 5 };
      case 'Max':
        return { buy: Number.POSITIVE_INFINITY, sell: Number.POSITIVE_INFINITY };
      default:
        return { buy: 1, sell: 1 };
    }
  };

  // Posting handlers
  const postIntent = () => {
    if (!currentUser) {
      alert('Please sign in first.');
      return;
    }

    const limits = getTierLimits(currentUser.tier);
    const currentPosts = postings.filter((p) => p.name === currentUser.username);
    const buyPosts = currentPosts.filter((p) => p.role === 'buyer').length;
    const sellPosts = currentPosts.filter((p) => p.role === 'seller').length;

    if (role === 'buyer' && buyPosts >= limits.buy) {
      alert(`Your ${currentUser.tier} tier allows only ${limits.buy} buy post(s). Delete old posts to make new ones.`);
      return;
    }
    if (role === 'seller' && sellPosts >= limits.sell) {
      alert(`Your ${currentUser.tier} tier allows only ${limits.sell} sell post(s). Delete old posts to make new ones.`);
      return;
    }

    const newPosting: Posting = {
      id: Math.random().toString(36),
      userId: getDeviceId(),
      eventId,
      role,
      percent: Math.round(clamp01((percent || 0) / 100) * 100),
      tickets: 1,
      name: currentUser.username,
      phone: currentUser.phone_e164,
      cohort: currentUser.cohort,
      venmo: currentUser.venmo_handle,
      email: currentUser.wharton_email,
    };

    setPostings((prev) => [...prev, newPosting]);
  };

  const deletePosting = (id: string) => {
    setPostings((prev) => prev.filter((p) => p.id !== id));
  };

  const markTraded = (id: string) => {
    const posting = postings.find((p) => p.id === id);
    if (posting) {
      setTotalTradedTickets((prev) => prev + posting.tickets);
      deletePosting(id);
    }
  };

  const recordTrade = (buyerName: string, sellerName: string, agreedPct: number, tickets: number) => {
    const trade: Trade = {
      id: Math.random().toString(36),
      buyerName,
      sellerName,
      eventId,
      price: (agreedPct / 100) * eventPrice,
      tickets,
      timestamp: new Date(),
    };
    setTrades((prev) => [...prev, trade]);
    setTotalTradedTickets((prev) => prev + tickets);
  };

  const deleteProfile = () => {
    if (!currentUser) return;
    if (confirm('Are you sure you want to delete your profile? This cannot be undone.')) {
      setPostings((prev) => prev.filter((p) => p.name !== currentUser.username));
      setCurrentUser(null);
    }
  };

  const addComment = () => {
    if (!currentUser || !newComment.trim()) return;

    const comment: Comment = {
      id: Math.random().toString(36),
      username: currentUser.username,
      message: newComment.trim(),
      timestamp: new Date(),
    };
    setComments((prev) => [...prev, comment]);
    setNewComment('');
  };

  // Matches (computed each render)
  type Match = { me: Posting; other: Posting; agreedPct: number; tickets: number };
  const getMatches = (): Match[] => {
    if (!currentUser) return [];

    const mine = postings.filter((p) => p.name === currentUser.username && p.eventId === eventId);
    const others = postings.filter((p) => p.name !== currentUser.username && p.eventId === eventId);
    const matches: Match[] = [];

    for (const me of mine) {
      const compatible = others.filter((o) => {
        if (me.role === 'buyer' && o.role === 'seller') return me.percent >= o.percent;
        if (me.role === 'seller' && o.role === 'buyer') return o.percent >= me.percent;
        return false;
      });

      if (compatible.length === 0) continue;

      let filtered = compatible;
      if (currentUser.tier === 'Limited') filtered = compatible.filter((o) => Math.abs(me.percent - o.percent) === 0);
      else if (currentUser.tier === 'Basic') filtered = compatible.filter((o) => Math.abs(me.percent - o.percent) <= 10);
      else if (currentUser.tier === 'Pro') filtered = compatible.filter((o) => Math.abs(me.percent - o.percent) <= 25);
      // Max sees all compatible

      const maxMatches = currentUser.tier === 'Limited' ? 3 : currentUser.tier === 'Basic' ? 5 : currentUser.tier === 'Pro' ? 10 : Infinity;

      const sortedMatches = filtered
        .sort((a, b) => Math.abs(me.percent - a.percent) - Math.abs(me.percent - b.percent))
        .slice(0, maxMatches);

      sortedMatches.forEach((other) => {
        const agreedPct = Math.min(me.percent, other.percent);
        matches.push({
          me,
          other,
          agreedPct,
          tickets: Math.min(me.tickets, other.tickets),
        });
      });
    }

    return matches;
  };

  const myMatches = getMatches();
  const myListings = currentUser ? postings.filter((p) => p.name === currentUser.username) : [];

  // Render
  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900">
      <div className="max-w-7xl mx-auto p-6 md:p-8">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-3xl font-extrabold tracking-tight">Ticketmatch</h1>
          <div className="mt-2 flex items-center gap-4">
            <p className="flex-1 text-gray-700">
              Plans at Wharton change all the time! Buy and resell Wharton tickets at face value or lower. Create an
              account, and buy/sell at your desired percentage price point.
            </p>
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="text-yellow-500" size={20} />
              <span className="font-semibold">{totalTradedTickets}</span>
              <span className="text-gray-600">tickets traded</span>
            </div>
          </div>
        </div>

        {/* Tier Selection */}
        {currentUser && (
          <Card className="mb-6 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Choose Your Tier</h3>
              <span className="text-sm text-gray-600">Current: {currentUser.tier}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TIER_INFO).map(([tier, info]) => (
                <div key={tier} className="relative">
                  <button
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      currentUser.tier === (tier as Tier)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    onClick={() => {
                      setCurrentUser((prev) => (prev ? { ...prev, tier: tier as Tier } : prev));
                      setShowTierDropdown(showTierDropdown === (tier as Tier) ? null : (tier as Tier));
                    }}
                  >
                    {tier} {info.price}
                  </button>
                  {showTierDropdown === (tier as Tier) && (
                    <div className="min-w-64 absolute left-0 top-full z-10 mt-1 rounded-lg border bg-white p-3 shadow-lg">
                      <ul className="space-y-1 text-xs">
                        {info.features.map((feature, idx) => (
                          <li key={idx} className="text-gray-600">
                            • {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Auth */}
        {!currentUser ? (
          <Card className="mb-6 p-5">
            <SectionTitle title="Create an account or sign in" subtitle="Test accounts: joe@wharton.upenn.edu / wharton2025 OR andrew.bilden@wharton.upenn.edu / andrew2025" />
            <form onSubmit={authMode === 'signup' ? handleSignup : handleLogin} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Username or Email</Label>
                <Input
                  placeholder="Joe Wharton or joe@wharton.upenn.edu"
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

              {authMode === 'signup' && (
                <div className="contents">
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
                        {AREA_CODES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </Select>
                      <Input
                        placeholder="digits"
                        value={phoneDigits}
                        onChange={(e) => setPhoneDigits(onlyDigits(e.target.value))}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Venmo Handle</Label>
                    <Input placeholder="@yourhandle" value={venmo} onChange={(e) => setVenmo(e.target.value)} required />
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
                <Button type="submit">{authMode === 'signup' ? 'Create account' : 'Sign in'}</Button>
                <GhostButton type="button" onClick={() => setAuthMode(authMode === 'signup' ? 'login' : 'signup')}>
                  {authMode === 'signup' ? 'Have an account? Sign in' : 'New here? Create account'}
                </GhostButton>
                {authError && <span className="text-sm text-red-600">{authError}</span>}
              </div>
            </form>
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
              <GhostButton onClick={deleteProfile}>Delete Profile</GhostButton>
              <GhostButton onClick={() => setCurrentUser(null)}>Sign out</GhostButton>
            </div>
          </div>
        )}

        {/* Main Content Grid */}
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
                    {EVENTS.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.label}
                      </option>
                    ))}
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
                      style={{
                        background: `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${percent}%, #e5e7eb ${percent}%, #e5e7eb 100%)`,
                      }}
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
                  <Button type="button" onClick={postIntent}>
                    Post
                  </Button>
                </div>

                {/* Matches */}
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
                              <span>
                                {seller.name} ↔ {buyer.name} at {agreedPct}%
                              </span>
                              <WeTradedButton onClick={() => recordTrade(buyer.name, seller.name, agreedPct, m.tickets)} />
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                              <div>
                                <div className="font-semibold">Seller</div>
                                <div>Name: {seller.name}</div>
                                <div className="flex items-center gap-1">
                                  Phone: {seller.phone}
                                  <button
                                    onClick={() => navigator.clipboard?.writeText(seller.phone)}
                                    className="px-1 text-indigo-600 hover:text-indigo-800"
                                    type="button"
                                  >
                                    📋
                                  </button>
                                </div>
                                <div className="flex items-center gap-1">
                                  Venmo: @{seller.venmo}
                                  <button
                                    onClick={() => navigator.clipboard?.writeText(String(seller.venmo ?? ''))}
                                    className="px-1 text-indigo-600 hover:text-indigo-800"
                                    type="button"
                                  >
                                    📋
                                  </button>
                                </div>
                                <div>Email: {seller.email}</div>
                                <div>Cohort: {seller.cohort}</div>
                              </div>
                              <div>
                                <div className="font-semibold">Buyer</div>
                                <div>Name: {buyer.name}</div>
                                <div className="flex items-center gap-1">
                                  Phone: {buyer.phone}
                                  <button
                                    onClick={() => navigator.clipboard?.writeText(buyer.phone)}
                                    className="px-1 text-indigo-600 hover:text-indigo-800"
                                    type="button"
                                  >
                                    📋
                                  </button>
                                </div>
                                <div className="flex items-center gap-1">
                                  Venmo: @{buyer.venmo}
                                  <button
                                    onClick={() => navigator.clipboard?.writeText(String(buyer.venmo ?? ''))}
                                    className="px-1 text-indigo-600 hover:text-indigo-800"
                                    type="button"
                                  >
                                    📋
                                  </button>
                                </div>
                                <div>Email: {buyer.email}</div>
                                <div>Cohort: {buyer.cohort}</div>
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

          {/* MIDDLE: Charts (2 columns) */}
          <div className="lg:col-span-2 grid gap-6 lg:grid-cols-1">
            {/* Distribution Chart */}
            <Card className="p-5">
              <SectionTitle
                title="Market Distribution"
                subtitle={`Event: ${currentEvent?.label ?? ''} - Left bars = sellers (purple), right bars = buyers (green)`}
              />
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { bucket: '50-60%', seller: -Math.floor(Math.random() * 5), buyer: Math.floor(Math.random() * 3) },
                      { bucket: '60-70%', seller: -Math.floor(Math.random() * 8), buyer: Math.floor(Math.random() * 5) },
                      { bucket: '70-80%', seller: -Math.floor(Math.random() * 12), buyer: Math.floor(Math.random() * 8) },
                      { bucket: '80-90%', seller: -Math.floor(Math.random() * 10), buyer: Math.floor(Math.random() * 12) },
                      { bucket: '90-100%', seller: -Math.floor(Math.random() * 6), buyer: Math.floor(Math.random() * 15) },
                      { bucket: '100%', seller: -Math.floor(Math.random() * 4), buyer: Math.floor(Math.random() * 10) },
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
                    <Bar dataKey="buyer" name="Buyers" fill="#10B981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Supply vs Demand */}
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

          {/* RIGHT: Comments Forum */}
          <Card className="p-5 lg:col-span-1">
            <SectionTitle title="Community Chat" subtitle="Public discussion forum" />
            <div className="space-y-4">
              {/* Comments Display */}
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg bg-gray-50 p-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="text-sm">
                    <div className="font-semibold text-indigo-600">{comment.username}</div>
                    <div className="text-gray-700">{comment.message}</div>
                    <div className="text-xs text-gray-500">{comment.timestamp.toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>

              {/* Add Comment */}
              {currentUser && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Type your message..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addComment();
                    }}
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
              <div>
                <strong>Username:</strong> {currentUser.username}
              </div>
              <div>
                <strong>Email:</strong> {currentUser.wharton_email}
              </div>
              <div>
                <strong>WG Cohort:</strong> {currentUser.cohort}
              </div>
              <div>
                <strong>Phone:</strong> {currentUser.phone_e164}
              </div>
              <div>
                <strong>Venmo:</strong> @{currentUser.venmo_handle}
              </div>
              <div>
                <strong>Tier:</strong> {currentUser.tier}
              </div>
            </div>

            <div className="mt-6">
              <SectionTitle title="My Listings" subtitle="Active posts you created" />
              {myListings.length === 0 ? (
                <div className="text-sm text-gray-500">No active listings.</div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {myListings.map((l) => (
                    <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        {l.role} 1 ticket @ {l.percent}% --- {EVENTS.find((ev) => ev.id === l.eventId)?.label}
                      </span>
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

      {/* Custom CSS for slider */}
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #4f46e5;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #4f46e5;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}
