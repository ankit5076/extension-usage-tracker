# Extension Usage Tracker

Next.js API service for paid access to the Canada and UK Amazon warehouse job extensions. Razorpay Payment Links are the production payment path, with Dodo and Paddle still available behind the same provider interface.

## Endpoints

```text
GET  /api/{productId}/license/check?amazonEmail=amazon@example.com
POST /api/{productId}/license/checkout
POST /api/{productId}/license/usage
POST /api/payments/dodo/webhook
POST /api/payments/paddle/webhook
POST /api/payments/razorpay/webhook
POST /api/dodo/webhook
GET  /checkout/success
```

Supported product ids:

```text
amazon-warehouse-jobs-canada
amazon-warehouse-jobs-uk
```

Extension responses keep this shape:

```json
{
  "allowed": true,
  "isProUser": false,
  "accessExpiresAt": "2026-01-31T00:00:00.000Z",
  "checkoutUrl": "",
  "message": "30-day access active until 2026-01-31T00:00:00.000Z.",
  "syncIntervalMs": 900000
}
```

## Supabase

Run `supabase/schema.sql` in the shared Supabase project. It creates `extension_access.users` keyed by `(product_id, amazon_email_id)`.

The schema enables RLS, revokes schema/table access from `anon` and `authenticated`, and grants access only to `service_role`. Keep `SUPABASE_SERVICE_ROLE_KEY` on the server only. Extensions never call Supabase directly.

## Payments

Checkout goes through `src/lib/payments/PaymentProvider`. Set `PAYMENT_PROVIDER=razorpay`, `PAYMENT_PROVIDER=dodo`, or `PAYMENT_PROVIDER=paddle`; the extension API and response shape do not change.

Each checkout session includes metadata:

```json
{
  "product_id": "amazon-warehouse-jobs-canada",
  "country": "CA",
  "email_id": "buyer@example.com",
  "amazon_email_id": "amazon@example.com",
  "purchase_type": "access"
}
```

Razorpay creates hosted Payment Links and verifies webhooks with `X-Razorpay-Signature`. Dodo uses hosted checkout sessions and Dodo webhook verification. Paddle uses transaction checkout URLs and `Paddle-Signature` verification through `@paddle/paddle-node-sdk`. Payment success extends access once using `last_payment_event_id`; refund/dispute events mark the row as `refunded` or `blocked`.

The legacy Dodo webhook route remains available at `/api/dodo/webhook`; provider-specific webhooks live at `/api/payments/dodo/webhook`, `/api/payments/paddle/webhook`, and `/api/payments/razorpay/webhook`.

## Configuration

