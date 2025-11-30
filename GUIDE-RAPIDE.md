# 🚀 Guide Rapide - Configuration Twilio

## ✅ Ce que vous voyez est CORRECT

Quand vous accédez à `https://semijocular-superleniently-bianca.ngrok-free.dev/twiml` dans votre navigateur, vous voyez le XML TwiML. **C'est normal !** C'est exactement ce que Twilio doit recevoir.

## 📋 Configuration du Webhook Twilio

### Étape 1: Aller dans la Console Twilio
1. Ouvrez https://console.twilio.com/
2. Allez dans **Phone Numbers** → **Manage** → **Active numbers**
3. Cliquez sur votre numéro de téléphone

### Étape 2: Configurer le Webhook
Dans la section **"Voice & Fax"** :

**"A CALL COMES IN"** :
- Méthode : `HTTP POST` (ou `HTTP GET`)
- URL : `https://semijocular-superleniently-bianca.ngrok-free.dev/twiml`

⚠️ **IMPORTANT** : 
- Utilisez `https://` (pas `http://`)
- N'ajoutez PAS de `/twiml` à la fin si vous utilisez la méthode POST
- L'URL doit être exactement : `https://semijocular-superleniently-bianca.ngrok-free.dev/twiml`

### Étape 3: Sauvegarder
Cliquez sur **"Save"** en bas de la page.

## 🧪 Tester

### 1. Ouvrir les logs en temps réel
Dans un terminal, lancez :
```bash
./watch-all-logs.sh
```

### 2. Passer un appel
Appelez votre numéro Twilio depuis votre téléphone.

### 3. Vérifier les logs
Vous devriez voir dans les logs (dans l'ordre) :

1. ✅ `TwiML requested from: [IP]` 
   → Twilio a appelé votre webhook

2. ✅ `WebSocket connection received: /call`
   → Twilio se connecte au WebSocket

3. ✅ `Twilio call connection`
   → Connexion établie

4. ✅ `Twilio stream started, streamSid: ...`
   → Le stream audio démarre

5. ✅ `Connecting to OpenAI Realtime API...`
   → Connexion à OpenAI

6. ✅ `OpenAI Realtime API connected`
   → OpenAI est connecté

7. ✅ `Session updated confirmed, starting response...`
   → La session est prête

8. ✅ `Response created, model is now listening`
   → Le modèle écoute et peut répondre

## ❌ Si vous ne voyez rien dans les logs

### Problème 1: Aucun log "TwiML requested"
**Cause** : Le webhook n'est pas configuré ou l'URL est incorrecte

**Solution** :
- Vérifiez que l'URL dans Twilio est exactement : `https://semijocular-superleniently-bianca.ngrok-free.dev/twiml`
- Vérifiez que vous avez cliqué sur "Save"
- Vérifiez que ngrok est toujours actif (l'URL change si vous redémarrez ngrok)

### Problème 2: Log "TwiML requested" mais pas de "WebSocket connection"
**Cause** : Twilio n'arrive pas à se connecter au WebSocket

**Solution** :
- Vérifiez que ngrok est toujours actif
- Vérifiez que l'URL dans le TwiML est bien `wss://` (WebSocket Secure)
- Attendez quelques secondes (la connexion peut prendre du temps)

### Problème 3: L'URL ngrok a changé
**Cause** : Ngrok a été redémarré

**Solution** :
1. Récupérez la nouvelle URL :
   ```bash
   curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | head -1
   ```

2. Mettez à jour `PUBLIC_URL` dans `websocket-server/.env`

3. Mettez à jour le webhook dans Twilio avec la nouvelle URL

## 🔄 Si ngrok redémarre

L'URL ngrok change à chaque redémarrage. Vous devez :

1. **Mettre à jour `.env`** :
   ```bash
   # Éditer websocket-server/.env
   # Changer PUBLIC_URL avec la nouvelle URL ngrok
   ```

2. **Mettre à jour Twilio** :
   - Allez dans Phone Numbers → Votre numéro
   - Changez l'URL du webhook avec la nouvelle URL ngrok
   - Sauvegardez

3. **Redémarrer le websocket-server** (si nécessaire) :
   ```bash
   ./restart-with-logs.sh
   ```

## 📞 Support

Si rien ne fonctionne :
1. Vérifiez tous les logs : `./watch-all-logs.sh`
2. Testez les endpoints : `./test-endpoints.sh`
3. Consultez le guide de dépannage : `cat TROUBLESHOOTING.md`



