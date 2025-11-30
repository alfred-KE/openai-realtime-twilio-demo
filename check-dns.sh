#!/bin/bash

echo "🔍 Vérification DNS pour app.aventure-studio.com"
echo "════════════════════════════════════════════════"
echo ""

DOMAIN="app.aventure-studio.com"
EXPECTED_IP="149.56.130.28"

# Vérifier avec dig
echo "📡 Résolution DNS:"
RESOLVED_IP=$(dig +short $DOMAIN @8.8.8.8 | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)

if [ -z "$RESOLVED_IP" ]; then
    echo "   ❌ Le domaine $DOMAIN ne résout pas encore"
    echo "   ⏳ Attendez quelques minutes pour la propagation DNS"
    exit 1
fi

echo "   Résolu vers: $RESOLVED_IP"

if [ "$RESOLVED_IP" = "$EXPECTED_IP" ]; then
    echo ""
    echo "✅ DNS configuré correctement !"
    echo "   Le domaine pointe vers: $EXPECTED_IP"
    echo ""
    echo "🚀 Vous pouvez maintenant configurer le SSL avec:"
    echo "   sudo certbot --nginx -d app.aventure-studio.com --non-interactive --agree-tos --redirect"
    exit 0
else
    echo ""
    echo "⚠️  Le DNS pointe vers: $RESOLVED_IP"
    echo "   Attendu: $EXPECTED_IP"
    echo ""
    echo "❌ Le DNS n'est pas encore correctement configuré"
    exit 1
fi





