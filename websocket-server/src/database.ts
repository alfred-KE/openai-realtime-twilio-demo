import Database from 'better-sqlite3';
import { join } from 'path';
import { Item } from './types';

const dbPath = join(process.cwd(), 'data', 'conversations.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stream_sid TEXT UNIQUE NOT NULL,
    phone_number TEXT NOT NULL,
    phone_number_sid TEXT,
    caller_number TEXT,
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    duration_seconds INTEGER,
    message_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    item_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    role TEXT,
    content TEXT,
    status TEXT,
    timestamp DATETIME,
    call_id TEXT,
    function_name TEXT,
    function_params TEXT,
    function_output TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    UNIQUE(conversation_id, item_id)
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_phone_number ON conversations(phone_number);
  CREATE INDEX IF NOT EXISTS idx_conversations_started_at ON conversations(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_items_conversation_id ON conversation_items(conversation_id);
`);

export interface Conversation {
  id: number;
  stream_sid: string;
  phone_number: string;
  phone_number_sid?: string;
  caller_number?: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  message_count: number;
  created_at: string;
}

export interface ConversationItem {
  id: number;
  conversation_id: number;
  item_id: string;
  item_type: string;
  role?: string;
  content: string;
  status?: string;
  timestamp?: string;
  call_id?: string;
  function_name?: string;
  function_params?: string;
  function_output?: string;
}

// Start a new conversation
export function startConversation(
  streamSid: string,
  phoneNumber: string,
  phoneNumberSid?: string,
  callerNumber?: string
): number {
  const stmt = db.prepare(`
    INSERT INTO conversations (stream_sid, phone_number, phone_number_sid, caller_number, started_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  const result = stmt.run(streamSid, phoneNumber, phoneNumberSid || null, callerNumber || null);
  return result.lastInsertRowid as number;
}

// Save an item to a conversation
export function saveConversationItem(conversationId: number, item: Item): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO conversation_items 
    (conversation_id, item_id, item_type, role, content, status, timestamp, call_id, function_name, function_params, function_output)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    conversationId,
    item.id,
    item.type,
    item.role || null,
    JSON.stringify(item.content || []),
    item.status || null,
    item.timestamp || null,
    item.call_id || null,
    item.name || null,
    item.params ? JSON.stringify(item.params) : null,
    item.output || null
  );
}

// Save multiple items at once
export function saveConversationItems(conversationId: number, items: Item[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO conversation_items 
    (conversation_id, item_id, item_type, role, content, status, timestamp, call_id, function_name, function_params, function_output)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((items: Item[]) => {
    for (const item of items) {
      stmt.run(
        conversationId,
        item.id,
        item.type,
        item.role || null,
        JSON.stringify(item.content || []),
        item.status || null,
        item.timestamp || null,
        item.call_id || null,
        item.name || null,
        item.params ? JSON.stringify(item.params) : null,
        item.output || null
      );
    }
  });
  
  insertMany(items);
}

// End a conversation
export function endConversation(streamSid: string, messageCount: number): void {
  const stmt = db.prepare(`
    UPDATE conversations 
    SET ended_at = datetime('now'),
        duration_seconds = CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER),
        message_count = ?
    WHERE stream_sid = ?
  `);
  stmt.run(messageCount, streamSid);
}

// Get conversations for a phone number
export function getConversationsByPhoneNumber(phoneNumber: string, limit = 50): Conversation[] {
  const stmt = db.prepare(`
    SELECT * FROM conversations 
    WHERE phone_number = ? 
    ORDER BY started_at DESC 
    LIMIT ?
  `);
  return stmt.all(phoneNumber, limit) as Conversation[];
}

// Get conversations by phone number SID
export function getConversationsByPhoneNumberSid(phoneNumberSid: string, limit = 50): Conversation[] {
  const stmt = db.prepare(`
    SELECT * FROM conversations 
    WHERE phone_number_sid = ? 
    ORDER BY started_at DESC 
    LIMIT ?
  `);
  return stmt.all(phoneNumberSid, limit) as Conversation[];
}

// Get all conversations
export function getAllConversations(limit = 100): Conversation[] {
  const stmt = db.prepare(`
    SELECT * FROM conversations 
    ORDER BY started_at DESC 
    LIMIT ?
  `);
  return stmt.all(limit) as Conversation[];
}

// Get conversation by stream_sid
export function getConversationByStreamSid(streamSid: string): Conversation | null {
  const stmt = db.prepare('SELECT * FROM conversations WHERE stream_sid = ?');
  return stmt.get(streamSid) as Conversation | null;
}

// Get items for a conversation
export function getConversationItems(conversationId: number): Item[] {
  const stmt = db.prepare(`
    SELECT * FROM conversation_items 
    WHERE conversation_id = ? 
    ORDER BY timestamp ASC, created_at ASC
  `);
  const items = stmt.all(conversationId) as ConversationItem[];
  
  return items.map(item => ({
    id: item.item_id,
    object: 'realtime.item',
    type: item.item_type as any,
    role: item.role as any,
    content: JSON.parse(item.content || '[]'),
    status: item.status as any,
    timestamp: item.timestamp,
    call_id: item.call_id,
    name: item.function_name,
    params: item.function_params ? JSON.parse(item.function_params) : undefined,
    output: item.function_output,
    streamSid: undefined,
  }));
}

// Delete a conversation
export function deleteConversation(streamSid: string): boolean {
  const stmt = db.prepare('DELETE FROM conversations WHERE stream_sid = ?');
  const result = stmt.run(streamSid);
  return result.changes > 0;
}

export default db;

