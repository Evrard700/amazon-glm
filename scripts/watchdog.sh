#!/bin/bash
# ============================================================
# WATCHDOG DU DEV SERVER — rend la boutique auto-réparante :
#   1. si le serveur dev ne répond plus → relance immédiate
#      (env Supabase explicite + cap mémoire + double-fork) ;
#   2. si next-server dépasse RSS_MAX Mo → recyclage propre
#      AVANT l'OOM du noyau (les sessions sont en DB, aucun
#      état utilisateur n'est perdu — seuls les caches mémoire
#      se reconstruisent en arrière-plan) ;
#   3. après chaque relance → warmup automatique des routes
#      (pré-compilation + remplissage des caches 15 s) pour
#      que la boutique reste INSTANTANÉE.
# Boucle passive (sleep), empreinte mémoire négligeable.
# ============================================================
# Plafond dynamique : scripts/rss-max.conf (modifiable à chaud, 2700 par défaut)
HEAP_MB=1300           # cap V8 pour next-server
CHECK_INTERVAL=20      # secondes entre les vérifications
PROJ=/home/z/my-project
LOG=/tmp/watchdog.log

# --- Secrets : lus depuis .env (JAMAIS codés en dur — .env est gitignoré) ---
if [ -f "$PROJ/.env" ]; then
  DB_URL=$(grep -E "^DATABASE_URL=" "$PROJ/.env" | head -1 | cut -d= -f2-)
  DIRECT_URL=$(grep -E "^DIRECT_URL=" "$PROJ/.env" | head -1 | cut -d= -f2-)
  SESSION_SECRET=$(grep -E "^SESSION_SECRET=" "$PROJ/.env" | head -1 | cut -d= -f2-)
fi
if [ -z "$DB_URL" ] || [ -z "$SESSION_SECRET" ]; then
  echo "[watchdog] ERREUR : DATABASE_URL / SESSION_SECRET introuvables dans $PROJ/.env" >> "$LOG"
  exit 1
fi

log() { echo "[$(date '+%m-%d %H:%M:%S')] $*" >> "$LOG"; }

start_server() {
  log "démarrage du serveur dev…"
  (
    cd "$PROJ" &&
    env DATABASE_URL="$DB_URL" DIRECT_URL="$DIRECT_URL" SESSION_SECRET="$SESSION_SECRET" \
      NODE_OPTIONS="--max-old-space-size=${HEAP_MB}" \
      setsid bash -c 'exec bun run dev' >/dev/null 2>&1 </dev/null &
  )
  # attend que le port réponde (max 90 s)
  for i in $(seq 1 45); do
    sleep 2
    if curl -s -o /dev/null --max-time 3 http://localhost:3000/ 2>/dev/null; then
      log "serveur opérationnel (${i}e essai)"
      # warmup en arrière-plan (pré-compilation + caches chauds)
      ( setsid bash -c "sleep 5; bash $PROJ/scripts/warmup.sh" >/dev/null 2>&1 & )
      return 0
    fi
  done
  log "ÉCHEC de démarrage après 90 s"
  return 1
}

RSS_MAX_MB="$(cat /home/z/my-project/scripts/rss-max.conf 2>/dev/null || echo 2700)"
log "watchdog démarré (RSS max ${RSS_MAX_MB} Mo, heap ${HEAP_MB} Mo — plafond modifiable à chaud via scripts/rss-max.conf)"

while true; do
  RSS_MAX_MB="$(cat /home/z/my-project/scripts/rss-max.conf 2>/dev/null || echo 2700)"
  # 1) serveur vivant ?
  if ! curl -s -o /dev/null --max-time 5 http://localhost:3000/ 2>/dev/null; then
    log "serveur inaccessible → relance"
    pkill -f "next dev" 2>/dev/null
    pkill -f "next-server" 2>/dev/null
    sleep 2
    start_server
    sleep 30
    continue
  fi

  # 2) next-server trop gourmand ? recyclage PROPRE avant l'OOM
  RSS=$(ps aux | grep "next-server" | grep -v grep | awk '{sum += $6} END {printf "%d", sum/1024}')
  if [ -n "$RSS" ] && [ "$RSS" -gt "$RSS_MAX_MB" ] 2>/dev/null; then
    log "RSS ${RSS} Mo > ${RSS_MAX_MB} Mo → recyclage contrôlé"
    pkill -f "next-server" 2>/dev/null
    pkill -f "next dev" 2>/dev/null
    sleep 3
    start_server
    sleep 30
    continue
  fi

  sleep "$CHECK_INTERVAL"
done
