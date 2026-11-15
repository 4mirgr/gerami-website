# Shared website and clinic patient portal

Authority: the owner's latest request for in-header login/signup alongside /account/, a profile and private medical documents, one username/password and information bank with Clinic, and background search/article history. The owner explicitly opted out of repeated design confirmations; implementation proceeds in this session.

Clinic now has a real Django/PostgreSQL application at 4mirgr/Clinic (baseline e1f6dd6); its Python host/database/storage are not deployed. The website has a pending reviewed accounts branch, not yet merged because live D1 authentication is blocked by quota. Preserve the public Enfhess/Dompet, bilingual themes, Vazirmatn, IntMed and private AUS boundaries.

## Approach

Use Clinic's existing Django authentication, PostgreSQL and private document storage as the single patient authority. Both /account/ and /dash/portal/ use its same HttpOnly root-path session. The website exposes a bounded same-origin reverse proxy; fixed HTTPS clinic origin and server-held proxy key never reach browsers. Existing clinic staff roles and clinical access checks remain intact. GitHub website-owner and native AUS identity services remain separate; they do not duplicate patient passwords or grant clinical authority.

Duplicated password/profile stores with periodic reconciliation were rejected because they cannot guarantee immediate revocation or a single record. Replacing Clinic's mature Django models with D1 would discard existing work. These are implementation judgments, not additional user requirements.

New public signup/login goes only to Clinic; when its upstream is unavailable, fail closed rather than create a second D1 patient account. Existing pending D1 stores contain zero users. The website owner can inspect/manage the shared user directory through a short-lived signed server assertion; that assertion is not clinical access. Existing clinic staff keep their Django roles and can sign in from either interface. Never auto-link a pre-existing clinical record by self-entered email, phone or national ID.

## Patient data and activity

A one-to-one portal account links a Django user to a newly created clinical Patient record. Basic profile edits update that exact patient; patient-reported history/medications/allergies are stored separately from clinician notes. Clinical staff see both without patient edits overwriting medical notes. Medical documents enter the existing private document model/storage, with UUID paths, actual file checks, a strict 5MiB patient limit and attachment-only authenticated downloads. Patients see only their own files; secretary and unrelated patients cannot access them. Routine website administrators have no medical-file authority.

Activity tracking defaults off. Separate explicit consent controls saving search/article-opening events and sharing them with the clinician. Users can stop and erase their history. Record bounded, normalized site search terms and published article IDs/categories; suppress identifiers/URLs and retain at most 90 days. A visible, open article qualifies after eight seconds; describe it as opened, not proof the entire article was read. Background events use same-origin CSRF-protected requests, no third-party analytics and no inferred diagnoses. Clinical sharing is not implied by account registration.

## UI

Header buttons open an accessible modal (focus, Escape, tab labels, errors, day/night, mobile); normal links keep the separate /account/ page available. Successful inline login updates the header without leaving the article. /account/ adds shared profile, medical documents, activity and privacy controls. /dash/portal/ is the native patient view of those same records. Clinic staff retain the separate existing management interface.

## Rollout

Prepare and test both repositories with synthetic local data, preserve patient/secret exclusions and the Clinic handoff. No production patient data, email or appointments are created. Host configuration remains an actual blocker; Cloudflare R2 is disabled and is not needed because Clinic already owns private storage. Do not enable billing. The scheduled follow-up must not publish the superseded D1-patient design; require the shared Clinic deployment, authenticated smoke and private-file/CSRF checks before release.
