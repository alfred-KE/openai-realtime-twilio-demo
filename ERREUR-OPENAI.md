# 🚨 ERREUR OPENAI DÉTECTÉE

## ❌ Erreur identifiée

```
Model error: {
  type: 'error',
  event_id: 'event_ChHoYgjNyV77BzP1pTFWV',
  error: {
    type: 'invalid_request_error',
    code: 'invalid_api_key',
    message: 'Incorrect API key provided: sk-proj-...sQoA. You can find your API key at https://platform.openai.com/account/api-keys.',
    param: null,
    event_id: null
  }
}
OpenAI Realtime API closed: 3000 invalid_request_error.invalid_api_key
```

## 🔍 Analyse

**Code d'erreur:** `invalid_api_key`  
**Type:** `invalid_request_error`  
**Code de fermeture WebSocket:** `3000`

### Causes possibles :

1. **Clé API expirée ou révoquée**
   - La clé API a peut-être été supprimée ou désactivée
   - Vérifiez sur https://platform.openai.com/account/api-keys

2. **Clé API sans permissions Realtime API**
   - La clé API peut ne pas avoir accès à la Realtime API
   - Vérifiez les permissions de la clé

3. **Clé API incorrecte ou mal copiée**
   - Il peut y avoir des espaces ou caractères invisibles
   - La clé peut être tronquée

4. **Format de clé incorrect**
   - La clé doit commencer par `sk-proj-` pour les nouvelles clés
   - Vérifiez le format

## ✅ Solutions

### 1. Vérifier la clé API sur OpenAI

1. Allez sur https://platform.openai.com/account/api-keys
2. Vérifiez que la clé existe et est active
3. Si nécessaire, créez une nouvelle clé

### 2. Vérifier le format dans .env

```bash
# Vérifier qu'il n'y a pas d'espaces
cat websocket-server/.env | grep OPENAI_API_KEY

# La ligne doit être exactement :
# OPENAI_API_KEY=sk-proj-... (sans espaces avant ou après le =)
```

### 3. Mettre à jour la clé API

1. Créez une nouvelle clé sur https://platform.openai.com/account/api-keys
2. Copiez la clé complète (commence par `sk-proj-`)
3. Mettez à jour `websocket-server/.env` :
   ```bash
   OPENAI_API_KEY=votre_nouvelle_cle_ici
   ```
4. **IMPORTANT:** Pas d'espaces autour du `=`
5. Redémarrez les services :
   ```bash
   ./restart-with-logs.sh
   ```

### 4. Vérifier les permissions

Assurez-vous que :
- La clé API a accès à la Realtime API
- Votre compte OpenAI a les permissions nécessaires
- Vous avez des crédits disponibles

## 🧪 Test de la clé API

Pour tester si la clé fonctionne, vous pouvez utiliser curl :

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

Si cela retourne une erreur `invalid_api_key`, la clé est invalide.

## 📋 Checklist

- [ ] La clé API existe sur https://platform.openai.com/account/api-keys
- [ ] La clé est active (pas supprimée)
- [ ] Le format dans `.env` est correct (pas d'espaces)
- [ ] La clé commence par `sk-proj-`
- [ ] Le compte OpenAI a des crédits
- [ ] La clé a les permissions Realtime API

## 🔄 Après correction

Une fois la clé corrigée, redémarrez les services :

```bash
./restart-with-logs.sh
```

Puis vérifiez les logs pour confirmer que la connexion fonctionne :

```bash
tail -f logs/websocket-server.log | grep -E "(OpenAI|error|Error)"
```

Vous devriez voir :
- ✅ `OpenAI Realtime API connected`
- ✅ `Session update sent`
- ✅ `Session updated confirmed`
- ❌ Plus d'erreur `invalid_api_key`



