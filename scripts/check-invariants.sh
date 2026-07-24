#!/usr/bin/env bash
# check-invariants.sh — Loosening detector for the SOP website (KPI → salary).
# Scans the git diff for signs a change makes salary/access controls LOOSER.
# Flags for human review EVEN IF tests pass.
#
# Exit 0 = clean. Exit 1 = suspicious → STOP, get Champ to approve.
#
# Usage:
#   ./scripts/check-invariants.sh            # working tree + staged vs HEAD
#   ./scripts/check-invariants.sh --staged
#   ./scripts/check-invariants.sh <base>
#
# Why: this repo docks real salary. auto-fix optimizes "tests green", not
# "did the salary formula get looser". Removing a guard passes tests MORE easily.

set -euo pipefail
cd "$(dirname "$0")/.."

RANGE=""
case "${1:-}" in
  --staged) RANGE="--cached" ;;
  "") RANGE="HEAD" ;;
  *) RANGE="$1" ;;
esac

DIFF="$(git diff $RANGE -- . 2>/dev/null || true)"
if [ -z "$DIFF" ]; then echo "✅ no diff to check"; exit 0; fi

REMOVED="$(printf '%s\n' "$DIFF" | grep '^-' | grep -v '^---' || true)"
ADDED="$(printf '%s\n' "$DIFF" | grep '^+' | grep -v '^+++' || true)"

HITS=0
flag() { HITS=$((HITS+1)); echo "  🚩 [$1] $2"; }

echo "── Loosening detector — SOP (KPI/salary) ──"

# 1. Salary threshold / formula
if printf '%s\n' "$REMOVED" | grep -Eq 'totalScore *>= *50|>= *50|calculateSalaryDeduction'; then
  flag CRITICAL "touched the salary threshold (>= 50 guard / calculateSalaryDeduction). See INVARIANTS #1"
fi
if printf '%s\n' "$DIFF" | grep -Eq 'Math\.ceil.*50|Math\.floor.*50'; then
  printf '%s\n' "$REMOVED" | grep -Eq 'Math\.ceil' && printf '%s\n' "$ADDED" | grep -Eq 'Math\.floor' \
    && flag CRITICAL "changed Math.ceil→Math.floor on the points-short calc — under-docks salary. See INVARIANTS #1"
fi
if printf '%s\n' "$DIFF" | grep -Eq '\b500\b' && printf '%s\n' "$DIFF" | grep -Eiq 'deduct|salary|point'; then
  flag WARN "touched the 500 THB/point rate near salary logic. Verify against payroll. See INVARIANTS #1"
fi

# 2. Category floor/cap
if printf '%s\n' "$ADDED" | grep -Eq 'Math\.max\(0'; then
  printf '%s\n' "$ADDED" | grep -Eiq 'category' && flag CRITICAL "floored a category at 0 — hides severe failures. Categories go negative by design. See INVARIANTS #2"
fi

# 3. Persisted salary (should be computed only)
if printf '%s\n' "$ADDED" | grep -Eiq 'salaryDeduction|salary_amount|dockAmount' && printf '%s\n' "$ADDED" | grep -Eiq 'restUpsert|setDoc|addDoc|PATCH'; then
  flag CRITICAL "persisting a salary amount to Firestore — must stay computed-only. See INVARIANTS #3"
fi

# 4. Auth / owner / allow-list
if printf '%s\n' "$REMOVED" | grep -Eiq 'isOwner|OWNER_EMAILS|requireUser|sopUserForEmail|verifySession'; then
  flag CRITICAL "removed an auth/owner/allow-list check. See INVARIANTS #4"
fi
if printf '%s\n' "$ADDED" | grep -Eiq 'localStorage.*(role|isOwner|admin)'; then
  flag CRITICAL "caching role/isOwner in localStorage — client-forgeable. See INVARIANTS #4"
fi

# 5. Firestore write gate / append vs upsert
if printf '%s\n' "$ADDED" | grep -Eiq 'FieldValue\.increment|\+= *count|append'; then
  printf '%s\n' "$DIFF" | grep -Eiq 'record|sop_service|sop_assigned' && flag WARN "switched to increment/append on records — double-counting risk (must upsert). See INVARIANTS #5"
fi

# 6. CSV upload — path traversal / gate
if printf '%s\n' "$ADDED" | grep -Eq '\.\./|path\.join.*formData|join\(.*req'; then
  flag CRITICAL "possible path traversal in file write. See INVARIANTS #6"
fi

# 7. Evidence image checks
if printf '%s\n' "$REMOVED" | grep -Eiq "startsWith\('image|startsWith\(\"image|5 *\* *1024"; then
  flag WARN "removed evidence image type/size check. See INVARIANTS #7"
fi

# 8. Storage / Firestore rule opened
if printf '%s\n' "$ADDED" | grep -Eq 'allow (read|write).*if true'; then
  flag CRITICAL "opened a Storage/Firestore rule (if true). See INVARIANTS #5,#7"
fi

# 9. Stock grace-period date moved earlier / penalty raised
if printf '%s\n' "$DIFF" | grep -Eq 'STOCK_DIFFERENCE_DEDUCTION_START'; then
  flag WARN "changed the stock grace-period start date. Verify it is not backdated. See INVARIANTS #8"
fi

# 10. Generic guard removal
GUARD_DEL="$(printf '%s\n' "$REMOVED" | grep -Ec '^-\s*(if|throw|return|redirect)' || true)"
if [ "${GUARD_DEL:-0}" -gt 0 ]; then
  flag WARN "deleted $GUARD_DEL guard-like line(s) (if/throw/return/redirect). Confirm each was replaced."
fi

echo "────────────────────────────────────────"
if [ "$HITS" -eq 0 ]; then
  echo "✅ no loosening signals. (Still confirm against INVARIANTS.md if you touched performance-score/auth/owner.)"
  exit 0
else
  echo "⚠️  $HITS loosening signal(s). Do NOT auto-deploy."
  echo "   → A CRITICAL flag requires Champ's explicit approval, even if tests pass."
  exit 1
fi
