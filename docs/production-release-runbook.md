# Production Release Runbook

This runbook covers the production path for the Canada and UK Amazon warehouse jobs Chrome extensions:

- `amazon-warehouse-jobs-canada`
- `amazon-warehouse-jobs-uk`
- shared backend: `extension-usage-tracker`

Canada and UK are released as separate Chrome Web Store listings. They share the same backend, Supabase schema, and Dodo payment strategy.

## Current Status

As of June 29, 2026:

- Code readiness is done for the tracker, Canada extension, and UK extension.
- Backend health and plan endpoints are live and responding.
- Supabase readiness is done: `extension_access.users` exists, RLS is enabled, and `anon`/`authenticated` have no direct access.
- Extension packaging is done for version `1.0.0`.
- Chrome Web Store asset packs are prepared in both extension repos.
- Privacy and support pages are implemented in the tracker and must be deployed before the Web Store listing URLs are submitted.
- Trusted-tester release is intentionally skipped. The release target is direct public Chrome Web Store submission.
- Public submission is still blocked until the production backend returns live Dodo checkout URLs instead of `test.checkout.dodopayments.com`.

## Official References

- Chrome Web Store publishing: <https://developer.chrome.com/docs/webstore/publish/>
- Chrome Web Store developer dashboard: <https://chrome.google.com/webstore/devconsole>
- Chrome extension quality guidelines: <https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq>
- Dodo Payments docs: <https://docs.dodopayments.com/>
- Dodo checkout integration guide: <https://docs.dodopayments.com/developer-resources/integration-guide>
- Supabase API security: <https://supabase.com/docs/guides/api/securing-your-api>

## Release Stages

1. Code readiness - done
2. Backend readiness - done
3. Supabase readiness - done
4. Dodo live-mode setup - pending
5. Extension build and package - done
6. Chrome Web Store listing setup - asset pack done, dashboard upload pending
7. Trusted-tester release - skipped by decision
8. Public launch - pending
9. Post-release monitoring - pending

This release goes directly to public Chrome Web Store submission. Because trusted testers are skipped, run the manual smoke tests locally from the packaged zips before submission and again from the approved public listing after review.

## Hard Release Gates

The release is blocked until every gate below is true:

- Tracker tests pass: `npm test`, `npm run typecheck`, `npm run build`.
- Canada tests pass: `npm test`, `npm run build`, `npm run verify:bundle`, `npm run package`.
- UK tests pass: `npm test`, `npm run build`, `npm run verify:bundle`, `npm run package`.
- Canada and UK manifest versions are `1.0.0`.
- UK README and release notes no longer describe the extension as local-only.
- No customer-facing text mentions old booking counts, credit packs, or "5 bookings".
- Popup shows both payment choices: 30-day access and annual/pro access.
- Backend production deploy uses `DODO_PAYMENTS_ENVIRONMENT=live_mode`.
- Backend production deploy uses live Dodo API keys, live webhook secret, and live product IDs.
- Production checkout smoke tests return live Dodo checkout URLs, not `test.checkout.dodopayments.com`.
- Dodo webhook URL is configured and verified.
- Supabase table exists under `extension_access.users`, not `public.extension_users`.
- Supabase RLS is enabled and browser clients have no direct table access.
- Chrome Web Store privacy, permission, payment, and reviewer-instruction fields are complete.
- The production zips contain no dev-only host permissions.

## Code Readiness

### Backend

Run from `/Users/ankitvishwakarma/Projects/public/extension-usage-tracker`:

```bash
npm test
npm run typecheck
npm run build
```

Required API routes:

```text
GET  /api/health
GET  /api/{productId}/license/check
GET  /api/{productId}/license/plans
POST /api/{productId}/license/checkout
POST /api/{productId}/license/usage
POST /api/payments/dodo/webhook
POST /api/dodo/webhook
```

Required product IDs:

```text
amazon-warehouse-jobs-canada
amazon-warehouse-jobs-uk
```

Expected production base URL:

```text
https://getslotnow.com/extension-usage-tracker
```

### Canada Extension

Run from `/Users/ankitvishwakarma/Projects/public/amazon-warehouse-jobs-canada`:

```bash
npm test
npm run build
npm run verify:bundle
npm run package
```

Before packaging:

- Done: `src/manifest.json` version is `1.0.0`.
- Done: production host permissions are used and `http://localhost:8080/*` has been removed.
- Done: popup shows both 30-day and annual/pro access.
- Confirm manually before submission: the extension runs only on valid Amazon job-search/application pages.
- Confirm manually before submission: no navigation to application/booking pages happens without valid access.

