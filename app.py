"""
╔══════════════════════════════════════════════════════════════════╗
║          NutriGenius AI - Powered by IBM Watsonx.ai              ║
║                Granite LLM Nutrition Agent                        ║
╚══════════════════════════════════════════════════════════════════╝

AGENT INSTRUCTIONS
==================
Customize your agent's behavior below by editing the AGENT_CONFIG dict.
No AI/ML knowledge required — just edit the values below.

Sections you can customize:
  1. PERSONA       – Name, tone, language style
  2. SPECIALIZATION – Diet type focus (e.g. vegetarian, keto, ayurvedic)
  3. REGIONAL_FOOD  – Enable/disable Indian food preferences & regional cuisines
  4. SAFETY_RULES   – Guardrails: medical disclaimers, allergen warnings
  5. RESPONSE_STYLE – Length, formatting, emoji usage
  6. GOALS          – What the agent prioritizes (weight loss, muscle gain, etc.)
"""

import os
import json
import re
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from dotenv import load_dotenv
from ibm_watsonx_ai import APIClient, Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

load_dotenv()

# ─────────────────────────────────────────────────────────────
#  ██████╗  AGENT INSTRUCTIONS — EDIT HERE ██████╗
# ─────────────────────────────────────────────────────────────
AGENT_CONFIG = {

    # ── 1. PERSONA ────────────────────────────────────────────
    "name": "NutriGenius",
    "tagline": "Your AI-Powered Nutrition & Wellness Coach",
    "tone": "friendly, warm, and encouraging",          # options: "formal", "casual", "clinical", "friendly"
    "language": "simple English with occasional Hindi phrases",  # adjust as needed

    # ── 2. SPECIALIZATION ─────────────────────────────────────
    "diet_focus": "balanced nutrition",          # e.g. "vegetarian", "vegan", "keto", "ayurvedic", "diabetic-friendly"
    "calorie_method": "TDEE",                    # "TDEE" or "simple_bmr"
    "macro_split": "40% carbs, 30% protein, 30% fat",   # default macro split

    # ── 3. REGIONAL / INDIAN FOOD PREFERENCES ─────────────────
    "indian_food_enabled": True,                 # True = prioritize Indian meal suggestions
    "preferred_cuisines": [                      # list regional cuisines to suggest
        "North Indian", "South Indian", "Bengali",
        "Gujarati", "Punjabi", "Maharashtra"
    ],
    "common_indian_ingredients": [               # agent will use these in meal plans
        "dal", "rice", "roti", "sabzi", "curd", "paneer",
        "sprouts", "poha", "upma", "idli", "dosa", "khichdi",
        "rajma", "chhole", "methi", "palak", "lauki", "moong"
    ],

    # ── 4. SAFETY RULES ───────────────────────────────────────
    "medical_disclaimer": True,          # always add disclaimer when mentioning medical conditions
    "allergen_warning": True,            # warn about common allergens in meal suggestions
    "avoid_extreme_diets": True,         # refuse to recommend very low calorie (<1200 kcal) plans
    "min_safe_calories": 1200,           # kcal — never recommend below this
    "refer_doctor_conditions": [         # always suggest doctor consultation for these
        "diabetes", "hypertension", "heart disease",
        "kidney disease", "eating disorder", "pregnancy"
    ],

    # ── 5. RESPONSE STYLE ─────────────────────────────────────
    "use_emojis": True,                  # add food/health emojis to responses
    "response_length": "medium",         # "short", "medium", "detailed"
    "use_bullet_points": True,           # structure responses with bullets
    "use_tables": True,                  # use markdown tables for meal plans

    # ── 6. AGENT GOALS & PRIORITIES ───────────────────────────
    "primary_goal": "holistic nutrition and sustainable healthy eating",
    "secondary_goals": [
        "prevent lifestyle diseases",
        "promote traditional Indian superfoods",
        "support family nutrition including children and elderly",
        "encourage hydration and sleep hygiene"
    ],
    "family_support": True,              # enable multi-member family profiles
    "age_groups_supported": [            # agent knows how to handle these groups
        "children (2-12)", "teenagers (13-19)",
        "adults (20-59)", "seniors (60+)"
    ],
}
# ─────────────────────────────────────────────────────────────
#  END OF AGENT INSTRUCTIONS
# ─────────────────────────────────────────────────────────────


