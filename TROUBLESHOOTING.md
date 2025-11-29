# Guide de dépannage - Rien ne se passe après l'appel

## 🔍 Diagnostic étape par étape

### 1. Vérifier que le webhook Twilio est configuré

**URL du webhook à configurer dans Twilio:**
```
https://semijocular-superleniently-bianca.ngrok-free.dev/twiml
```

**Comment vérifier:**
1. Allez dans la console Twilio → Phone Numbers → Manage → Active numbers
2. Cliquez sur votre numéro
3. Vérifiez que "A CALL COMES IN" pointe vers: `https://semijocular-superleniently-bianca.ngrok-free.dev/twiml`
4. Méthode: `HTTP POST` ou `HTTP GET` (les deux fonctionnent)

### 2. Vérifier que ngrok est accessible

```bash
# Vérifier l'URL ngrok
curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"'

# Tester l'endpoint TwiML via ngrok
curl https://semijocular-superleniently-bianca.ngrok-free.dev/twiml
```

**Résultat attendu:** Du XML TwiML avec l'URL WebSocket

### 3. Vérifier les logs en temps réel

```bash
# Suivre tous les logs
./watch-all-logs.sh

# Ou seulement websocket-server
tail -f logs/websocket-server.log
```

**Ce que vous devriez voir lors d'un appel:**
1. `TwiML requested from: [IP]` - Twilio appelle le webhook
2. `WebSocket connection received: /call` - Twilio se connecte au websocket
3. `Twilio call connection` - Connexion établie
4. `Twilio stream started, streamSid: ...` - Stream démarré
5. `Connecting to OpenAI Realtime API...` - Connexion OpenAI
6. `OpenAI Realtime API connected` - OpenAI connecté

### 4. Problèmes courants

#### ❌ Aucun log "TwiML requested"
**Problème:** Twilio n'appelle pas le webhook
**Solutions:**
- Vérifiez que le webhook est bien configuré dans Twilio
- Vérifiez que l'URL ngrok est correcte (sans `/twiml` à la fin dans la config Twilio)
- Vérifiez que ngrok est toujours actif (l'URL change à chaque redémarrage)

#### ❌ Log "TwiML requested" mais pas de "WebSocket connection"
**Problème:** Twilio n'arrive pas à se connecter au websocket
**Solutions:**
- Vérifiez que ngrok supporte WSS (WebSocket Secure)
- Vérifiez que l'URL dans le TwiML est bien `wss://` (pas `ws://`)
- Testez manuellement: `wscat -c wss://semijocular-superleniently-bianca.ngrok-free.dev/call`

#### ❌ Log "WebSocket connection" mais pas de "Twilio stream started"
**Problème:** Le stream Twilio ne démarre pas
**Solutions:**
- Attendez quelques secondes (le stream peut prendre du temps)
- Vérifiez les logs pour des erreurs
- Vérifiez que le message "start" arrive de Twilio

#### ❌ Log "Twilio stream started" mais pas de "Connecting to OpenAI"
**Problème:** Les conditions pour connecter OpenAI ne sont pas remplies
**Solutions:**
- Vérifiez les logs pour "Cannot connect model: missing requirements"
- Vérifiez que `OPENAI_API_KEY` est valide
- Vérifiez que `streamSid` est présent

### 5. Test manuel du websocket

```bash
# Installer wscat si nécessaire
npm install -g wscat

# Tester la connexion WebSocket
wscat -c wss://semijocular-superleniently-bianca.ngrok-free.dev/call
```

**Résultat attendu:** Connexion établie (vous pouvez envoyer des messages JSON)

### 6. Vérifier la configuration ngrok

Ngrok doit être lancé avec:
```bash
ngrok http 8081
```

**Important:** L'URL ngrok change à chaque redémarrage. Mettez à jour:
1. `PUBLIC_URL` dans `websocket-server/.env`
2. Le webhook dans Twilio

### 7. Script de test automatique

```bash
# Tester tous les endpoints
./test-endpoints.sh
```

## 📋 Checklist complète

- [ ] Ngrok est actif et accessible
- [ ] `PUBLIC_URL` dans `.env` correspond à l'URL ngrok actuelle
- [ ] Le webhook Twilio pointe vers `https://[ngrok-url]/twiml`
- [ ] Le websocket-server est en cours d'exécution
- [ ] Les logs montrent "Server running on http://localhost:8081"
- [ ] Un appel a été passé au numéro Twilio
- [ ] Les logs montrent "TwiML requested" lors de l'appel
- [ ] Les logs montrent "WebSocket connection received: /call"
- [ ] Les logs montrent "Twilio stream started"

## 🚨 Si rien ne fonctionne

1. **Redémarrer tous les services:**
   ```bash
   ./restart-with-logs.sh
   ```

2. **Vérifier l'URL ngrok actuelle:**
   ```bash
   curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"'
   ```

3. **Mettre à jour PUBLIC_URL:**
   ```bash
   # Éditer websocket-server/.env
   # Mettre à jour PUBLIC_URL avec la nouvelle URL ngrok
   ```

4. **Mettre à jour le webhook Twilio** avec la nouvelle URL

5. **Relancer les services** et réessayer

