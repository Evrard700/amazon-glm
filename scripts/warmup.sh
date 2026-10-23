#!/bin/bash
# ============================================================
# WARMUP DEV SERVER — pré-compilation de toutes les routes
# après un redémarrage (le mode dev compile chaque route à sa
# première visite : 1-8 s). Ce script "chauffe" le serveur en
# arrière-plan pour que l'utilisateur ne paie JAMAIS ce délai :
# la boutique et l'admin s'ouvrent instantanément.
# Usage : bash scripts/warmup.sh [cookies_file]
# ============================================================
BASE="http://localhost:3000"
WARM_LOG="${2:-/tmp/warmup.log}"
COOKIE_JAR="${1:-/tmp/warmup-cookies.txt}"

# --- Identifiants de warmup : lus depuis scripts/warmup.creds (gitignoré) ---
# Format du fichier :
#   WARMUP_EMAIL=…
#   WARMUP_PASSWORD=…
CREDS_FILE="$(dirname "$0")/warmup.creds"
WARMUP_EMAIL=""
WARMUP_PASSWORD=""
[ -f "$CREDS_FILE" ] && . "$CREDS_FILE"

echo "[$(date +%H:%M:%S)] Warmup démarré" >> "$WARM_LOG"

# 1) Pages publiques (compilation des coquilles + caches storefront)
for path in "/" "/catalogue" "/categories" "/panier" "/connexion" "/inscription" \
            "/products/ecouteurs-airsound-pods" "/account/referrals" \
            "/api/newsletter" ; do
  curl -s -o /dev/null --max-time 60 "$BASE$path" 2>/dev/null
  echo "[$(date +%H:%M:%S)] storefront $path" >> "$WARM_LOG"
done

# 2) Login admin (owner) pour chauffer les routes protégées
#    (ignoré si scripts/warmup.creds est absent — ex. après un clone GitHub)
if [ -n "$WARMUP_EMAIL" ] && [ -n "$WARMUP_PASSWORD" ]; then
  curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$WARMUP_EMAIL\",\"password\":\"$WARMUP_PASSWORD\"}" \
    -o /dev/null --max-time 60 2>/dev/null
else
  echo "[$(date +%H:%M:%S)] warmup: identifiants absents, section admin ignorée" >> "$WARM_LOG"
fi

# 3) Pages + APIs admin (compilation + remplissage des caches 15 s)
for path in "/admin" "/admin/orders" "/admin/customers" "/admin/products" \
            "/admin/categories" "/admin/collections" "/admin/inventory" \
            "/admin/analytics" "/admin/storefront" "/admin/storefront/theme" \
            "/admin/settings" "/admin/users" "/admin/roles" "/admin/activity-logs" \
            "/admin/marketing/coupons" "/admin/marketing/reviews" \
            "/admin/marketing/abandoned-carts" "/admin/marketing/promotions" \
            "/admin/marketing/upsells" "/admin/marketing/referral-program" \
            "/admin/marketing/campaigns" "/admin/products/new" \
            "/api/admin/users/me" "/api/admin/dashboard/stats?days=7" \
            "/api/admin/orders" "/api/admin/customers" \
            "/api/admin/products?take=500" "/api/admin/products?deleted=1" \
            "/api/admin/categories" "/api/admin/collections" "/api/admin/inventory" \
            "/api/admin/analytics?days=30" "/api/admin/pages" "/api/admin/theme" \
            "/api/admin/marketing/coupons" "/api/admin/marketing/reviews" \
            "/api/admin/marketing/abandoned-carts" ; do
  curl -s -b "$COOKIE_JAR" -o /dev/null --max-time 60 "$BASE$path" 2>/dev/null
  echo "[$(date +%H:%M:%S)] admin $path" >> "$WARM_LOG"
done

echo "[$(date +%H:%M:%S)] Warmup TERMINÉ" >> "$WARM_LOG"