# ── Flask App Setup ───────────────────────────────────────────
# static assets are served from the /public directory on Vercel, so the
# Flask app itself doesn't need to register a /static route.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=None, template_folder=os.path.join(BASE_DIR, "templates"))
app.secret_key = os.getenv("FLASK_SECRET_KEY", "nutrigenius-secret-2025")
CORS(app)


# ── Watsonx.ai Client ─────────────────────────────────────────
def get_watsonx_model():
    """Initialize IBM Watsonx.ai Granite model."""
    api_key = os.getenv("IBM_API_KEY")
    project_id = os.getenv("IBM_PROJECT_ID")
    url = os.getenv("IBM_WATSONX_URL", "https://eu-de.ml.cloud.ibm.com")

    if not api_key or not project_id:
        raise ValueError(
            "IBM_API_KEY and IBM_PROJECT_ID must be set in the .env file."
        )

    credentials = Credentials(api_key=api_key, url=url)
    client = APIClient(credentials=credentials, project_id=project_id)

    model = ModelInference(
        model_id="meta-llama/llama-3-3-70b-instruct",
        api_client=client,
        params={
            GenParams.DECODING_METHOD: "greedy",
            GenParams.MAX_NEW_TOKENS: 1024,
            GenParams.MIN_NEW_TOKENS: 50,
            GenParams.TEMPERATURE: 0.7,
            GenParams.TOP_P: 0.9,
            GenParams.REPETITION_PENALTY: 1.1,
            GenParams.STOP_SEQUENCES: ["Human:", "User:"],
        },
    )
    return model


# ── System Prompt Builder ─────────────────────────────────────
def build_system_prompt(user_profile: dict | None = None) -> str:
    cfg = AGENT_CONFIG
    indian_note = ""
    if cfg["indian_food_enabled"]:
        cuisines = ", ".join(cfg["preferred_cuisines"])
        ingredients = ", ".join(cfg["common_indian_ingredients"][:10])
        indian_note = (
            f"\n- Prioritize Indian meal suggestions covering cuisines: {cuisines}."
            f"\n- Use common Indian ingredients like: {ingredients}."
            f"\n- Suggest traditional Indian superfoods and home remedies where appropriate."
        )

    safety_note = ""
    if cfg["medical_disclaimer"]:
        conditions = ", ".join(cfg["refer_doctor_conditions"])
        safety_note = (
            f"\n- Always add a medical disclaimer when discussing: {conditions}."
            f"\n- Never recommend fewer than {cfg['min_safe_calories']} kcal/day."
            f"\n- Warn about allergens in meal suggestions."
        )

    profile_note = ""
    if user_profile:
        profile_note = f"""
Current User Profile:
- Name: {user_profile.get('name', 'User')}
- Age: {user_profile.get('age', 'Unknown')}
- Gender: {user_profile.get('gender', 'Unknown')}
- Weight: {user_profile.get('weight', 'Unknown')} kg
- Height: {user_profile.get('height', 'Unknown')} cm
- Activity Level: {user_profile.get('activity', 'Moderate')}
- Goal: {user_profile.get('goal', 'Balanced nutrition')}
- Dietary Restrictions: {user_profile.get('restrictions', 'None')}
- Health Conditions: {user_profile.get('conditions', 'None')}
"""

    emoji_note = "Use relevant food and health emojis to make responses engaging." if cfg["use_emojis"] else ""
    bullet_note = "Use bullet points and structured formatting." if cfg["use_bullet_points"] else ""

    system_prompt = f"""You are {cfg['name']}, {cfg['tagline']}.
Your tone is {cfg['tone']} and you speak in {cfg['language']}.
Your primary goal is {cfg['primary_goal']}.
Diet specialization: {cfg['diet_focus']}.
Default macro split: {cfg['macro_split']}.

Secondary goals:
{chr(10).join(f'- {g}' for g in cfg['secondary_goals'])}

Guidelines:
{indian_note}
{safety_note}
- Support family nutrition across age groups: {', '.join(cfg['age_groups_supported'])}.
- {emoji_note}
- {bullet_note}
- Keep responses {cfg['response_length']} and actionable.
- When asked for meal plans, provide breakfast, lunch, dinner, and snacks.
- Always include approximate calorie counts and macro breakdown.
- Never give medical diagnoses; always recommend consulting a healthcare professional for medical concerns.
{profile_note}
"""
    return system_prompt.strip()


