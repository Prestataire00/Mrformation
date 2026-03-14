import { google } from "googleapis";

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthorizationUrl(state: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error("No refresh token received from Google");
  }

  // Get the user's email address
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    email: data.email as string,
  };
}

function buildMimeMessage(
  to: string,
  subject: string,
  htmlBody: string,
  fromName?: string,
  fromEmail?: string
): string {
  const boundary = "boundary_" + Date.now().toString(36);
  const from = fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromEmail || "";

  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(htmlBody).toString("base64"),
    "",
    `--${boundary}--`,
  ];

  return lines.join("\r\n");
}

export async function sendGmailEmail(
  refreshToken: string,
  {
    to,
    subject,
    htmlBody,
    fromName,
    fromEmail,
  }: {
    to: string;
    subject: string;
    htmlBody: string;
    fromName?: string;
    fromEmail?: string;
  }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const client = getOAuth2Client();
    client.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: "v1", auth: client });

    const mimeMessage = buildMimeMessage(to, subject, htmlBody, fromName, fromEmail);
    const encodedMessage = Buffer.from(mimeMessage)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    return {
      success: true,
      messageId: result.data.id ?? undefined,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Gmail send failed";
    return { success: false, error: message };
  }
}
