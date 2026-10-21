#!/usr/bin/env bash
# Installs the malware pre-push hook into this clone. Safe to re-run; keeps any existing pre-push hook.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
hooks="$(git -C "$root" rev-parse --git-path hooks)"
case "$hooks" in /*) ;; *) hooks="$root/$hooks" ;; esac
mkdir -p "$hooks"
hook="$hooks/pre-push"
marker="# malware-scan pre-push (scripts/security)"

if [ -f "$hook" ] && grep -qF "$marker" "$hook"; then
  echo "pre-push hook already installed"; exit 0
fi
if [ -f "$hook" ]; then
  mv "$hook" "$hooks/pre-push.local"                            # keep the existing hook and chain to it
fi
cat > "$hook" <<EOF
#!/usr/bin/env bash
$marker
input="\$(cat)"
printf '%s\n' "\$input" | bash "\$(git rev-parse --show-toplevel)/scripts/security/pre-push" "\$@" || exit 1
if [ -x "\$(dirname "\$0")/pre-push.local" ]; then printf '%s\n' "\$input" | "\$(dirname "\$0")/pre-push.local" "\$@"; fi
EOF
chmod +x "$hook"
echo "pre-push hook installed at $hook"
