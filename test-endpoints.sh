#!/bin/bash

echo "🧪 Test des endpoints"
echo "════════════════════════════════════════════════"
echo ""

# Récupérer l'URL ngrok
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$NGROK_URL" ]; then
    echo "❌ Ngrok n'est pas accessible"
    exit 1
fi

echo "✅ URL Ngrok: $NGROK_URL"
echo ""

# Test 1: Endpoint TwiML local
echo "1️⃣  Test endpoint TwiML local (http://localhost:8081/twiml)"
if curl -s http://localhost:8081/twiml > /dev/null 2>&1; then
    echo "   ✅ Accessible"
    WS_URL=$(curl -s http://localhost:8081/twiml | grep -o 'url="[^"]*"' | cut -d'"' -f2)
    echo "   📋 WebSocket URL dans TwiML: $WS_URL"
else
    echo "   ❌ Non accessible"
fi
echo ""

# Test 2: Endpoint TwiML via ngrok
echo "2️⃣  Test endpoint TwiML via ngrok ($NGROK_URL/twiml)"
if curl -s "$NGROK_URL/twiml" > /dev/null 2>&1; then
    echo "   ✅ Accessible"
    WS_URL_NGROK=$(curl -s "$NGROK_URL/twiml" | grep -o 'url="[^"]*"' | cut -d'"' -f2)
    echo "   📋 WebSocket URL dans TwiML: $WS_URL_NGROK"
    
    # Vérifier que c'est bien wss://
    if [[ $WS_URL_NGROK == wss://* ]]; then
        echo "   ✅ Utilise WSS (WebSocket Secure)"
    else
        echo "   ⚠️  N'utilise PAS WSS (devrait être wss://)"
    fi
else
    echo "   ❌ Non accessible"
    echo "   💡 Vérifiez que ngrok est actif et que l'URL est correcte"
fi
echo ""

# Test 3: Vérifier PUBLIC_URL dans .env
echo "3️⃣  Vérification PUBLIC_URL dans .env"
if [ -f "websocket-server/.env" ]; then
    ENV_URL=$(grep "PUBLIC_URL=" websocket-server/.env | cut -d'=' -f2 | tr -d ' ')
    if [ "$ENV_URL" == "$NGROK_URL" ]; then
        echo "   ✅ PUBLIC_URL correspond à l'URL ngrok"
    else
        echo "   ⚠️  PUBLIC_URL ne correspond PAS à l'URL ngrok"
        echo "   📋 PUBLIC_URL actuel: $ENV_URL"
        echo "   📋 URL ngrok actuelle: $NGROK_URL"
        echo "   💡 Mettez à jour PUBLIC_URL dans websocket-server/.env"
    fi
else
    echo "   ❌ Fichier .env non trouvé"
fi
echo ""

# Test 4: Vérifier le webhook Twilio
echo "4️⃣  Configuration du webhook Twilio"
echo "   📋 URL du webhook à configurer: $NGROK_URL/twiml"
echo "   💡 Allez dans Twilio Console → Phone Numbers → Votre numéro"
echo "   💡 Configurez 'A CALL COMES IN' avec cette URL"
echo ""

# Test 5: Vérifier les services
echo "5️⃣  Vérification des services"
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
    echo "   ✅ Ngrok (port 4040): ACTIF"
else
    echo "   ❌ Ngrok (port 4040): INACTIF"
fi
echo ""

echo "📋 Pour suivre les logs en temps réel:"
echo "   ./watch-all-logs.sh"
echo ""
echo "📋 Pour voir le guide de dépannage:"
echo "   cat TROUBLESHOOTING.md"



