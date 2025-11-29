import { RawData, WebSocket } from "ws";
import functions from "./functionHandlers";

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
}

let session: Session = {
  audioBuffer: [],
  responseCreated: false,
};

export function handleCallConnection(ws: WebSocket, openAIApiKey: string) {
  console.log("Twilio call connection received");
  cleanupConnection(session.twilioConn);
  session.twilioConn = ws;
  session.openAIApiKey = openAIApiKey;
  // Réinitialiser les flags
  session.audioBuffer = [];
  session.responseCreated = false;

  ws.on("message", handleTwilioMessage);
  ws.on("error", (err) => {
    console.error("Twilio connection error:", err);
    ws.close();
  });
  ws.on("close", () => {
    console.log("Twilio connection closed");
    cleanupConnection(session.modelConn);
    cleanupConnection(session.twilioConn);
    if (session.responseCreateTimeout) {
      clearTimeout(session.responseCreateTimeout);
    }
    session.twilioConn = undefined;
    session.modelConn = undefined;
    session.streamSid = undefined;
    session.lastAssistantItem = undefined;
    session.responseStartTimestamp = undefined;
    session.latestMediaTimestamp = undefined;
    session.audioBuffer = [];
    session.responseCreated = false;
    if (!session.frontendConn) session = { audioBuffer: [], responseCreated: false };
  });
}

export function handleFrontendConnection(ws: WebSocket) {
  cleanupConnection(session.frontendConn);
  session.frontendConn = ws;

  ws.on("message", handleFrontendMessage);
  ws.on("close", () => {
    cleanupConnection(session.frontendConn);
    session.frontendConn = undefined;
    if (!session.twilioConn && !session.modelConn) {
      session = { audioBuffer: [], responseCreated: false };
    }
  });
}

