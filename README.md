# 🛡️ Silent Signal

> **Covert Emergency Alert System, Encrypted Telemetry & Disguised Evidence Collection Platform**  
> *Built for National Hackathon 2026 by Team INGENIOUS*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-emerald?style=for-the-badge&logo=render)](https://silent-signal-uw58.onrender.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D20-green?style=for-the-badge&logo=node.js)](package.json)
[![CI Build](https://img.shields.io/badge/CI-GitHub%20Actions-purple?style=for-the-badge&logo=github)](.github/workflows/ci.yml)

---

## 📌 Overview

**Silent Signal** is a stealth-oriented emergency response system designed for high-risk situations (such as domestic abuse, stalking, harassment, or human trafficking) where a victim **cannot safely ask for help out loud or open a suspicious emergency app**.

The application disguises itself as a normal, realistic **notes workspace** while quietly collecting live location telemetry, rolling voice evidence, notifying trusted contacts across multiple channels (Email, SMS, WhatsApp), and preserving data through weak connectivity.

---

## ✨ Key Capabilities

- **🔐 Stealth Duress PIN**: Special 4-digit PIN opens the decoy notes workspace while silently starting background SOS capture.
- **🤫 Whispered Safe Word**: Local Web Speech API detection listens for a user-configured safe phrase without sending audio to third parties.
- **📳 Motion & Wearable Triggers**: Rapid accelerometer shake detection and simulated smartwatch stress/heart-rate spike activation.
- **🧭 Live Safe Havens**: Locates the exact nearest police, hospital, pharmacy, and petrol stations from live GPS via the OpenStreetMap Overpass API.
- **⏱️ Safe-Arrival Timer**: Set a destination and time limit; failing to arrive (auto-detected within ~100 m) or confirm "I'm safe" before expiry auto-alerts trusted contacts.
- **📍 AES-256 Encrypted Telemetry**: Encrypted GPS coordinate storage (`AES-256-GCM`) with offline batching & reconnect auto-flush.
- **🎙️ Rolling WebM Audio Evidence**: Automatic 30-second chunked voice recording uploaded to secure storage.
- **📱 Multi-Channel SOS Dispatch**: Simultaneous Email alerts (Brevo / Resend HTTP API), SMS (Twilio), and direct 1-click WhatsApp deep-links (`wa.me`).
- **🤖 AI Incident Summarizer**: Factual plain-English incident reports generated from chronological evidence logs via Google Gemini API.
- **🔗 Auto-Expiring Share Links**: Rotating public evidence links for trusted contact viewing.

---

## 🛡️ Threat Model & Security

For a comprehensive breakdown of security remediations, cryptography implementations, and audit logs, see [docs/SECURITY_FIXES.md](docs/SECURITY_FIXES.md).

### Defenses Implemented:
- **Decoy UI Disguise**: Keeps the notes UI realistic and believable to avoid perpetrator suspicion.
- **Bcrypt Password Hashing**: Passwords and Duress PINs hashed with 10 salt rounds.
- **JWT Authentication & Rate Limiting**: Protects login and SOS endpoints against brute-force attacks.
- **Offline Telemetry Resilience**: Replays GPS coordinate queues automatically when connectivity is restored.

---

## ⚙️ Environment Variables

Configure these variables in your deployment settings or local `.env` file:

| Variable | Description |
| :--- | :--- |
| `JWT_SECRET` | Secret key for stable JWT auth tokens |
| `ENCRYPTION_KEY` | 64-character hex key for AES-256 GPS encryption |
| `BREVO_API_KEY` | *(Recommended for production)* Brevo REST API key for global email dispatch |
| `RESEND_API_KEY` | Resend REST API key for email notifications |
| `APP_URL` | Public base URL for evidence link generation |
| `DATABASE_PATH` | Path for runtime SQLite database (default: `data/silent_signal.db`) |
| `TWILIO_ACCOUNT_SID` | Optional Twilio account SID for SMS alerts |
| `TWILIO_AUTH_TOKEN` | Optional Twilio auth token for SMS alerts |
| `TWILIO_PHONE_NUMBER` | Optional Twilio sender phone number |

---

## 🚀 Local Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev
```

Visit `http://localhost:3000` to run the application locally.

### Testing Stealth Mode:
1. Click **Register** → Create a user with a **Passcode** (e.g. `1234`) and a **Duress PIN** (e.g. `9999`).
2. Log out and sign in using the **Duress PIN** (`9999`).
3. Observe the background SOS protocol activate while the decoy notes workspace remains active.

---

## 📂 Project Structure

```text
Silent-Signal/
├── .github/workflows/   # CI GitHub Actions (Gitleaks, TypeScript check, Build)
├── docs/                # Security documentation & audit reports
├── server/              # Express backend controllers & AI integrations
├── src/                 # React frontend, components, hooks, & state management
├── .env.example         # Template for environment configuration
├── LICENSE              # MIT License
├── render.yaml          # Render cloud deployment specification
├── server.ts            # Main Express server entry point & database initialization
└── vite.config.ts       # Vite bundler & PWA configuration
```

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
