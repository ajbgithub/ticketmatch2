'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type School = 'Wharton' | 'Penn' | 'HBS' | 'GSB';
const AREA_CODES = ['+1', '+44', '+61', '+81', '+82', '+91', '+33', '+49', '+39', '+34', '+86', '+971', '+65', '+852', '+353'];

const onlyDigits = (s: string) => (s || '').replace(/\D+/g, '');
const normalizeUsername = (u: string) => (u || '').trim().replace(/\s+/, ' ');
const isValidUsername = (u: string) => /^[A-Za-z]+ [A-Za-z]+$/.test((u || '').trim());
const isValidE164 = (e164: string) => /^\+\d{6,16}$/.test((e164 || '').trim());
const normalizeVenmo = (h: string) => (h || '').trim().replace(/^@/, '');
const isValidVenmo = (h: string) => /^[A-Za-z0-9!@#$%^&*()_+\-=.:@]{2,64}$/.test(normalizeVenmo(h));
const buildE164 = (code: string, digits: string) => {
  const d = onlyDigits(digits);
  const c = code.startsWith('+') ? code : `+${onlyDigits(code)}`;
  return `${c}${d}`;
};

export default function OnboardingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [authEmail, setAuthEmail] = useState('');
  const [uid, setUid] = useState<string | null>(null);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [school, setSchool] = useState<School>('Wharton');
  const [areaCode, setAreaCode] = useState(AREA_CODES[0]);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [venmo, setVenmo] = useState('');
  const [schoolEmail, setSchoolEmail] = useState('');
  const [bio, setBio] = useState('');

  const needsProfile = useMemo(() => {
    const nameOk = isValidUsername(fullName);
    const eduOk = (schoolEmail || '').toLowerCase().endsWith('.edu');
    const venOk = isValidVenmo(venmo);
    const e164 = buildE164(areaCode, phoneDigits);
    const phoneOk = isValidE164(e164);
    const bioOk = !!(bio || '').trim();
    return !(nameOk && eduOk && venOk && phoneOk && bioOk);
  }, [fullName, schoolEmail, venmo, areaCode, phoneDigits, bio]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      const { data: s, error: sErr } = await supabase.auth.getSession();
      if (sErr) {
        setError(sErr.message);
        setLoading(false);
        return;
      }
      const user = s?.session?.user;
      if (!user) {
        // Not signed in; send home
        router.replace('/');
        return;
      }
      setUid(user.id);
      setAuthEmail(user.email ?? '');
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (prof) {
          setFullName(prof.username ?? '');
          setSchool((prof.cohort as School) ?? 'Wharton');
          setVenmo(prof.venmo_handle ?? '');
          setSchoolEmail(prof.wharton_email ?? '');
          setBio(prof.bio ?? '');
          // Attempt to parse existing phone_e164 into area+digits (best effort)
          const e = (prof.phone_e164 || '').trim();
          if (e.startsWith('+')) {
            const code = e.slice(0, 2) === '+1' ? '+1' : (AREA_CODES.find(c => e.startsWith(c)) || AREA_CODES[0]);
            setAreaCode(code);
            setPhoneDigits(e.replace(code, ''));
          }
          const needs = !prof.username || !prof.phone_e164 || !prof.venmo_handle || !(prof.wharton_email || '').endsWith('.edu') || !(prof.bio ?? '').trim();
          if (!needs) {
            // Already complete; go home
            router.replace('/');
            return;
          }
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setError('');
    const name = normalizeUsername(fullName);
    if (!isValidUsername(name)) { setError('Please enter First Last'); return; }
    if (!schoolEmail.toLowerCase().endsWith('.edu')) { setError('School email must end in .edu'); return; }
    const ven = normalizeVenmo(venmo);
    if (!isValidVenmo(ven)) { setError('Enter a valid Venmo'); return; }
    const e164 = buildE164(areaCode, phoneDigits);
    if (!isValidE164(e164)) { setError('Enter a valid phone number'); return; }
    if (!bio.trim()) { setError('Bio is required'); return; }

    const { data: s } = await supabase.auth.getSession();
    const userId = s?.session?.user?.id;
    if (!userId) { setError('Not signed in'); return; }

    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      username: name,
      cohort: school,
      phone_e164: e164,
      venmo_handle: ven,
      wharton_email: schoolEmail,
      bio,
    }, { onConflict: 'id' });
    if (error) { setError(error.message); return; }
    router.replace('/');
  };

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Complete Your Profile</h1>
      <p className="mb-6 text-sm text-gray-600">You’re almost there. Please fill in the required info to trade.</p>

      {loading ? (
        <div className="text-sm text-gray-600">Loading…</div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Auth Email</label>
            <input className="mt-1 w-full rounded-lg border px-3 py-2 bg-gray-50" value={authEmail} readOnly />
          </div>
          <div>
            <label className="block text-sm font-medium">Full Name</label>
            <input className="mt-1 w-full rounded-lg border px-3 py-2" value={fullName} onChange={(e)=>setFullName(e.target.value)} placeholder="First Last" />
          </div>
          <div>
            <label className="block text-sm font-medium">School</label>
            <select className="mt-1 w-full rounded-lg border px-3 py-2" value={school} onChange={(e)=>setSchool(e.target.value as School)}>
              <option value="Wharton">Wharton</option>
              <option value="Penn">Penn</option>
              <option value="HBS">HBS</option>
              <option value="GSB">GSB</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">School Email (.edu)</label>
            <input className="mt-1 w-full rounded-lg border px-3 py-2" value={schoolEmail} onChange={(e)=>setSchoolEmail(e.target.value)} placeholder="you@school.edu" />
          </div>
          <div>
            <label className="block text-sm font-medium">Phone (WhatsApp)</label>
            <div className="mt-1 flex gap-2">
              <select className="w-28 rounded-lg border px-3 py-2" value={areaCode} onChange={(e)=>setAreaCode(e.target.value)}>
                {AREA_CODES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input className="flex-1 rounded-lg border px-3 py-2" value={phoneDigits} onChange={(e)=>setPhoneDigits(e.target.value)} placeholder="5551234567" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Venmo</label>
            <input className="mt-1 w-full rounded-lg border px-3 py-2" value={venmo} onChange={(e)=>setVenmo(e.target.value)} placeholder="@yourhandle" />
          </div>
          <div>
            <label className="block text-sm font-medium">Bio</label>
            <input className="mt-1 w-full rounded-lg border px-3 py-2" value={bio} onChange={(e)=>setBio(e.target.value)} placeholder="Short intro (required)" />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="pt-2">
            <button
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              onClick={save}
              disabled={loading || !uid || needsProfile}
            >
              Save Profile
            </button>
            <button
              className="ml-3 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-gray-50"
              onClick={async () => { await supabase.auth.signOut(); router.replace('/'); }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
