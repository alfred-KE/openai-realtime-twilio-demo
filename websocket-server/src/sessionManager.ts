import { RawData, WebSocket } from "ws";
import functions from "./functionHandlers";
import * as db from "./database";
import { Item } from "./types";

interface Session {
  twilioConn?: WebSocket;
  frontendConn?: WebSocket;
  modelConn?: WebSocket;
  streamSid?: string;
  saved_config?: any;
  lastAssistantItem?: string;
  responseStartTimestamp?: number;
  latestMediaTimestamp?: number;
  openAIApiKey?: string;
  // NOUVEAU: Buffer pour les messages audio avant que response.created soit reçu
  audioBuffer: Array<{ type: string; audio: string; timestamp: string }>;
  // NOUVEAU: Flag pour savoir si response.created a été reçu
  responseCreated: boolean;
  // NOUVEAU: Timeout pour response.create
  responseCreateTimeout?: NodeJS.Timeout;
  // NOUVEAU: Pour la sauvegarde des conversations
  conversationId?: number;
  phoneNumber?: string;
  phoneNumberSid?: string;
  callerNumber?: string;
  items: Item[]; // Stocker les items pour sauvegarde
}

// Map pour gérer plusieurs sessions simultanées (clé = streamSid)
const sessions = new Map<string, Session>();

// Session partagée pour le frontend (une seule connexion frontend)
let frontendSession: Session = {
  audioBuffer: [],
  responseCreated: false,
  items: [],
};

// Fonction helper pour obtenir ou créer une session
function getOrCreateSession(streamSid: string, openAIApiKey: string, twilioConn: WebSocket, phoneNumber?: string, phoneNumberSid?: string, callerNumber?: string): Session {
  if (!sessions.has(streamSid)) {
    const session: Session = {
      audioBuffer: [],
      responseCreated: false,
      streamSid,
      openAIApiKey,
      twilioConn,
      phoneNumber: phoneNumber || "unknown",
      phoneNumberSid,
      callerNumber,
      items: [],
    };
    
    // Démarrer la conversation dans la base de données
    try {
      session.conversationId = db.startConversation(
        streamSid,
        session.phoneNumber || "unknown",
        phoneNumberSid,
        callerNumber
      );
      console.log(`[${streamSid}] Started conversation in database (ID: ${session.conversationId})`);
    } catch (err) {
      console.error(`[${streamSid}] Error starting conversation:`, err);
    }
    
    sessions.set(streamSid, session);
    console.log(`Created new session for streamSid: ${streamSid}`);
  }
  const session = sessions.get(streamSid)!;
  session.twilioConn = twilioConn;
  session.openAIApiKey = openAIApiKey;
  if (phoneNumber) session.phoneNumber = phoneNumber;
  if (phoneNumberSid) session.phoneNumberSid = phoneNumberSid;
  if (callerNumber) session.callerNumber = callerNumber;
  return session;
}

// Fonction helper pour obtenir une session par streamSid
function getSession(streamSid?: string): Session | null {
  if (!streamSid) return null;
  return sessions.get(streamSid) || null;
}

// Export function to get session items for saving
export function getSessionItems(streamSid: string): Item[] | undefined {
  const session = sessions.get(streamSid);
  return session?.items;
}

// Fonction helper pour nettoyer une session
function cleanupSession(streamSid: string) {
  const session = sessions.get(streamSid);
  if (session) {
    // Sauvegarder tous les items dans la base de données avant de nettoyer
    if (session.conversationId && session.items && session.items.length > 0) {
      try {
        console.log(`[${streamSid}] Saving ${session.items.length} items to database before cleanup`);
        db.saveConversationItems(session.conversationId, session.items);
        
        // Compter les messages pour mettre à jour la conversation
        const messageCount = session.items.filter((item) => item.type === "message").length;
        db.endConversation(streamSid, messageCount);
        
        console.log(`[${streamSid}] Conversation saved and ended in database`);
      } catch (err) {
        console.error(`[${streamSid}] Error saving conversation items:`, err);
      }
    }
    
    // Envoyer un événement au frontend pour indiquer que l'appel est terminé
    if (frontendSession.frontendConn && isOpen(frontendSession.frontendConn)) {
      jsonSend(frontendSession.frontendConn, {
        type: "call.ended",
        streamSid: streamSid,
        message: "Call ended",
      });
      console.log(`[${streamSid}] Sent call.ended event to frontend`);
    }
    
    cleanupConnection(session.modelConn);
    cleanupConnection(session.twilioConn);
    if (session.responseCreateTimeout) {
      clearTimeout(session.responseCreateTimeout);
    }
    sessions.delete(streamSid);
    console.log(`Cleaned up session for streamSid: ${streamSid}`);
  }
}

