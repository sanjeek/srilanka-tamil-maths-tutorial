# Chithambara Maths Challenge

The original Vercel demo remains on `main`. This branch adds a separate local, synthetic release preview for the Tamil-first Grade 5 portal. Its SMS and payment simulations are restricted to the loopback server. Use fictional names only.

## Audit and route mapping

The starting commit was `6446d01`. It had three static surfaces, no package scripts, and no migrations. Syntax checks passed for both inline scripts and the legacy API. The legacy app uses browser-local progress, demo passwords, a signed cookie, client marking and preloaded solutions. The teacher summary uses fixed sample rows. These are release blockers for real learners. Existing demo files and Vercel routing are preserved.

| Route | Existing Vercel demo | Local preview |
| --- | --- | --- |
| / | Grade 5 homepage | Grade 5 offer and proposed pricing |
| /student | Shared demo login | Guardian OTP, sibling selection, sample and history, sharing and simulated billing |
| /teacher | Shared demo login | Synthetic named teacher, incorrect and skipped queue, skill recommendations |
| /english | Named English demo | English sample translation available in the student dashboard |

## Run locally

1. Use Node 24 and run `npm ci`.
2. Copy `.env.example` to `.env`. Generate a random secret using `openssl rand -hex 32` for `CMC_SECRET`. Set a separate random `CMC_PREVIEW_TEACHER_PASSWORD` for the local teacher.
3. Run `npm test` and `npm run preview`. Open http://localhost:3000 using the configured origin. Create a fictional Grade 5 student with a synthetic mobile number such as 077 123 4567. The confirmation page shows a simulated OTP. No SMS is sent.
4. Submit the sample with a deliberately incorrect answer, then enable teacher sharing from the guardian session within five minutes of verification. In the teacher portal, sign in with the local password. Try the incorrect and skipped lists, recommend a skill, and withdraw sharing from the guardian dashboard.
5. In Manage Subscription create a test order and try the payment, cancellation and refund controls. The initial order gives zero access. The simulator records a verified event to open the five-question test challenge for that child. Plans are editable fixtures, with no real charges or renewal.

## Database, deployment and recovery

`migrations/001_practice.sql` is additive and can be applied to an empty PostgreSQL database. The local server defaults to persistent embedded PostgreSQL (PGlite); specify a separate `DATABASE_URL` for a managed preview connection. Running the preview applies the migration and idempotent fixtures. Keep this database independent from any live database. The existing site stores practice history locally, so there is no existing server data to migrate.

To roll back the application, stop the preview server and switch back to the previous Git commit. Leave additive tables in place. For a local restore drill, stop the server, copy the preview database directory, start against the copy via `CMC_LOCAL_DATABASE`, and verify a synthetic guardian’s attempt and submitted results. For managed PostgreSQL, take a provider snapshot or encrypted `pg_dump`, restore into a separate database, then check guardian/student counts, foreign keys, and a synthetic historical attempt. Confirm backup retention and run the managed restore drill before launch. No destructive down migration is needed for this additive schema.

Keep production payments disabled. Do not route this loopback-only preview or its test adapters into Vercel production. A hosted production adapter still requires managed PostgreSQL provisioning and migration, HTTPS secure cookies, real delivery, secure teacher identity and MFA, secrets configuration, logging redaction, retention jobs, and operational alerting. During provider outages keep existing paid entitlements intact, queue provider reconciliation, suspend new checkout when verification is unavailable, and never grant access from a browser return page. A lost phone requires an owner-approved support verification procedure before any account recovery.

## Content review

The 20 original sample questions and 20 corresponding English translations are seeded as draft versions, usable only by the synthetic preview. The five-item test challenge reuses those draft versions solely to exercise entitlement and resume. Start curriculum mapping at [e-Thaksalawa](https://e-thaksalawa.moe.gov.lk/) and the [Grade 5 Tamil reference](https://e-thaksalawa.moe.gov.lk/content/tamil/tg5/TG5_Mat/g5smtt1l11/example.html). The current topic groups are descriptive and are awaiting verified competency mapping.

For each draft, record the official reference and specific competency, validate the original Tamil, review the translation and worked arithmetic, and sign off publication and attribution. Create a new version for any content edit. Do not change the content of a referenced version; existing attempts pin that exact version. The schema supports draft, in review, published, archived and version-specific issue records. An administration interface and enforcement of immutable version writes remain release work. The reviewer has 20 existing draft questions to verify and roughly 160 additional originals to author and review if targeting 180 total, with three items per published skill.

## Billing evaluation

[PayHere recurring billing](https://support.payhere.lk/recurring-billing) and its [Recurring API](https://support.payhere.lk/api-%26-mobile-sdk/recurring-api) document hosted checkout, LKR notifications and verified server callbacks. The provider uses merchant credentials and its documented `md5sig` for callback verification. The test HMAC adapter in this branch does not implement that provider protocol. Confirm Sri Lankan merchant eligibility, recurring product approval, payment methods, fees, cancellation and settlement terms directly with PayHere. The local model only simulates non-renewing passes. The pilot price fixtures yield Rs. 3,890 annual savings and await owner approval.

## Acceptance and release gate

See [Acceptance report](ACCEPTANCE.md). Before release obtain owner approval of pilot prices, refund and renewal rules, staff identity, support contact and Tamil/English privacy notices. Verify Sri Lankan SMS delivery, actual provider events, teacher MFA and cohort administration, reviewed question coverage, a managed backup restore, and mobile/accessibility acceptance. Review data-processing locations, provider terms and applicability of the [Sri Lanka Data Protection Authority guidance](https://www.dpa.gov.lk/guidelines) with the owner.
