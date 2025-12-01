import express, { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import dotenv from "dotenv";
import http from "http";
import { readFileSync } from "fs";
import { join } from "path";
import cors from "cors";
import {
handleCallConnection,
handleFrontendConnection,
getSessionItems,
} from "./sessionManager";
import functions from "./functionHandlers";
import * as db from "./database";

dotenv.config();

const PORT = parseInt(process.env.PORT || "8081", 10);
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.urlencoded({ extended: false }));

const twimlPath = join(__dirname, "twiml.xml");
const twimlTemplate = readFileSync(twimlPath, "utf-8");

app.get("/public-url", (req, res) => {
res.json({ publicUrl: PUBLIC_URL });
});

app.all("/twiml", (req, res) => {
  console.log("TwiML requested from:", req.ip, req.headers["user-agent"]);
  
  // Extraire les infos de la requête Twilio
  const phoneNumber = req.body?.Called || req.query?.Called || "unknown";
  const phoneNumberSid = req.body?.CalledNumberSid || req.query?.CalledNumberSid || "";
  const callerNumber = req.body?.Caller || req.query?.Caller || "unknown";
  
  const wsUrl = new URL(PUBLIC_URL);
  wsUrl.protocol = "wss:";
  wsUrl.pathname = `/call`;

  const finalUrl = wsUrl.toString();
  console.log("WebSocket URL for Twilio:", finalUrl);
  console.log("Phone number:", phoneNumber, "Caller:", callerNumber);
  
  let twimlContent = twimlTemplate.replace("{{WS_URL}}", finalUrl);
  twimlContent = twimlContent.replace("{{PHONE_NUMBER}}", phoneNumber);
  twimlContent = twimlContent.replace("{{PHONE_NUMBER_SID}}", phoneNumberSid);
  twimlContent = twimlContent.replace("{{CALLER_NUMBER}}", callerNumber);
  
  res.type("text/xml").send(twimlContent);
});

// New endpoint to list available tools (schemas)
app.get("/tools", (req, res) => {
res.json(functions.map((f) => f.schema));
});

// API endpoints for conversation history
app.get("/api/conversations", (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const conversations = db.getAllConversations(limit);
    res.json(conversations);
  } catch (err: any) {
    console.error("Error getting conversations:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/conversations/phone/:phoneNumber", (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const conversations = db.getConversationsByPhoneNumber(phoneNumber, limit);
    res.json(conversations);
  } catch (err: any) {
    console.error("Error getting conversations by phone:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/conversations/phone-sid/:phoneNumberSid", (req, res) => {
  try {
    const { phoneNumberSid } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const conversations = db.getConversationsByPhoneNumberSid(phoneNumberSid, limit);
    res.json(conversations);
  } catch (err: any) {
    console.error("Error getting conversations by phone SID:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/conversations/stream/:streamSid", (req, res) => {
  try {
    const { streamSid } = req.params;
    const conversation = db.getConversationByStreamSid(streamSid);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const items = db.getConversationItems(conversation.id);
    res.json({ ...conversation, items });
  } catch (err: any) {
    console.error("Error getting conversation:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/conversations/stream/:streamSid", (req, res) => {
  try {
    const { streamSid } = req.params;
    const deleted = db.deleteConversation(streamSid);
    if (deleted) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Conversation not found" });
    }
  } catch (err: any) {
    console.error("Error deleting conversation:", err);
    res.status(500).json({ error: err.message });
  }
});

// Save items for a conversation (called from frontend when call ends)
app.post("/api/conversations/stream/:streamSid/items", (req, res) => {
  const { streamSid } = req.params;
  try {
    const { items: frontendItems } = req.body;
    
    const conversation = db.getConversationByStreamSid(streamSid);
    if (!conversation) {
      console.error(`[${streamSid}] Conversation not found when saving items`);
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    
    // Utiliser les items de la session backend si disponibles (ils ont le contenu complet)
    // Sinon utiliser les items du frontend
    const sessionItems = getSessionItems(streamSid);
    const itemsToSave = sessionItems && sessionItems.length > 0 
      ? sessionItems 
      : (Array.isArray(frontendItems) ? frontendItems : []);
    
    if (itemsToSave.length > 0) {
      console.log(`[${streamSid}] Saving ${itemsToSave.length} items to conversation ${conversation.id} (from ${sessionItems ? 'backend session' : 'frontend'})`);
      
      // Log du contenu des items assistant pour déboguer
      const assistantItems = itemsToSave.filter((item: any) => item.role === "assistant" && item.type === "message");
      assistantItems.forEach((item: any, idx: number) => {
        const contentText = item.content 
          ? item.content.map((c: any) => c?.text || "").join("").substring(0, 100)
          : "no content";
        console.log(`[${streamSid}] Assistant item ${idx + 1} (${item.id}): content length=${item.content?.length || 0}, preview="${contentText}"`);
      });
      
      db.saveConversationItems(conversation.id, itemsToSave);
      
      // Mettre à jour le message_count et ended_at
      const messageCount = itemsToSave.filter((item: any) => item.type === "message").length;
      db.endConversation(streamSid, messageCount);
      console.log(`[${streamSid}] Conversation updated: ${messageCount} messages, ended_at set`);
    } else {
      console.log(`[${streamSid}] No items to save`);
    }
    
    res.json({ success: true });
  } catch (err: any) {
    console.error(`[${streamSid}] Error saving conversation items:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Set pour gérer plusieurs connexions d'appels simultanées
const activeCalls = new Set<WebSocket>();
let currentLogs: WebSocket | null = null;

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  console.log("WebSocket connection received:", req.url);
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length < 1) {
    console.log("Invalid connection path, closing");
    ws.close();
    return;
  }

  const type = parts[0];
  console.log("Connection type:", type);

  if (type === "call") {
    console.log("Twilio call connection (multiple calls supported)");
    activeCalls.add(ws);
    handleCallConnection(ws, OPENAI_API_KEY);
    
    // Nettoyer quand la connexion se ferme
    ws.on("close", () => {
      activeCalls.delete(ws);
      console.log(`Call connection closed. Active calls: ${activeCalls.size}`);
    });
  } else if (type === "logs") {
    console.log("Frontend logs connection");
    if (currentLogs) currentLogs.close();
    currentLogs = ws;
    handleFrontendConnection(currentLogs);
  } else {
    console.log("Unknown connection type:", type);
    ws.close();
  }
});

server.listen(PORT, () => {
console.log(`Server running on http://localhost:${PORT}`);
});