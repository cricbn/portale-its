#!/usr/bin/env python3
"""Policy-as-code: tag di governance obbligatori nel template CloudFormation.

Perche esiste questo script invece di un check checkov.
--------------------------------------------------------
La policy equivalente per Terraform e .checkov/policies/owner_tag_terraform.yaml
ed e eseguita da checkov. Per CloudFormation non e possibile: nella versione
3.x il runner CloudFormation di checkov ha load_external_checks() come no-op
(restituisce None), quindi NESSUNA policy personalizzata - ne YAML ne Python -
viene mai caricata per quel framework. Verificato sulla 3.3.8.

Senza questo script il template CloudFormation resterebbe l'unico artefatto
non coperto dalla regola sul tag Owner, che e proprio la lacuna IAC-05 /
DAT-01 rilevata dalla perizia.

Uso: python verifica_tag_cfn.py artifacts/portale-its.yaml
Esce con codice != 0 se una risorsa taggabile non dichiara Owner ed Env.
"""

import sys

import yaml

TAG_OBBLIGATORI = ("Owner", "Env")

# Risorse per cui il tag e significativo e supportato.
TIPI_DA_CONTROLLARE = (
    "AWS::S3::Bucket",
    "AWS::DynamoDB::Table",
)


class LoaderCloudFormation(yaml.SafeLoader):
    """SafeLoader che non si spaventa davanti a !Ref, !Sub, !GetAtt."""


def _intrinseca(loader, tag_suffix, node):
    # Il valore preciso non interessa: serve solo poter attraversare l'albero.
    if isinstance(node, yaml.ScalarNode):
        return {tag_suffix: loader.construct_scalar(node)}
    if isinstance(node, yaml.SequenceNode):
        return {tag_suffix: loader.construct_sequence(node)}
    return {tag_suffix: loader.construct_mapping(node)}


LoaderCloudFormation.add_multi_constructor("!", _intrinseca)


def tag_presenti(risorsa):
    """Restituisce l'insieme dei tag di governance valorizzati sulla risorsa."""
    proprieta = risorsa.get("Properties") or {}
    tag = proprieta.get("Tags") or []
    if not isinstance(tag, list):
        return set()
    trovati = set()
    for voce in tag:
        if not isinstance(voce, dict):
            continue
        chiave, valore = voce.get("Key"), voce.get("Value")
        # Un !Ref a un parametro e un valore legittimo.
        if chiave in TAG_OBBLIGATORI and valore not in (None, "", {}):
            trovati.add(chiave)
    return trovati


def main(percorso):
    with open(percorso, encoding="utf-8") as f:
        template = yaml.load(f, Loader=LoaderCloudFormation)

    risorse = (template or {}).get("Resources") or {}
    errori = []
    controllate = 0

    for nome, risorsa in risorse.items():
        if not isinstance(risorsa, dict):
            continue
        if risorsa.get("Type") not in TIPI_DA_CONTROLLARE:
            continue
        controllate += 1
        mancanti = sorted(set(TAG_OBBLIGATORI) - tag_presenti(risorsa))
        if mancanti:
            errori.append(f"{nome} ({risorsa['Type']}): tag mancanti {', '.join(mancanti)}")
        else:
            print(f"  OK   {nome}: tag {', '.join(sorted(TAG_OBBLIGATORI))} presenti")

    if controllate == 0:
        print(f"ERRORE: nessuna risorsa taggabile trovata in {percorso}", file=sys.stderr)
        return 1

    if errori:
        print(f"\nPOLICY VIOLATA in {percorso}:", file=sys.stderr)
        for e in errori:
            print(f"  FAIL {e}", file=sys.stderr)
        print(
            "\nOgni bucket e ogni tabella deve dichiarare chi ne risponde "
            "(perizia IAC-05, DAT-01).",
            file=sys.stderr,
        )
        return 1

    print(f"\nPOLICY RISPETTATA: {controllate} risorse con tag di governance.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
