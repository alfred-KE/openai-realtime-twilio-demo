/**
 * Utility functions to get WebSocket and HTTP URLs for the websocket server
 */

// Get the base URL from environment variable, default to localhost for development
const getBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    // Client-side: use environment variable
    return (
      process.env.NEXT_PUBLIC_WEBSOCKET_SERVER_URL || "http://localhost:8081"
    );
  }
  // Server-side: use environment variable or default
  return process.env.NEXT_PUBLIC_WEBSOCKET_SERVER_URL || "http://localhost:8081";
};

/**
 * Get the WebSocket URL for logs endpoint
 * Automatically converts http:// to ws:// and https:// to wss://
 */
export const getWebSocketLogsUrl = (): string => {
  const baseUrl = getBaseUrl();
  if (baseUrl.startsWith("https://")) {
    return baseUrl.replace("https://", "wss://") + "/logs";
  }
  if (baseUrl.startsWith("http://")) {
    return baseUrl.replace("http://", "ws://") + "/logs";
  }
  // If already a ws:// or wss:// URL, just append /logs
  if (baseUrl.startsWith("wss://") || baseUrl.startsWith("ws://")) {
    return baseUrl + "/logs";
  }
  // Default fallback
  return "ws://localhost:8081/logs";
};

/**
 * Get the HTTP URL for API endpoints
 */
export const getApiUrl = (endpoint: string = ""): string => {
  const baseUrl = getBaseUrl();
  // Remove trailing slash from baseUrl and leading slash from endpoint
  const cleanBase = baseUrl.replace(/\/$/, "");
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${cleanBase}${cleanEndpoint}`;
};

/**
 * Get the public URL endpoint
 */
export const getPublicUrlEndpoint = (): string => {
  return getApiUrl("public-url");
};

/**
 * Get the tools endpoint
 */
export const getToolsEndpoint = (): string => {
  return getApiUrl("tools");
};




