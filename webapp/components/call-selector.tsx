"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff } from "lucide-react";
import { Item } from "@/components/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CallSelectorProps = {
  activeCalls: Map<string, { items: Item[]; startTime: Date }>;
  selectedStreamSid: string | null;
  onSelectCall: (streamSid: string | null) => void;
};

const CallSelector: React.FC<CallSelectorProps> = ({
  activeCalls,
  selectedStreamSid,
  onSelectCall,
}) => {
  const callEntries = Array.from(activeCalls.entries());

  if (callEntries.length === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <PhoneOff className="h-4 w-4" />
          <span className="text-sm">No active calls</span>
        </div>
      </Card>
    );
  }

  if (callEntries.length === 1) {
    const [streamSid, { items }] = callEntries[0];
    const messageCount = items.filter((i) => i.type === "message").length;
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium">Active Call</span>
            <span className="text-xs text-muted-foreground">
              ({messageCount} messages)
            </span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {streamSid.substring(0, 8)}...
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium">
            {callEntries.length} Active Calls
          </span>
        </div>
        <Select
          value={selectedStreamSid || "all"}
          onValueChange={(value) => onSelectCall(value === "all" ? null : value)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select a call">
              {selectedStreamSid
                ? `${selectedStreamSid.substring(0, 8)}...`
                : "All calls (combined)"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All calls (combined)</SelectItem>
            {callEntries.map(([streamSid, { items, startTime }]) => {
              const messageCount = items.filter((i) => i.type === "message").length;
              const duration = Math.floor(
                (Date.now() - startTime.getTime()) / 1000
              );
              const minutes = Math.floor(duration / 60);
              const seconds = duration % 60;
              return (
                <SelectItem key={streamSid} value={streamSid}>
                  <div className="flex items-center justify-between w-full">
                    <span className="font-mono text-xs">
                      {streamSid.substring(0, 8)}...
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {messageCount} msgs • {minutes}:{seconds.toString().padStart(2, "0")}
                    </span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    </Card>
  );
};

export default CallSelector;

