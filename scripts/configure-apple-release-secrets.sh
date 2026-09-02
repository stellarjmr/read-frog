#!/bin/bash

set -euo pipefail
umask 077

repository="stellarjmr/read-frog"
certificate_path=""
notary_key_path=""
issuer_identifier=""

usage() {
  cat <<'EOF'
Usage:
  scripts/configure-apple-release-secrets.sh \
    --certificate /path/to/developer-id.p12 \
    --notary-key /path/to/AuthKey_KEYID.p8 \
    [--issuer APP_STORE_CONNECT_ISSUER_UUID] \
    [--repo OWNER/REPO]

The PKCS#12 password and a final confirmation are read interactively. Secret
values are validated locally and sent to GitHub through standard input; they
are never written to the repository or included in command-line arguments.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --certificate)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --certificate" >&2
        usage >&2
        exit 2
      fi
      certificate_path=$2
      shift 2
      ;;
    --notary-key)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --notary-key" >&2
        usage >&2
        exit 2
      fi
      notary_key_path=$2
      shift 2
      ;;
    --issuer)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --issuer" >&2
        usage >&2
        exit 2
      fi
      issuer_identifier=$2
      shift 2
      ;;
    --repo)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --repo" >&2
        usage >&2
        exit 2
      fi
      repository=$2
      shift 2
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$certificate_path" ] || [ -z "$notary_key_path" ]; then
  usage >&2
  exit 2
fi

if [ ! -f "$certificate_path" ]; then
  echo "PKCS#12 certificate not found: $certificate_path" >&2
  exit 1
fi
if [ ! -f "$notary_key_path" ]; then
  echo "App Store Connect private key not found: $notary_key_path" >&2
  exit 1
fi
if ! grep -Fq -- "-----BEGIN PRIVATE KEY-----" "$notary_key_path" ||
  ! grep -Fq -- "-----END PRIVATE KEY-----" "$notary_key_path"; then
  echo "The App Store Connect key is not a complete PEM private key" >&2
  exit 1
fi

notary_key_filename=${notary_key_path##*/}
if [[ "$notary_key_filename" =~ ^AuthKey_([A-Z0-9]+)\.p8$ ]]; then
  notary_key_identifier=${BASH_REMATCH[1]}
else
  echo "The notary key filename must use Apple's AuthKey_KEYID.p8 format" >&2
  exit 1
fi

if [ -z "$issuer_identifier" ]; then
  read -r -p "App Store Connect issuer UUID: " issuer_identifier
fi
if [[ ! "$issuer_identifier" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]]; then
  echo "The App Store Connect issuer ID must be a UUID" >&2
  exit 1
fi

if [[ ! "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "Repository must use OWNER/REPO format" >&2
  exit 1
fi

for command_name in gh openssl security xcrun uuidgen; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  fi
done
if ! xcrun --find notarytool >/dev/null 2>&1; then
  echo "notarytool is unavailable; install current Xcode Command Line Tools" >&2
  exit 1
fi
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login -h github.com -p https -s repo,workflow" >&2
  exit 1
fi
if ! gh api --silent "repos/$repository/actions/secrets/public-key"; then
  echo "GitHub CLI cannot manage Actions secrets for $repository" >&2
  exit 1
fi

read -r -s -p "PKCS#12 password: " certificate_password
printf "\n"
if [ -z "$certificate_password" ]; then
  echo "The PKCS#12 password cannot be empty" >&2
  exit 1
fi

temporary_directory=$(mktemp -d)
keychain_path="$temporary_directory/release-secrets.keychain-db"
rewrapped_certificate_path="$temporary_directory/identity.p12"
keychain_password=$(uuidgen | tr -d "-")

cleanup() {
  security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
  if [ -f "$rewrapped_certificate_path" ]; then
    unlink "$rewrapped_certificate_path"
  fi
  rmdir "$temporary_directory" >/dev/null 2>&1 || true
  unset certificate_password
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

security create-keychain -p "$keychain_password" "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"
# `security import -P` exposes its value in process arguments. Rewrap the
# identity through pipes so only this one-time password is passed to `security`.
openssl pkcs12 -export \
  -inkey <(
    printf "%s\n" "$certificate_password" |
      openssl pkcs12 -in "$certificate_path" -passin stdin -nodes -nocerts
  ) \
  -in <(
    printf "%s\n" "$certificate_password" |
      openssl pkcs12 -in "$certificate_path" -passin stdin -nokeys
  ) \
  -out "$rewrapped_certificate_path" \
  -passout "pass:$keychain_password" >/dev/null
security import "$rewrapped_certificate_path" \
  -k "$keychain_path" \
  -P "$keychain_password" \
  -T /usr/bin/codesign \
  -t agg -f pkcs12 >/dev/null
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s -k "$keychain_password" \
  "$keychain_path" >/dev/null

identities=$(security find-identity -v -p codesigning "$keychain_path")
signing_identities=$(printf "%s\n" "$identities" | awk -F'"' '/^[[:space:]]*[0-9]+\)/ { print $2 }')
identity_count=$(printf "%s\n" "$signing_identities" | awk 'NF { count++ } END { print count + 0 }')
if [ "$identity_count" -ne 1 ]; then
  echo "Expected exactly one code-signing identity in the PKCS#12 file; found $identity_count" >&2
  printf "%s\n" "$identities" >&2
  exit 1
fi

signing_identity=$signing_identities
case "$signing_identity" in
  "Developer ID Application: "*) ;;
  *)
    echo "The certificate is not a Developer ID Application identity: $signing_identity" >&2
    exit 1
    ;;
esac

team_identifier=$(printf "%s\n" "$signing_identity" | sed -n 's/.*(\([A-Z0-9][A-Z0-9]*\))$/\1/p')
if [[ ! "$team_identifier" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "Unable to derive a ten-character Apple Team ID from: $signing_identity" >&2
  exit 1
fi

echo "Validating App Store Connect credentials with Apple's notary service..."
xcrun notarytool history \
  --key "$notary_key_path" \
  --key-id "$notary_key_identifier" \
  --issuer "$issuer_identifier" >/dev/null

printf "\nRelease credential summary:\n"
printf "  Repository: %s\n" "$repository"
printf "  Signing identity: %s\n" "$signing_identity"
printf "  Team ID: %s\n" "$team_identifier"
printf "  Notary key ID: %s\n" "$notary_key_identifier"
printf "  Notary issuer: %s\n" "$issuer_identifier"
read -r -p "Upload these seven GitHub Actions secrets? [y/N] " confirmation
case "$confirmation" in
  y | Y | yes | YES) ;;
  *)
    echo "No GitHub secrets were changed"
    exit 0
    ;;
esac

/usr/bin/base64 < "$certificate_path" |
  gh secret set MACOS_CERTIFICATE_P12 --app actions --repo "$repository"
printf "%s" "$certificate_password" |
  gh secret set MACOS_CERTIFICATE_PASSWORD --app actions --repo "$repository"
printf "%s" "$signing_identity" |
  gh secret set MACOS_SIGNING_IDENTITY --app actions --repo "$repository"
printf "%s" "$team_identifier" |
  gh secret set APPLE_TEAM_ID --app actions --repo "$repository"
printf "%s" "$notary_key_identifier" |
  gh secret set APPLE_NOTARY_KEY_ID --app actions --repo "$repository"
printf "%s" "$issuer_identifier" |
  gh secret set APPLE_NOTARY_ISSUER_ID --app actions --repo "$repository"
gh secret set APPLE_NOTARY_PRIVATE_KEY --app actions --repo "$repository" < "$notary_key_path"

echo "Configured and validated Apple release secrets for $repository"
