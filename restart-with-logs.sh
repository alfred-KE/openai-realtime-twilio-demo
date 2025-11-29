#!/bin/bash

# Créer le dossier logs s'il n'existe pas
mkdir -p logs

echo "🛑 Arrêt des services existants..."
pkill -f "next dev" 2>/dev/null
pkill -f "ts-node src/server.ts" 2>/dev/null
pkill -f "ngrok http 8081" 2>/dev/null
sleep 2

echo "🚀 Lancement des services avec logs..."
echo ""

# Lancer webapp avec logs
cd webapp
npm run dev > ../logs/webapp.log 2>&1 &
WEBAPP_PID=$!
echo "✅ Webapp lancé (PID: $WEBAPP_PID) - logs: logs/webapp.log"
cd ..

# Lancer websocket-server avec logs
cd websocket-server
npm run dev > ../logs/websocket-server.log 2>&1 &
WS_PID=$!
echo "✅ Websocket-server lancé (PID: $WS_PID) - logs: logs/websocket-server.log"
cd ..

# Lancer ngrok (depuis le répertoire racine)
ngrok http 8081 > logs/ngrok.log 2>&1 &
NGROK_PID=$!
echo "✅ Ngrok lancé (PID: $NGROK_PID) - logs: logs/ngrok.log"

echo ""
echo "📋 Pour suivre les logs en temps réel, utilisez:"
echo "   tail -f logs/webapp.log logs/websocket-server.log"
echo ""
echo "   Ou utilisez le script: ./watch-all-logs.sh"
echo ""

sleep 3

# Vérifier que les services sont actifs
if kill -0 $WEBAPP_PID 2>/dev/null; then
    echo "✅ Webapp: OK"
else
    echo "❌ Webapp: ERREUR - voir logs/webapp.log"
fi

if kill -0 $WS_PID 2>/dev/null; then
    echo "✅ Websocket-server: OK"
else
    echo "❌ Websocket-server: ERREUR - voir logs/websocket-server.log"
fi

if kill -0 $NGROK_PID 2>/dev/null; then
    echo "✅ Ngrok: OK"
else
    echo "❌ Ngrok: ERREUR - voir logs/ngrok.log"
fi