export function handleCallConnection(ws: WebSocket, openAIApiKey: string) {
  console.log("Twilio call connection received");
  
  // Stocker temporairement la connexion Twilio jusqu'à ce qu'on reçoive le streamSid
  let tempStreamSid: string | null = null;

  ws.on("message", (data: RawData) => {
    const msg = parseMessage(data);
    if (!msg) {
      console.log("Failed to parse Twilio message");
      return;
    }

    // Si c'est un événement "start", on crée la session avec le streamSid
    if (msg.event === "start" && msg.start?.streamSid) {
      const streamSid = msg.start.streamSid;
      tempStreamSid = streamSid;
      // Extraire les infos du message start (numéro appelé, appelant, etc.)
      // Twilio envoie les customParameters depuis le TwiML
      const phoneNumber = msg.start?.customParameters?.phoneNumber || 
                         msg.start?.accountSid || 
                         "unknown";
      const phoneNumberSid = msg.start?.customParameters?.phoneNumberSid || "";
      const callerNumber = msg.start?.customParameters?.callerNumber || 
                          msg.start?.callSid || 
                          "unknown";
      
      console.log(`[${streamSid}] Call info - Phone: ${phoneNumber}, Caller: ${callerNumber}`);
      const session = getOrCreateSession(streamSid, openAIApiKey, ws, phoneNumber, phoneNumberSid, callerNumber);
      handleTwilioMessage(data, session);
    } else if (tempStreamSid) {
      // Pour les autres messages, utiliser la session existante
      const session = getSession(tempStreamSid);
      if (session) {
        handleTwilioMessage(data, session);
      } else {
        console.log(`Session not found for streamSid: ${tempStreamSid}`);
      }
    } else {
      console.log("Received message before streamSid, ignoring");
    }
  });

  ws.on("error", (err) => {
    console.error("Twilio connection error:", err);
    ws.close();
  });

  ws.on("close", () => {
    console.log("Twilio connection closed");
    if (tempStreamSid) {
      cleanupSession(tempStreamSid);
    }
  });
}

export function handleFrontendConnection(ws: WebSocket) {
  cleanupConnection(frontendSession.frontendConn);
  frontendSession.frontendConn = ws;

  ws.on("message", (data: RawData) => {
    handleFrontendMessage(data);
  });

  ws.on("close", () => {
    cleanupConnection(frontendSession.frontendConn);
    frontendSession.frontendConn = undefined;
  });
}

async function handleFunctionCall(item: { name: string; arguments: string }, session: Session) {
  console.log("Handling function call:", item);
  const fnDef = functions.find((f) => f.schema.name === item.name);
  if (!fnDef) {
    throw new Error(`No handler found for function: ${item.name}`);
  }

  let args: unknown;
  try {
    args = JSON.parse(item.arguments);
  } catch {
    return JSON.stringify({
      error: "Invalid JSON arguments for function call.",
    });
  }

  try {
    console.log("Calling function:", fnDef.schema.name, args);
    const result = await fnDef.handler(args as any);
    return result;
  } catch (err: any) {
    console.error("Error running function:", err);
    return JSON.stringify({
      error: `Error running function ${item.name}: ${err.message}`,
    });
  }
}