Expected package output:

```text
dist/amazon-warehouse-ca/
amazon-warehouse-ca-1.0.0.zip
```

### UK Extension

Run from `/Users/ankitvishwakarma/Projects/public/amazon-warehouse-jobs-uk`:

```bash
npm test
npm run build
npm run verify:bundle
npm run package
```

Before packaging:

- Done: `src/manifest.json` version is `1.0.0`.
- Done: `README.md`, `ARCHITECTURE.md`, `release.md`, comments, and test labels no longer describe the extension as local-only.
- Done: popup shows both 30-day and annual/pro access.
- Confirm manually before submission: the extension runs only on valid Amazon job-search/application pages.
- Confirm manually before submission: no navigation to application/booking pages happens without valid access.

Expected package output:

```text
dist/amazon-warehouse-uk/
amazon-warehouse-uk-1.0.0.zip
```

## Backend Readiness

Production deploy is handled by:

```text
/Users/ankitvishwakarma/Projects/public/extension-usage-tracker/.github/workflows/deploy-ec2.yml
```

The workflow runs on pushes to `main` and manual dispatch. It builds the Next.js app, pushes a Docker image to ECR, deploys through SSM to EC2, and exposes the app under:

```text
https://getslotnow.com/extension-usage-tracker
```

### Required GitHub Actions Variables

Set these in `ankit5076/extension-usage-tracker` under Settings -> Secrets and variables -> Actions -> Variables:

```text
NEXT_PUBLIC_APP_URL=https://getslotnow.com/extension-usage-tracker
NEXT_PUBLIC_APP_BASE_PATH=/extension-usage-tracker
SUPABASE_URL=<existing Supabase project URL>
SUPABASE_EXTENSION_SCHEMA=extension_access
SUPABASE_EXTENSION_USERS_TABLE=users
PAYMENT_PROVIDER=dodo
LICENSE_SYNC_INTERVAL_MS=900000
DODO_PAYMENTS_ENVIRONMENT=live_mode
DODO_PRODUCT_CANADA_ACCESS=<live Canada 30-day Dodo product id>
DODO_PRODUCT_UK_ACCESS=<live UK 30-day Dodo product id>
DODO_PRODUCT_CANADA_PRO=<live Canada annual Dodo product id>
DODO_PRODUCT_UK_PRO=<live UK annual Dodo product id>
ACCESS_DAYS_PER_PURCHASE=30
CANADA_ACCESS_DAYS_PER_PURCHASE=30
UK_ACCESS_DAYS_PER_PURCHASE=30
PRO_ACCESS_DAYS_PER_PURCHASE=365
CANADA_PRO_ACCESS_DAYS_PER_PURCHASE=365
UK_PRO_ACCESS_DAYS_PER_PURCHASE=365
ALLOWED_EXTENSION_ORIGINS=<comma-separated Chrome extension origins after store IDs are known>
```

`ALLOWED_EXTENSION_ORIGINS` can be temporarily empty during pre-store testing if the backend CORS implementation allows extension calls safely. After Chrome Web Store IDs are known, lock it down to the two production extension origins.

### Required GitHub Actions Secrets

Set these under Settings -> Secrets and variables -> Actions -> Repository secrets:

```text
SUPABASE_SERVICE_ROLE_KEY
DODO_PAYMENTS_API_KEY
DODO_PAYMENTS_WEBHOOK_KEY
```

Never put these values in `.env.example`, source code, screenshots, or support messages.

### Production Smoke Checks

After deploy:

```bash
curl -i https://getslotnow.com/extension-usage-tracker/api/health
curl -s https://getslotnow.com/extension-usage-tracker/api/amazon-warehouse-jobs-canada/license/plans
curl -s https://getslotnow.com/extension-usage-tracker/api/amazon-warehouse-jobs-uk/license/plans
```

Expected `/license/plans` shape:

```json
{
  "productId": "amazon-warehouse-jobs-canada",
  "provider": "dodo",
  "plans": {
    "access": true,
    "pro": true
  }
}
```

Run a checkout smoke test for both products and both purchase types:

```bash
curl -i -X POST \
  https://getslotnow.com/extension-usage-tracker/api/amazon-warehouse-jobs-canada/license/checkout \
  -H 'content-type: application/json' \
  --data '{"emailId":"buyer@example.com","amazonEmailId":"amazon@example.com","purchaseType":"access"}'

curl -i -X POST \
  https://getslotnow.com/extension-usage-tracker/api/amazon-warehouse-jobs-canada/license/checkout \
  -H 'content-type: application/json' \
  --data '{"emailId":"buyer@example.com","amazonEmailId":"amazon@example.com","purchaseType":"pro"}'
```