async function handleFunctionCall(item: { name: string; arguments: string }) {
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

function handleTwilioMessage(data: RawData) {
  const msg = parseMessage(data);
  if (!msg) {
    console.log("Failed to parse Twilio message");
    return;
  }

  console.log("Twilio message received:", msg.event);
  switch (msg.event) {
    case "start":
      console.log("Twilio stream started, streamSid:", msg.start?.streamSid);
      session.streamSid = msg.start.streamSid;
      session.latestMediaTimestamp = 0;
      session.lastAssistantItem = undefined;
      session.responseStartTimestamp = undefined;
      session.audioBuffer = [];
      session.responseCreated = false;
      tryConnectModel();
      break;
    case "media":
      session.latestMediaTimestamp = msg.media.timestamp;
      
      // CORRECTION: Bufferiser l'audio si response.created n'a pas encore été reçu
      if (!session.responseCreated) {
        console.log("Buffering audio (response not created yet)");
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
        console.log("Model connection not open, dropping audio");
      }
      break;
    case "close":
      console.log("Twilio stream closed");
      closeAllConnections();
      break;
  }
}

function handleFrontendMessage(data: RawData) {
  const msg = parseMessage(data);
  if (!msg) return;

  if (isOpen(session.modelConn)) {
    jsonSend(session.modelConn, msg);
  }

  if (msg.type === "session.update") {
    session.saved_config = msg.session;
  }
}

function tryConnectModel() {
  if (!session.twilioConn || !session.streamSid || !session.openAIApiKey) {
    console.log("Cannot connect model: missing requirements", {
      hasTwilioConn: !!session.twilioConn,
      hasStreamSid: !!session.streamSid,
      hasApiKey: !!session.openAIApiKey,
    });
    return;
  }
  if (isOpen(session.modelConn)) {
    console.log("Model connection already open");
    return;
  }

  console.log("Connecting to OpenAI Realtime API...");
  session.modelConn = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
    {
      headers: {
        Authorization: `Bearer ${session.openAIApiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  session.modelConn.on("open", () => {
    console.log("OpenAI Realtime API connected");
    const config = session.saved_config || {};
    
    const functionSchemas = functions.map((f) => f.schema);
    
    jsonSend(session.modelConn, {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        turn_detection: {
          type: "server_vad",
          threshold: 0.8,                 // moins sensible → évite les coupures
          silence_duration_ms: 650        // attend plus longtemps avant de considérer que tu as fini
        },
        voice: "ash",
        input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        tools: functionSchemas.length > 0 ? functionSchemas : undefined,
        ...config,
      },
    });
    console.log("Session update sent, waiting for confirmation...");
  });

  session.modelConn.on("message", handleModelMessage);
  session.modelConn.on("error", (err) => {
    console.error("OpenAI Realtime API error:", err);
    closeModel();
  });
  session.modelConn.on("close", (code, reason) => {
    console.log("OpenAI Realtime API closed:", code, reason.toString());
    closeModel();
  });
}

function handleModelMessage(data: RawData) {
  const event = parseMessage(data);
  if (!event) {
    console.log("Failed to parse model message");
    return;
  }

  console.log("Model event received:", event.type);

  jsonSend(session.frontendConn, event);

  switch (event.type) {
    case "session.updated":
      console.log("Session updated confirmed, starting response...");
      // CORRECTION: Attendre un court délai avant d'envoyer response.create
      setTimeout(() => {
        if (isOpen(session.modelConn)) {
          console.log("Sending response.create...");
          jsonSend(session.modelConn, { type: "response.create" });
          
          // CORRECTION: Ajouter un timeout pour vérifier que response.created arrive
          session.responseCreateTimeout = setTimeout(() => {
            if (!session.responseCreated) {
              console.error("TIMEOUT: response.created not received after 5 seconds");
              console.error("Retrying response.create...");
              if (isOpen(session.modelConn)) {
                jsonSend(session.modelConn, { type: "response.create" });
              }
            }
          }, 5000);
        }
      }, 100);
      break;

    case "response.created":
      console.log("Response created, model is now listening");
      session.responseCreated = true;
      
      // CORRECTION: Envoyer tous les messages audio bufferisés avec un délai pour simuler le flux réel
      if (session.audioBuffer.length > 0) {
        console.log(`Sending ${session.audioBuffer.length} buffered audio messages (with delay to simulate real-time)`);
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
      console.log("Speech detected, handling truncation");
      handleTruncation();
      break;

    // CORRECTION: Ajouter handler pour response.output_item.added
    case "response.output_item.added":
      console.log("Response output item added:", event.item?.type);
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
        console.log("Cannot send audio: missing twilioConn or streamSid");
      }
      break;

    case "response.output_item.done": {
      const { item } = event;
      if (item.type === "function_call") {
        console.log("Function call completed:", item.name);
        handleFunctionCall(item)
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
            console.error("Error handling function call:", err);
          });
      }
      break;
    }

    // CORRECTION: Ajouter handler pour les transcriptions
    case "conversation.item.input_audio_transcription.completed":
      console.log("Input audio transcription completed:", event.transcript);
      break;

    case "conversation.item.input_audio_transcription.failed":
      console.error("Input audio transcription failed:", event.error);
      // Si la transcription échoue, on peut quand même continuer
      break;

    case "response.done":
      if (event.response?.status === "failed") {
        console.error("Response failed:", event.response.status_details);
        // Si la réponse échoue, créer une nouvelle réponse pour continuer
        if (isOpen(session.modelConn)) {
          console.log("Creating new response after failure...");
          setTimeout(() => {
            if (isOpen(session.modelConn)) {
              jsonSend(session.modelConn, { type: "response.create" });
            }
          }, 500);
        }
      } else {
        console.log("Response completed successfully:", event.response?.status);
      }
      break;

    case "error":
      console.error("Model error:", event);
      break;

    default:
      // CORRECTION: Logger tous les événements non gérés pour debugging
      if (!event.type.startsWith("response.audio_transcript")) {
        console.log("Unhandled event type:", event.type, JSON.stringify(event).substring(0, 200));
      }
      break;
  }
}

function handleTruncation() {
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

function closeModel() {
  cleanupConnection(session.modelConn);
  session.modelConn = undefined;
  if (session.responseCreateTimeout) {
    clearTimeout(session.responseCreateTimeout);
  }
  if (!session.twilioConn && !session.frontendConn) {
    session = { audioBuffer: [], responseCreated: false };
  }
}

function closeAllConnections() {
  if (session.twilioConn) {
    session.twilioConn.close();
    session.twilioConn = undefined;
  }
  if (session.modelConn) {
    session.modelConn.close();
    session.modelConn = undefined;
  }
  if (session.frontendConn) {
    session.frontendConn.close();
    session.frontendConn = undefined;
  }
  if (session.responseCreateTimeout) {
    clearTimeout(session.responseCreateTimeout);
  }
  session.streamSid = undefined;
  session.lastAssistantItem = undefined;
  session.responseStartTimestamp = undefined;
  session.latestMediaTimestamp = undefined;
  session.saved_config = undefined;
  session.audioBuffer = [];
  session.responseCreated = false;
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

