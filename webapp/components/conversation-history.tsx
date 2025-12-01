"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Clock, Phone, MessageSquare, Trash2, RefreshCw } from "lucide-react";
import { getApiUrl } from "@/lib/websocket-url";

interface Conversation {
  id: number;
  stream_sid: string;
  phone_number: string;
  caller_number?: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  message_count: number;
}

interface ConversationHistoryProps {
  phoneNumberSid: string;
  onLoadConversation: (streamSid: string) => void;
}

export default function ConversationHistory({
  phoneNumberSid,
  onLoadConversation,
}: ConversationHistoryProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadConversations = async () => {
    if (!phoneNumberSid) {
      console.log("[ConversationHistory] No phoneNumberSid, skipping load");
      setLoading(false);
      return;
    }
    
    console.log(`[ConversationHistory] Loading conversations for phoneNumberSid: ${phoneNumberSid}`);
    setLoading(true);
    try {
      // D'abord, essayer de récupérer le numéro de téléphone depuis l'API Twilio
      const numbersRes = await fetch("/api/twilio/numbers");
      if (numbersRes.ok) {
        const numbers = await numbersRes.json();
        console.log(`[ConversationHistory] Found ${numbers.length} phone numbers from API`);
        const selectedNumber = numbers.find((n: any) => n.sid === phoneNumberSid);
        
        if (selectedNumber) {
          console.log(`[ConversationHistory] Selected number: ${selectedNumber.phoneNumber} (SID: ${phoneNumberSid})`);
          
          // Chercher par phoneNumberSid d'abord
          let res = await fetch(getApiUrl(`conversations/phone-sid/${encodeURIComponent(phoneNumberSid)}`));
          let data = await res.json();
          console.log(`[ConversationHistory] Found ${data.length} conversations by phoneNumberSid`);
          
          // Si aucune conversation trouvée par SID, chercher par numéro de téléphone
          if (data.length === 0 && selectedNumber.phoneNumber) {
            console.log(`[ConversationHistory] Trying to find by phone number: ${selectedNumber.phoneNumber}`);
            res = await fetch(getApiUrl(`conversations/phone/${encodeURIComponent(selectedNumber.phoneNumber)}`));
            data = await res.json();
            console.log(`[ConversationHistory] Found ${data.length} conversations by phone number`);
          }
          
          console.log(`[ConversationHistory] Setting ${data.length} conversations`);
          setConversations(data);
        } else {
          console.warn(`[ConversationHistory] Phone number with SID ${phoneNumberSid} not found in API response`);
          setConversations([]);
        }
      } else {
        console.error("[ConversationHistory] Failed to fetch phone numbers from API");
        // Fallback: chercher directement par phoneNumberSid
        const res = await fetch(getApiUrl(`conversations/phone-sid/${encodeURIComponent(phoneNumberSid)}`));
        const data = await res.json();
        console.log(`[ConversationHistory] Fallback: Found ${data.length} conversations by phoneNumberSid`);
        setConversations(data);
      }
    } catch (err) {
      console.error("[ConversationHistory] Error loading conversations:", err);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [phoneNumberSid]);

  const handleDelete = async (streamSid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this conversation?")) {
      return;
    }
    
    setDeleting(streamSid);
    try {
      const res = await fetch(getApiUrl(`conversations/stream/${streamSid}`), {
        method: "DELETE",
      });
      if (res.ok) {
        setConversations(conversations.filter((c) => c.stream_sid !== streamSid));
      } else {
        alert("Failed to delete conversation");
      }
    } catch (err) {
      console.error("Error deleting conversation:", err);
      alert("Failed to delete conversation");
    } finally {
      setDeleting(null);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <Card className="h-full flex flex-col overflow-hidden">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="text-base font-semibold">Conversation History</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Conversation History</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={loadConversations}
            className="h-8 w-8"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-2 pr-4">
            {conversations.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No conversations yet</p>
                <p className="text-xs mt-1">Conversations will appear here after calls</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="border rounded-lg p-3 hover:bg-accent cursor-pointer transition-colors group"
                  onClick={() => onLoadConversation(conv.stream_sid)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {formatDate(conv.started_at)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDelete(conv.stream_sid, e)}
                      disabled={deleting === conv.stream_sid}
                    >
                      {deleting === conv.stream_sid ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {conv.caller_number && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        <span className="font-medium">{conv.caller_number}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {conv.message_count} messages
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(conv.duration_seconds)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}


