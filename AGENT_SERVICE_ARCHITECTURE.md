# RunCoach Agent Service Architecture

## Overview

The RunCoach AI Agent is being migrated from a tightly-coupled function-calling system to a **standalone microservice** powered by **LangGraph**. This enables:

- **Independent scaling** - Scale agent service separately from main backend
- **Better agent architecture** - Multi-step reasoning, state management, error recovery
- **Deployment flexibility** - Deploy agent on different infrastructure (GPU instances, serverless, etc.)
- **Technology independence** - Agent can be rewritten without touching main backend

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│                    http://localhost:5173                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/SSE
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Main Backend (Express)                        │
│                    http://localhost:3001                         │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • User Management                                        │   │
│  │ • Strava Integration                                     │   │
│  │ • Training Plans                                         │   │
│  │ • Database Access                                        │   │
│  │ • Authentication                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/gRPC
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Agent Service (LangGraph)                       │
│                    http://localhost:3002                         │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ LangGraph Agent Workflow:                                │   │
│  │                                                           │   │
│  │  1. Receive Request (message + user context)            │   │
│  │           ↓                                               │   │
│  │  2. Build Context (from main backend API)                │   │
│  │           ↓                                               │   │
│  │  3. Analyze Intent (understand user request)             │   │
│  │           ↓                                               │   │
│  │  4. Plan Actions (decide which tools to use)             │   │
│  │           ↓                                               │   │
│  │  5. Check Approval (requires human approval?)            │   │
│  │           ↓                                               │   │
│  │  6. Execute Tools (call main backend APIs)               │   │
│  │           ↓                                               │   │
│  │  7. Generate Response (stream back to user)              │   │
│  │                                                           │   │
│  │ Tools Available:                                          │   │
│  │  • shift_workout → POST /api/v1/agent/actions/shift      │   │
│  │  • modify_workout → POST /api/v1/agent/actions/modify    │   │
│  │  • create_workout → POST /api/v1/agent/actions/create    │   │
│  │  • delete_workout → POST /api/v1/agent/actions/delete    │   │
│  │  • analyze_performance → GET /api/v1/analysis/*          │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
                    OpenAI API (gpt-4o / gpt-4o-mini)
```

---

## Communication Patterns

### 1. Frontend → Main Backend (Unchanged)
```
POST /api/v1/chat/message
{
  conversationId: "uuid",
  message: "What's my schedule?"
}
```

### 2. Main Backend → Agent Service (New)
```
POST http://localhost:3002/agent/chat
{
  userId: 123,
  conversationId: "uuid",
  message: "What's my schedule?",
  streamResponse: true
}

Response: Server-Sent Events (SSE) stream
```

### 3. Agent Service → Main Backend (Tool Calls)
```
POST http://localhost:3001/api/v1/agent/actions/shift
Authorization: Bearer <service-token>
{
  userId: 123,
  workoutId: 456,
  newDate: "2026-02-10",
  reason: "User requested shift due to scheduling conflict"
}
```

---

## Service Responsibilities

### Main Backend (`backend/`)
**Responsibilities:**
- User authentication & authorization
- Database access (users, workouts, activities, goals)
- Strava API integration
- Training plan management
- Context building (gathers data for agent)
- Pending action approval workflow
- Token usage tracking

**Does NOT:**
- ❌ Direct OpenAI calls for chat
- ❌ Agent reasoning or tool selection
- ❌ LangGraph state management

### Agent Service (`agent-service/`)
**Responsibilities:**
- LangGraph agent orchestration
- Multi-step reasoning workflows
- Tool selection and planning
- OpenAI API calls (all models)
- Streaming responses
- State persistence and checkpointing
- Error recovery and retries
- Model selection (mini vs standard)

**Does NOT:**
- ❌ Database access (calls main backend APIs)
- ❌ User authentication (trusts service-to-service auth)
- ❌ Strava integration
- ❌ Business logic for workouts/plans

---

## Technology Stack

### Main Backend
- **Language:** TypeScript (Node.js)
- **Framework:** Express
- **Database:** PostgreSQL
- **ORM:** Raw SQL (pg)
- **Auth:** JWT

### Agent Service
- **Language:** TypeScript (Node.js) OR Python (more LangGraph support)
- **Framework:** Express (TS) or FastAPI (Python)
- **Agent:** LangGraph
- **LLM:** OpenAI (gpt-4o, gpt-4o-mini)
- **State Storage:** PostgreSQL (shared) or Redis
- **Streaming:** Server-Sent Events (SSE)

**Recommendation:** **Python + FastAPI + LangGraph**
- Native LangGraph support (built by LangChain team)
- Better async/streaming support
- Rich ecosystem for agent development
- Easier to add RAG, vector stores later

---

## Deployment Strategies

### Development (Current)
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15
    ports: ["5432:5432"]

  backend:
    build: ./backend
    ports: ["3001:3001"]
    depends_on: [postgres]

  agent-service:
    build: ./agent-service
    ports: ["3002:3002"]
    depends_on: [postgres]
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      BACKEND_API_URL: http://backend:3001

  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    depends_on: [backend]
```

### Production - Option 1: Monolithic (Simple)
```
Single server, all services in Docker Compose
Good for: MVP, low traffic, cost-sensitive
```

### Production - Option 2: Kubernetes (Scalable)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-service
spec:
  replicas: 5  # Scale agent independently
  selector:
    matchLabels:
      app: agent-service
  template:
    spec:
      containers:
      - name: agent
        image: runcoach/agent-service:latest
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
```

### Production - Option 3: Serverless (Auto-scaling)
```
Agent Service → AWS Lambda / Google Cloud Run
Main Backend → Traditional server
Good for: Variable traffic, cost optimization
```

---

## State Management

### LangGraph State Schema
```typescript
interface AgentState {
  // Input
  userId: number;
  conversationId: string;
  userMessage: string;

  // Context (fetched from backend)
  userContext: UserContextData;
  conversationHistory: Message[];

  // Planning
  intent: string;
  toolPlan: ToolCall[];
  requiresApproval: boolean;

  // Execution
  toolResults: ToolResult[];
  pendingActionIds: string[];

  // Output
  response: string;
  modelUsed: string;
  tokenUsage: TokenUsage;

  // Metadata
  stepCount: number;
  errors: Error[];
}
```

### State Persistence
- **In-memory:** Fast, no persistence (use for stateless requests)
- **PostgreSQL:** Shared database, full state history
- **Redis:** Fast caching, session management
- **LangGraph Checkpoints:** Built-in state snapshots

---

## API Specification

### Agent Service Endpoints

#### 1. Chat (Streaming)
```http
POST /agent/chat
Content-Type: application/json

{
  "userId": 123,
  "conversationId": "uuid",
  "message": "What's my schedule?",
  "streamResponse": true
}

Response: text/event-stream
data: {"type":"content","content":"Here's your schedule..."}
data: {"type":"tool_call","tool":"shift_workout","args":{...}}
data: {"type":"pending_action","actionId":"uuid"}
data: {"type":"complete","tokenUsage":{...}}
```

#### 2. Execute Approved Action
```http
POST /agent/execute-action
Content-Type: application/json

{
  "userId": 123,
  "actionId": "uuid",
  "approved": true
}

Response: 200 OK
{
  "success": true,
  "result": {...}
}
```

#### 3. Health Check
```http
GET /health

Response: 200 OK
{
  "status": "healthy",
  "langraph": "ready",
  "openai": "connected"
}
```

---

## Security

### Service-to-Service Authentication
```typescript
// Main Backend → Agent Service
headers: {
  'X-Service-Token': process.env.AGENT_SERVICE_SECRET,
  'X-User-Id': userId
}

// Agent Service validates token
if (req.headers['x-service-token'] !== process.env.SERVICE_SECRET) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

### Agent Service → Main Backend
```typescript
// Agent calls backend with service credentials
headers: {
  'Authorization': `Bearer ${SERVICE_JWT}`,
  'X-Agent-Request': 'true'
}
```

---

## Migration Strategy

### Phase 1: Create Agent Service (Week 1)
- [ ] Set up agent-service directory
- [ ] Implement LangGraph workflow
- [ ] Create HTTP API with streaming
- [ ] Add Docker configuration
- [ ] Test independently

### Phase 2: Integrate with Backend (Week 1-2)
- [ ] Update main backend to call agent service
- [ ] Migrate context builder to agent service API
- [ ] Update streaming endpoint
- [ ] Test end-to-end flow

### Phase 3: Deploy Separately (Week 2-3)
- [ ] Docker Compose for multi-service deployment
- [ ] Environment configuration
- [ ] Health checks and monitoring
- [ ] Load testing

### Phase 4: Production Optimization (Week 3-4)
- [ ] Add Redis for state caching
- [ ] Implement connection pooling
- [ ] Add retry logic and circuit breakers
- [ ] Set up monitoring (Prometheus, Grafana)

---

## Benefits of This Architecture

### Scalability
- Scale agent service to 10 instances during peak hours
- Main backend stays at 2 instances
- Independent resource allocation (agent gets more CPU/memory)

### Reliability
- Agent service crashes don't affect main backend
- Easier to implement retry logic
- Circuit breakers prevent cascade failures

### Development Velocity
- Agent team works independently from backend team
- Can rewrite agent in different language without touching backend
- Easier to add new AI features (RAG, vector search, etc.)

### Cost Optimization
- Agent service on GPU instances (if needed)
- Main backend on standard instances
- Serverless agent for low-traffic periods

### Future Features (Easy to Add)
- Multiple agent types (performance coach, nutrition coach, injury prevention)
- Agent-to-agent communication
- RAG with vector database
- Fine-tuned models
- A/B testing different agent prompts

---

## Monitoring & Observability

### Metrics to Track
```
Agent Service:
- Requests per second
- Average response time
- Token usage per request
- Tool call success rate
- Error rate by type
- Model selection distribution (mini vs standard)

Main Backend:
- Agent service availability
- Context building time
- Tool execution latency
```

### Logging
```
Structured logs (JSON):
{
  "service": "agent-service",
  "userId": 123,
  "conversationId": "uuid",
  "step": "plan_actions",
  "toolsPlanned": ["shift_workout", "modify_workout"],
  "duration_ms": 245,
  "timestamp": "2026-02-06T..."
}
```

---

## Next Steps

1. **Create `agent-service/` directory** with Python + FastAPI + LangGraph
2. **Implement LangGraph agent** with proper state management
3. **Create HTTP API** for chat streaming
4. **Update main backend** to proxy chat requests to agent service
5. **Add Docker configuration** for independent deployment
6. **Test end-to-end flow**

Ready to start implementation?
