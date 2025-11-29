#!/bin/bash

echo "📋 Suivi des logs en temps réel"
echo "Appuyez sur Ctrl+C pour arrêter"
echo ""

# Vérifier que les fichiers de logs existent
if [ ! -f "logs/webapp.log" ] && [ ! -f "logs/websocket-server.log" ]; then
    echo "❌ Aucun fichier de logs trouvé."
    echo "💡 Lancez d'abord: ./restart-with-logs.sh"
    exit 1
fi

# Créer les fichiers s'ils n'existent pas encore
touch logs/webapp.log logs/websocket-server.log logs/ngrok.log 2>/dev/null

# Utiliser tail -f avec des processus en arrière-plan pour chaque fichier
# avec des préfixes de couleur distincts

(tail -f logs/webapp.log 2>/dev/null | while read line; do echo -e "\033[0;34m[WEBAPP]\033[0m $line"; done) &
PID1=$!

(tail -f logs/websocket-server.log 2>/dev/null | while read line; do echo -e "\033[0;32m[WS-SERVER]\033[0m $line"; done) &
PID2=$!

(tail -f logs/ngrok.log 2>/dev/null | while read line; do echo -e "\033[0;33m[NGROK]\033[0m $line"; done) &
PID3=$!

# Attendre et nettoyer à la sortie
trap "kill $PID1 $PID2 $PID3 2>/dev/null; exit" INT TERM

wait

