import { Item } from "@/components/types";

export default function handleRealtimeEvent(
  ev: any,
  setItems: React.Dispatch<React.SetStateAction<Item[]>>,
  streamSid?: string
) {
  // Helper function to create a new item with default fields
  function createNewItem(base: Partial<Item>): Item {
    return {
      object: "realtime.item",
      timestamp: new Date().toLocaleTimeString(),
      streamSid: streamSid || base.streamSid,
      ...base,
    } as Item;
  }

  // Helper function to update an existing item if found by id, or add a new one if not.
  // We can also pass partial updates to reduce repetitive code.
  function updateOrAddItem(id: string, updates: Partial<Item>): void {
    setItems((prev) => {
      // Filtrer par streamSid si fourni
      const relevantItems = streamSid 
        ? prev.filter((m) => m.streamSid === streamSid)
        : prev;
      const otherItems = streamSid
        ? prev.filter((m) => m.streamSid !== streamSid)
        : [];
      
      const idx = relevantItems.findIndex((m) => m.id === id);
      if (idx >= 0) {
        const updated = [...relevantItems];
        updated[idx] = { ...updated[idx], ...updates, streamSid: streamSid || updated[idx].streamSid };
        return [...otherItems, ...updated];
      } else {
        return [...prev, createNewItem({ id, ...updates })];
      }
    });
  }

  const { type } = ev;
  const eventStreamSid = ev.streamSid || streamSid;

  switch (type) {
    case "session.created": {
      // Starting a new session, clear items for this streamSid only
      if (eventStreamSid) {
        setItems((prev) => prev.filter((item) => item.streamSid !== eventStreamSid));
      } else {
        // If no streamSid, clear all (backward compatibility)
        setItems([]);
      }
      break;
    }

    case "input_audio_buffer.speech_started": {
      // Create a user message item with running status and placeholder content
      const { item_id } = ev;
      console.log("🎤 Speech started, item_id:", item_id, "streamSid:", eventStreamSid);
      setItems((prev) => {
        const relevantItems = eventStreamSid 
          ? prev.filter((m) => m.streamSid === eventStreamSid)
          : prev;
        const otherItems = eventStreamSid
          ? prev.filter((m) => m.streamSid !== eventStreamSid)
          : [];
        
        // Vérifier si l'item existe déjà pour éviter les doublons
        const exists = relevantItems.some((m) => m.id === item_id && m.role === "user");
        if (exists) {
          console.log("⚠️ Item user existe déjà, mise à jour du statut");
          const updated = relevantItems.map((m) =>
            m.id === item_id && m.role === "user"
              ? { ...m, status: "running", streamSid: eventStreamSid }
              : m
          );
          return [...otherItems, ...updated];
        }
        return [
          ...prev,
          createNewItem({
            id: item_id,
            type: "message",
            role: "user",
            content: [{ type: "text", text: "..." }],
            status: "running",
            streamSid: eventStreamSid,
          }),
        ];
      });
      break;
    }

    case "conversation.item.created": {
      const { item } = ev;
      if (item.type === "message") {
        // A completed message from user or assistant
        console.log("💬 Message créé:", item.id, "role:", item.role, "streamSid:", eventStreamSid);
        const updatedContent =
          item.content && item.content.length > 0 ? item.content : [];
        setItems((prev) => {
          const relevantItems = eventStreamSid 
            ? prev.filter((m) => m.streamSid === eventStreamSid)
            : prev;
          const otherItems = eventStreamSid
            ? prev.filter((m) => m.streamSid !== eventStreamSid)
            : [];
          
          const idx = relevantItems.findIndex((m) => m.id === item.id);
          if (idx >= 0) {
            // Item existe, le mettre à jour
            const updated = [...relevantItems];
            updated[idx] = {
              ...updated[idx],
              ...item,
              content: updatedContent,
              status: "completed",
              streamSid: eventStreamSid || updated[idx].streamSid,
              timestamp:
                updated[idx].timestamp || new Date().toLocaleTimeString(),
            };
            return [...otherItems, ...updated];
          } else {
            // Item n'existe pas, le créer
            console.log("➕ Création d'un nouveau message:", item.role);
            return [
              ...prev,
              createNewItem({
                ...item,
                content: updatedContent,
                status: "completed",
                streamSid: eventStreamSid,
              }),
            ];
          }
        });
      }
      // NOTE: We no longer handle function_call items here.
      // The handling of function_call items has been moved to the "response.output_item.done" event.
      else if (item.type === "function_call_output") {
        // Function call output item created
        // Add the output item and mark the corresponding function_call as completed
        // Also display in transcript as tool message with the response
        setItems((prev) => {
          const relevantItems = eventStreamSid 
            ? prev.filter((m) => m.streamSid === eventStreamSid)
            : prev;
          const otherItems = eventStreamSid
            ? prev.filter((m) => m.streamSid !== eventStreamSid)
            : [];
          
          const newItems = [
            ...relevantItems,
            createNewItem({
              ...item,
              role: "tool",
              content: [
                {
                  type: "text",
                  text: `Function call response: ${item.output}`,
                },
              ],
              status: "completed",
              streamSid: eventStreamSid,
            }),
          ];

          const updated = newItems.map((m) =>
            m.call_id === item.call_id && m.type === "function_call"
              ? { ...m, status: "completed" }
              : m
          );
          return [...otherItems, ...updated];
        });
      }
      break;
    }

    case "conversation.item.input_audio_transcription.completed": {
      // Update the user message with the final transcript
      const { item_id, transcript } = ev;
      console.log("📝 Transcription complétée pour item:", item_id, "streamSid:", eventStreamSid);
      setItems((prev) => {
        const relevantItems = eventStreamSid 
          ? prev.filter((m) => m.streamSid === eventStreamSid)
          : prev;
        const otherItems = eventStreamSid
          ? prev.filter((m) => m.streamSid !== eventStreamSid)
          : [];
        
        const idx = relevantItems.findIndex((m) => m.id === item_id && m.type === "message" && m.role === "user");
        if (idx >= 0) {
          // Item existe, le mettre à jour
          const updated = [...relevantItems];
          updated[idx] = {
            ...updated[idx],
            content: [{ type: "text", text: transcript || "" }],
            status: "completed",
            streamSid: eventStreamSid || updated[idx].streamSid,
          };
          return [...otherItems, ...updated];
        } else {
          // Item n'existe pas, le créer
          console.log("⚠️ Item user non trouvé, création d'un nouveau item avec transcription");
          return [
            ...prev,
            createNewItem({
              id: item_id,
              type: "message",
              role: "user",
              content: [{ type: "text", text: transcript || "" }],
              status: "completed",
              streamSid: eventStreamSid,
            }),
          ];
        }
      });
      break;
    }

    case "transcription": {
      // Event from backend with transcription and streamSid
      const { item_id, transcript } = ev;
      const sid = ev.streamSid || eventStreamSid;
      console.log("📝 Transcription reçue:", transcript, "streamSid:", sid);
      setItems((prev) => {
        const relevantItems = sid 
          ? prev.filter((m) => m.streamSid === sid)
          : prev;
        const otherItems = sid
          ? prev.filter((m) => m.streamSid !== sid)
          : [];
        
        const idx = relevantItems.findIndex((m) => m.id === item_id && m.type === "message" && m.role === "user");
        if (idx >= 0) {
          const updated = [...relevantItems];
          updated[idx] = {
            ...updated[idx],
            content: [{ type: "text", text: transcript || "" }],
            status: "completed",
            streamSid: sid || updated[idx].streamSid,
          };
          return [...otherItems, ...updated];
        } else {
          return [
            ...prev,
            createNewItem({
              id: item_id,
              type: "message",
              role: "user",
              content: [{ type: "text", text: transcript || "" }],
              status: "completed",
              streamSid: sid,
            }),
          ];
        }
      });
      break;
    }

    case "response.content_part.added": {
      const { item_id, part, output_index } = ev;
      // Append new content to the assistant message if output_index == 0
      if (part.type === "text" && output_index === 0) {
        setItems((prev) => {
          const relevantItems = eventStreamSid 
            ? prev.filter((m) => m.streamSid === eventStreamSid)
            : prev;
          const otherItems = eventStreamSid
            ? prev.filter((m) => m.streamSid !== eventStreamSid)
            : [];
          
          const idx = relevantItems.findIndex((m) => m.id === item_id);
          if (idx >= 0) {
            const updated = [...relevantItems];
            const existingContent = updated[idx].content || [];
            updated[idx] = {
              ...updated[idx],
              content: [
                ...existingContent,
                { type: part.type, text: part.text },
              ],
              streamSid: eventStreamSid || updated[idx].streamSid,
            };
            return [...otherItems, ...updated];
          } else {
            // If the item doesn't exist yet, create it as a running assistant message
            return [
              ...prev,
              createNewItem({
                id: item_id,
                type: "message",
                role: "assistant",
                content: [{ type: part.type, text: part.text }],
                status: "running",
                streamSid: eventStreamSid,
              }),
            ];
          }
        });
      }
      break;
    }

    case "response.audio_transcript.delta": {
      // Streaming transcript text (assistant)
      const { item_id, delta, output_index } = ev;
      if (output_index === 0 && delta) {
        setItems((prev) => {
          const relevantItems = eventStreamSid 
            ? prev.filter((m) => m.streamSid === eventStreamSid)
            : prev;
          const otherItems = eventStreamSid
            ? prev.filter((m) => m.streamSid !== eventStreamSid)
            : [];
          
          const idx = relevantItems.findIndex((m) => m.id === item_id);
          if (idx >= 0) {
            const updated = [...relevantItems];
            const existingContent = updated[idx].content || [];
            updated[idx] = {
              ...updated[idx],
              content: [...existingContent, { type: "text", text: delta }],
              streamSid: eventStreamSid || updated[idx].streamSid,
            };
            return [...otherItems, ...updated];
          } else {
            return [
              ...prev,
              createNewItem({
                id: item_id,
                type: "message",
                role: "assistant",
                content: [{ type: "text", text: delta }],
                status: "running",
                streamSid: eventStreamSid,
              }),
            ];
          }
        });
      }
      break;
    }

    case "response.output_item.done": {
      const { item } = ev;
      if (item.type === "function_call") {
        // A new function call item
        // Display it in the transcript as an assistant message indicating a function is being requested
        console.log("function_call", item, "streamSid:", eventStreamSid);
        setItems((prev) => [
          ...prev,
          createNewItem({
            ...item,
            role: "assistant",
            content: [
              {
                type: "text",
                text: `${item.name}(${JSON.stringify(
                  JSON.parse(item.arguments)
                )})`,
              },
            ],
            status: "running",
            streamSid: eventStreamSid,
          }),
        ]);
      }
      break;
    }

    default:
      break;
  }
}
