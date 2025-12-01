# Guide de connexion du serveur MCP Twilio Conversations

Ce guide vous explique comment connecter le serveur MCP à différents clients compatibles.

## 📋 Prérequis

1. Le serveur MCP doit être compilé :
   ```bash
   cd mcp-server
   npm install
   npm run build
   ```

2. Vérifiez que le serveur fonctionne :
   ```bash
   ./test-server.sh
   ```

## 🔌 Connexion à Claude Desktop

Claude Desktop est l'application officielle d'Anthropic qui supporte MCP.

### Installation

1. Téléchargez Claude Desktop depuis [claude.ai/download](https://claude.ai/download)

2. Installez l'application selon votre système d'exploitation

### Configuration

1. **Localisez le fichier de configuration :**
   - **Linux/Mac** : `~/.config/claude_desktop_config.json`
   - **Windows** : `%APPDATA%\Claude\claude_desktop_config.json`

2. **Créez ou modifiez le fichier de configuration :**

   ```json
   {
     "mcpServers": {
       "twilio-conversations": {
         "command": "node",
         "args": ["/chemin/absolu/vers/KESIPInterface/mcp-server/dist/index.js"]
       }
     }
   }
   ```

   **Exemple avec chemin absolu :**
   ```json
   {
     "mcpServers": {
       "twilio-conversations": {
         "command": "node",
         "args": ["/home/ubuntu/KESIPInterface/mcp-server/dist/index.js"]
       }
     }
   }
   ```

3. **Trouvez le chemin absolu :**
   ```bash
   cd /home/ubuntu/KESIPInterface
   realpath mcp-server/dist/index.js
   ```

4. **Redémarrez Claude Desktop** pour que les changements prennent effet

### Utilisation

Une fois configuré, vous pouvez demander à Claude :
- "Liste les conversations Twilio"
- "Montre-moi les détails de la conversation avec le stream SID X"
- "Recherche les conversations du 1er décembre"
- "Trouve les conversations de l'appelant +33123456789"

## 🔌 Connexion à Cursor

Cursor est un éditeur de code qui supporte MCP.

### Configuration

1. Ouvrez les paramètres de Cursor (Settings)

2. Cherchez "MCP" ou "Model Context Protocol"

3. Ajoutez la configuration suivante dans les paramètres MCP :

   ```json
   {
     "mcpServers": {
       "twilio-conversations": {
         "command": "node",
         "args": ["/chemin/absolu/vers/KESIPInterface/mcp-server/dist/index.js"]
       }
     }
   }
   ```

4. Redémarrez Cursor

## 🔌 Connexion via l'API MCP (pour développement)

Si vous voulez tester le serveur directement, vous pouvez utiliser un client MCP en ligne de commande.

### Installation d'un client de test

```bash
npm install -g @modelcontextprotocol/inspector
```

### Test en ligne de commande

```bash
# Le serveur MCP communique via stdio
node mcp-server/dist/index.js
```

## 🧪 Vérification de la connexion

### Dans Claude Desktop

1. Ouvrez Claude Desktop
2. Regardez les logs (si disponibles) pour voir si le serveur MCP est connecté
3. Posez une question comme : "Quels outils MCP sont disponibles ?"
4. Claude devrait lister les outils du serveur Twilio Conversations

### Test manuel

Vous pouvez tester que le serveur répond correctement :

```bash
# Test basique (le serveur doit démarrer sans erreur)
cd mcp-server
timeout 2 node dist/index.js 2>&1 | head -10
```

## 🛠️ Outils disponibles

Une fois connecté, vous aurez accès à ces outils :

### 1. `get_conversations`
Liste les conversations avec filtres optionnels.

**Exemple d'utilisation dans Claude :**
```
Utilise l'outil get_conversations pour lister les 10 dernières conversations
```

### 2. `get_conversation_details`
Récupère les détails complets d'une conversation.

**Exemple :**
```
Récupère les détails de la conversation avec le stream SID CA1234567890abcdef
```

### 3. `search_conversations`
Recherche par date.

**Exemple :**
```
Recherche les conversations entre le 2024-12-01 et 2024-12-02
```

### 4. `search_conversations_by_caller`
Recherche par numéro de l'appelant.

**Exemple :**
```
Trouve toutes les conversations de l'appelant +33123456789
```

## 📚 Ressources disponibles

Les 100 dernières conversations sont disponibles comme ressources avec l'URI :
```
conversation://{streamSid}
```

Vous pouvez demander à Claude :
```
Lis la ressource conversation://CA1234567890abcdef
```

## 🔍 Dépannage

### Le serveur ne démarre pas

1. Vérifiez que Node.js est installé :
   ```bash
   node --version
   ```

2. Vérifiez que le serveur est compilé :
   ```bash
   ls -la mcp-server/dist/index.js
   ```

3. Vérifiez que la base de données existe :
   ```bash
   ls -la websocket-server/data/conversations.db
   ```

### Le client ne trouve pas le serveur

1. Vérifiez le chemin absolu dans la configuration :
   ```bash
   realpath mcp-server/dist/index.js
   ```

2. Vérifiez que le fichier de configuration est au bon endroit :
   - Linux/Mac : `~/.config/claude_desktop_config.json`
   - Windows : `%APPDATA%\Claude\claude_desktop_config.json`

3. Vérifiez la syntaxe JSON (utilisez un validateur JSON)

### Le serveur démarre mais ne retourne pas de données

1. Vérifiez qu'il y a des conversations dans la base :
   ```bash
   sqlite3 websocket-server/data/conversations.db "SELECT COUNT(*) FROM conversations;"
   ```

2. Vérifiez les permissions de la base de données :
   ```bash
   ls -la websocket-server/data/conversations.db
   ```

## 📝 Exemples de questions pour Claude

Une fois connecté, vous pouvez poser ces questions :

- "Liste les 5 dernières conversations Twilio"
- "Montre-moi les détails de la dernière conversation"
- "Combien de conversations y a-t-il aujourd'hui ?"
- "Quels sont les numéros d'appelants les plus fréquents ?"
- "Résume la conversation avec le stream SID CA1234567890abcdef"
- "Trouve toutes les conversations de l'appelant +33123456789"
- "Quelles conversations ont eu lieu entre le 1er et le 2 décembre ?"

## 🔐 Sécurité

⚠️ **Important** : Le serveur MCP a accès direct à votre base de données. Assurez-vous que :
- Seuls les clients de confiance peuvent se connecter
- La base de données est protégée (permissions de fichiers)
- Vous ne partagez pas votre configuration avec des tiers

## 📞 Support

Si vous rencontrez des problèmes :
1. Vérifiez les logs du client MCP
2. Testez le serveur avec `./test-server.sh`
3. Vérifiez que la base de données contient des données