Repeat for `amazon-warehouse-jobs-uk`. Each response must return a Dodo hosted checkout URL.

Current blocker:

```text
The latest checkout smoke test returned test.checkout.dodopayments.com.
Do not submit publicly until the deployed backend returns live Dodo checkout URLs.
```

## Supabase Readiness

The backend must use the existing Supabase project and private schema:

```text
extension_access.users
```

Required checks:

- `extension_access` schema exists.
- `extension_access.users` table exists.
- RLS is enabled.
- `anon` and `authenticated` do not have schema or table access.
- `service_role` can select, insert, and update rows.
- `public.extension_users` is not used by current backend code.

Expected access model:

```text
Browser extension -> Next.js backend -> Supabase service-role client
```

The browser extension must never call Supabase directly.

Useful SQL verification:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'extension_access'
  and tablename = 'users';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'extension_access'
  and table_name = 'users'
order by grantee, privilege_type;
```

Expected user-row behavior:

- A successful Dodo payment creates or updates one row for `product_id + amazon_email_id`.
- 30-day access sets a future `access_expires_at`.
- Annual/pro access sets `is_pro_user=true` and a future `access_expires_at`.
- Refund or dispute marks the row as `refunded` or `blocked`.
- Duplicate webhook events do not extend access twice.
- Duplicate booking usage events do not record usage twice.

## Dodo Live-Mode Setup

Dodo test-mode products are for development only. Production launch requires live-mode products, live API key, and live webhook secret.

Current status:

- Pending: confirm live Dodo products, API key, webhook key, and live product IDs are set in GitHub Actions.
- Pending: redeploy `extension-usage-tracker` after live-mode variables/secrets are configured.
- Pending: rerun checkout smoke tests and confirm the returned checkout host is live, not `test.checkout.dodopayments.com`.

### Products

Create or copy these four live products:

| Product | Price | Access |
| --- | ---: | --- |
| Amazon Warehouse Jobs Canada - 30-Day Access | $50 | 30 days |
| Amazon Warehouse Jobs UK - 30-Day Access | $50 | 30 days |
| Amazon Warehouse Jobs Canada - Annual Access | $120 | 365 days |
| Amazon Warehouse Jobs UK - Annual Access | $120 | 365 days |

For each product:

- Use one-time payment unless the business decision changes to a subscription later.
- Keep product names clear and country-specific.
- Add the Additional Information field for Amazon job-search email.
- Use this description for the Amazon email field:

```text
This Amazon Jobs account will receive this access.
```

### Webhook

Configure this Dodo webhook URL:

```text
https://getslotnow.com/extension-usage-tracker/api/payments/dodo/webhook
```

Store the signing secret as:

```text
DODO_PAYMENTS_WEBHOOK_KEY
```

Required webhook verification:

- Successful payment extends access.
- Duplicate successful payment event does not extend access twice.
- Refund event marks the user row as refunded.
- Dispute or suspicious payment event blocks the user row if supported by the provider event.
- Events missing required metadata are logged and ignored.

Required checkout metadata:

```json
{
  "product_id": "amazon-warehouse-jobs-canada",
  "country": "CA",
  "email_id": "buyer@example.com",
  "amazon_email_id": "amazon@example.com",
  "purchase_type": "access"
}
```

For annual/pro:

```json
{
  "purchase_type": "pro"
}
```

## Extension Manual Test Matrix

Test each extension from a fresh Chrome profile or after removing all extension storage.

### Canada

- Install from `amazon-warehouse-jobs-canada/amazon-warehouse-ca-1.0.0.zip`.
- Open popup on a non-Amazon page; activation must stay blocked.
- Open valid Canada Amazon job-search page.
- Confirm popup asks for buyer email and Amazon job-search email.
- Confirm both 30-day and annual/pro payment options are visible.
- Start checkout for 30-day access and confirm it opens Dodo directly.
- Complete payment using the live public-payment method.
- Confirm license check returns allowed for the Amazon email.
- Confirm job polling only runs on the job-search page.
- Confirm matched job does not navigate without valid access.
- Confirm valid access allows the existing Canada booking flow, including Application Mode/direct application where applicable.
- Confirm expired/refunded/blocked access fails closed.

### UK

- Install from `amazon-warehouse-jobs-uk/amazon-warehouse-uk-1.0.0.zip`.
- Open popup on a non-Amazon page; activation must stay blocked.
- Open valid UK Amazon job-search page.
- Confirm popup asks for buyer email and Amazon job-search email.
- Confirm both 30-day and annual/pro payment options are visible.
- Start checkout for 30-day access and confirm it opens Dodo directly.
- Complete payment using the live public-payment method.
- Confirm license check returns allowed for the Amazon email.
- Confirm job polling only runs on the job-search page.
- Confirm matched job does not navigate without valid access.
- Confirm valid access allows the existing UK booking flow.
- Confirm expired/refunded/blocked access fails closed.

## Chrome Web Store Listing Setup

Use the Chrome Web Store developer dashboard:

```text
https://chrome.google.com/webstore/devconsole
```

Create two separate items:

- Amazon Warehouse Jobs Canada
- Amazon Warehouse Jobs UK

### Package Upload

Upload:

```text
amazon-warehouse-jobs-canada/amazon-warehouse-ca-1.0.0.zip
amazon-warehouse-jobs-uk/amazon-warehouse-uk-1.0.0.zip
```

If upload fails:

- Confirm manifest version was bumped.
- Confirm the zip contains the extension files at the root expected by Chrome.
- Confirm manifest permissions are accurate and justified.
- Confirm no sourcemaps, test files, secrets, or local-only files are included.

### Store Assets

Required:

- Done: 128x128 PNG icons are prepared.
- Done: five 1280x800 PNG screenshots are prepared per listing.
- Done: short descriptions, detailed descriptions, privacy/permission copy, reviewer instructions, and submission checklists are prepared.
- Pending: deploy tracker privacy/support pages and use their public URLs in the dashboard.

Prepared asset folders:

```text
amazon-warehouse-jobs-canada/chrome-web-store/
amazon-warehouse-jobs-uk/chrome-web-store/
```

Each folder contains:

```text
assets/icon-128.png
screenshots/01-popup-unpaid.png
screenshots/02-payment-options.png
screenshots/03-amazon-search-page.png
screenshots/04-activated-paid.png
screenshots/05-application-flow.png
listing.md
privacy-permissions.md
reviewer-instructions.txt
submission-checklist.md
```

### Privacy And Permissions

Complete the privacy tab honestly:

- The extension collects buyer/contact email and Amazon job-search email for access validation.
- The extension reads Amazon job-search/application pages to automate matching and booking.
- The extension communicates with `getslotnow.com` for license checks, checkout creation, and access validation.
- The extension does not sell user data.
- The extension does not call Supabase directly.
- Payment is handled by Dodo hosted checkout.

Permission justification template:

```text
This extension needs access to Amazon hiring pages to detect available warehouse job listings, match the user's selected search criteria, and continue the booking/application flow only after the user has valid paid access. Storage is used to save local extension preferences and the cached access state. Tabs/activeTab/scripting are used to coordinate the popup with the active Amazon hiring tab.
```

Host permission justification template:

```text
Amazon hiring host permissions are required because the extension operates only on Amazon job-search and application pages for the selected country. getslotnow.com is required for paid access validation and checkout creation.
```

### Payment Disclosure

If the Chrome Web Store dashboard asks about paid features or in-app purchases, disclose that:

- The extension requires paid access.
- Payment checkout is hosted by Dodo.
- The extension supports 30-day access and annual/pro access.
- Access is tied to the Amazon job-search email entered during checkout.

### Reviewer Instructions

Paste a concise version of this into the reviewer instructions field and customize per country:

```text
This extension works only on Amazon hiring job-search/application pages for the listed country.

