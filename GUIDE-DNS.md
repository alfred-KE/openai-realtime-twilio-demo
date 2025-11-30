# 🌐 Guide de Configuration DNS pour app.aventure-studio.com

## 📋 Informations du Serveur

- **IP IPv4 publique** : `149.56.130.28`
- **IP IPv6 publique** : `2607:5300:205:200::855a` (optionnel)
- **Domaine à configurer** : `app.aventure-studio.com`

## 🔧 Configuration DNS

### Étape 1: Accéder à votre gestionnaire DNS

1. Connectez-vous à votre fournisseur de domaine (ex: Cloudflare, OVH, Namecheap, GoDaddy, etc.)
2. Allez dans la section de gestion DNS de votre domaine `aventure-studio.com`

### Étape 2: Ajouter l'enregistrement A

Ajoutez un **enregistrement A** avec les valeurs suivantes :

| Type | Nom/Host | Valeur/IP | TTL |
|------|----------|-----------|-----|
| A | `app` | `149.56.130.28` | 3600 (ou Auto) |

**Détails :**
- **Type** : `A`
- **Nom/Host** : `app` (sans le point final)
- **Valeur/IP** : `149.56.130.28`
- **TTL** : `3600` secondes (1 heure) ou laissez la valeur par défaut

### Étape 3: (Optionnel) Ajouter l'enregistrement AAAA pour IPv6

Si votre serveur et votre fournisseur DNS supportent IPv6 :

| Type | Nom/Host | Valeur/IP | TTL |
|------|----------|-----------|-----|
| AAAA | `app` | `2607:5300:205:200::855a` | 3600 (ou Auto) |

### Étape 4: Vérifier la propagation DNS

Après avoir ajouté l'enregistrement, attendez quelques minutes (jusqu'à 1 heure selon le TTL), puis vérifiez :

```bash
# Vérifier depuis votre ordinateur
nslookup app.aventure-studio.com

# Ou avec dig
dig app.aventure-studio.com

# Vérifier depuis le serveur
dig app.aventure-studio.com @8.8.8.8
```

**Résultat attendu :**
```
app.aventure-studio.com.    IN    A    149.56.130.28
```

### Étape 5: Tester l'accès

Une fois le DNS propagé, testez l'accès :

```bash
curl -I http://app.aventure-studio.com
```

## 📝 Exemples selon les fournisseurs DNS

### Cloudflare
1. Allez sur https://dash.cloudflare.com
2. Sélectionnez le domaine `aventure-studio.com`
3. Cliquez sur **DNS** → **Records**
4. Cliquez sur **Add record**
5. Remplissez :
   - Type : `A`
   - Name : `app`
   - IPv4 address : `149.56.130.28`
   - Proxy status : Désactivé (gris) pour le moment
   - TTL : Auto
6. Cliquez sur **Save**

### OVH
1. Allez sur https://www.ovh.com/manager/
2. Sélectionnez votre domaine `aventure-studio.com`
3. Allez dans **Zone DNS**
4. Cliquez sur **Ajouter une entrée**
5. Remplissez :
   - Sous-domaine : `app`
   - Type : `A`
   - Cible : `149.56.130.28`
   - TTL : `3600`
6. Cliquez sur **Suivant** puis **Confirmer**

### Namecheap
1. Allez sur https://ap.www.namecheap.com/
2. Sélectionnez **Domain List** → votre domaine
3. Cliquez sur **Manage** → **Advanced DNS**
4. Dans **Host Records**, cliquez sur **Add New Record**
5. Remplissez :
   - Type : `A Record`
   - Host : `app`
   - Value : `149.56.130.28`
   - TTL : `Automatic`
6. Cliquez sur la coche pour sauvegarder

### GoDaddy
1. Allez sur https://dcc.godaddy.com/
2. Sélectionnez votre domaine `aventure-studio.com`
3. Allez dans **DNS**
4. Dans **Records**, cliquez sur **Add**
5. Remplissez :
   - Type : `A`
   - Name : `app`
   - Value : `149.56.130.28`
   - TTL : `1 Hour`
6. Cliquez sur **Save**

## ⚠️ Important

- La propagation DNS peut prendre de **5 minutes à 48 heures** selon votre fournisseur
- Vérifiez que le DNS pointe bien vers `149.56.130.28` avant de continuer avec certbot
- Si vous utilisez Cloudflare, désactivez le proxy (mode DNS uniquement) pour que Let's Encrypt fonctionne

## ✅ Vérification

Une fois le DNS configuré et propagé, vous pouvez vérifier avec :

```bash
# Depuis votre ordinateur
ping app.aventure-studio.com

# Ou
nslookup app.aventure-studio.com
```

Le résultat doit pointer vers `149.56.130.28`.




