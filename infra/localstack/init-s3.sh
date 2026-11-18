#!/bin/sh
# Runs inside the LocalStack container once S3 is ready (mounted into /etc/localstack/init/ready.d).
# Creates the local recordings bucket with the same safety settings we'll use in real AWS (SPEC §9).
# Idempotent: safe to run on every container start.
set -eu

BUCKET="speakup-recordings-dev"

awslocal s3api create-bucket --bucket "$BUCKET" \
  --create-bucket-configuration LocationConstraint=eu-central-1 2>/dev/null || true

# Private bucket: no public ACLs or policies, ever.
awslocal s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Encrypt every object at rest.
awslocal s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# The browser uploads straight to S3 (pre-signed POST), so the bucket must allow our web origin.
awslocal s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration '{
  "CORSRules": [{
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }]
}'

echo "S3 bucket $BUCKET ready"
