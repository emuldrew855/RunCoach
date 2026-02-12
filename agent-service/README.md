# RunCoach Agent Service

Standalone AI agent service for RunCoach, built with **LangGraph** for scalable, multi-step reasoning workflows with proper state management and checkpointing.

## Features

- 🤖 **LangGraph StateGraph** - True LangGraph with Annotation-based state management
- 💾 **Checkpointing** - MemorySaver for conversation state persistence
- 🔄 **Streaming Responses** - Server-Sent Events (SSE) for real-time chat
- 🧠 **Intelligent Model Selection** - Automatically chooses between gpt-4o-mini and gpt-4o based on complexity
- 🛠️ **Tool Execution** - Shift/modify/create/delete workouts via main backend APIs
- 📊 **Token Tracking** - Monitors usage and reports back to main backend
- 🔒 **Service-to-Service Auth** - Secure communication with main backend
- ⚡ **Independent Scaling** - Deploy separately from main backend

## Architecture

```
Frontend → Main Backend → Agent Service → OpenAI
                ↓              ↓
           PostgreSQL    Main Backend API
                          (for tools)
```

## Setup

### 1. Install Dependencies

```bash
cd agent-service
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
PORT=3002
OPENAI_API_KEY=your-openai-key
BACKEND_API_URL=http://localhost:3001
SERVICE_SECRET=your-service-secret
```

### 3. Run Development Server

```bash
npm run dev
```

The agent service will start on `http://localhost:3002`.

## API Endpoints

### POST /agent/chat

Main chat endpoint with streaming responses.

**Request:**
```json
{
  "userId": 123,
  "conversationId": "uuid",
  "message": "What's my schedule this week?"
}
```

**Response:** Server-Sent Events (SSE)
```
data: {"type":"status","status":"building_context"}
data: {"type":"status","status":"generating_response"}
data: {"type":"content","content":"Here's your schedule..."}
data: {"type":"complete","response":"...","tokenUsage":{...}}
data: [DONE]
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "runcoach-agent-service",
  "version": "1.0.0"
}
```

## Agent Workflow

The agent follows a structured workflow:

1. **Build Context** - Fetch user data from main backend
2. **Select Model** - Choose gpt-4o-mini (cheap) or gpt-4o (smart) based on query complexity
3. **Build System Prompt** - Generate coaching prompt with user's training data
4. **Stream Response** - Call OpenAI with function calling enabled
5. **Handle Tool Calls** - Execute approved tools via main backend API
6. **Save State** - Store message and track token usage

## Model Selection

The agent automatically selects models based on complexity:

- **gpt-4o-mini** ($0.15/1M tokens) - Simple queries ("How was my run?")
- **gpt-4o** ($5.00/1M tokens) - Complex analysis ("Analyze my training progression")

Triggers for expensive model:
- Keywords: analyze, performance, progression, modify, adjust
- Long conversations (>10 messages)

## Available Tools

- **shift_workout** - Reschedule a workout to a different date
- **modify_workout** - Change workout distance, pace, HR zone
- **create_workout** - Add a new workout to the plan
- **delete_workout** - Remove a workout from the plan

All tools require user approval before execution.

## Deployment

### Docker

```bash
docker build -t runcoach-agent-service .
docker run -p 3002:3002 --env-file .env runcoach-agent-service
```

### Production

The agent service can be deployed independently:

- **Same Server**: Run alongside main backend with Docker Compose
- **Separate Server**: Deploy on different infrastructure (GPU instance, serverless)
- **Kubernetes**: Scale agent pods independently from main backend

## Development

```bash
npm run dev      # Start with hot reload
npm run build    # Compile TypeScript
npm start        # Run compiled code
```

## Future Enhancements

- [ ] Full LangGraph.js integration (when library matures)
- [ ] Redis for state caching
- [ ] Multiple agent types (nutrition coach, injury prevention)
- [ ] RAG with vector database for training plan recommendations
- [ ] Agent-to-agent communication
- [ ] Checkpointing for long-running workflows

## License

MIT