Copy `.env.example` into your deployment environment and set:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_EXTENSION_SCHEMA
SUPABASE_EXTENSION_USERS_TABLE
PAYMENT_PROVIDER
DODO_PAYMENTS_API_KEY
DODO_PAYMENTS_WEBHOOK_KEY
DODO_PAYMENTS_ENVIRONMENT
PADDLE_API_KEY
PADDLE_WEBHOOK_SECRET
PADDLE_ENVIRONMENT
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
RAZORPAY_CURRENCY
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_APP_BASE_PATH
DODO_PRODUCT_CANADA_ACCESS
DODO_PRODUCT_UK_ACCESS
PADDLE_PRICE_CANADA_ACCESS
PADDLE_PRICE_UK_ACCESS
RAZORPAY_CANADA_ACCESS_AMOUNT_SUBUNITS
RAZORPAY_UK_ACCESS_AMOUNT_SUBUNITS
```

Only the active provider's secrets and product/amount variables are required at runtime. For production Razorpay, set `PAYMENT_PROVIDER=razorpay` with the `RAZORPAY_*` variables.

Optional pro products:

```text
DODO_PRODUCT_CANADA_PRO
DODO_PRODUCT_UK_PRO
PADDLE_PRICE_CANADA_PRO
PADDLE_PRICE_UK_PRO
RAZORPAY_CANADA_PRO_AMOUNT_SUBUNITS
RAZORPAY_UK_PRO_AMOUNT_SUBUNITS
```

## Local Development

```bash
npm install
npm run dev
```

For a production-style local run:

```bash
npm run build
PORT=3001 npm start
```

`npm start` serves the standalone Next.js build. If port `3000` is already in use, set `PORT` to any free port.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

## EC2 Deployment

The repository includes `.github/workflows/deploy-ec2.yml`, modeled on the existing `automation-tracker-service` EC2 deployment. On pushes to `main`, the workflow:

- runs tests, typecheck, and build
- builds the standalone Next.js Docker image
- pushes it to ECR repository `extension-usage-tracker`
- deploys it to the existing `get-slot-now-prod` EC2 host through SSM
- joins the existing Docker network and adds a private Caddy route at `/extension-usage-tracker/*`

Default public backend URL:

```text
https://getslotnow.com/extension-usage-tracker
```

Razorpay webhook URL:

```text
https://getslotnow.com/extension-usage-tracker/api/payments/razorpay/webhook
```

The workflow has defaults for the current EC2 host, Supabase project, legacy Dodo product ids, and access window sizing. Set repository variables only when overriding those defaults:

```text
AWS_ACCOUNT_ID
AWS_REGION
AWS_ROLE_ARN
DEPLOY_INSTANCE_ID
DEPLOY_INSTANCE_TAG_NAME
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_APP_BASE_PATH
ALLOWED_EXTENSION_ORIGINS
SUPABASE_URL
SUPABASE_EXTENSION_SCHEMA
SUPABASE_EXTENSION_USERS_TABLE
PAYMENT_PROVIDER
LICENSE_SYNC_INTERVAL_MS
RAZORPAY_CURRENCY
RAZORPAY_CANADA_ACCESS_AMOUNT_SUBUNITS
RAZORPAY_UK_ACCESS_AMOUNT_SUBUNITS
RAZORPAY_CANADA_PRO_AMOUNT_SUBUNITS
RAZORPAY_UK_PRO_AMOUNT_SUBUNITS
DODO_PAYMENTS_ENVIRONMENT
DODO_PRODUCT_CANADA_ACCESS
DODO_PRODUCT_UK_ACCESS
DODO_PRODUCT_CANADA_PRO
DODO_PRODUCT_UK_PRO
ACCESS_DAYS_PER_PURCHASE
CANADA_ACCESS_DAYS_PER_PURCHASE
UK_ACCESS_DAYS_PER_PURCHASE
PRO_ACCESS_DAYS_PER_PURCHASE
CANADA_PRO_ACCESS_DAYS_PER_PURCHASE
UK_PRO_ACCESS_DAYS_PER_PURCHASE
EXTENSION_USAGE_TRACKER_PUBLIC_PATH
EXTENSION_USAGE_TRACKER_ECR_REPOSITORY
```

Required GitHub repository secrets for Razorpay deployment:

```text
SUPABASE_SERVICE_ROLE_KEY
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
```

Only set these Dodo secrets if `PAYMENT_PROVIDER=dodo`:

```text
DODO_PAYMENTS_API_KEY
DODO_PAYMENTS_WEBHOOK_KEY
```

Only set these Paddle secrets if `PAYMENT_PROVIDER=paddle`:

```text
PADDLE_API_KEY
PADDLE_WEBHOOK_SECRET
```

The AWS OIDC deploy role must trust this repository in addition to the existing repos:

```text
repo:ankit5076/extension-usage-tracker:ref:refs/heads/main
repo:ankit5076/extension-usage-tracker:environment:production
```

The GitHub deploy role and EC2 instance role also need ECR push/pull permissions for:

```text
arn:aws:ecr:<AWS_REGION>:<AWS_ACCOUNT_ID>:repository/extension-usage-tracker
```

See `docs/release-setup.md` for the exact remaining GitHub secrets, Razorpay webhook URL, and AWS IAM additions.