function handleTwilioMessage(data: RawData, session: Session) {
  const msg = parseMessage(data);
  if (!msg) {
    console.log("Failed to parse Twilio message");
    return;
  }

  console.log(`[${session.streamSid}] Twilio message received:`, msg.event);
  switch (msg.event) {
    case "start":
      console.log(`[${session.streamSid}] Twilio stream started`);
      session.streamSid = msg.start.streamSid;
      session.latestMediaTimestamp = 0;
      session.lastAssistantItem = undefined;
      session.responseStartTimestamp = undefined;
      session.audioBuffer = [];
      session.responseCreated = false;
      // Initialiser le tableau d'items si pas déjà fait
      if (!session.items) {
        session.items = [];
      }
      tryConnectModel(session);
      break;
    case "media":
      session.latestMediaTimestamp = msg.media.timestamp;
      
      // CORRECTION: Bufferiser l'audio si response.created n'a pas encore été reçu
      if (!session.responseCreated) {
        console.log(`[${session.streamSid}] Buffering audio (response not created yet)`);
        session.audioBuffer.push({
          type: "input_audio_buffer.append",
          audio: msg.media.payload,
          timestamp: msg.media.timestamp,
        });
        return; // Ne pas envoyer maintenant
      }
      
      // Si response.created a été reçu, envoyer directement
      if (isOpen(session.modelConn)) {
        jsonSend(session.modelConn, {
          type: "input_audio_buffer.append",
          audio: msg.media.payload,
        });
      } else {
        console.log(`[${session.streamSid}] Model connection not open, dropping audio`);
      }
      break;
    case "close":
      console.log(`[${session.streamSid}] Twilio stream closed`);
      if (session.streamSid) {
        cleanupSession(session.streamSid);
      }
      break;
  }
}

function handleFrontendMessage(data: RawData) {
  const msg = parseMessage(data);
  if (!msg) return;

  // Envoyer le message à toutes les sessions actives
  sessions.forEach((session) => {
    if (isOpen(session.modelConn)) {
      jsonSend(session.modelConn, msg);
    }
  });

  if (msg.type === "session.update") {
    // Sauvegarder la config pour toutes les futures sessions
    frontendSession.saved_config = msg.session;
    
    // Appliquer la nouvelle config à toutes les sessions actives
    sessions.forEach((session) => {
      if (isOpen(session.modelConn)) {
        const functionSchemas = functions.map((f) => f.schema);
        const defaultConfig = {
          modalities: ["text", "audio"],
          turn_detection: {
            type: "server_vad",
            threshold: 0.4,
            silence_duration_ms: 1000,
          },
          voice: "ash",
          temperature: 0.7,
          input_audio_transcription: { model: "gpt-4o-transcribe" },
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
        };
        
        const sessionConfig = {
          ...defaultConfig,
          ...msg.session,
          turn_detection: msg.session.turn_detection || defaultConfig.turn_detection,
          input_audio_transcription: msg.session.input_audio_transcription || defaultConfig.input_audio_transcription,
          tools: functionSchemas.length > 0 ? functionSchemas : (msg.session.tools || undefined),
        };
        
        jsonSend(session.modelConn, {
          type: "session.update",
          session: sessionConfig,
        });
        console.log(`[${session.streamSid}] Session config updated during active session`);
      }
    });
  }
}

