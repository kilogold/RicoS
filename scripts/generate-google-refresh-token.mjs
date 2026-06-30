import crypto from "node:crypto";
import http from "node:http";
import { google } from "googleapis";

const DEFAULT_PORT = 3001;
const port = Number.parseInt(process.env.GOOGLE_OAUTH_CALLBACK_PORT ?? `${DEFAULT_PORT}`, 10);
const redirectUri = `http://localhost:${port}/oauth2callback`;

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  throw new Error(
    "Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET. Add them to .env.local or export them before running this script.",
  );
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const state = crypto.randomBytes(24).toString("hex");

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
  state,
});

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Missing request URL.");
    return;
  }

  const url = new URL(req.url, redirectUri);
  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404);
    res.end("Not found.");
    return;
  }

  const returnedState = url.searchParams.get("state");
  if (returnedState !== state) {
    res.writeHead(400);
    res.end("Invalid OAuth state.");
    return;
  }

  const error = url.searchParams.get("error");
  if (error) {
    res.writeHead(400);
    res.end(`OAuth failed: ${error}`);
    server.close();
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400);
    res.end("Missing OAuth code.");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Re-run the script and make sure the consent screen is shown. If needed, remove this app from your Google Account third-party access list first.",
      );
    }

    console.log("\nAdd this to .env.local and Vercel:");
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);

    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Refresh token generated. You can close this tab and return to your terminal.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nFailed to exchange OAuth code: ${message}`);
    res.writeHead(500);
    res.end(`Failed to exchange OAuth code: ${message}`);
  } finally {
    server.close();
  }
});

server.listen(port, () => {
  console.log(`OAuth callback listening at ${redirectUri}`);
  console.log("\nOpen this URL in your browser:\n");
  console.log(authUrl);
  console.log("\nWaiting for Google to redirect back after consent...");
});
