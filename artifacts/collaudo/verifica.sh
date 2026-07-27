#!/usr/bin/env bash
# Collaudo dell'infrastruttura su finto-AWS (moto).
#
# Non si fida dell'esito di "terraform apply": interroga le API una per una e
# verifica che le risorse esistano DAVVERO e con i controlli di sicurezza
# richiesti. Qualunque scostamento fa uscire con codice != 0, quindi la
# pipeline diventa rossa.
#
# Uso: verifica.sh <bucket-sito> <bucket-log> <tabella-iscrizioni> <owner>
set -uo pipefail

SITO="${1:?bucket del sito mancante}"
LOG="${2:?bucket dei log mancante}"
TAB="${3:?tabella iscrizioni mancante}"
OWNER="${4:?owner mancante}"

: "${AWS_ENDPOINT_URL:=http://127.0.0.1:5000}"
: "${AWS_DEFAULT_REGION:=eu-south-1}"
export AWS_ENDPOINT_URL AWS_DEFAULT_REGION
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"

PY=$(command -v python3 || command -v python)
ERRORI=0

ok()     { printf '  OK   %s\n' "$1"; }
ko()     { printf '  FAIL %s\n' "$1"; ERRORI=$((ERRORI + 1)); }
titolo() { printf '\n== %s\n' "$1"; }

# atteso <descrizione> <valore-atteso> <valore-ottenuto>
atteso() {
  if [ "$2" = "$3" ]; then ok "$1 = $3"; else ko "$1: atteso '$2', ottenuto '$3'"; fi
}

titolo "esistenza delle risorse"
aws s3api head-bucket --bucket "$SITO" >/dev/null 2>&1 && ok "bucket sito $SITO esiste" || ko "bucket sito $SITO NON esiste"
aws s3api head-bucket --bucket "$LOG"  >/dev/null 2>&1 && ok "bucket log $LOG esiste"   || ko "bucket log $LOG NON esiste"
aws dynamodb describe-table --table-name "$TAB" >/dev/null 2>&1 && ok "tabella $TAB esiste" || ko "tabella $TAB NON esiste"

titolo "bucket del sito: versionamento (prerequisito del rollback)"
atteso "versioning" "Enabled" \
  "$(aws s3api get-bucket-versioning --bucket "$SITO" --query 'Status' --output text 2>/dev/null)"

titolo "bucket del sito: cifratura a riposo"
atteso "SSEAlgorithm" "AES256" \
  "$(aws s3api get-bucket-encryption --bucket "$SITO" \
     --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' \
     --output text 2>/dev/null)"

titolo "bucket del sito: public access block su tutti e quattro i controlli"
for chiave in BlockPublicAcls BlockPublicPolicy IgnorePublicAcls RestrictPublicBuckets; do
  atteso "$chiave" "True" \
    "$(aws s3api get-public-access-block --bucket "$SITO" \
       --query "PublicAccessBlockConfiguration.$chiave" --output text 2>/dev/null)"
done

titolo "bucket del sito: la policy non deve essere pubblica"
POLICY=$(aws s3api get-bucket-policy --bucket "$SITO" --query Policy --output text 2>/dev/null)
if [ -z "$POLICY" ] || [ "$POLICY" = "None" ]; then
  ok "nessuna bucket policy (accettabile: nessun accesso anonimo)"
else
  # Regola: nessuno statement puo essere Allow con Principal anonimo "*".
  PUBBLICA=$(printf '%s' "$POLICY" | "$PY" -c '
import sys, json
st = json.load(sys.stdin).get("Statement", [])
st = st if isinstance(st, list) else [st]
def anonimo(p):
    if p == "*":
        return True
    if isinstance(p, dict):
        v = p.get("AWS", [])
        return "*" in (v if isinstance(v, list) else [v])
    return False
print("SI" if any(s.get("Effect") == "Allow" and anonimo(s.get("Principal")) for s in st) else "NO")
')
  atteso "policy con Allow anonimo (Principal *)" "NO" "$PUBBLICA"
  printf '%s' "$POLICY" | grep -q 'aws:SecureTransport' \
    && ok "policy nega il trasporto in chiaro" \
    || ko "policy senza deny su aws:SecureTransport"
fi

titolo "bucket dei log: privato, versionato, cifrato"
atteso "versioning log" "Enabled" \
  "$(aws s3api get-bucket-versioning --bucket "$LOG" --query 'Status' --output text 2>/dev/null)"
atteso "SSEAlgorithm log" "AES256" \
  "$(aws s3api get-bucket-encryption --bucket "$LOG" \
     --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' \
     --output text 2>/dev/null)"
atteso "RestrictPublicBuckets log" "True" \
  "$(aws s3api get-public-access-block --bucket "$LOG" \
     --query 'PublicAccessBlockConfiguration.RestrictPublicBuckets' --output text 2>/dev/null)"

titolo "tabella iscrizioni: cifratura, PITR, tag di governance"
atteso "SSE" "ENABLED" \
  "$(aws dynamodb describe-table --table-name "$TAB" --query 'Table.SSEDescription.Status' --output text 2>/dev/null)"
atteso "point-in-time recovery" "ENABLED" \
  "$(aws dynamodb describe-continuous-backups --table-name "$TAB" \
     --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
     --output text 2>/dev/null)"

ARN=$(aws dynamodb describe-table --table-name "$TAB" --query 'Table.TableArn' --output text 2>/dev/null)
for chiave in Owner Env Progetto; do
  VALORE=$(aws dynamodb list-tags-of-resource --resource-arn "$ARN" \
           --query "Tags[?Key=='$chiave'].Value" --output text 2>/dev/null)
  [ -n "$VALORE" ] && ok "tag $chiave = $VALORE" || ko "tag $chiave assente"
done
atteso "tag Owner coerente con il parametro" "$OWNER" \
  "$(aws dynamodb list-tags-of-resource --resource-arn "$ARN" \
     --query "Tags[?Key=='Owner'].Value" --output text 2>/dev/null)"

printf '\n'
if [ "$ERRORI" -gt 0 ]; then
  printf 'COLLAUDO FALLITO: %s controlli non superati.\n' "$ERRORI"
  exit 1
fi
printf 'COLLAUDO SUPERATO: infrastruttura conforme.\n'