# ── Nutrition Helper Functions ────────────────────────────────
def calculate_bmi(weight_kg: float, height_cm: float) -> dict:
    height_m = height_cm / 100
    bmi = round(weight_kg / (height_m ** 2), 1)
    if bmi < 18.5:
        category = "Underweight"
        color = "#3b82f6"
        advice = "You may need to increase calorie intake with nutrient-dense foods."
    elif bmi < 25:
        category = "Normal Weight"
        color = "#22c55e"
        advice = "Great! Maintain a balanced diet and active lifestyle."
    elif bmi < 30:
        category = "Overweight"
        color = "#f59e0b"
        advice = "Consider a moderate caloric deficit with more whole foods."
    else:
        category = "Obese"
        color = "#ef4444"
        advice = "Please consult a healthcare provider for a personalized plan."
    return {"bmi": bmi, "category": category, "color": color, "advice": advice}


def calculate_tdee(weight_kg: float, height_cm: float, age: int,
                   gender: str, activity: str) -> dict:
    """Harris-Benedict BMR + activity multiplier."""
    if gender.lower() in ("male", "m"):
        bmr = 88.362 + (13.397 * weight_kg) + (4.799 * height_cm) - (5.677 * age)
    else:
        bmr = 447.593 + (9.247 * weight_kg) + (3.098 * height_cm) - (4.330 * age)

    multipliers = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9,
    }
    factor = multipliers.get(activity.lower(), 1.55)
    tdee = round(bmr * factor)
    bmr = round(bmr)

    return {
        "bmr": bmr,
        "tdee": tdee,
        "weight_loss": tdee - 500,
        "weight_gain": tdee + 300,
        "maintain": tdee,
    }


def build_nutrition_context(chat_history: list) -> str:
    """Format last 6 messages as context for the LLM."""
    if not chat_history:
        return ""
    recent = chat_history[-6:]
    lines = []
    for msg in recent:
        role = "Human" if msg["role"] == "user" else "Assistant"
        lines.append(f"{role}: {msg['content']}")
    return "\n".join(lines)


# ── Route: Home ───────────────────────────────────────────────
@app.route("/")
def index():
    if "chat_history" not in session:
        session["chat_history"] = []
    if "user_profile" not in session:
        session["user_profile"] = {}
    if "family_members" not in session:
        session["family_members"] = []
    try:
        return render_template("index.html", agent_config=AGENT_CONFIG)
    except Exception:
        # Fallback: read the file directly. Also surfaces a clear diagnostic
        # if the templates folder wasn't bundled by the deployment platform.
        template_path = os.path.join(BASE_DIR, "templates", "index.html")
        if os.path.exists(template_path):
            with open(template_path, "r", encoding="utf-8") as f:
                html = f.read()
            return html
        return (
            "templates/index.html not found on this deployment. "
            f"Looked in: {template_path}. "
            f"BASE_DIR contents: {os.listdir(BASE_DIR)}",
            500,
        )
    return render_template("index.html", agent_config=AGENT_CONFIG)


# ── Route: Chat ───────────────────────────────────────────────
@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    user_message = data.get("message", "").strip()
    user_profile = data.get("user_profile", session.get("user_profile", {}))

    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    # Update session profile if provided
    if user_profile:
        session["user_profile"] = user_profile
        session.modified = True

    # Build history
    if "chat_history" not in session:
        session["chat_history"] = []
    session["chat_history"].append({"role": "user", "content": user_message})

    try:
        model = get_watsonx_model()
        system_prompt = build_system_prompt(user_profile)
        context = build_nutrition_context(session["chat_history"][:-1])

        full_prompt = f"""{system_prompt}

{context}
Human: {user_message}
Assistant:"""

        response = model.generate_text(prompt=full_prompt)
        assistant_reply = response.strip() if response else "I'm here to help with your nutrition questions!"

        session["chat_history"].append({"role": "assistant", "content": assistant_reply})
        session.modified = True

        return jsonify({
            "reply": assistant_reply,
            "timestamp": datetime.now().strftime("%I:%M %p"),
        })

    except Exception as e:
        error_msg = str(e)
        # Fallback demo response when API not configured
        if ("IBM_API_KEY" in error_msg or "project_id" in error_msg
                or "must be set" in error_msg or "not_found" in error_msg
                or "Failed to retrieve project" in error_msg or "WSCPA0000E" in error_msg
                or "BXNIM0415E" in error_msg or "could not be found" in error_msg
                or "authenticating connection" in error_msg or "validate your credentials" in error_msg):
            fallback = generate_fallback_response(user_message, user_profile)
            session["chat_history"].append({"role": "assistant", "content": fallback})
            session.modified = True
            return jsonify({
                "reply": fallback,
                "timestamp": datetime.now().strftime("%I:%M %p"),
                "demo_mode": True,
            })
        return jsonify({"error": f"AI service error: {error_msg}"}), 500


