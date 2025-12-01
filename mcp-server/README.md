# Serveur MCP pour l'historique des conversations Twilio

Ce serveur MCP (Model Context Protocol) expose l'historique des conversations Twilio pour permettre aux assistants IA d'y accéder.

## Installation

```bash
cd mcp-server
npm install
npm run build
```

## Utilisation

### En mode développement

```bash
npm run dev
```

### En production

```bash
npm start
```

## Configuration pour Claude Desktop

Ajoutez ce serveur dans votre configuration Claude Desktop (`~/.config/claude_desktop_config.json` sur Linux/Mac ou `%APPDATA%\Claude\claude_desktop_config.json` sur Windows) :

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

## Outils disponibles

### `get_conversations`
Récupère la liste des conversations avec filtres optionnels.

**Paramètres :**
- `phoneNumber` (optionnel) : Filtrer par numéro de téléphone
- `phoneNumberSid` (optionnel) : Filtrer par SID du numéro
- `limit` (optionnel, défaut: 50) : Nombre maximum de résultats

### `get_conversation_details`
Récupère les détails complets d'une conversation avec tous ses messages.

**Paramètres :**
- `streamSid` (requis) : Stream SID de la conversation

### `search_conversations`
Recherche des conversations par date.

**Paramètres :**
- `startDate` (optionnel) : Date de début (format ISO)
- `endDate` (optionnel) : Date de fin (format ISO)
- `limit` (optionnel, défaut: 50) : Nombre maximum de résultats

### `search_conversations_by_caller`
Recherche des conversations par numéro de l'appelant.

**Paramètres :**
- `callerNumber` (requis) : Numéro de téléphone de l'appelant
- `limit` (optionnel, défaut: 50) : Nombre maximum de résultats

## Ressources disponibles

Les 100 dernières conversations sont disponibles comme ressources avec l'URI `conversation://{streamSid}`.

Chaque ressource contient :
- Les métadonnées de la conversation (numéro appelé, numéro appelant, dates, durée, etc.)
- Tous les messages de la conversation formatés en texte

