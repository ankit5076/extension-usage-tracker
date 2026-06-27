# Extension Usage Tracker

Next.js API service for paid access to the Canada and UK Amazon warehouse job extensions. Dodo is the default payment provider, and Paddle is available behind the same provider interface.

## Endpoints

```text
GET  /api/{productId}/license/check?amazonEmail=amazon@example.com
POST /api/{productId}/license/checkout
POST /api/{productId}/license/usage
POST /api/payments/dodo/webhook
POST /api/payments/paddle/webhook
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
  "credits": 5,
  "isProUser": false,
  "checkoutUrl": "",
  "message": "5 booking credits available.",
  "syncIntervalMs": 900000
}
```

## Supabase

Run `supabase/schema.sql` in the shared Supabase project. It creates `extension_access.users` keyed by `(product_id, amazon_email_id)`.

The schema enables RLS, revokes schema/table access from `anon` and `authenticated`, and grants access only to `service_role`. Keep `SUPABASE_SERVICE_ROLE_KEY` on the server only. Extensions never call Supabase directly.

## Payments

Checkout goes through `src/lib/payments/PaymentProvider`. Set `PAYMENT_PROVIDER=dodo` or `PAYMENT_PROVIDER=paddle`; the extension API and response shape do not change.

Each checkout session includes metadata:

```json
{
  "product_id": "amazon-warehouse-jobs-canada",
  "country": "CA",
  "email_id": "buyer@example.com",
  "amazon_email_id": "amazon@example.com",
  "purchase_type": "credits"
}
```

Dodo uses hosted checkout sessions and Dodo webhook verification. Paddle uses transaction checkout URLs and `Paddle-Signature` verification through `@paddle/paddle-node-sdk`. Payment success increments credits once using `last_payment_event_id`; refund/dispute events mark the row as `refunded` or `blocked`.

The legacy Dodo webhook route remains available at `/api/dodo/webhook`; new provider-specific webhooks live at `/api/payments/dodo/webhook` and `/api/payments/paddle/webhook`.

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
NEXT_PUBLIC_APP_URL
DODO_PRODUCT_CANADA_CREDITS
DODO_PRODUCT_UK_CREDITS
PADDLE_PRICE_CANADA_CREDITS
PADDLE_PRICE_UK_CREDITS
```

Optional pro products:

```text
DODO_PRODUCT_CANADA_PRO
DODO_PRODUCT_UK_PRO
PADDLE_PRICE_CANADA_PRO
PADDLE_PRICE_UK_PRO
```

## Local Development

```bash
npm install
npm run dev
```

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

Dodo webhook URL:

```text
https://getslotnow.com/extension-usage-tracker/api/payments/dodo/webhook
```

The workflow has defaults for the current EC2 host, Supabase project, Dodo product ids, and 5-credit pack sizing. Set repository variables only when overriding those defaults:

```text
AWS_ACCOUNT_ID
AWS_REGION
AWS_ROLE_ARN
DEPLOY_INSTANCE_ID
DEPLOY_INSTANCE_TAG_NAME
NEXT_PUBLIC_APP_URL
ALLOWED_EXTENSION_ORIGINS
SUPABASE_URL
SUPABASE_EXTENSION_SCHEMA
SUPABASE_EXTENSION_USERS_TABLE
PAYMENT_PROVIDER
LICENSE_SYNC_INTERVAL_MS
DODO_PAYMENTS_ENVIRONMENT
DODO_PRODUCT_CANADA_CREDITS
DODO_PRODUCT_UK_CREDITS
DODO_PRODUCT_CANADA_PRO
DODO_PRODUCT_UK_PRO
CANADA_CREDITS_PER_PURCHASE
UK_CREDITS_PER_PURCHASE
EXTENSION_USAGE_TRACKER_PUBLIC_PATH
EXTENSION_USAGE_TRACKER_ECR_REPOSITORY
```

Required GitHub repository secrets for Dodo deployment:

```text
SUPABASE_SERVICE_ROLE_KEY
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
