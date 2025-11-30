import twilioClient from "@/lib/twilio";

export async function GET() {
  if (!twilioClient) {
    return Response.json(
      { error: "Twilio client not initialized" },
      { status: 500 }
    );
  }

  const incomingPhoneNumbers = await twilioClient.incomingPhoneNumbers.list({
    limit: 20,
  });
  return Response.json(incomingPhoneNumbers);
}

export async function POST(req: Request) {
  if (!twilioClient) {
    return Response.json(
      { error: "Twilio client not initialized" },
      { status: 500 }
    );
  }

  const { phoneNumberSid, voiceUrl } = await req.json();
  const incomingPhoneNumber = await twilioClient
    .incomingPhoneNumbers(phoneNumberSid)
    .update({ voiceUrl });

  return Response.json(incomingPhoneNumber);
}

export async function DELETE(req: Request) {
  if (!twilioClient) {
    return Response.json(
      { error: "Twilio client not initialized" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const phoneNumberSid = searchParams.get("phoneNumberSid");
  
  if (!phoneNumberSid) {
    return Response.json(
      { error: "phoneNumberSid is required" },
      { status: 400 }
    );
  }

  await twilioClient.incomingPhoneNumbers(phoneNumberSid).remove();
  return Response.json({ success: true });
}