function tryConnectModel(session: Session) {
  if (!session.twilioConn || !session.streamSid || !session.openAIApiKey) {
    console.log(`[${session.streamSid}] Cannot connect model: missing requirements`, {
      hasTwilioConn: !!session.twilioConn,
      hasStreamSid: !!session.streamSid,
      hasApiKey: !!session.openAIApiKey,
    });
    return;
  }
  if (isOpen(session.modelConn)) {
    console.log(`[${session.streamSid}] Model connection already open`);
    return;
  }

  console.log(`[${session.streamSid}] Connecting to OpenAI Realtime API...`);
  const config = session.saved_config || frontendSession.saved_config || {};
  const model = config.model || "gpt-4o-realtime-preview-2024-12-17";
  
  session.modelConn = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${model}`,
    {
      headers: {
        Authorization: `Bearer ${session.openAIApiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  session.modelConn.on("open", () => {
    console.log(`[${session.streamSid}] OpenAI Realtime API connected`);
    
    const functionSchemas = functions.map((f) => f.schema);
    
    // Valeurs par défaut
    const defaultConfig = {
      modalities: ["text", "audio"],
      turn_detection: {
        type: "server_vad",
        threshold: 0.4,
        silence_duration_ms: 1000,
      },
      voice: "ash",
      temperature: 0.7,
      input_audio_transcription: { model: "gpt-4o-transcribe" },
      input_audio_format: "g711_ulaw",
      output_audio_format: "g711_ulaw",
    };
    
    // Fusionner avec la config sauvegardée (priorité à la config)
    const sessionConfig = {
      ...defaultConfig,
      ...config,
      // S'assurer que turn_detection est bien fusionné
      turn_detection: config.turn_detection || defaultConfig.turn_detection,
      // S'assurer que input_audio_transcription est bien fusionné
      input_audio_transcription: config.input_audio_transcription || defaultConfig.input_audio_transcription,
      // Tools depuis les fonctions backend
      tools: functionSchemas.length > 0 ? functionSchemas : (config.tools || undefined),
    };
    
    jsonSend(session.modelConn, {
      type: "session.update",
      session: sessionConfig,
    });
    console.log(`[${session.streamSid}] Session update sent with config:`, sessionConfig);
  });

  session.modelConn.on("message", (data: RawData) => {
    handleModelMessage(data, session);
  });
  
  session.modelConn.on("error", (err) => {
    console.error(`[${session.streamSid}] OpenAI Realtime API error:`, err);
    closeModel(session);
  });
  
  session.modelConn.on("close", (code, reason) => {
    console.log(`[${session.streamSid}] OpenAI Realtime API closed:`, code, reason.toString());
    closeModel(session);
  });
}

function handleModelMessage(data: RawData, session: Session) {
  const event = parseMessage(data);
  if (!event) {
    console.log(`[${session.streamSid}] Failed to parse model message`);
    return;
  }

  console.log(`[${session.streamSid}] Model event received:`, event.type, event.type.includes("content") || event.type.includes("transcript") ? JSON.stringify(event).substring(0, 200) : "");

  // Envoyer au frontend (une seule connexion frontend partagée) avec streamSid
  const eventWithStreamSid = {
    ...event,
    streamSid: session.streamSid,
  };
  jsonSend(frontendSession.frontendConn, eventWithStreamSid);

  // Fonction helper pour mettre à jour ou créer un item dans session.items
  const updateOrCreateItem = (itemId: string, updates: Partial<Item>) => {
    if (!session.items) {
      session.items = [];
    }
    const existingIndex = session.items.findIndex((item) => item.id === itemId);
    if (existingIndex >= 0) {
      // Mettre à jour l'item existant
      session.items[existingIndex] = {
        ...session.items[existingIndex],
        ...updates,
      };
      console.log(`[${session.streamSid}] Item updated in session.items:`, itemId, updates);
    } else {
      // Créer un nouvel item
      const newItem: Item = {
        id: itemId,
        type: "message",
        role: "user",
        content: [],
        status: "running",
        timestamp: new Date().toISOString(),
        streamSid: session.streamSid,
        ...updates,
      };
      session.items.push(newItem);
      console.log(`[${session.streamSid}] Item created in session.items:`, itemId, updates);
    }
  };

  // Stocker les items créés dans session.items pour sauvegarde
  if (event.type === "conversation.item.created" && event.item) {
    if (!session.items) {
      session.items = [];
    }
    // Convertir l'item OpenAI en format Item pour la sauvegarde
    const item: Item = {
      id: event.item.id,
      type: event.item.type === "message" ? "message" : 
            event.item.type === "function_call" ? "function_call" :
            event.item.type === "function_call_output" ? "function_call_output" : 
            event.item.type as any,
      role: event.item.role,
      content: event.item.content || [],
      status: event.item.status,
      timestamp: new Date().toISOString(),
      streamSid: session.streamSid,
      call_id: event.item.call_id,
      name: event.item.name,
      params: event.item.input,
      output: typeof event.item.output === "string" ? event.item.output : 
              event.item.output ? JSON.stringify(event.item.output) : undefined,
    };
    
    // Vérifier si l'item existe déjà (peut arriver si response.content_part.added arrive avant)
    const existingIndex = session.items.findIndex((i) => i.id === item.id);
    if (existingIndex >= 0) {
      // Mettre à jour l'item existant mais préserver le contenu s'il existe déjà
      const existingContent = session.items[existingIndex].content || [];
      if (existingContent.length > 0) {
        // Préserver le contenu existant
        item.content = existingContent;
        console.log(`[${session.streamSid}] Item ${item.id} already exists with content, preserving existing content`);
      }
      session.items[existingIndex] = item;
    } else {
      session.items.push(item);
    }
    
    console.log(`[${session.streamSid}] Item stored in session.items:`, item.id, item.type, item.role, `content length: ${item.content?.length || 0}`);
  }

  switch (event.type) {
    case "session.updated":
      console.log(`[${session.streamSid}] Session updated confirmed, starting response...`);
      // CORRECTION: Attendre un court délai avant d'envoyer response.create
      setTimeout(() => {
        if (isOpen(session.modelConn)) {
          console.log(`[${session.streamSid}] Sending response.create...`);
          jsonSend(session.modelConn, { type: "response.create" });
          
          // CORRECTION: Ajouter un timeout pour vérifier que response.created arrive
          session.responseCreateTimeout = setTimeout(() => {
            if (!session.responseCreated) {
              console.error(`[${session.streamSid}] TIMEOUT: response.created not received after 5 seconds`);
              console.error(`[${session.streamSid}] Retrying response.create...`);
              if (isOpen(session.modelConn)) {
                jsonSend(session.modelConn, { type: "response.create" });
              }
            }
          }, 5000);
        }
      }, 100);
      break;

    case "response.created":
      console.log(`[${session.streamSid}] Response created, model is now listening`);
      session.responseCreated = true;
      
      // CORRECTION: Envoyer tous les messages audio bufferisés avec un délai pour simuler le flux réel
      if (session.audioBuffer.length > 0) {
        console.log(`[${session.streamSid}] Sending ${session.audioBuffer.length} buffered audio messages (with delay to simulate real-time)`);
        // Envoyer les messages avec un délai de 20ms entre chaque pour simuler le flux réel
        // Twilio envoie généralement des chunks toutes les 20ms
        session.audioBuffer.forEach((buffered, index) => {
          setTimeout(() => {
            if (isOpen(session.modelConn)) {
              jsonSend(session.modelConn, {
                type: buffered.type,
                audio: buffered.audio,
              });
            }
          }, index * 20); // 20ms entre chaque message
        });
        session.audioBuffer = [];
      }
      
      // Nettoyer le timeout
      if (session.responseCreateTimeout) {
        clearTimeout(session.responseCreateTimeout);
        session.responseCreateTimeout = undefined;
      }
      break;

    case "input_audio_buffer.speech_started":
      console.log(`[${session.streamSid}] Speech detected, handling truncation`);
      handleTruncation(session);
      break;

    // CORRECTION: Ajouter handler pour response.output_item.added
    case "response.output_item.added":
      console.log(`[${session.streamSid}] Response output item added:`, event.item?.type);
      break;

    case "response.audio.delta":
      if (session.twilioConn && session.streamSid) {
        if (session.responseStartTimestamp === undefined) {
          session.responseStartTimestamp = session.latestMediaTimestamp || 0;
        }
        if (event.item_id) session.lastAssistantItem = event.item_id;

        jsonSend(session.twilioConn, {
          event: "media",
          streamSid: session.streamSid,
          media: { payload: event.delta },
        });

        jsonSend(session.twilioConn, {
          event: "mark",
          streamSid: session.streamSid,
        });
      } else {
        console.log(`[${session.streamSid}] Cannot send audio: missing twilioConn or streamSid`);
      }
      break;

    case "response.output_item.done": {
      const { item } = event;
      if (item.type === "function_call") {
        console.log(`[${session.streamSid}] Function call completed:`, item.name);
        handleFunctionCall(item, session)
          .then((output) => {
            if (session.modelConn) {
              jsonSend(session.modelConn, {
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: item.call_id,
                  output: JSON.stringify(output),
                },
              });
              jsonSend(session.modelConn, { type: "response.create" });
            }
          })
          .catch((err) => {
            console.error(`[${session.streamSid}] Error handling function call:`, err);
          });
      } else if (item.type === "message") {
        // Marquer l'item message comme complété quand la réponse est terminée
        // Utiliser le contenu de session.items si disponible (il a été mis à jour par response.audio_transcript.delta)
        const existingItem = session.items?.find((i) => i.id === item.id);
        let finalContent = existingItem?.content && existingItem.content.length > 0
          ? existingItem.content
          : (item.content || []);
        
        // CORRECTION: Convertir le contenu audio en contenu texte si nécessaire
        finalContent = finalContent.map((c: any) => {
          if (c && c.type === "audio" && c.transcript) {
            // Convertir audio avec transcript en text
            return { type: "text", text: c.transcript };
          } else if (c && c.type === "text" && c.text) {
            // Garder le texte tel quel
            return { type: "text", text: c.text };
          } else {
            // Format inconnu, essayer de récupérer le texte
            return { type: "text", text: c?.text || c?.transcript || "" };
          }
        }).filter((c: any) => c.text && c.text.length > 0); // Filtrer les contenus vides
        
        updateOrCreateItem(item.id, {
          role: "assistant",
          content: finalContent,
          status: "completed",
        });
        
        console.log(`[${session.streamSid}] response.output_item.done: Final content for item ${item.id}:`, JSON.stringify(finalContent).substring(0, 200));
      }
      break;
    }

    // CORRECTION: Ajouter handler pour les transcriptions
    case "conversation.item.input_audio_transcription.completed":
      console.log(`[${session.streamSid}] ✅ Transcription reçue:`, event.transcript);
      // Mettre à jour l'item user avec la transcription
      if (event.item_id && event.transcript) {
        updateOrCreateItem(event.item_id, {
          role: "user",
          content: [{ type: "text", text: event.transcript }],
          status: "completed",
        });
      }
      // Envoyer la transcription au frontend pour debug
      if (frontendSession.frontendConn) {
        jsonSend(frontendSession.frontendConn, {
          type: "transcription",
          transcript: event.transcript,
          item_id: event.item_id,
          streamSid: session.streamSid,
        });
      }
      break;

    case "conversation.item.input_audio_transcription.failed":
      console.error(`[${session.streamSid}] Input audio transcription failed:`, event.error);
      // Si la transcription échoue, on peut quand même continuer
      break;

    case "response.done":
      if (event.response?.status === "failed") {
        console.error(`[${session.streamSid}] Response failed:`, event.response.status_details);
        // Si la réponse échoue, créer une nouvelle réponse pour continuer
        if (isOpen(session.modelConn)) {
          console.log(`[${session.streamSid}] Creating new response after failure...`);
          setTimeout(() => {
            if (isOpen(session.modelConn)) {
              jsonSend(session.modelConn, { type: "response.create" });
            }
          }, 500);
        }
      } else {
        console.log(`[${session.streamSid}] Response completed successfully:`, event.response?.status);
      }
      break;

    case "error":
      console.error(`[${session.streamSid}] Model error:`, event);
      break;

    case "response.content_part.added":
      // Mettre à jour le contenu de l'item assistant avec le texte
      if (event.item_id && event.part && event.part.type === "text" && event.output_index === 0) {
        console.log(`[${session.streamSid}] response.content_part.added received for item ${event.item_id}, text: "${event.part.text?.substring(0, 50)}"`);
        const existingItem = session.items?.find((item) => item.id === event.item_id);
        if (existingItem) {
          // Consolider le contenu existant en un seul texte, puis ajouter le nouveau texte
          const existingContent = existingItem.content || [];
          const existingText = existingContent
            .filter((c: any) => c && (c.type === "text" || c.text))
            .map((c: any) => c.text || "")
            .join("");
          const newText = existingText + (event.part.text || "");
          updateOrCreateItem(event.item_id, {
            role: "assistant",
            content: [{ type: "text", text: newText }],
            status: "running",
          });
          console.log(`[${session.streamSid}] Updated existing item ${event.item_id} with content_part, total text length: ${newText.length}`);
        } else {
          // Créer un nouvel item si il n'existe pas
          updateOrCreateItem(event.item_id, {
            role: "assistant",
            content: [{ type: "text", text: event.part.text || "" }],
            status: "running",
          });
          console.log(`[${session.streamSid}] Created new item ${event.item_id} with content_part, text length: ${(event.part.text || "").length}`);
        }
      }
      break;

    case "response.audio_transcript.delta":
      // Mettre à jour le contenu de l'item assistant avec le transcript audio
      if (event.item_id && event.delta && event.output_index === 0) {
        const existingItem = session.items?.find((item) => item.id === event.item_id);
        if (existingItem) {
          // Consolider le contenu existant en un seul texte, puis ajouter le delta
          const existingContent = existingItem.content || [];
          const existingText = existingContent
            .filter((c: any) => c && (c.type === "text" || c.text))
            .map((c: any) => c.text || "")
            .join("");
          const newText = existingText + (event.delta || "");
          const updatedContent = [{ type: "text", text: newText }];
          updateOrCreateItem(event.item_id, {
            role: "assistant",
            content: updatedContent,
            status: "running",
          });
          console.log(`[${session.streamSid}] Updated item ${event.item_id} with audio_transcript delta:`, newText.substring(0, 50));
        } else {
          // Créer un nouvel item si il n'existe pas
          updateOrCreateItem(event.item_id, {
            role: "assistant",
            content: [{ type: "text", text: event.delta || "" }],
            status: "running",
          });
          console.log(`[${session.streamSid}] Created new item ${event.item_id} with audio_transcript delta:`, event.delta?.substring(0, 50));
        }
      }
      break;


    default:
      // CORRECTION: Logger tous les événements non gérés pour debugging
      if (!event.type.startsWith("response.audio_transcript")) {
        console.log(`[${session.streamSid}] Unhandled event type:`, event.type, JSON.stringify(event).substring(0, 200));
      }
      break;
  }
}

