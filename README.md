# ChatCraft | No-Code AI Chatbot Builder for Websites (LLM + RAG)

[![Live App](https://img.shields.io/badge/Live-chatcraft.web.app-DC2626?logo=firebase&logoColor=white)](https://chatcraft.web.app)
[![NPM](https://img.shields.io/npm/v/chatcraft-bot.svg)](https://www.npmjs.com/package/chatcraft-bot)
[![NPM Downloads](https://img.shields.io/npm/dm/chatcraft-bot.svg)](https://www.npmjs.com/package/chatcraft-bot)
[![GitHub Stars](https://img.shields.io/github/stars/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites?style=social)](https://github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Build, train, and deploy an AI chatbot without coding. ChatCraft is a cloud-based no-code chatbot platform powered by LLM + RAG that helps businesses, creators, and teams launch website chatbots quickly.

- Create chatbot projects in ChatCraft Cloud: https://chatcraft.web.app
- Embed in any website using script tag or npm package
- Powered by Gemini/OpenAI/Anthropic/Ollama-ready architecture
- Knowledge-base grounded answers with Retrieval-Augmented Generation (RAG)

## Why ChatCraft Cloud

- No coding needed to create and launch chatbot projects
- Fast onboarding with guided setup and testing
- Flexible branding: icon, theme color, chatbot name, font family, font colors
- Website deployment in minutes
- Works for startups, SMBs, agencies, SaaS, and enterprise teams

## Embed Your Chatbot (2 Ways)

### Option 1: Script Tag (Any Website)

```html
<script src="https://your-backend-domain/api/v1/embed/script.js?project_id=YOUR_PROJECT_ID" data-project-id="YOUR_PROJECT_ID" defer></script>
```

### Option 2: NPM Package (React and npm-based Frameworks)

- Package: https://www.npmjs.com/package/chatcraft-bot

```bash
npm install chatcraft-bot
```

```jsx
import React from "react";
import { ChatCraftBot } from "chatcraft-bot/react";

function App() {
	return (
		<div style={{ background: "#FFFFFF", minHeight: "100vh" }}>
			<ChatCraftBot
				projectId="YOUR_PROJECT_ID"
				apiBase="https://your-backend-domain/api/v1"
			/>
		</div>
	);
}

export default App;
```

## New and Released Features

1. Script tag and npm package based chatbot embedding
2. Streaming chatbot responses with markdown/table rendering
3. Custom fallback behavior with optional contact details
4. Project deployment states (draft/deployed) for safe widget exposure
5. Full chatbot customization (name, icon, theme, font family, user/bot font colors)
6. Session rate limiting for production safety (25 requests per session / 5 minutes)
7. Authentication with email/password and Google Sign-In

## Preview

| Test Chat (Table + Inline Sources) | Project Settings (Chatbot Behavior) |
| ---------------------------------- | ----------------------------------- |
| ![Test Chat Preview](images/image1.png) | ![Chatbot Behavior Preview](images/image2.png) |

| Chat Customizations | Login to ChatCraft (Email/Password or Google Sign-In) |
| ------------------- | ------------------------------------------------------ |
| ![Chat Customizations Preview](images/image3.png) | ![Login Preview](images/image4.png) |

## Live Product

- Cloud app: https://chatcraft.web.app

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Frontend | React 19, Tailwind CSS, React Flow, Zustand |
| Backend | Go (`net/http`), pgx |
| Database | PostgreSQL (Neon serverless) |
| Auth | bcrypt + JWT + Google Auth |
| LLM | OpenAI, Anthropic, Google Gemini, Ollama |
| RAG | chunking, embeddings, pgvector |

## Languages Used

- Go
- JavaScript
- TypeScript
- CSS
- SQL

## Target Users

- SaaS products that need instant AI support chat
- Agencies building chatbot solutions for clients
- E-commerce stores for pre-sales/support automation
- Educational institutes and training organizations
- Healthcare and service businesses wanting lead capture + FAQ automation
- Founders and non-technical teams that need no-code AI chatbot deployment

## Repository and Community Stats

### Public repo metrics (auto badges)

[![GitHub forks](https://img.shields.io/github/forks/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites?style=social)](https://github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/network/members)
[![GitHub issues](https://img.shields.io/github/issues/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites)](https://github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/issues)

### Traffic metrics (views, cloners)

GitHub provides views and clone traffic in Insights > Traffic. Those numbers are available to repo admins/collaborators and are not always publicly queryable in README without extra automation.

## Project Structure

```
ChatBot Builder/
|- main.go
|- config/
|- internal/
|  |- database/
|  |- handler/
|  |- logging/
|  |- metrics/
|  |- middleware/
|  |- model/
|  |- server/
|  |- service/
|- chatcraft-ui/
|- npm-package-chatcraft/
|  |- src/
|  |  |- widget.ts
|  |  |- react/
|- go.mod
```

## Getting Started (Local Development)

### Prerequisites

- Go 1.21+
- Node.js 18+
- PostgreSQL or Neon DB

### 1) Clone

```bash
git clone https://github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites.git
cd ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites
```

### 2) Configure environment

Create `.env` in project root:

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
PORT=8080
```

### 3) Run backend

```bash
go run main.go
```

### 4) Run frontend

```bash
cd chatcraft-ui
npm install
npm run dev
```

For production usage, use ChatCraft Cloud at https://chatcraft.web.app.

## API Endpoints (Core)

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/v1/health` | Service and runtime health |
| POST | `/api/v1/auth/register` | Register account |
| POST | `/api/v1/auth/login` | Login |
| GET | `/api/v1/embed/script.js` | Public widget script |
| GET | `/api/v1/embed/config/{project_id}` | Public widget config |
| POST | `/api/v1/chat/{bot_token}` | Public chatbot chat endpoint |

## Report Issues

Found a bug or want a feature?

- Open an issue: https://github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites/issues/new/choose

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a pull request

Become a contributor and help improve no-code AI chatbot deployment for everyone.

## Support This Project

If ChatCraft helps you, please star this repository:

https://github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites

## License

MIT
