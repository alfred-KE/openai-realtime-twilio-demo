"use client";

import React, { useState, useEffect, useMemo } from "react";
import TopBar from "@/components/top-bar";
import ChecklistAndConfig from "@/components/checklist-and-config";
import SessionConfigurationPanel from "@/components/session-configuration-panel";
import Transcript from "@/components/transcript";
import FunctionCallsPanel from "@/components/function-calls-panel";
import CallSelector from "@/components/call-selector";
import ConversationHistory from "@/components/conversation-history";
import { Item } from "@/components/types";
import handleRealtimeEvent from "@/lib/handle-realtime-event";
import PhoneNumberChecklist from "@/components/phone-number-checklist";
import { getWebSocketLogsUrl, getApiUrl } from "@/lib/websocket-url";

const CallInterface = () => {
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState("");
  const [selectedPhoneNumberSid, setSelectedPhoneNumberSid] = useState("");
  const [allConfigsReady, setAllConfigsReady] = useState(false);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [selectedStreamSid, setSelectedStreamSid] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState("disconnected");
  const [ws, setWs] = useState<WebSocket | null>(null);
  // Set pour suivre les appels actifs (ceux qui ont encore des événements)
  const [activeStreamSids, setActiveStreamSids] = useState<Set<string>>(new Set());

  // Group items by streamSid and track active calls (seulement ceux qui sont actifs)
  const activeCalls = useMemo(() => {
    const calls = new Map<string, { items: Item[]; startTime: Date }>();
    
    // Ne garder que les appels qui sont dans activeStreamSids
    allItems.forEach((item) => {
      const sid = item.streamSid || "unknown";
      if (sid === "unknown" || !activeStreamSids.has(sid)) {
        return; // Ignorer les items des appels terminés
      }
      
      if (!calls.has(sid)) {
        // Find the earliest timestamp for this call
        const callItems = allItems.filter((i) => i.streamSid === sid);
        const earliestItem = callItems.find((i) => i.timestamp);
        calls.set(sid, {
          items: callItems,
          startTime: earliestItem?.timestamp
            ? new Date(earliestItem.timestamp)
            : new Date(),
        });
      } else {
        // Update items for this call
        const call = calls.get(sid)!;
        call.items = allItems.filter((i) => i.streamSid === sid);
      }
    });
    
    return calls;
  }, [allItems, activeStreamSids]);

  // Filter items based on selected call
  const displayedItems = useMemo(() => {
    if (selectedStreamSid === null) {
      // Show all calls combined
      return allItems;
    }
    return allItems.filter((item) => item.streamSid === selectedStreamSid);
  }, [allItems, selectedStreamSid]);

  // Auto-select the most recent call if none selected
  useEffect(() => {
    if (selectedStreamSid === null && activeCalls.size > 0) {
      const calls = Array.from(activeCalls.entries());
      // Sort by start time (most recent first)
      calls.sort((a, b) => b[1].startTime.getTime() - a[1].startTime.getTime());
      setSelectedStreamSid(calls[0][0]);
    }
  }, [activeCalls, selectedStreamSid]);

  // Sauvegarder les items dans la base de données (avec debounce pour éviter trop d'appels)
  useEffect(() => {
    if (allItems.length === 0) return;
    
    const timeoutId = setTimeout(() => {
      // Grouper les items par streamSid et sauvegarder
      const itemsByStreamSid = new Map<string, Item[]>();
      allItems.forEach((item) => {
        const sid = item.streamSid || "unknown";
        if (!itemsByStreamSid.has(sid)) {
          itemsByStreamSid.set(sid, []);
        }
        itemsByStreamSid.get(sid)!.push(item);
      });

      // Sauvegarder chaque groupe d'items
      itemsByStreamSid.forEach((items, streamSid) => {
        if (streamSid === "unknown") return;
        
        // Sauvegarder via API (le backend récupérera le conversationId depuis la session)
        fetch(getApiUrl(`conversations/stream/${streamSid}/items`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        }).catch((err) => {
          console.error(`Error saving items for ${streamSid}:`, err);
        });
      });
    }, 2000); // Debounce de 2 secondes
    
    return () => clearTimeout(timeoutId);
  }, [allItems]);

  // Charger une conversation depuis l'historique
  const handleLoadConversation = async (streamSid: string) => {
    try {
      const res = await fetch(getApiUrl(`conversations/stream/${streamSid}`));
      if (!res.ok) throw new Error("Failed to load conversation");
      const data = await res.json();
      
      // Ajouter le streamSid aux items
      const itemsWithStreamSid = data.items.map((item: Item) => ({
        ...item,
        streamSid: data.stream_sid,
      }));
      
      // Remplacer les items actuels par ceux de la conversation
      setAllItems(itemsWithStreamSid);
      setSelectedStreamSid(streamSid);
    } catch (err) {
      console.error("Error loading conversation:", err);
      alert("Failed to load conversation");
    }
  };

  useEffect(() => {
    if (allConfigsReady && !ws) {
      const newWs = new WebSocket(getWebSocketLogsUrl());

      newWs.onopen = () => {
        console.log("Connected to logs websocket");
        setCallStatus("connected");
      };

      newWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Received logs event:", data);
        const streamSid = data.streamSid;
        
        // Mettre à jour activeStreamSids selon le type d'événement
        if (data.type === "call.ended" && streamSid) {
          // Retirer l'appel de la liste des actifs
          setActiveStreamSids((prev) => {
            const next = new Set(prev);
            next.delete(streamSid);
            return next;
          });
          // Si c'était l'appel sélectionné, désélectionner
          setSelectedStreamSid((current) => (current === streamSid ? null : current));
        } else if (streamSid && data.type !== "call.ended") {
          // Ajouter l'appel à la liste des actifs si on reçoit un événement
          setActiveStreamSids((prev) => {
            const next = new Set(prev);
            next.add(streamSid);
            return next;
          });
        }
        
        handleRealtimeEvent(data, setAllItems, streamSid);
      };

      newWs.onclose = () => {
        console.log("Logs websocket disconnected");
        setWs(null);
        setCallStatus("disconnected");
      };

      setWs(newWs);
    }
  }, [allConfigsReady, ws]);

  return (
    <div className="h-screen bg-background flex flex-col">
      <ChecklistAndConfig
        ready={allConfigsReady}
        setReady={setAllConfigsReady}
        selectedPhoneNumber={selectedPhoneNumber}
        setSelectedPhoneNumber={setSelectedPhoneNumber}
        selectedPhoneNumberSid={selectedPhoneNumberSid}
        setSelectedPhoneNumberSid={setSelectedPhoneNumberSid}
      />
      <TopBar />
      <div className="flex-grow p-4 h-full overflow-hidden flex flex-col">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Left Column */}
          <div className="col-span-3 flex flex-col h-full overflow-hidden gap-4">
            <SessionConfigurationPanel
              callStatus={callStatus}
              onSave={(config) => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                  const updateEvent = {
                    type: "session.update",
                    session: {
                      ...config,
                    },
                  };
                  console.log("Sending update event:", updateEvent);
                  ws.send(JSON.stringify(updateEvent));
                }
              }}
            />
            {selectedPhoneNumber && (
              <ConversationHistory
                phoneNumber={selectedPhoneNumber}
                onLoadConversation={handleLoadConversation}
              />
            )}
          </div>

          {/* Middle Column: Transcript */}
          <div className="col-span-6 flex flex-col gap-4 h-full overflow-hidden">
            <PhoneNumberChecklist
              selectedPhoneNumber={selectedPhoneNumber}
              allConfigsReady={allConfigsReady}
              setAllConfigsReady={setAllConfigsReady}
            />
            <CallSelector
              activeCalls={activeCalls}
              selectedStreamSid={selectedStreamSid}
              onSelectCall={setSelectedStreamSid}
            />
            <Transcript 
              items={displayedItems} 
              showStreamSid={activeCalls.size > 1 && selectedStreamSid === null}
            />
          </div>

          {/* Right Column: Function Calls */}
          <div className="col-span-3 flex flex-col h-full overflow-hidden">
            <FunctionCallsPanel items={displayedItems} ws={ws} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallInterface;
