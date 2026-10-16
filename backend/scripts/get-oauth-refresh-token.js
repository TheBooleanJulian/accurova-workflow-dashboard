// backend/scripts/get-oauth-refresh-token.js
// One-time helper: run locally to get a GOOGLE_OAUTH_REFRESH_TOKEN for the
// backend's env vars. Not deployed — this never runs on Zeabur.
//
// Usage: node scripts/get-oauth-refresh-token.js
// Needs GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET in backend/.env
// (the same Desktop-app OAuth client the PhotoVault Tracker uses is fine —
// see README "Google account setup").

import "dotenv/config";
import http from "node:http";
import { OAuth2Client } from "google-auth-library";

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in backend/.env first.");
  process.exit(1);
}

const server = http.createServer();
server.listen(0, "localhost", () => {
  const port = server.address().port;
  const redirectUri = `http://localhost:${port}`;
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri });

  const authUrl = client.generateAuthUrl({
    access_type: "offline",   // required to get a refresh_token back
    prompt: "consent",        // force a refresh_token even on a repeat consent
    scope: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  console.log("\nOpen this URL in a browser, and sign in with the Google account that");
  console.log("has Editor access to the target sheet:\n");
  console.log(authUrl, "\n");
  console.log("Waiting for you to finish signing in...");

  server.on("request", async (req, res) => {
    const url = new URL(req.url, redirectUri);
    const code = url.searchParams.get("code");

    if (!code) {
      res.writeHead(400).end("No authorization code in the request.");
      return;
    }

    try {
      const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
      res.writeHead(200, { "Content-Type": "text/html" })
        .end("<p>Done — you can close this tab.</p>");

      if (!tokens.refresh_token) {
        console.error(
          "\nNo refresh_token came back. This Google account may have already granted this " +
          "app access before — revoke it at https://myaccount.google.com/permissions and run this again."
        );
        process.exit(1);
      }

      console.log("\nGOOGLE_OAUTH_REFRESH_TOKEN =", tokens.refresh_token);
      console.log("\nCopy that into the backend's Zeabur env vars (and backend/.env for local dev).");
    } catch (err) {
      res.writeHead(500).end("Token exchange failed — see the terminal.");
      console.error("\nToken exchange failed:", err.message);
    } finally {
      server.close();
    }
  });
});