# ── Route: BMI Calculator ─────────────────────────────────────
@app.route("/api/bmi", methods=["POST"])
def bmi():
    data = request.get_json()
    try:
        weight = float(data["weight"])
        height = float(data["height"])
        result = calculate_bmi(weight, height)
        return jsonify(result)
    except (KeyError, ValueError, TypeError) as e:
        return jsonify({"error": str(e)}), 400


# ── Route: TDEE Calculator ────────────────────────────────────
@app.route("/api/tdee", methods=["POST"])
def tdee():
    data = request.get_json()
    try:
        result = calculate_tdee(
            weight_kg=float(data["weight"]),
            height_cm=float(data["height"]),
            age=int(data["age"]),
            gender=data["gender"],
            activity=data["activity"],
        )
        return jsonify(result)
    except (KeyError, ValueError, TypeError) as e:
        return jsonify({"error": str(e)}), 400


# ── Route: Meal Plan Generator ────────────────────────────────
@app.route("/api/meal-plan", methods=["POST"])
def meal_plan():
    data = request.get_json()
    calories = data.get("calories", 2000)
    diet_type = data.get("diet_type", AGENT_CONFIG["diet_focus"])
    preferences = data.get("preferences", "Indian")
    goal = data.get("goal", "maintain weight")
    user_profile = data.get("user_profile", session.get("user_profile", {}))

    prompt_text = f"""Create a detailed 1-day meal plan for:
- Calorie target: {calories} kcal
- Diet type: {diet_type}
- Cuisine preference: {preferences}
- Goal: {goal}

Format with:
🌅 Breakfast (time + meal + calories + macros)
☀️ Mid-Morning Snack
🍽️ Lunch (time + meal + calories + macros)
🌆 Evening Snack
🌙 Dinner (time + meal + calories + macros)
💧 Hydration tips
📊 Daily Total: calories, protein, carbs, fat

Keep it practical, use common ingredients, and include preparation tips."""

    try:
        model = get_watsonx_model()
        system_prompt = build_system_prompt(user_profile)
        full_prompt = f"{system_prompt}\n\nHuman: {prompt_text}\nAssistant:"
        response = model.generate_text(prompt=full_prompt)
        return jsonify({"meal_plan": response.strip(), "calories": calories})
    except Exception as e:
        fallback = generate_fallback_meal_plan(calories, diet_type)
        return jsonify({"meal_plan": fallback, "calories": calories, "demo_mode": True})


# ── Route: Family Profile ─────────────────────────────────────
@app.route("/api/family", methods=["GET", "POST", "DELETE"])
def family():
    if request.method == "GET":
        return jsonify(session.get("family_members", []))

    if request.method == "POST":
        member = request.get_json()
        if "family_members" not in session:
            session["family_members"] = []
        member["id"] = len(session["family_members"]) + 1
        member["added_at"] = datetime.now().strftime("%Y-%m-%d")
        session["family_members"].append(member)
        session.modified = True
        return jsonify({"success": True, "member": member})

    if request.method == "DELETE":
        member_id = request.get_json().get("id")
        session["family_members"] = [
            m for m in session.get("family_members", [])
            if m.get("id") != member_id
        ]
        session.modified = True
        return jsonify({"success": True})


# ── Route: Family Nutrition Advice ────────────────────────────
@app.route("/api/family-advice", methods=["POST"])
def family_advice():
    data = request.get_json()
    members = data.get("members", session.get("family_members", []))

    if not members:
        return jsonify({"error": "No family members found"}), 400

    member_list = "\n".join(
        f"- {m.get('name', 'Member')}, {m.get('age', '?')} yrs, "
        f"{m.get('gender', '?')}, Activity: {m.get('activity', 'moderate')}, "
        f"Goal: {m.get('goal', 'health')}"
        for m in members
    )

    prompt_text = f"""Provide personalized nutrition advice for this family:
{member_list}

For each member provide:
1. Daily calorie recommendation
2. Key nutrients to focus on
3. 2-3 suitable meal ideas
4. Any special dietary considerations

Also suggest 2-3 common family meals everyone can enjoy."""

    try:
        model = get_watsonx_model()
        system_prompt = build_system_prompt()
        full_prompt = f"{system_prompt}\n\nHuman: {prompt_text}\nAssistant:"
        response = model.generate_text(prompt=full_prompt)
        return jsonify({"advice": response.strip()})
    except Exception as e:
        return jsonify({"advice": generate_fallback_family_advice(members), "demo_mode": True})


