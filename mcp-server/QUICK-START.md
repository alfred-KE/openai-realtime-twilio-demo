# Guide de démarrage rapide - Serveur MCP Twilio

## 🚀 Configuration rapide pour Claude Desktop

### Étape 1 : Trouver le chemin absolu

```bash
cd /home/ubuntu/KESIPInterface
realpath mcp-server/dist/index.js
```

Copiez le chemin affiché (exemple : `/home/ubuntu/KESIPInterface/mcp-server/dist/index.js`)

### Étape 2 : Configurer Claude Desktop

**Linux/Mac :**
```bash
mkdir -p ~/.config
cat > ~/.config/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "twilio-conversations": {
      "command": "node",
      "args": ["/home/ubuntu/KESIPInterface/mcp-server/dist/index.js"]
    }
  }
}
EOF
```

**Windows (PowerShell) :**
```powershell
$configPath = "$env:APPDATA\Claude\claude_desktop_config.json"
$configDir = Split-Path $configPath
if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir }
@"
{
  "mcpServers": {
    "twilio-conversations": {
      "command": "node",
      "args": ["C:\\chemin\\vers\\KESIPInterface\\mcp-server\\dist\\index.js"]
    }
  }
}
"@ | Out-File -FilePath $configPath -Encoding utf8
```

⚠️ **Important** : Remplacez le chemin dans `args` par le chemin absolu de votre installation !

### Étape 3 : Redémarrer Claude Desktop

Fermez complètement Claude Desktop et relancez-le.

### Étape 4 : Tester

Dans Claude Desktop, posez cette question :
```
Quels outils MCP sont disponibles ?
```

Claude devrait lister les outils du serveur Twilio Conversations.

## 🧪 Test rapide

```bash
cd mcp-server
./test-server.sh
```

## 📝 Exemples de questions pour Claude

Une fois connecté, essayez :

- "Liste les 5 dernières conversations Twilio"
- "Combien de conversations y a-t-il dans la base de données ?"
- "Montre-moi les détails de la dernière conversation"
- "Recherche les conversations de l'appelant +33123456789"

## 🔍 Vérification

Pour vérifier que tout fonctionne :

1. **Le serveur démarre :**
   ```bash
   cd mcp-server
   timeout 2 node dist/index.js 2>&1 | grep "démarré"
   ```
   Devrait afficher : `Serveur MCP Twilio Conversations démarré`

2. **La base de données est accessible :**
   ```bash
   sqlite3 websocket-server/data/conversations.db "SELECT COUNT(*) FROM conversations;"
   ```

3. **Le fichier de configuration existe :**
   ```bash
   cat ~/.config/claude_desktop_config.json
   ```

## ❓ Problèmes courants

### "Le serveur ne démarre pas"
- Vérifiez que Node.js est installé : `node --version`
- Vérifiez que le serveur est compilé : `ls -la mcp-server/dist/index.js`
- Si besoin, recompilez : `cd mcp-server && npm run build`

### "Claude ne voit pas le serveur"
- Vérifiez le chemin absolu dans la configuration
- Redémarrez complètement Claude Desktop
- Vérifiez la syntaxe JSON (pas de virgule en trop)

### "Pas de données retournées"
- Vérifiez qu'il y a des conversations : `sqlite3 websocket-server/data/conversations.db "SELECT COUNT(*) FROM conversations;"`
- Si 0, passez quelques appels pour créer des conversations

## 📚 Documentation complète

Pour plus de détails, consultez `GUIDE-MCP.md`

