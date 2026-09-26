# Flag Memory Match — Self-Hosted Multiplayer Server

This runs the remote multiplayer version of the game on your own computer,
so your friends don't need Claude accounts. Everyone connects to a server
you run, over the internet.

## 1. Install Node.js (if you don't have it)
Download from https://nodejs.org (LTS version). Run `node -v` in a terminal
to confirm it installed.

## 2. Install dependencies
Open a terminal in this folder and run:

    npm install

## 3. Run the server

    npm start

You should see:
    Flag Memory Match server running on port 3000
    Open http://localhost:3000 to play.

You (the host machine) can open http://localhost:3000 in your browser to
confirm it works.

## 4. Let friends on OTHER networks connect

Since your friends are not on your WiFi, your computer needs to be reachable
from the internet. Two ways to do this:

### Option A — Quick and easy: ngrok (recommended for a one-off game night)
1. Go to https://ngrok.com, sign up free, and follow their install instructions.
2. With your server running (npm start), open a second terminal and run:
       ngrok http 3000
3. ngrok gives you a public URL like https://abcd1234.ngrok-free.app —
   send that link to your friends instead of localhost:3000.
4. Keep both the server and ngrok running for the whole game session.
   Closing either one disconnects everyone.

### Option B — Port forwarding on your router (more permanent, more setup)
1. Find your computer's local IP (e.g. 192.168.1.42).
2. Log into your router's admin page and forward external port 3000 to
   your computer's local IP, port 3000.
3. Find your public IP (search "what is my ip") and share
   http://YOUR_PUBLIC_IP:3000 with friends.
4. This exposes a port on your home network to the internet — fine for a
   casual game, but turn off port forwarding when you're done playing.

## Notes
- The server keeps game state in memory only. If you stop the server,
  all active games are lost.
- Up to 6 players per room, same as the Claude-hosted version.
- If someone's connection drops, they'll show "(offline)" next to their
  name but their score is kept; they can rejoin with the same name to
  keep playing (this reconnect flow is basic and untested with real
  flaky connections, so treat it as best-effort).
