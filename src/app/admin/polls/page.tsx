// app/policy/page.tsx
'use client';

import Link from 'next/link';

export default function PolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-2 text-3xl font-extrabold">Privacy &amp; User Policy</h1>
        <p className="mb-8 text-sm text-gray-600">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <section className="space-y-6 text-[15px] leading-6">
          <div>
            <h2 className="text-xl font-semibold">1) What TicketMatch Is</h2>
            <p>
              TicketMatch helps members connect to buy or sell tickets for listed
              events at or below face value. We are a matching and messaging layer,
              not a payment processor or escrow service.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold">2) Information We Collect</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Name and school email (e.g., @wharton.upenn.edu).</li>
              <li>Phone number (E.164), cohort, and Venmo handle.</li>
              <li>
                Listings/requests: role (buyer/seller), percent of ticket value (0–100%),
                number of tickets, and event.
              </li>
              <li>Basic usage data (e.g., device identifier) to show you your own posts.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">3) How We Use Your Info</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                To create matches between buyers and sellers and display contact info to
                matched parties.
              </li>
              <li>To power event-specific market charts and operational analytics.</li>
              <li>To provide account support and product notifications (email, and SMS).</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">4) What Others Can See</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Public charts are aggregated and don’t show personal identifiers.</li>
              <li>
                Your contact details (phone, Venmo) are only shown to the counterparties when
                a direct match is surfaced to you.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">5) Off-Platform Transactions</h2>
            <p>
              TicketMatch does not handle payments or ticket transfers. If you choose to
              complete a trade off platform (e.g., Venmo, SMS), you do so at your own risk.
              Always verify counterparties and keep records.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold">6) Market &amp; Pricing Rules</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Listings and matches in this phase are capped at{' '}
                <strong>0–100% of face value</strong>.
              </li>
              <li>No upcharging or arbitrage tools are provided in this version.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">7) Consent &amp; Communications</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                By creating an account and checking the consent box, you agree that we may
                store your contact information and display it to your matches.
              </li>
              <li>
                If/when SMS is enabled, you agree to opt-in with carrier disclosures.
                Standard message/data rates may apply.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">8) Data Retention &amp; Deletion</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>You may delete your active listings from your profile at any time.</li>
              <li>
                Account/profile deletion is available on request; operational logs may persist
                for a limited period.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">9) Acceptable Use</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>No harassment, spam, fraud, or attempts to bypass platform rules.</li>
              <li>Only post tickets you actually control and are allowed to transfer.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">10) Contact</h2>
            <p>
              Questions or data requests? Email{' '}
              <a className="underline" href="mailto:ajbgithub@gmail.com">
                ajbgithub@gmail.com
              </a>
              .
            </p>
          </div>

          <hr className="my-6" />

          <div className="text-sm text-gray-600">
            By creating an account or continuing to use TicketMatch, you agree to this
            Privacy &amp; User Policy.
          </div>

          <div className="mt-6">
            <Link href="/" className="underline text-indigo-600">
              ← Back to TicketMatch
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
