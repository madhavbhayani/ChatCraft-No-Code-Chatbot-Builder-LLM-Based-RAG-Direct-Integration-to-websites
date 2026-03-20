# ChatCraft — No-Code Chatbot Builder (LLM + RAG)

A full-stack no-code chatbot builder that lets you design, train, and deploy AI-powered chatbots with a visual drag-and-drop interface. Integrates with LLMs (OpenAI, Claude, Gemini, Ollama) and supports Retrieval-Augmented Generation (RAG) for knowledge-base-powered answers. Embed your chatbot on any website with a single script tag.

## New Features Introduced

1. Supports Table creation and display on the test chat.
2. Custom Fallback Message and links.

## Preview

| Test Chat (Table + Inline Sources) | Project Settings (Chatbot Behavior) |
| ---------------------------------- | ----------------------------------- |
| ![Test Chat Preview](images/image.png) | ![Chatbot Behavior Preview](images/image2.png) |

## Tech Stack

| Layer     | Technology                                         |
| --------- | -------------------------------------------------- |
| Frontend  | React 19, Tailwind CSS, React Flow, Zustand        |
| Backend   | Go (stdlib `net/http`), pgx                        |
| Database  | PostgreSQL (NeonDB — serverless)                   |
| Auth      | bcrypt + JWT                                       |
| LLM       | OpenAI, Anthropic, Google Gemini, Ollama           |
| RAG       | Document chunking, embeddings, pgvector            |

## Project Structure

```
ChatBot Builder/
├── main.go                    # Go server entry point
├── config/                    # Configuration loader
├── internal/
│   ├── database/              # DB connection + migrations
│   ├── handler/               # HTTP handlers (auth, health)
│   ├── middleware/             # CORS, request logger
│   ├── model/                 # Data models (user, bot)
│   └── server/                # Router setup
├── chatcraft-ui/              # React frontend (Vite)
│   ├── src/
│   │   ├── pages/             # Landing, Login, Register
│   │   ├── components/        # UI components
│   │   └── ...
│   └── ...
├── .env                       # Environment variables (not committed)
└── go.mod
```

## Getting Started

### Prerequisites

- **Go** 1.21+
- **Node.js** 18+
- **PostgreSQL** (or a NeonDB account)

### 1. Clone the repository

```bash
git clone https://github.com/madhavbhayani/ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites.git
cd ChatCraft-No-Code-Chatbot-Builder-LLM-Based-RAG-Direct-Integration-to-websites
```

### 2. Configure environment

Create a `.env` file in the root directory:

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
PORT=8080
```

### 3. Run the backend

```bash
go run main.go
```

The API server starts on `http://localhost:8080`. On first run it automatically applies database migrations.

### 4. Run the frontend

```bash
cd chatcraft-ui
npm install
npm run dev
```

The React dev server starts on `http://localhost:5173`.

## API Endpoints

| Method | Endpoint                  | Description           |
| ------ | ------------------------- | --------------------- |
| GET    | `/api/v1/health`          | Health check          |
| POST   | `/api/v1/auth/register`   | Create a new account  |
| POST   | `/api/v1/auth/login`      | Log in                |

## Color Theme

| Name            | Hex       | Usage                        |
| --------------- | --------- | ---------------------------- |
| Crimson Red     | `#DC2626` | CTAs, buttons, active states |
| Deep Charcoal   | `#0C0A0A` | Backgrounds, navbar          |
| Soft White      | `#FFF8F8` | Page backgrounds, cards      |
| Rose Pink       | `#F43F5E` | Accents, highlights          |
| Dusty Rose      | `#FDA4AF` | Hover states                 |
| Light Rose Gray | `#FFE4E6` | Borders, dividers, inputs    |
| Success Emerald | `#10B981` | Active/connected status      |
| Warning Amber   | `#F59E0B` | Alerts                       |
| Muted Gray      | `#6B7280` | Body text, descriptions      |

## License

MIT 
