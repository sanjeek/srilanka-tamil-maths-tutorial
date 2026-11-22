# Preview acceptance

## Covered by the automated integration suite

- Local and international Sri Lankan mobile inputs normalise to one identity. Wrong, expired and repeated codes fail, and the resend cooldown applies.
- Sibling records are separate; idempotent creates do not duplicate them. A selected sibling cannot retrieve another sibling's attempt by ID.
- The free sample creates no order and initial responses contain no answers or explanations. Drafts resume from the database, stale saves conflict, submission retries preserve one result, and results pin the historical question version.
- The teacher queue defaults to incorrect answers and distinguishes skips. Guardians must grant sharing. Withdrawing it blocks subsequent review access and recommendations. Staff responses exclude guardian contact and payment data. Private notes are excluded from student results.
- A pending order grants no access. The test ledger rejects invalid currency and de-duplicates an event. A test payment opens the mixed challenge for one student, a saved draft resumes, and cancellation preserves paid-through access, and refund and expiry block paid access. A failed payment leaves the previous entitlement unchanged.
- Numeric marking checks zero, whitespace, Tamil digits, leading zeros, fractional equivalence, decimals and malformed values.

## Browser smoke check

Chromium passed at 360px and 1280px using the local HTTP server and synthetic database. Checked signup, OTP, 20 visible solutions, teacher sharing and skipped-question review, and the simulated payment-to-challenge journey. Checked for horizontal overflow in results, teacher review and paid practice.

## Open release work

- Live SMS delivery, encryption and recovery for verified phone changes, real teacher MFA, and production provisioning.
- Reviewed curriculum mapping and content, dedicated publishing and issue reporting workflow, fresh-question skill retry/recommendations, topic feedback, and full teacher grouping, filters and follow-up.
- Owner-approved Tamil and English copy for the public pages. Current information and policy pages are Tamil drafts, with support contact pending.
- Hosted PayHere checkout and sandbox credentials, documented callback authentication, recurring renewals and grace, receipts, cancellation confirmation, and refund procedures. There is no provider integration in this preview.
- Complete accessibility audit, low-cost Android and intermittent-network verification, alerts, retention and managed backup restore. Local synthetic preview is not a clean production acceptance run.
