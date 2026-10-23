#!/bin/bash
# ============================================================
# WARMUP DEV SERVER — pré-compilation de toutes les routes
# après un démarrage (le mode dev compile chaque route à sa
# première visite : 1-8 s). Ce script "chauffe" le serveur en
# arrière-plan pour que l'utilisateur ne paie JAMAIS ce délai :
# la boutique et l'admin s'ouvrent instantanément.
#
# ANTI-DOUBLON : verrou par fichier — un SEUL warmup à la fois
# (le watchdog peut déclencher le sien pendant que celui-ci
# tourne : le second s'arrête immédiatement, sinon les deux
# compilent les mêmes routes en double et font exploser la
# mémoire → recyclages en cascade du serveur).
#
# RYTHME : 1 s de pause entre routes pour lisser la pression
# mémoire des compilations ; relance automatique d'une requête
# si le serveur redémarrait au même moment (watchdog).
#
# Authentification (routes protégées) :
#   1. scripts/warmup.token (jeton JWT signé localement) ;
#   2. scripts/warmup.creds (WARMUP_EMAIL/WARMUP_PASSWORD).
# Les deux fichiers sont gitignorés — jamais dans le dépôt.
#
# Usage : bash scripts/warmup.sh [cookies_file] [log_file]
# ============================================================
BASE="http://localhost:3000"
WARM_LOG="${2:-/tmp/warmup.log}"
COOKIE_JAR="${1:-/tmp/warmup-cookies.txt}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCK="/tmp/warmup.lock"

log_line() { echo "[$(date +%H:%M:%S)] $1" >> "$WARM_LOG"; }

# --- Verrou : un seul warmup à la fois ---
if [ -f "$LOCK" ]; then
  OLD_PID="$(cat "$LOCK" 2>/dev/null)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    log_line "un warmup tourne déjà (PID $OLD_PID) → cette instance s'arrête"
    exit 0
  fi
  # Verrou orphelin (processus mort) : on le reprend.
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

log_line "Warmup démarré (PID $$)"

# --- Construction de l'en-tête Cookie pour les routes protégées ---
AUTH_HEADER=""
TOKEN_FILE="$SCRIPT_DIR/warmup.token"
CREDS_FILE="$SCRIPT_DIR/warmup.creds"

if [ -f "$TOKEN_FILE" ]; then
  TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  if [ -n "$TOKEN" ]; then
    AUTH_HEADER="Cookie: tm_session=$TOKEN"
    log_line "auth : jeton warmup.token chargé"
  fi
fi

if [ -z "$AUTH_HEADER" ] && [ -f "$CREDS_FILE" ]; then
  WARMUP_EMAIL=""
  WARMUP_PASSWORD=""
  . "$CREDS_FILE"
  if [ -n "$WARMUP_EMAIL" ] && [ -n "$WARMUP_PASSWORD" ]; then
    curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$WARMUP_EMAIL\",\"password\":\"$WARMUP_PASSWORD\"}" \
      -o /dev/null --max-time 60 2>/dev/null
    log_line "auth : connexion via warmup.creds"
  fi
fi

# Requête UNE fois, puis relance si le serveur était en redémarrage
# (code 000 = connexion refusée) : attend 15 s et retente.
warm_get() { # $1 = chemin, $2 = en-tête cookie (texte) ou vide, $3 = étiquette
  local code=""
  for attempt in 1 2; do
    if [ -n "$2" ]; then
      code="$(curl -s -H "$2" -o /dev/null -w "%{http_code}" --max-time 60 "$BASE$1" 2>/dev/null)"
    else
      code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "$BASE$1" 2>/dev/null)"
    fi
    [ "$code" != "000" ] && break
    log_line "$3 $1 : serveur en redémarrage (essai $attempt), pause 15 s…"
    sleep 15
  done
  log_line "$3 $1 → $code"
  sleep 1 # rythme mémoire : laisse la compilation se poser
}

# 1) Pages publiques de la boutique (coquilles + caches storefront)
for path in "/" "/catalogue" "/cart" "/login" "/register" "/checkout" \
            "/products/tilo-teste-08" "/products/tilo-78" \
            "/categories/electronique" "/categories/mode-accessoires" \
            "/categories/maison-cuisine" "/pages/a-propos" "/pages/faq" \
            "/pages/contact" "/sitemap.xml" \
            "/api/cart" "/api/auth/me" "/api/cart/upsell-offers" \
            "/api/search/suggestions?q=te" ; do
  warm_get "$path" "" "storefront"
done

# 2) Pages + APIs protégées (compte client + admin) — requiert AUTH
if [ -n "$AUTH_HEADER" ]; then
  for path in "/account" "/account/orders" "/account/downloads" \
              "/account/referrals" "/account/rewards" ; do
    warm_get "$path" "$AUTH_HEADER" "compte"
  done

  for path in "/admin" "/admin/orders" "/admin/customers" "/admin/products" \
              "/admin/products/new" "/admin/categories" "/admin/collections" \
              "/admin/inventory" "/admin/analytics" "/admin/storefront" \
              "/admin/storefront/theme" "/admin/settings" \
              "/admin/settings/payments" "/admin/settings/shipping" \
              "/admin/users" "/admin/roles" "/admin/activity-logs" \
              "/admin/marketing/coupons" "/admin/marketing/reviews" \
              "/admin/marketing/abandoned-carts" "/admin/marketing/promotions" \
              "/admin/marketing/upsells" "/admin/marketing/referral-program" \
              "/admin/marketing/full-refund" "/admin/marketing/campaigns" \
              "/api/admin/users/me" "/api/admin/dashboard/stats?days=7" \
              "/api/admin/dashboard/stats?days=30" "/api/admin/orders" \
              "/api/admin/customers" "/api/admin/products?take=500" \
              "/api/admin/products?deleted=1" "/api/admin/categories" \
              "/api/admin/collections" "/api/admin/inventory" \
              "/api/admin/analytics?days=30" "/api/admin/pages/light-data" \
              "/api/admin/pages" "/api/admin/theme" "/api/admin/settings" \
              "/api/admin/users" "/api/admin/roles" "/api/admin/activity" \
              "/api/admin/marketing/coupons" "/api/admin/marketing/reviews" \
              "/api/admin/marketing/abandoned-carts" \
              "/api/admin/marketing/promotions" "/api/admin/marketing/upsells" \
              "/api/admin/marketing/referral-program" \
              "/api/admin/marketing/full-refund-program" \
              "/api/admin/marketing/rewards" \
              "/api/admin/marketing/campaigns" \
              "/api/admin/marketing/products" \
              "/api/admin/marketing/clients" ; do
    warm_get "$path" "$AUTH_HEADER" "admin"
  done
else
  log_line "auth absente (warmup.token + warmup.creds introuvables) : section protégée ignorée"
fi

log_line "Warmup TERMINÉ (PID $$)"
