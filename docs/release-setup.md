# Release Setup

The GitHub Actions workflow is ready and defaults to the existing EC2 deployment target:

```text
AWS_ACCOUNT_ID=269985663760
AWS_REGION=us-east-1
AWS_ROLE_ARN=arn:aws:iam::269985663760:role/GetSlotNowGitHubDeployRole
DEPLOY_INSTANCE_ID=i-087a97129bcdc6fac
DEPLOY_INSTANCE_TAG_NAME=get-slot-now-prod
NEXT_PUBLIC_APP_URL=https://getslotnow.com/extension-usage-tracker
```

## Required GitHub Secrets

Add these in `ankit5076/extension-usage-tracker` under Settings -> Secrets and variables -> Actions -> Repository secrets:

```text
SUPABASE_SERVICE_ROLE_KEY
DODO_PAYMENTS_API_KEY
DODO_PAYMENTS_WEBHOOK_KEY
```

After those are set, rerun:

```text
https://github.com/ankit5076/extension-usage-tracker/actions/workflows/deploy-ec2.yml
```

## Dodo Webhook

Configure Dodo to send events to:

```text
https://getslotnow.com/extension-usage-tracker/api/payments/dodo/webhook
```

Store the Dodo webhook signing secret as:

```text
DODO_PAYMENTS_WEBHOOK_KEY
```

## AWS IAM Updates

Applied in AWS CloudShell for account `269985663760`.

The GitHub OIDC deploy role trusts this repository:

```text
repo:ankit5076/extension-usage-tracker:ref:refs/heads/main
repo:ankit5076/extension-usage-tracker:environment:production
```

The GitHub deploy role has ECR push access to:

```text
arn:aws:ecr:us-east-1:269985663760:repository/extension-usage-tracker
```

The EC2 instance role has ECR pull access to:

```text
arn:aws:ecr:us-east-1:269985663760:repository/extension-usage-tracker
```

The ECR repository exists:

```text
269985663760.dkr.ecr.us-east-1.amazonaws.com/extension-usage-tracker
```

For a fresh AWS account, create it manually:

```bash
aws ecr create-repository \
  --region us-east-1 \
  --repository-name extension-usage-tracker \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256

aws ecr put-lifecycle-policy \
  --region us-east-1 \
  --repository-name extension-usage-tracker \
  --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"Keep last 30 images","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":30},"action":{"type":"expire"}}]}'
```

## Expected Flow After Setup

1. GitHub Actions builds and pushes `extension-usage-tracker`.
2. SSM deploys the container to the existing `get-slot-now-prod` EC2 instance.
3. The deploy script joins the existing Caddy Docker network.
4. Caddy routes `/extension-usage-tracker/*` to the private container.
5. Health check passes at:

```text
https://getslotnow.com/extension-usage-tracker/api/health
```
