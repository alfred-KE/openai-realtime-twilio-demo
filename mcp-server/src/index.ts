#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Chemin vers la base de données (remonter de mcp-server vers websocket-server)
const dbPath = join(__dirname, "..", "..", "websocket-server", "data", "conversations.db");
const db = new Database(dbPath);

// Créer le serveur MCP
const server = new Server(
  {
    name: "twilio-conversations",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Lister les outils disponibles
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_conversations",
        description: "Récupère la liste des conversations avec filtres optionnels (par numéro de téléphone, SID, ou toutes)",
        inputSchema: {
          type: "object",
          properties: {
            phoneNumber: {
              type: "string",
              description: "Numéro de téléphone pour filtrer (optionnel)",
            },
            phoneNumberSid: {
              type: "string",
              description: "SID du numéro de téléphone pour filtrer (optionnel)",
            },
            limit: {
              type: "number",
              description: "Nombre maximum de conversations à retourner (défaut: 50)",
              default: 50,
            },
          },
        },
      },
      {
        name: "get_conversation_details",
        description: "Récupère les détails complets d'une conversation avec tous ses messages et le numéro de l'appelant",
        inputSchema: {
          type: "object",
          properties: {
            streamSid: {
              type: "string",
              description: "Stream SID de la conversation",
            },
          },
          required: ["streamSid"],
        },
      },
      {
        name: "search_conversations",
        description: "Recherche des conversations par date (format ISO)",
        inputSchema: {
          type: "object",
          properties: {
            startDate: {
              type: "string",
              description: "Date de début (format ISO, optionnel)",
            },
            endDate: {
              type: "string",
              description: "Date de fin (format ISO, optionnel)",
            },
            limit: {
              type: "number",
              description: "Nombre maximum de conversations à retourner",
              default: 50,
            },
          },
        },
      },
      {
        name: "search_conversations_by_caller",
        description: "Recherche des conversations par numéro de l'appelant",
        inputSchema: {
          type: "object",
          properties: {
            callerNumber: {
              type: "string",
              description: "Numéro de téléphone de l'appelant",
            },
            limit: {
              type: "number",
              description: "Nombre maximum de conversations à retourner",
              default: 50,
            },
          },
          required: ["callerNumber"],
        },
      },
    ],
  };
});

