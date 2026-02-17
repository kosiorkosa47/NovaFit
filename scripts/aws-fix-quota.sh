#!/bin/bash
# =============================================================
# WKLEJ TEN SKRYPT W AWS CLOUDSHELL (zaloguj sie jako ROOT)
# https://console.aws.amazon.com/cloudshell
# =============================================================

set -e
echo "=== 1/4 Dodaje uprawnienia do usera nova-health ==="

# Dodaj ServiceQuotas + Support
aws iam attach-user-policy --user-name nova-health \
  --policy-arn arn:aws:iam::aws:policy/ServiceQuotasFullAccess

aws iam attach-user-policy --user-name nova-health \
  --policy-arn arn:aws:iam::aws:policy/AWSSupportAccess

echo "OK - uprawnienia dodane"

echo ""
echo "=== 2/4 Sprawdzam aktualne limity Bedrock ==="

# Pokaż aktualne limity tokenów na dzień dla Nova
aws service-quotas list-service-quotas --service-code bedrock \
  --query 'Quotas[?contains(QuotaName, `tokens per day`) && contains(QuotaName, `Nova`)].{Name: QuotaName, Value: Value, Adjustable: Adjustable, Code: QuotaCode}' \
  --output table --region us-east-1 2>/dev/null || echo "(nie udalo sie wylistowac - to normalne)"

echo ""
echo "=== 3/4 Probuje zwiekszyc limity przez Service Quotas ==="

# Spróbuj zwiększyć dla Nova 2 Lite
for CODE in $(aws service-quotas list-service-quotas --service-code bedrock \
  --query 'Quotas[?contains(QuotaName, `Nova`) && contains(QuotaName, `tokens per day`)].QuotaCode' \
  --output text --region us-east-1 2>/dev/null); do

  echo "Requesting increase for quota: $CODE"
  aws service-quotas request-service-quota-increase \
    --service-code bedrock \
    --quota-code "$CODE" \
    --desired-value 1000000000 \
    --region us-east-1 2>/dev/null || echo "  -> Nie mozna zwiekszyc przez Service Quotas (quota not adjustable)"
done

echo ""
echo "=== 4/4 Tworze Support Case ==="

CASE_ID=$(aws support create-case \
  --subject "Bedrock daily token quota increase - new paid account" \
  --communication-body "Hello,

I recently upgraded my AWS account (973918476813) from Free Plan to Paid Plan. I am building a project for the Amazon Nova AI Hackathon 2026 and need to use Amazon Bedrock models (Nova 2 Lite, Nova Pro, Nova Micro) in us-east-1.

Currently ALL Bedrock models return ThrottlingException: 'Too many tokens per day' despite this being a brand new account with zero prior usage. My daily token quota appears to be set to 0.

Could you please increase my Bedrock daily token quotas to the standard defaults? I need:
- Amazon Nova 2 Lite: tokens per day (standard default ~5.76B)
- Amazon Nova Pro: tokens per day (standard default ~1.15B)
- Amazon Nova Micro: tokens per day (standard default ~5.76B)

This is urgent as the hackathon deadline is approaching. I have a Visa card attached and $100 credits on the account.

Thank you for your help." \
  --service-code amazon-bedrock \
  --category-code general-guidance \
  --severity-code low \
  --language en \
  --region us-east-1 \
  --query 'caseId' --output text 2>&1)

if [[ "$CASE_ID" == *"Error"* ]] || [[ "$CASE_ID" == *"error"* ]]; then
  echo "Nie udalo sie utworzyc Support Case automatycznie."
  echo "Blad: $CASE_ID"
  echo ""
  echo ">>> Utworz recznie: https://console.aws.amazon.com/support/home#/case/create"
  echo ">>> Service: Amazon Bedrock"
  echo ">>> Opis: Potrzebujesz quota increase - tokens per day"
else
  echo "Support Case utworzony! ID: $CASE_ID"
  echo "Sprawdz status: https://console.aws.amazon.com/support/home#/case/?displayId=$CASE_ID"
fi

echo ""
echo "=== GOTOWE ==="
echo "Jesli limity sie nie odblokuja od razu, poczekaj do 1:00 w nocy (midnight UTC)."
echo "Po upgrade z Free na Paid, limity powinny byc wyzsze po resecie dziennym."