Test flow:
1. Install the extension.
2. Open the extension popup on a non-Amazon page and confirm activation is blocked.
3. Open a supported Amazon hiring job-search page.
4. Enter a buyer email and Amazon job-search email.
5. Choose either 30-day access or annual/pro access.
6. The extension opens Dodo hosted checkout.
7. After payment, return to the Amazon job-search page and activate the extension.
8. The extension checks paid access through https://getslotnow.com/extension-usage-tracker and only proceeds when access is valid.

Payment is handled by Dodo hosted checkout. Supabase is used only by the backend service and is never called directly by the extension.
```

For this release, reviewer instructions should describe live checkout behavior. Do not reference a trusted-tester or test-mode checkout path in the public submission.

## Trusted-Tester Release

Skipped by decision. This release targets direct public Chrome Web Store submission.

Because trusted testers are skipped, complete these checks before public submission:

- Install both extensions locally from the packaged `1.0.0` zips.
- Run the manual test matrix above.
- Confirm live Dodo checkout creates or updates rows in `extension_access.users`.
- Confirm unpaid, expired, refunded, and blocked users are denied.
- Confirm no old booking-count or credit-pack language appears anywhere in the extension or checkout.
- Confirm no unexpected navigation happens before valid access.

## Public Launch

Launch directly as public after all hard release gates pass.

Before submission:

- Confirm `DODO_PAYMENTS_ENVIRONMENT=live_mode`.
- Confirm Dodo product IDs are live-mode IDs.
- Confirm checkout URLs use live Dodo checkout, not `test.checkout.dodopayments.com`.
- Confirm webhook event delivery succeeds in Dodo dashboard.
- Confirm `/api/health` passes.
- Confirm `/license/plans` shows both plans for both products.
- Confirm Chrome Web Store listings use final descriptions, screenshots, privacy answers, and support links.
- Confirm package versions match release notes.

Launch steps:

1. Create or open the Canada Chrome Web Store item.
2. Upload `amazon-warehouse-jobs-canada/amazon-warehouse-ca-1.0.0.zip`.
3. Complete Canada listing fields using `amazon-warehouse-jobs-canada/chrome-web-store/`.
4. Set Canada visibility to public and submit for review.
5. Create or open the UK Chrome Web Store item.
6. Upload `amazon-warehouse-jobs-uk/amazon-warehouse-uk-1.0.0.zip`.
7. Complete UK listing fields using `amazon-warehouse-jobs-uk/chrome-web-store/`.
8. Set UK visibility to public and submit for review.
9. Monitor Chrome Web Store review status.
10. After approval, install both public listing versions in a clean Chrome profile.
11. Run payment and activation smoke tests again.

## Post-Release Monitoring

During the first 48 hours, check:

- GitHub Actions deployment status.
- EC2 container health.
- `https://getslotnow.com/extension-usage-tracker/api/health`.
- Dodo checkout success rate.
- Dodo webhook delivery failures.
- Supabase `extension_access.users` row creation/update behavior.
- Customer support messages about payment, activation, Amazon email mismatch, and country mismatch.
- Chrome Web Store review or policy messages.

