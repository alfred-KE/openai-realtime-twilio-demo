# OpenAI Realtime API with Twilio Quickstart

Combine OpenAI's Realtime API and Twilio's phone calling capability to build an AI calling assistant that can handle phone calls with real-time voice interaction.

<img width="1728" alt="Screenshot 2024-12-18 at 4 59 30 PM" src="https://github.com/user-attachments/assets/d3c8dcce-b339-410c-85ca-864a8e0fc326" />

## Quick Setup

Open three terminal windows:

| Terminal | Purpose                       | Quick Reference (see below for more) |
| -------- | ----------------------------- | ------------------------------------ |
| 1        | To run the `webapp`           | `npm run dev`                        |
| 2        | To run the `websocket-server` | `npm run dev`                        |
| 3        | To run `ngrok`                | `ngrok http 8081`                    |

Make sure all vars in `webapp/.env` and `websocket-server/.env` are set correctly. See [full setup](#full-setup) section for more.

## Overview

This repository implements a phone calling assistant that integrates OpenAI's Realtime API with Twilio's telephony infrastructure. The application consists of three main components:

1. **`webapp`**: A Next.js frontend application that provides a user interface for call configuration, real-time transcript viewing, and conversation history management
2. **`websocket-server`**: An Express.js backend server that acts as a bridge between Twilio, OpenAI's Realtime API, and the frontend
3. **`mcp-server`**: A Model Context Protocol (MCP) server that exposes conversation history to AI assistants like Claude Desktop

<img width="1514" alt="Screenshot 2024-12-20 at 10 32 40 AM" src="https://github.com/user-attachments/assets/61d39b88-4861-4b6f-bfe2-796957ab5476" />

## How It Works

### Architecture Overview

The application creates a real-time bidirectional communication bridge between phone calls (via Twilio) and OpenAI's Realtime API. Here's the flow:

1. **Phone Call Initiation**: When someone calls a Twilio-managed phone number, Twilio receives the call
2. **TwiML Webhook**: Twilio queries your backend's `/twiml` endpoint to get instructions on how to handle the call
3. **Bidirectional Stream**: Twilio opens a WebSocket connection to your backend (`/call` endpoint) for real-time audio streaming
4. **OpenAI Connection**: The backend establishes a WebSocket connection to OpenAI's Realtime API
5. **Message Forwarding**: The backend forwards audio and events between:
   - Twilio ↔ OpenAI Realtime API (for the actual phone conversation)
   - Frontend ↔ OpenAI Realtime API (for real-time transcript updates and configuration)

### TwiML Configuration

Twilio uses TwiML (Twilio Markup Language, an XML-based format) to specify how to handle phone calls. When a call comes in, we tell Twilio to start a bidirectional stream to our backend. The `{{WS_URL}}` placeholder is replaced with our WebSocket endpoint.

```xml
<!-- TwiML to start a bi-directional stream-->

<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connected</Say>
  <Connect>
    <Stream url="{{WS_URL}}" />
  </Connect>
  <Say>Disconnected</Say>
</Response>
```

We use `ngrok` to make our local server reachable by Twilio's cloud infrastructure.

### Life of a Phone Call

#### Setup Phase

1. **Start ngrok**: Run `ngrok http 8081` to create a public tunnel to your local websocket server
2. **Configure Twilio Webhook**: Set the Twilio webhook URL to your ngrok address (e.g., `https://your-ngrok-url.ngrok-free.app/twiml`)
3. **Frontend Connection**: The frontend connects to the backend's `/logs` WebSocket endpoint, ready to receive real-time updates

#### Call Flow

1. **Incoming Call**: A call is placed to your Twilio-managed phone number
2. **TwiML Request**: Twilio queries the webhook (`http://[your_backend]/twiml`) for TwiML instructions
3. **Stream Establishment**: Twilio opens a bidirectional WebSocket stream to the backend (`wss://[your_backend]/call`)
4. **OpenAI Connection**: The backend connects to OpenAI's Realtime API using your API key
5. **Session Configuration**: The backend sends session configuration (voice, temperature, tools, etc.) to OpenAI
6. **Audio Streaming**: 
   - Audio from the caller flows: Twilio → Backend → OpenAI Realtime API
   - Audio responses flow: OpenAI Realtime API → Backend → Twilio → Caller
7. **Real-time Updates**: The backend forwards events (transcripts, function calls, etc.) to the frontend via the `/logs` WebSocket
8. **Conversation Storage**: All conversation items are stored in a SQLite database for later retrieval

### Component Details

#### WebSocket Server (`websocket-server`)

The backend server handles multiple responsibilities:

- **Call Management**: Manages multiple simultaneous phone calls, each with its own session
- **Session Management**: Creates and maintains sessions that track:
  - Twilio WebSocket connection
  - OpenAI Realtime API WebSocket connection
  - Frontend WebSocket connection
  - Conversation items and metadata
- **Message Routing**: Forwards messages between Twilio, OpenAI, and the frontend
- **Function Calling**: Handles function calls from the AI model and executes them
- **Database Operations**: Stores conversations and items in SQLite for persistence
- **API Endpoints**: Provides REST endpoints for:
  - TwiML generation (`/twiml`)
  - Conversation history (`/api/conversations/*`)
  - Tool schemas (`/tools`)

**Key WebSocket Endpoints:**
- `/call`: Receives connections from Twilio for phone call audio streaming
- `/logs`: Receives connections from the frontend for real-time event updates

#### Web App (`webapp`)

The frontend provides:

- **Call Interface**: Real-time display of conversation transcripts
- **Session Configuration**: UI to configure OpenAI session parameters (voice, temperature, tools, etc.)
- **Phone Number Management**: Interface to select and manage Twilio phone numbers
- **Call Selector**: View and switch between multiple active calls
- **Conversation History**: Browse past conversations stored in the database
- **Function Calls Panel**: View and interact with function calls made during conversations

**Key Features:**
- Real-time transcript updates as the conversation progresses
- Support for multiple simultaneous calls
- Automatic conversation saving to the database
- Configuration persistence across calls

#### MCP Server (`mcp-server`)

The MCP server exposes conversation history to AI assistants:

- **Tools**: Provides functions to query conversations by phone number, date, caller, etc.
- **Resources**: Makes the 100 most recent conversations available as resources
- **Integration**: Can be connected to Claude Desktop or other MCP-compatible clients

### Function Calling

The application supports OpenAI's function calling feature. When the AI model decides to call a function:

1. The function call is received by the backend
2. The backend executes the corresponding handler function
3. The function result is sent back to OpenAI
4. The AI continues the conversation with the function result

This demo includes sample function handlers that you can customize. In production, you would implement actual business logic (e.g., database queries, API calls, etc.).

### Conversation Storage

All conversations are stored in a SQLite database (`websocket-server/data/conversations.db`) with the following structure:

- **conversations**: Stores metadata about each call (phone numbers, timestamps, duration, message count)
- **conversation_items**: Stores individual messages and function calls within each conversation

The database is automatically initialized when the server starts, and conversations are saved in real-time as the call progresses.

## Full Setup

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A Twilio account with a phone number
- An OpenAI API key with access to the Realtime API
- ngrok (for local development)

### Installation Steps

1. **Clone and install dependencies**:

```shell
# Install webapp dependencies
cd webapp
npm install

# Install websocket-server dependencies
cd ../websocket-server
npm install

# Install mcp-server dependencies (optional)
cd ../mcp-server
npm install
npm run build
```

2. **Configure environment variables**:

Set your credentials in `webapp/.env` and `websocket-server/.env` - see `webapp/.env.example` and `websocket-server/.env.example` for reference.

Required variables:
- `OPENAI_API_KEY`: Your OpenAI API key
- `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
- `PUBLIC_URL`: Your ngrok URL (see below)

3. **Run the webapp**:

```shell
cd webapp
npm run dev
```

The webapp will be available at `http://localhost:3000` (or the port specified in your Next.js config).

4. **Run the websocket server**:

```shell
cd websocket-server
npm run dev
```

The server will run on port `8081` by default.

5. **Start ngrok**:

```shell
ngrok http 8081
```

Make note of the `Forwarding` URL (e.g., `https://54c5-35-170-32-42.ngrok-free.app`).

6. **Configure PUBLIC_URL**:

Set the `PUBLIC_URL` in `websocket-server/.env` to your ngrok URL (e.g., `PUBLIC_URL=https://54c5-35-170-32-42.ngrok-free.app`).

7. **Configure Twilio Webhook**:

In your Twilio Console, set the webhook URL for your phone number to:
```
https://your-ngrok-url.ngrok-free.app/twiml
```

## Detailed Auth & Env

### OpenAI & Twilio

Set your credentials in `webapp/.env` and `websocket-server/.env` - see `webapp/.env.example` and `websocket-server/.env.example` for reference.

**Required Environment Variables:**

**webapp/.env:**
- `OPENAI_API_KEY`: Your OpenAI API key
- `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
- `NEXT_PUBLIC_WEBSOCKET_URL`: The WebSocket URL for the backend (usually your ngrok URL)

**websocket-server/.env:**
- `OPENAI_API_KEY`: Your OpenAI API key
- `PUBLIC_URL`: Your public URL (ngrok URL) where Twilio can reach your server
- `PORT`: Port for the websocket server (default: 8081)

### Ngrok

Twilio needs to be able to reach your websocket server. If you're running it locally, your ports are inaccessible by default. [ngrok](https://ngrok.com/) can make them temporarily accessible.

We have set the `websocket-server` to run on port `8081` by default, so that is the port we will be forwarding.

```shell
ngrok http 8081
```

Make note of the `Forwarding` URL. (e.g., `https://54c5-35-170-32-42.ngrok-free.app`)

### Websocket URL

Your server should now be accessible at the `Forwarding` URL when run, so set the `PUBLIC_URL` in `websocket-server/.env`. See `websocket-server/.env.example` for reference.

## Additional Notes

This repo isn't polished, and the security practices leave some to be desired. Please only use this as reference, and make sure to audit your app with security and engineering before deploying!

### Production Considerations

- **Security**: Implement proper authentication and authorization
- **Error Handling**: Add comprehensive error handling and retry logic
- **Rate Limiting**: Implement rate limiting to prevent abuse
- **Monitoring**: Add logging and monitoring for production use
- **Database**: Consider using a production-grade database instead of SQLite
- **HTTPS**: Ensure all connections use HTTPS in production
- **API Keys**: Never commit API keys to version control
