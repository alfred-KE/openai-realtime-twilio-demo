#!/bin/bash

# Script de test pour le serveur MCP
# Ce script teste les fonctionnalités de base du serveur

echo "🧪 Test du serveur MCP Twilio Conversations"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Vérifier que la base de données existe
DB_PATH="../websocket-server/data/conversations.db"
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Erreur: Base de données non trouvée: $DB_PATH"
    exit 1
fi
echo "✅ Base de données trouvée: $DB_PATH"
echo ""

# Vérifier que le serveur est compilé
if [ ! -f "dist/index.js" ]; then
    echo "❌ Erreur: Serveur non compilé. Exécutez: npm run build"
    exit 1
fi
echo "✅ Serveur compilé: dist/index.js"
echo ""

# Vérifier que Node.js peut exécuter le serveur
echo "🔍 Test de démarrage du serveur (timeout 2 secondes)..."
timeout 2 node dist/index.js 2>&1 | head -5 || echo "✅ Le serveur démarre (timeout attendu)"
echo ""

# Vérifier la structure de la base de données
echo "📊 Vérification de la base de données..."
CONV_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM conversations;" 2>/dev/null || echo "0")
echo "   Conversations dans la base: $CONV_COUNT"

if [ "$CONV_COUNT" -gt 0 ]; then
    echo "   Dernière conversation:"
    sqlite3 "$DB_PATH" "SELECT stream_sid, phone_number, caller_number, started_at FROM conversations ORDER BY started_at DESC LIMIT 1;" 2>/dev/null | while IFS='|' read -r sid phone caller date; do
        echo "     - Stream SID: $sid"
        echo "     - Numéro: $phone"
        echo "     - Appelant: ${caller:-N/A}"
        echo "     - Date: $date"
    done
fi
echo ""

echo "✅ Tests de base terminés"
echo ""
echo "💡 Pour tester avec un client MCP:"
echo "   1. Configurez le client (voir GUIDE-MCP.md)"
echo "   2. Redémarrez le client"
echo "   3. Utilisez les outils MCP pour accéder à l'historique"