// Appeler un outil
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_conversations": {
        const { phoneNumber, phoneNumberSid, limit = 50 } = args || {};
        
        let conversations;
        if (phoneNumberSid) {
          const stmt = db.prepare(`
            SELECT * FROM conversations 
            WHERE phone_number_sid = ? 
            ORDER BY started_at DESC 
            LIMIT ?
          `);
          conversations = stmt.all(phoneNumberSid, limit);
        } else if (phoneNumber) {
          const stmt = db.prepare(`
            SELECT * FROM conversations 
            WHERE phone_number = ? 
            ORDER BY started_at DESC 
            LIMIT ?
          `);
          conversations = stmt.all(phoneNumber, limit);
        } else {
          const stmt = db.prepare(`
            SELECT * FROM conversations 
            ORDER BY started_at DESC 
            LIMIT ?
          `);
          conversations = stmt.all(limit);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(conversations, null, 2),
            },
          ],
        };
      }

      case "get_conversation_details": {
        const { streamSid } = args || {};
        if (!streamSid) {
          throw new Error("streamSid est requis");
        }

        // Récupérer la conversation
        const convStmt = db.prepare("SELECT * FROM conversations WHERE stream_sid = ?");
        const conversation = convStmt.get(streamSid) as any;
        
        if (!conversation) {
          return {
            content: [
              {
                type: "text",
                text: `Conversation avec stream_sid "${streamSid}" non trouvée`,
              },
            ],
          };
        }

        // Récupérer les items
        const itemsStmt = db.prepare(`
          SELECT * FROM conversation_items 
          WHERE conversation_id = ? 
          ORDER BY timestamp ASC, created_at ASC
        `);
        const items = itemsStmt.all(conversation.id);

        // Formater les items pour la lecture
        const formattedItems = items.map((item: any) => {
          const content = JSON.parse(item.content || "[]");
          const textContent = content
            .filter((c: any) => c && (c.type === "text" || c.text))
            .map((c: any) => c.text || "")
            .join("");

          return {
            role: item.role,
            content: textContent,
            timestamp: item.timestamp,
            type: item.item_type,
          };
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  conversation: {
                    id: conversation.id,
                    stream_sid: conversation.stream_sid,
                    phone_number: conversation.phone_number,
                    phone_number_sid: conversation.phone_number_sid,
                    caller_number: conversation.caller_number,
                    started_at: conversation.started_at,
                    ended_at: conversation.ended_at,
                    duration_seconds: conversation.duration_seconds,
                    message_count: conversation.message_count,
                  },
                  items: formattedItems,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "search_conversations": {
        const { startDate, endDate, limit = 50 } = args || {};
        
        let query = "SELECT * FROM conversations WHERE 1=1";
        const params: any[] = [];

        if (startDate) {
          query += " AND started_at >= ?";
          params.push(startDate);
        }
        if (endDate) {
          query += " AND started_at <= ?";
          params.push(endDate);
        }

        query += " ORDER BY started_at DESC LIMIT ?";
        params.push(limit);

        const stmt = db.prepare(query);
        const conversations = stmt.all(...params);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(conversations, null, 2),
            },
          ],
        };
      }

      case "search_conversations_by_caller": {
        const { callerNumber, limit = 50 } = args || {};
        if (!callerNumber) {
          throw new Error("callerNumber est requis");
        }

        const stmt = db.prepare(`
          SELECT * FROM conversations 
          WHERE caller_number = ? 
          ORDER BY started_at DESC 
          LIMIT ?
        `);
        const conversations = stmt.all(callerNumber, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(conversations, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Outil inconnu: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Erreur: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Lister les ressources disponibles
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  // Récupérer toutes les conversations pour créer les ressources
  const stmt = db.prepare(`
    SELECT stream_sid, phone_number, caller_number, started_at 
    FROM conversations 
    ORDER BY started_at DESC 
    LIMIT 100
  `);
  const conversations = stmt.all() as any[];

  return {
    resources: conversations.map((conv) => ({
      uri: `conversation://${conv.stream_sid}`,
      name: `Conversation ${conv.caller_number || conv.phone_number} - ${new Date(conv.started_at).toLocaleString()}`,
      description: `Conversation du ${new Date(conv.started_at).toLocaleString()}${conv.caller_number ? ` (Appelant: ${conv.caller_number})` : ""}`,
      mimeType: "application/json",
    })),
  };
});

// Lire une ressource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (!uri.startsWith("conversation://")) {
    throw new Error(`URI non supportée: ${uri}`);
  }

  const streamSid = uri.replace("conversation://", "");

  // Récupérer la conversation
  const convStmt = db.prepare("SELECT * FROM conversations WHERE stream_sid = ?");
  const conversation = convStmt.get(streamSid) as any;

  if (!conversation) {
    throw new Error(`Conversation non trouvée: ${streamSid}`);
  }

  // Récupérer les items
  const itemsStmt = db.prepare(`
    SELECT * FROM conversation_items 
    WHERE conversation_id = ? 
    ORDER BY timestamp ASC, created_at ASC
  `);
  const items = itemsStmt.all(conversation.id);

  // Formater pour la lecture
  const formattedItems = items.map((item: any) => {
    const content = JSON.parse(item.content || "[]");
    const textContent = content
      .filter((c: any) => c && (c.type === "text" || c.text))
      .map((c: any) => c.text || "")
      .join("");

    return {
      role: item.role,
      content: textContent,
      timestamp: item.timestamp,
      type: item.item_type,
    };
  });

  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            conversation: {
              id: conversation.id,
              stream_sid: conversation.stream_sid,
              phone_number: conversation.phone_number,
              phone_number_sid: conversation.phone_number_sid,
              caller_number: conversation.caller_number,
              started_at: conversation.started_at,
              ended_at: conversation.ended_at,
              duration_seconds: conversation.duration_seconds,
              message_count: conversation.message_count,
            },
            items: formattedItems,
          },
          null,
          2
        ),
      },
    ],
  };
});

// Démarrer le serveur
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Serveur MCP Twilio Conversations démarré");
}

main().catch((error) => {
  console.error("Erreur fatale:", error);
  process.exit(1);
});