# ── Route: Nutrition Analysis ─────────────────────────────────
@app.route("/api/analyze", methods=["POST"])
def analyze_nutrition():
    data = request.get_json()
    food_items = data.get("foods", "")

    if not food_items:
        return jsonify({"error": "No food items provided"}), 400

    prompt_text = f"""Analyze the nutritional content of: {food_items}

Provide:
1. 📊 Calorie estimate per serving
2. 🥩 Protein content
3. 🌾 Carbohydrates (total + fiber + sugar)
4. 🧈 Fat content (saturated vs unsaturated)
5. 🌿 Key vitamins and minerals
6. ✅ Health benefits
7. ⚠️ Things to watch out for
8. 💡 Healthier alternatives or additions"""

    try:
        model = get_watsonx_model()
        system_prompt = build_system_prompt()
        full_prompt = f"{system_prompt}\n\nHuman: {prompt_text}\nAssistant:"
        response = model.generate_text(prompt=full_prompt)
        return jsonify({"analysis": response.strip()})
    except Exception as e:
        return jsonify({
            "analysis": f"🔍 Nutritional analysis for '{food_items}':\n\nThis feature requires IBM Watsonx.ai API configuration. Please set up your IBM API Key in the .env file to get detailed AI-powered analysis.",
            "demo_mode": True
        })


# ── Route: Save User Profile ──────────────────────────────────
@app.route("/api/profile", methods=["GET", "POST"])
def profile():
    if request.method == "GET":
        return jsonify(session.get("user_profile", {}))
    data = request.get_json()
    session["user_profile"] = data
    session.modified = True
    return jsonify({"success": True, "profile": data})


# ── Route: Clear Chat ─────────────────────────────────────────
@app.route("/api/clear-chat", methods=["POST"])
def clear_chat():
    session["chat_history"] = []
    session.modified = True
    return jsonify({"success": True})


# ── Route: Health Check ───────────────────────────────────────
@app.route("/api/health")
def health_check():
    return jsonify({
        "status": "healthy",
        "app": AGENT_CONFIG["name"],
        "version": os.getenv("APP_VERSION", "1.0.0"),
        "watsonx_configured": bool(os.getenv("IBM_API_KEY") and os.getenv("IBM_PROJECT_ID")),
        "timestamp": datetime.now().isoformat(),
    })


# ── Fallback Demo Responses ───────────────────────────────────
def generate_fallback_response(message: str, profile: dict) -> str:
    message_lower = message.lower()
    name = profile.get("name", "friend")

    if any(w in message_lower for w in ["bmi", "weight", "obese", "overweight"]):
        return (
            f"🌿 Hi {name}! BMI (Body Mass Index) is calculated as weight(kg) / height(m)².\n\n"
            "📊 **BMI Categories:**\n"
            "- Under 18.5 → Underweight\n- 18.5–24.9 → Normal\n- 25–29.9 → Overweight\n- 30+ → Obese\n\n"
            "Use the **BMI Calculator** tab for your personalized result! 💪\n\n"
            "*⚠️ Demo Mode: Configure IBM_API_KEY in .env for full AI responses.*"
        )
    if any(w in message_lower for w in ["meal", "plan", "diet", "food", "eat"]):
        return (
            f"🍽️ Great question, {name}! Here's a sample balanced Indian meal plan:\n\n"
            "🌅 **Breakfast:** Moong dal chilla + curd (350 kcal)\n"
            "☀️ **Snack:** Handful of almonds + 1 fruit (150 kcal)\n"
            "🍽️ **Lunch:** Brown rice + dal + sabzi + salad (550 kcal)\n"
            "🌆 **Snack:** Sprouts chaat (120 kcal)\n"
            "🌙 **Dinner:** 2 rotis + paneer sabzi + dal (480 kcal)\n\n"
            "💧 Drink 8–10 glasses of water daily!\n\n"
            "*⚠️ Demo Mode: Configure IBM_API_KEY in .env for personalized AI meal plans.*"
        )
    if any(w in message_lower for w in ["protein", "calorie", "nutrition", "macro"]):
        return (
            "💪 **Quick Nutrition Facts:**\n\n"
            "- 🥩 **Protein:** 0.8–1.2g per kg body weight/day\n"
            "- 🌾 **Carbs:** 45–65% of total calories\n"
            "- 🧈 **Fat:** 20–35% of total calories\n\n"
            "**Best Indian protein sources:** Dal, paneer, curd, rajma, chhole, eggs, soy\n\n"
            "*⚠️ Demo Mode: Configure IBM_API_KEY in .env for full AI responses.*"
        )
    return (
        f"👋 Hello {name}! I'm **NutriGenius**, your AI nutrition coach!\n\n"
        "I can help you with:\n"
        "- 🥗 Personalized meal plans\n- 📊 Calorie & macro analysis\n"
        "- 🧮 BMI & TDEE calculations\n- 👨‍👩‍👧 Family nutrition advice\n- 🇮🇳 Indian food recommendations\n\n"
        "What would you like to explore today?\n\n"
        "*⚠️ Demo Mode: Configure your IBM_API_KEY in .env file for full AI-powered responses.*"
    )


