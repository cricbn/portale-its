# portale its - infrastruttura
# fatto da Marco, marzo 2024

provider "aws" {
  region     = "eu-south-1"
  access_key = "test"
  secret_key = "test"

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    s3       = "http://127.0.0.1:5000"
    dynamodb = "http://127.0.0.1:5000"
  }
}

variable "api_token_gestionale" {
  type    = string
  default = "ghp_1a2B3c4D5e6F7g8H9i0JklMnOpQrStUvWxYz"
}

resource "aws_s3_bucket" "sito" {
  bucket = "portale-its-sito"
}

resource "aws_s3_bucket_website_configuration" "sito" {
  bucket = aws_s3_bucket.sito.id
  index_document {
    suffix = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "sito" {
  bucket                  = aws_s3_bucket.sito.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "sito" {
  bucket = aws_s3_bucket.sito.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:*"
      Resource  = "${aws_s3_bucket.sito.arn}/*"
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.sito]
}

resource "aws_dynamodb_table" "iscrizioni" {
  name         = "iscrizioni"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "iscrizioneId"

  attribute {
    name = "iscrizioneId"
    type = "S"
  }
}

output "sito" {
  value = aws_s3_bucket.sito.bucket
}
