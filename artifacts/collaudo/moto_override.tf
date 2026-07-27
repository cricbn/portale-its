# Configurazione di COLLAUDO su finto-AWS (moto). Non e codice di produzione.
#
# Sta in artifacts/collaudo/ e non accanto a main.tf apposta: la perizia
# (IAC-02) rilevava endpoint 127.0.0.1 e credenziali "test" dentro il codice
# che governa la produzione. Qui l'override e isolato, dichiarato e usato solo
# dal job di collaudo, che lo copia in una cartella temporanea insieme a
# main.tf.
#
# IL NOME DEL FILE E VINCOLANTE: Terraform tratta come override solo i file
# chiamati "override.tf" o che finiscono in "_override.tf" (underscore). Con
# un trattino verrebbe letto come configurazione normale e il blocco provider
# qui sotto andrebbe in conflitto con quello di main.tf ("Duplicate provider
# configuration"). Non rinominare questo file.
#
# Le credenziali "test" non sono un segreto: moto accetta qualunque valore e
# non esiste alcun account AWS dietro questo endpoint.

provider "aws" {
  region                      = "eu-south-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  skip_region_validation      = true
  s3_use_path_style           = true

  endpoints {
    s3       = "http://127.0.0.1:5000"
    dynamodb = "http://127.0.0.1:5000"
    sts      = "http://127.0.0.1:5000"
  }
}
