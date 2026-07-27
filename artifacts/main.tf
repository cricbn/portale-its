# =============================================================================
# BINARIO PRINCIPALE (fonte di verita per l'infrastruttura).
#
# Come da perizia, azione 3.1: si adotta un solo strumento IaC e quello scelto
# e Terraform. portale-its.yaml (CloudFormation) descrive le stesse risorse con
# gli stessi nomi e gli stessi controlli di sicurezza, ed e mantenuto allineato
# per portabilita e per il collaudo su finto-AWS, ma NON e la fonte di verita:
# in caso di divergenza vale questo file.
#
# Nessun endpoint locale, nessuna credenziale, nessuno skip_* in questo file
# (cfr. IAC-02). Il collaudo su moto inietta la propria configurazione tramite
# un file di override generato dalla pipeline, che non viene mai versionato.
# =============================================================================

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Backend remoto con locking e cifratura (cfr. IAC-03).
  # Va inizializzato con -backend-config: nessun valore di ambiente qui dentro.
  # backend "s3" {}
}

variable "env" {
  type        = string
  default     = "test"
  description = "Ambiente di destinazione."
  validation {
    condition     = contains(["dev", "test", "prod"], var.env)
    error_message = "env deve essere dev, test o prod."
  }
}

variable "owner" {
  type        = string
  default     = "squadra-0"
  description = "Referente responsabile delle risorse. Obbligatorio: imposta il tag Owner."
  validation {
    condition     = length(var.owner) >= 3
    error_message = "owner deve avere almeno 3 caratteri."
  }
}

variable "region" {
  type        = string
  default     = "eu-south-1"
  description = "Regione AWS."
}

locals {
  suffisso = "${var.env}-${var.owner}"
  tagcomuni = {
    Owner    = var.owner
    Env      = var.env
    Progetto = "portale-its"
  }
}

provider "aws" {
  region = var.region
}

data "aws_caller_identity" "attuale" {}

# --- bucket dei log di accesso ----------------------------------------------

resource "aws_s3_bucket" "log" {
  # checkov:skip=CKV_AWS_18:e il bucket di destinazione dei log; loggare i log su se stessi crea ricorsione
  # checkov:skip=CKV_AWS_144:replica cross-region non richiesta per i log di un sito statico
  # checkov:skip=CKV_AWS_145:SSE-S3 (AES256) adeguata; nessuna KMS CMK per non introdurre costo e rotazione chiavi
  # checkov:skip=CKV2_AWS_62:notifiche di evento non previste da alcun consumatore
  bucket = "portale-its-log-${local.suffisso}"
  tags   = local.tagcomuni
}

# I log di accesso non si conservano per sempre: 365 giorni e poi scadono.
resource "aws_s3_bucket_lifecycle_configuration" "log" {
  bucket = aws_s3_bucket.log.id
  rule {
    id     = "scadenza-log"
    status = "Enabled"
    filter {}
    expiration {
      days = 365
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
  depends_on = [aws_s3_bucket_versioning.log]
}

resource "aws_s3_bucket_ownership_controls" "log" {
  bucket = aws_s3_bucket.log.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "log" {
  bucket = aws_s3_bucket.log.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "log" {
  bucket = aws_s3_bucket.log.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "log" {
  bucket                  = aws_s3_bucket.log.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "log" {
  bucket = aws_s3_bucket.log.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "ConsentiScritturaLogS3"
        Effect    = "Allow"
        Principal = { Service = "logging.s3.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.log.arn}/*"
        Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.attuale.account_id } }
      },
      {
        Sid       = "NegaTrasportoInChiaro"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.log.arn, "${aws_s3_bucket.log.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
  depends_on = [aws_s3_bucket_public_access_block.log]
}

# --- bucket del sito --------------------------------------------------------
#
# Il bucket resta completamente privato: nessuna policy con Principal "*" in
# Allow (cfr. SEC-02/SEC-03). La distribuzione pubblica avviene tramite
# CloudFront con Origin Access Control, fuori dal perimetro di questo modulo.

resource "aws_s3_bucket" "sito" {
  # checkov:skip=CKV_AWS_144:replica cross-region non richiesta; il sito e ricostruibile dalla pipeline
  # checkov:skip=CKV_AWS_145:SSE-S3 (AES256) adeguata per contenuto pubblico statico, nessun dato personale
  # checkov:skip=CKV2_AWS_62:notifiche di evento non previste da alcun consumatore
  bucket = "portale-its-sito-${local.suffisso}"
  tags   = local.tagcomuni
}

# Tracciabilita degli accessi al sito (cfr. OPS-04: prima non esisteva alcun log).
resource "aws_s3_bucket_logging" "sito" {
  bucket        = aws_s3_bucket.sito.id
  target_bucket = aws_s3_bucket.log.id
  target_prefix = "sito/"
  depends_on    = [aws_s3_bucket_policy.log]
}

resource "aws_s3_bucket_ownership_controls" "sito" {
  bucket = aws_s3_bucket.sito.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Versionamento: e il prerequisito del rollback (cfr. OPS-02).
resource "aws_s3_bucket_versioning" "sito" {
  bucket = aws_s3_bucket.sito.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "sito" {
  bucket = aws_s3_bucket.sito.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "sito" {
  bucket                  = aws_s3_bucket.sito.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Policy NON pubblica: nega soltanto. Nessun Allow anonimo.
resource "aws_s3_bucket_policy" "sito" {
  bucket = aws_s3_bucket.sito.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "NegaTrasportoInChiaro"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.sito.arn, "${aws_s3_bucket.sito.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.sito]
}

# Conserva le versioni precedenti per 90 giorni: finestra utile al rollback.
resource "aws_s3_bucket_lifecycle_configuration" "sito" {
  bucket = aws_s3_bucket.sito.id
  rule {
    id     = "scadenza-versioni-precedenti"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
  depends_on = [aws_s3_bucket_versioning.sito]
}

# --- tabella iscrizioni -----------------------------------------------------

resource "aws_dynamodb_table" "iscrizioni" {
  # checkov:skip=CKV_AWS_119:cifratura con chiave gestita AWS; la classificazione del dato (perizia 4.1) e prerequisito per decidere una CMK
  name         = "portale-its-iscrizioni-${local.suffisso}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "iscrizioneId"

  attribute {
    name = "iscrizioneId"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = local.tagcomuni
}

# --- output: usati dal collaudo per verificare che le risorse esistano ------

output "bucket_sito" {
  value       = aws_s3_bucket.sito.id
  description = "Nome del bucket che ospita il sito."
}

output "bucket_log" {
  value       = aws_s3_bucket.log.id
  description = "Nome del bucket dei log di accesso."
}

output "tabella_iscrizioni" {
  value       = aws_dynamodb_table.iscrizioni.name
  description = "Nome della tabella DynamoDB delle iscrizioni."
}

output "env" {
  value       = var.env
  description = "Ambiente applicato."
}

output "owner" {
  value       = var.owner
  description = "Referente responsabile."
}