def generate_fallback_meal_plan(calories: int, diet_type: str) -> str:
    return f"""🍽️ **Sample {diet_type.title()} Meal Plan ({calories} kcal)**

🌅 **Breakfast (~{int(calories*0.25)} kcal)**
- 2 Moong Dal Cheela with mint chutney
- 1 cup low-fat curd
- 1 glass warm water with lemon

☀️ **Mid-Morning Snack (~{int(calories*0.08)} kcal)**
- 1 seasonal fruit (apple/banana/guava)
- 8–10 soaked almonds

🍽️ **Lunch (~{int(calories*0.35)} kcal)**
- 1 cup brown rice or 2 rotis
- 1 bowl mixed dal (toor + moong)
- 1 bowl seasonal sabzi
- Green salad + 1 cup buttermilk

🌆 **Evening Snack (~{int(calories*0.07)} kcal)**
- Sprouts chaat with tomato, onion, lemon
- 1 cup green tea (no sugar)

🌙 **Dinner (~{int(calories*0.25)} kcal)**
- 2 multigrain rotis
- 1 bowl palak paneer or dal
- 1 bowl raita

💧 **Hydration:** 8–10 glasses of water throughout the day

📊 **Approximate Daily Total:** {calories} kcal
- Protein: {int(calories*0.25/4)}g | Carbs: {int(calories*0.45/4)}g | Fat: {int(calories*0.30/9)}g

*⚠️ Demo Mode — Configure IBM_API_KEY for AI-personalized plans*"""


def generate_fallback_family_advice(members: list) -> str:
    lines = ["👨‍👩‍👧 **Family Nutrition Guide**\n"]
    for m in members:
        age = int(m.get("age", 30))
        name = m.get("name", "Member")
        if age < 13:
            note = "Focus on calcium, iron, and vitamin D for growth. Include milk, eggs, and colorful vegetables."
        elif age < 20:
            note = "Growing teens need extra protein and calcium. Include dal, paneer, eggs, and whole grains."
        elif age > 59:
            note = "Seniors need more calcium, vitamin D, and fiber. Focus on easy-to-digest foods like khichdi and dalia."
        else:
            note = "Maintain a balanced diet with whole grains, lean protein, and plenty of vegetables."
        lines.append(f"👤 **{name} ({age} yrs):** {note}")
    lines.append("\n🍲 **Common Family Meals:**")
    lines.append("- Dal khichdi (nutritious, easy to digest for all ages)")
    lines.append("- Vegetable pulao with raita")
    lines.append("- Roti + sabzi + dal + salad")
    lines.append("\n*⚠️ Demo Mode — Configure IBM_API_KEY for personalized AI advice*")
    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    api_key = os.getenv("IBM_API_KEY", "")
    project_id = os.getenv("IBM_PROJECT_ID", "")
    print(f"""
╔══════════════════════════════════════════════╗
║  🥗 NutriGenius AI — Starting Server         ║
║  URL: http://localhost:{port:<5}                 ║
║  Mode: {'DEBUG' if debug else 'PRODUCTION':<10}                       ║
║  Watsonx: {'✅ Configured' if api_key else '⚠️  Demo Mode (set .env)'}       ║
╚══════════════════════════════════════════════╝
[DEBUG] IBM_API_KEY    = {api_key[:6]}...{api_key[-4:] if len(api_key) > 10 else '(empty)'}
[DEBUG] IBM_PROJECT_ID = {project_id}
[DEBUG] .env loaded from: {os.path.abspath('.env')}
""")
    app.run(host="0.0.0.0", port=port, debug=debug)
