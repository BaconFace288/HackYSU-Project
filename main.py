import os
from fastapi import FastAPI, Request as StarletteRequest, Depends, HTTPException, Header
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List
import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import firestore

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Initialize Firebase Admin
try:
    firebase_admin.get_app()
except ValueError:
    # Note: Requires GOOGLE_APPLICATION_CREDENTIALS for full signature verification
    firebase_admin.initialize_app()

def verify_token(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split("Bearer ")[1].strip()
    try:
        return firebase_auth.verify_id_token(token)
    except Exception as e:
        print(f"Token verification failed: {e}")
        # For hackathon purposes, failing open if service account credentials aren't set
        # In a real production app, you strictly: raise HTTPException(status_code=401)
        return {"uid": "unverified", "error": str(e)}

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

class IntentRequest(BaseModel):
    text: str

class JournalInsightRequest(BaseModel):
    entries: List[str]

@app.post("/api/chat")
async def ai_chat(body: ChatRequest, user: dict = Depends(verify_token)):
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

# ---- Image moderation endpoint ----
class ImageModRequest(BaseModel):
    image_data: str   # base64 data URL  e.g. "data:image/jpeg;base64,..."

@app.post("/api/moderate-image")
async def moderate_image(body: ImageModRequest, user: dict = Depends(verify_token)):
    if not OPENAI_API_KEY:
        # No key set — auto-approve so the feature still works (admin should set the key)
        return JSONResponse({"approved": True, "reason": "Moderation not configured; image auto-approved."})
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=OPENAI_API_KEY)

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "You are a content moderation AI for a mental-health peer-support platform. "
                            "Examine the image carefully and answer ONLY with a JSON object like: "
                            "{\"approved\": true, \"reason\": \"\"} or {\"approved\": false, \"reason\": \"Brief reason\"}.\n"
                            "Reject (approved=false) if the image contains: nudity, sexual content, graphic violence or gore, "
                            "self-harm imagery, hate symbols, drugs, or anything inappropriate for a support community. "
                            "Approve (approved=true) if it is a benign image (memes, nature, text screenshots, artwork, etc.). "
                            "Return ONLY valid JSON, no markdown."
                        )
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": body.image_data, "detail": "low"}
                    }
                ]
            }],
            max_tokens=80
        )
        import json as _json
        raw = response.choices[0].message.content.strip()
        # Strip any markdown code fences the model might add
        raw = raw.replace("```json", "").replace("```", "").strip()
        result = _json.loads(raw)
        return JSONResponse(result)
    except Exception as e:
        # On error, reject to be safe
        return JSONResponse({"approved": False, "reason": f"Moderation error: {str(e)[:100]}"}, status_code=200)

# ---- Intent checking endpoint ----
@app.post("/api/check-intent")
async def check_intent(body: IntentRequest, user: dict = Depends(verify_token)):
    if not OPENAI_API_KEY:
        # No key set - bypass intent checking
        return JSONResponse({"hazardous": False, "reason": "No API key configured."})
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=OPENAI_API_KEY)

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": (
                    "You are a crisis intent detection AI for a mental-health peer-support platform. "
                    "Analyze the given text and determine if the user has clear hazardous intent (e.g., self-harm, suicide, harming others). "
                    "Answer ONLY with a JSON object like: {\"hazardous\": true, \"reason\": \"Brief reason for flagging\"} "
                    "or {\"hazardous\": false, \"reason\": \"\"}.\n"
                    "Return ONLY valid JSON, no markdown.\n\n"
                    f"Text to analyze: \"{body.text}\""
                )
            }],
            max_tokens=80,
            temperature=0.0
        )
        import json as _json
        raw = response.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        result = _json.loads(raw)
        return JSONResponse(result)
    except Exception as e:
        # If API fails, default to false so we don't block messages or show false-positive popups
        return JSONResponse({"hazardous": False, "reason": f"Intent check error: {str(e)[:100]}"}, status_code=200)

# ---- Journal Insight endpoint ----
@app.post("/api/journal-insight")
async def journal_insight(body: JournalInsightRequest, user: dict = Depends(verify_token)):
    if not OPENAI_API_KEY:
        return JSONResponse({"insight": "AI Insights are offline. Ask an admin to provide an OPENAI_API_KEY."})
    
    if not body.entries:
        return JSONResponse({"insight": "You haven't written any journal entries yet this week! Write a few thoughts down first so I can analyze them for you."})

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=OPENAI_API_KEY)

        entries_text = "\n\n---\n\n".join(body.entries)
        
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "system",
                "content": (
                    "You are HealBot, an empathetic journaling assistant. "
                    "Read the user's private journal entries from this past week and provide a warm, 3-4 sentence summary of their emotional trends. "
                    "Highlight any recurring themes (stress, growth, anxiety), validate their feelings, and offer one gentle, customized psychological coping mechanism or grounding technique based on what they wrote.\n"
                    "Speak directly to the user (e.g., 'It sounds like you've been carrying a heavy load this week...')."
                )
            }, {
                "role": "user",
                "content": f"Here are my journal entries from this week:\n\n{entries_text}"
            }],
            max_tokens=250,
            temperature=0.6
        )
        insight = response.choices[0].message.content.strip()
        return JSONResponse({"insight": insight})
    except Exception as e:
        return JSONResponse({"insight": f"Sorry, I couldn't generate an insight right now: {str(e)[:100]}"}, status_code=200)

# ---- Admin account deletion endpoint ----
@app.delete("/api/admin/delete-user/{target_uid}")
async def hard_delete_user(target_uid: str, user: dict = Depends(verify_token)):
    caller_uid = user.get("uid")
    if not caller_uid or caller_uid == "unverified":
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    try:
        db = firestore.client()
        caller_doc = db.collection("users").document(caller_uid).get()
        if not caller_doc.exists or caller_doc.to_dict().get("role") != "admin":
            raise HTTPException(status_code=403, detail="Forbidden: Admins only")

        # Delete from Auth
        firebase_auth.delete_user(target_uid)
        # Delete from Firestore
        db.collection("users").document(target_uid).delete()
        return JSONResponse({"success": True})
    except Exception as e:
        error_msg = str(e)
        if "Could not automatically determine credentials" in error_msg or "DefaultCredentialsError" in error_msg:
            error_msg = "Google Cloud Service Account missing. The backend cannot delete users without GOOGLE_APPLICATION_CREDENTIALS set."
        return JSONResponse({"success": False, "error": error_msg}, status_code=500)

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

@app.get("/app", response_class=HTMLResponse)
async def get_index(request: StarletteRequest):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/", response_class=HTMLResponse)
async def get_landing(request: StarletteRequest):
    return templates.TemplateResponse("landing.html", {"request": request})
