import os
from fastapi import FastAPI, Request as StarletteRequest
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ---- OpenAI Chat endpoint ----
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

SYSTEM_PROMPT = """You are HealBot, a warm and empathetic mental-health support assistant for HealSpace — an online peer-support community.

Your role:
- Provide compassionate, non-judgmental responses to users who may be struggling emotionally.
- Offer coping strategies, grounding techniques, and psychoeducation where appropriate.
- Encourage users to connect with real people on HealSpace (group chats, certified therapists).
- Always remind users in distress that professional help is available (988 Lifeline, Crisis Text Line: text HOME to 741741).
- NEVER diagnose, prescribe, or claim to replace a real therapist.
- Keep responses concise (2–4 sentences max unless the user asks for more detail).
- Use a gentle, warm tone. Avoid clinical jargon.

If a user mentions self-harm or suicide, always provide crisis resources immediately."""

class ChatMessage(BaseModel):
    role: str  # "user" or "model"
    text: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

@app.post("/api/chat")
async def ai_chat(body: ChatRequest):
    if not OPENAI_API_KEY:
        return JSONResponse(
            {"reply": "The AI assistant isn't configured yet. Please ask an admin to set the OPENAI_API_KEY environment variable."},
            status_code=200
        )
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=OPENAI_API_KEY)

        # Build messages array: system prompt + full history
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in body.messages:
            messages.append({"role": msg.role if msg.role == "user" else "assistant", "content": msg.text})

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=300,
            temperature=0.75
        )
        reply = response.choices[0].message.content
        return JSONResponse({"reply": reply})
    except Exception as e:
        return JSONResponse({"reply": f"I'm having trouble connecting right now. Please try again in a moment. ({str(e)[:80]})"}, status_code=200)

# ---- Page routes ----
@app.get("/login", response_class=HTMLResponse)
async def get_login(request: StarletteRequest):
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/settings", response_class=HTMLResponse)
async def get_settings(request: StarletteRequest):
    return templates.TemplateResponse("settings.html", {"request": request})

@app.get("/admin", response_class=HTMLResponse)
async def get_admin(request: StarletteRequest):
    return templates.TemplateResponse("admin.html", {"request": request})

@app.get("/conversations", response_class=HTMLResponse)
async def get_conversations(request: StarletteRequest):
    return templates.TemplateResponse("conversations.html", {"request": request})

@app.get("/", response_class=HTMLResponse)
async def get_index(request: StarletteRequest):
    return templates.TemplateResponse("index.html", {"request": request})
