#!/bin/bash

echo "🔍 DIAGNOSTIC - Vérification de l'état du système"
echo "════════════════════════════════════════════════"
echo ""

# Vérifier les services
echo "📊 Services en cours d'exécution:"
ps aux | grep -E "(next dev|ts-node.*server|ngrok)" | grep -v grep | wc -l | xargs -I {} echo "   Processus actifs: {}"
echo ""

# Vérifier les ports
echo "🔌 Ports ouverts:"
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "   ✅ Webapp (port 3000): ACTIF"
else
    echo "   ❌ Webapp (port 3000): INACTIF"
fi

if curl -s http://localhost:8081 > /dev/null 2>&1; then
    echo "   ✅ Websocket-server (port 8081): ACTIF"
else
    echo "   ❌ Websocket-server (port 8081): INACTIF"
fi

if curl -s http://localhost:4040/api/tunnels > /dev/null 2>&1; then
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ ! -z "$NGROK_URL" ]; then
        echo "   ✅ Ngrok: ACTIF - $NGROK_URL"
    else
        echo "   ⚠️  Ngrok: ACTIF mais URL non trouvée"
    fi
else
    echo "   ❌ Ngrok: INACTIF"
fi
echo ""

# Vérifier les logs récents
echo "📋 Événements récents dans les logs:"
echo "   ── Websocket-server ──"
if [ -f "logs/websocket-server.log" ]; then
    tail -n 50 logs/websocket-server.log 2>/dev/null | grep -E "(Frontend logs connection|Twilio|OpenAI|Connecting|Cannot connect|error|Error|Server running)" | tail -5
else
    echo "   ⚠️  Fichier de log non trouvé"
fi
echo ""

# Vérifier la configuration
echo "⚙️  Configuration:"
if [ -f "websocket-server/.env" ]; then
    if grep -q "OPENAI_API_KEY=" websocket-server/.env 2>/dev/null; then
        API_KEY_LEN=$(grep "OPENAI_API_KEY=" websocket-server/.env | cut -d'=' -f2 | tr -d ' ' | wc -c)
        if [ $API_KEY_LEN -gt 20 ]; then
            echo "   ✅ OPENAI_API_KEY: Configuré (${API_KEY_LEN} caractères)"
        else
            echo "   ❌ OPENAI_API_KEY: TROP COURT ou manquant"
        fi
    else
        echo "   ❌ OPENAI_API_KEY: Non trouvé dans .env"
    fi
    
    if grep -q "PUBLIC_URL=" websocket-server/.env 2>/dev/null; then
        PUBLIC_URL=$(grep "PUBLIC_URL=" websocket-server/.env | cut -d'=' -f2 | tr -d ' ')
        if [ ! -z "$PUBLIC_URL" ]; then
            echo "   ✅ PUBLIC_URL: $PUBLIC_URL"
        else
            echo "   ⚠️  PUBLIC_URL: Vide"
        fi
    else
        echo "   ⚠️  PUBLIC_URL: Non configuré"
    fi
else
    echo "   ❌ Fichier .env non trouvé"
fi
echo ""

# Vérifier les connexions WebSocket
echo "🔗 État des connexions:"
echo "   Pour vérifier les connexions actives, consultez les logs en temps réel:"
echo "   ./watch-all-logs.sh"
echo ""

# Recommandations
echo "💡 Recommandations:"
echo "   1. Si vous voyez 'Connected' mais pas de réponse OpenAI:"
echo "      → Vérifiez qu'un appel Twilio a été passé"
echo "      → Vérifiez les logs pour 'Twilio stream started'"
echo "      → Vérifiez les logs pour 'Connecting to OpenAI Realtime API...'"
echo ""
echo "   2. Pour suivre les logs en temps réel:"
echo "      ./watch-all-logs.sh"
echo ""
echo "   3. Pour voir le diagnostic complet:"
echo "      cat DIAGNOSTIC.md"