function handleTruncation(session: Session) {
  if (
    !session.lastAssistantItem ||
    session.responseStartTimestamp === undefined
  )
    return;

  const elapsedMs =
    (session.latestMediaTimestamp || 0) - (session.responseStartTimestamp || 0);
  const audio_end_ms = elapsedMs > 0 ? elapsedMs : 0;

  if (isOpen(session.modelConn)) {
    jsonSend(session.modelConn, {
      type: "conversation.item.truncate",
      item_id: session.lastAssistantItem,
      content_index: 0,
      audio_end_ms,
    });
  }

  if (session.twilioConn && session.streamSid) {
    jsonSend(session.twilioConn, {
      event: "clear",
      streamSid: session.streamSid,
    });
  }

  session.lastAssistantItem = undefined;
  session.responseStartTimestamp = undefined;
}

function closeModel(session: Session) {
  cleanupConnection(session.modelConn);
  session.modelConn = undefined;
  if (session.responseCreateTimeout) {
    clearTimeout(session.responseCreateTimeout);
  }
}

function cleanupConnection(ws?: WebSocket) {
  if (isOpen(ws)) ws.close();
}

function parseMessage(data: RawData): any {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}

function jsonSend(ws: WebSocket | undefined, obj: unknown) {
  if (!isOpen(ws)) return;
  ws.send(JSON.stringify(obj));
}

function isOpen(ws?: WebSocket): ws is WebSocket {
  return !!ws && ws.readyState === WebSocket.OPEN;
}
