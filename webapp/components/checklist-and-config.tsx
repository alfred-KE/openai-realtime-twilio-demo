"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Circle, CheckCircle, Loader2, Trash2 } from "lucide-react";
import { PhoneNumber } from "@/components/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPublicUrlEndpoint, getApiUrl } from "@/lib/websocket-url";

export default function ChecklistAndConfig({
  ready,
  setReady,
  selectedPhoneNumber,
  setSelectedPhoneNumber,
  selectedPhoneNumberSid,
  setSelectedPhoneNumberSid,
}: {
  ready: boolean;
  setReady: (val: boolean) => void;
  selectedPhoneNumber: string;
  setSelectedPhoneNumber: (val: string) => void;
  selectedPhoneNumberSid: string;
  setSelectedPhoneNumberSid: (val: string) => void;
}) {
  const [hasCredentials, setHasCredentials] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [currentNumberSid, setCurrentNumberSid] = useState("");
  const [currentVoiceUrl, setCurrentVoiceUrl] = useState("");

  const [publicUrl, setPublicUrl] = useState("");
  const [localServerUp, setLocalServerUp] = useState(false);

  const [allChecksPassed, setAllChecksPassed] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const appendedTwimlUrl = publicUrl ? `${publicUrl}/twiml` : "";
  const isWebhookMismatch =
    appendedTwimlUrl && currentVoiceUrl && appendedTwimlUrl !== currentVoiceUrl;

  useEffect(() => {
    let polling = true;

    const pollChecks = async () => {
      try {
        // 1. Check credentials
        let res = await fetch("/api/twilio");
        if (!res.ok) throw new Error("Failed credentials check");
        const credData = await res.json();
        setHasCredentials(!!credData?.credentialsSet);

        // 2. Fetch numbers
        res = await fetch("/api/twilio/numbers");
        if (!res.ok) throw new Error("Failed to fetch phone numbers");
        const numbersData = await res.json();
        if (Array.isArray(numbersData) && numbersData.length > 0) {
          setPhoneNumbers((prevNumbers) => {
            // Only update if the list actually changed
            const prevSids = prevNumbers.map((p) => p.sid).sort().join(",");
            const newSids = numbersData.map((p: PhoneNumber) => p.sid).sort().join(",");
            if (prevSids === newSids) {
              return prevNumbers; // No change, keep previous state
            }
            return numbersData;
          });
          
          // Only update currentNumberSid if it's not set or the selected number is no longer in the list
          setCurrentNumberSid((prevSid) => {
            if (!prevSid) {
              // No number selected, use first
              const first = numbersData[0];
              setCurrentVoiceUrl(first.voiceUrl || "");
              setSelectedPhoneNumber(first.friendlyName || "");
              setSelectedPhoneNumberSid(first.sid || "");
              return first.sid;
            }
            const selected = numbersData.find((p: PhoneNumber) => p.sid === prevSid);
            if (selected) {
              // Selected number still exists, update its URL if needed
              setCurrentVoiceUrl((prevUrl) => {
                if (prevUrl !== selected.voiceUrl) {
                  return selected.voiceUrl || "";
                }
                return prevUrl;
              });
              setSelectedPhoneNumber((prevName) => {
                if (prevName !== selected.friendlyName) {
                  return selected.friendlyName || "";
                }
                return prevName;
              });
              setSelectedPhoneNumberSid(selected.sid || "");
              return prevSid; // Keep the same selection
            }
            // Selected number no longer exists, use first
            const first = numbersData[0];
            setCurrentVoiceUrl(first.voiceUrl || "");
            setSelectedPhoneNumber(first.friendlyName || "");
            setSelectedPhoneNumberSid(first.sid || "");
            return first.sid;
          });
        }

        // 3. Check local server & public URL
        let foundPublicUrl = "";
        try {
          const resLocal = await fetch(getPublicUrlEndpoint(), {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            // Add timeout to avoid hanging
            signal: AbortSignal.timeout(3000),
          });
          if (resLocal.ok) {
            const pubData = await resLocal.json();
            foundPublicUrl = pubData?.publicUrl || "";
            setLocalServerUp(true);
            setPublicUrl((prevUrl) => {
              if (prevUrl !== foundPublicUrl) {
                return foundPublicUrl;
              }
              return prevUrl;
            });
          } else {
            throw new Error("Local server not responding");
          }
        } catch (err) {
          // Si le serveur n'est pas accessible, vérifier si on a une URL configurée dans l'env
          // Utiliser getApiUrl pour obtenir l'URL de base configurée
          const baseUrl = getApiUrl("").replace(/\/$/, "");
          if (baseUrl && baseUrl !== "http://localhost:8081") {
            // On a une URL configurée (probablement via Nginx), considérer que le serveur est accessible
            setPublicUrl(baseUrl);
            setLocalServerUp(true);
          } else {
            setLocalServerUp(false);
            setPublicUrl((prevUrl) => {
              if (prevUrl !== "") {
                return "";
              }
              return prevUrl;
            });
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    pollChecks();
    const intervalId = setInterval(() => polling && pollChecks(), 1000);
    return () => {
      polling = false;
      clearInterval(intervalId);
    };
  }, [setSelectedPhoneNumber]);

  const updateWebhook = async () => {
    if (!currentNumberSid || !appendedTwimlUrl) return;
    try {
      setWebhookLoading(true);
      const res = await fetch("/api/twilio/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberSid: currentNumberSid,
          voiceUrl: appendedTwimlUrl,
        }),
      });
      if (!res.ok) throw new Error("Failed to update webhook");
      setCurrentVoiceUrl(appendedTwimlUrl);
    } catch (err) {
      console.error(err);
    } finally {
      setWebhookLoading(false);
    }
  };


  const deletePhoneNumber = async () => {
    if (!currentNumberSid) return;
    if (!confirm(`Are you sure you want to delete this phone number? This action cannot be undone.`)) {
      return;
    }
    try {
      setDeleteLoading(true);
      const res = await fetch(`/api/twilio/numbers?phoneNumberSid=${currentNumberSid}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete phone number");
      // Remove from local state
      setPhoneNumbers(phoneNumbers.filter((p) => p.sid !== currentNumberSid));
      setCurrentNumberSid("");
      setSelectedPhoneNumber("");
      setSelectedPhoneNumberSid("");
      setCurrentVoiceUrl("");
    } catch (err) {
      console.error(err);
      alert("Failed to delete phone number. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const checklist = useMemo(() => {
    return [
      {
        label: "Set up phone account",
        done: hasCredentials,
        description: "Then update account details in webapp/.env",
        field: (
          <Button
            className="w-full"
            onClick={() => window.open("https://console.twilio.com/", "_blank")}
          >
            Open Console
          </Button>
        ),
      },
      {
        label: "Set up phone number",
        done: phoneNumbers.length > 0,
        description: "Costs around $1.15/month",
        field:
          phoneNumbers.length > 0 ? (
            <div className="flex gap-2 w-full">
              {phoneNumbers.length === 1 ? (
                <Input value={phoneNumbers[0].friendlyName || ""} disabled className="flex-1" />
              ) : (
                <Select
                  onValueChange={(value) => {
                    setCurrentNumberSid(value);
                    const selected = phoneNumbers.find((p) => p.sid === value);
                    if (selected) {
                      setSelectedPhoneNumber(selected.friendlyName || "");
                      setSelectedPhoneNumberSid(selected.sid || "");
                      setCurrentVoiceUrl(selected.voiceUrl || "");
                    }
                  }}
                  value={currentNumberSid}
                  className="flex-1"
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a phone number" />
                  </SelectTrigger>
                  <SelectContent>
                    {phoneNumbers.map((phone) => (
                      <SelectItem key={phone.sid} value={phone.sid}>
                        {phone.friendlyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={deletePhoneNumber}
                disabled={deleteLoading || !currentNumberSid}
                className="flex-shrink-0"
              >
                {deleteLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={() =>
                window.open(
                  "https://console.twilio.com/us1/develop/phone-numbers/manage/incoming",
                  "_blank"
                )
              }
            >
              Set up phone number
            </Button>
          ),
      },
      {
        label: "WebSocket server",
        done: localServerUp || !!publicUrl,
        description: "Server should be running and accessible",
        field: localServerUp ? (
          <div className="text-sm text-green-600">
            ✓ Server accessible at {publicUrl || "localhost:8081"}
          </div>
        ) : publicUrl ? (
          <div className="text-sm text-muted-foreground">
            Server URL configured: {publicUrl}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Check server connection...
          </div>
        ),
      },
      {
        label: "Webhook URL",
        done: !isWebhookMismatch || !currentNumberSid || !!publicUrl,
        description: "Configured via Nginx (automatic)",
        field: (
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1">
              <Input value={currentVoiceUrl || appendedTwimlUrl || "Not configured"} disabled className="w-full" />
            </div>
            {isWebhookMismatch && currentNumberSid && publicUrl && (
              <div className="flex-1">
                <Button
                  onClick={updateWebhook}
                  disabled={webhookLoading}
                  className="w-full"
                >
                  {webhookLoading ? (
                    <Loader2 className="mr-2 h-4 animate-spin" />
                  ) : (
                    "Update Webhook"
                  )}
                </Button>
              </div>
            )}
          </div>
        ),
      },
    ];
  }, [
    hasCredentials,
    phoneNumbers,
    currentNumberSid,
    localServerUp,
    publicUrl,
    currentVoiceUrl,
    isWebhookMismatch,
    appendedTwimlUrl,
    webhookLoading,
    setSelectedPhoneNumber,
  ]);

  useEffect(() => {
    // Ne pas bloquer si le serveur est accessible ou si on a un numéro configuré
    const essentialChecks = hasCredentials && phoneNumbers.length > 0;
    setAllChecksPassed(essentialChecks);
  }, [hasCredentials, phoneNumbers.length]);

  const handleDone = () => setReady(true);

  return (
    <Dialog open={!ready}>
      <DialogContent className="w-full max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Setup Checklist</DialogTitle>
          <DialogDescription>
            This sample app requires a few steps before you get started
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-0">
          {checklist.map((item, i) => (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 py-2"
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  {item.done ? (
                    <CheckCircle className="text-green-500" />
                  ) : (
                    <Circle className="text-gray-400" />
                  )}
                  <span className="font-medium">{item.label}</span>
                </div>
                {item.description && (
                  <p className="text-sm text-gray-500 ml-8">
                    {item.description}
                  </p>
                )}
              </div>
              <div className="flex items-center mt-2 sm:mt-0">{item.field}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row sm:justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleDone}
          >
            {allChecksPassed ? "Let's go!" : "Continue anyway"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
