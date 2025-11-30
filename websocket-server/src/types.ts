import { WebSocket } from "ws";

export interface Session {
  twilioConn?: WebSocket;
  frontendConn?: WebSocket;
  modelConn?: WebSocket;
  config?: any;
  streamSid?: string;
}

export interface FunctionCallItem {
  name: string;
  arguments: string;
  call_id?: string;
}

export interface FunctionSchema {
  name: string;
  type: "function";
  description?: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
}

export interface FunctionHandler {
  schema: FunctionSchema;
  handler: (args: any) => Promise<string>;
}

export interface Item {
  id: string;
  object?: string;
  type: "message" | "function_call" | "function_call_output";
  timestamp?: string;
  status?: "running" | "completed";
  role?: "system" | "user" | "assistant" | "tool";
  content?: { type: string; text: string }[];
  name?: string;
  call_id?: string;
  params?: Record<string, any>;
  output?: string;
  streamSid?: string;
}
