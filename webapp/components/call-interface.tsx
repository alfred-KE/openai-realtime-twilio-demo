"use client";

import React, { useState, useEffect, useMemo } from "react";
import TopBar from "@/components/top-bar";
import ChecklistAndConfig from "@/components/checklist-and-config";
import SessionConfigurationPanel from "@/components/session-configuration-panel";
import Transcript from "@/components/transcript";
import FunctionCallsPanel from "@/components/function-calls-panel";
import CallSelector from "@/components/call-selector";
import { Item } from "@/components/types";
import handleRealtimeEvent from "@/lib/handle-realtime-event";
import PhoneNumberChecklist from "@/components/phone-number-checklist";
import { getWebSocketLogsUrl } from "@/lib/websocket-url";

const CallInterface = () => {
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState("");
  const [allConfigsReady, setAllConfigsReady] = useState(false);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [selectedStreamSid, setSelectedStreamSid] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState("disconnected");
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Group items by streamSid and track active calls
  const activeCalls = useMemo(() => {
    const calls = new Map<string, { items: Item[]; startTime: Date }>();
    
    allItems.forEach((item) => {
      const sid = item.streamSid || "unknown";
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
  }, [allItems]);

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
      />
      <TopBar />
      <div className="flex-grow p-4 h-full overflow-hidden flex flex-col">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Left Column */}
          <div className="col-span-3 flex flex-col h-full overflow-hidden">
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