Operational queries:

```sql
select product_id, status, is_pro_user, count(*)
from extension_access.users
group by product_id, status, is_pro_user
order by product_id, status, is_pro_user;

select product_id, email_id, amazon_email_id, status, is_pro_user, access_expires_at, last_payment_status, updated_at
from extension_access.users
order by updated_at desc
limit 25;
```

## Rollback

Backend rollback options:

- Re-run the last known good GitHub Actions deployment.
- Re-deploy the previous Docker image tag if available in ECR.
- Temporarily set the Chrome Web Store listing visibility back to private if a public release is unsafe.

Extension rollback options:

- Upload a fixed package with a higher manifest version.
- Keep the previous approved Web Store version active while the new version is under review.
- If the issue is severe, unpublish or restrict visibility until fixed.

Dodo rollback options:

- Disable the affected live product.
- Rotate webhook/API secrets if exposed.
- Refund affected users and mark their rows consistently in `extension_access.users`.

## Release Signoff Template

```text
Release:
- Canada extension version:
- UK extension version:
- Backend commit:
- Backend deployment run:
- Dodo mode: live_mode
- Supabase schema: extension_access.users
- Chrome listing visibility: public

Backend checks:
- npm test:
- npm run typecheck:
- npm run build:
- /api/health:
- Canada /license/plans:
- UK /license/plans:
- Canada access checkout host is live:
- Canada annual/pro checkout host is live:
- UK access checkout host is live:
- UK annual/pro checkout host is live:
- Dodo webhook delivery verified:

Extension checks:
- Canada npm test/build/verify/package:
- UK npm test/build/verify/package:
- Canada packaged zip: amazon-warehouse-ca-1.0.0.zip
- UK packaged zip: amazon-warehouse-uk-1.0.0.zip
- Canada fresh install:
- UK fresh install:
- 30-day checkout:
- Annual/pro checkout:
- Unpaid blocked:
- Paid allowed:
- Expired/refunded/blocked denied:

Chrome Web Store:
- Canada package uploaded:
- UK package uploaded:
- Store asset packs used:
- Privacy/support URLs deployed:
- Privacy completed:
- Permission justifications completed:
- Payment disclosure completed:
- Reviewer instructions completed:
- Public visibility selected:
- Public review submitted:
- Public launch approved:

Owner:
Date:
```
