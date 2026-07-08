# 🥗 NutriGenius AI — IBM Watsonx.ai Powered Nutrition Agent

> A full-stack AI nutrition web application built with **Python Flask** + **IBM Watsonx.ai Granite models**, featuring a responsive chat UI, BMI calculator, AI meal planner, food analyzer, and family profile management.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 AI Chat | Conversational nutrition advice via IBM Granite LLM |
| 🧮 BMI Calculator | Visual BMI gauge with category and advice |
| 🔥 TDEE Calculator | Harris-Benedict calorie needs with macro breakdown |
| 🍽️ AI Meal Planner | Personalized Indian/global meal plans (1200–4000 kcal) |
| 🔍 Food Analyzer | Detailed nutrition analysis for any meal |
| 👨‍👩‍👧 Family Profiles | Multi-member nutrition management with age-specific advice |
| 🌿 Nutrient Dashboard | 12 key nutrients with Indian food sources and RDA |
| 🌙 Dark Mode | Full dark/light theme toggle |
| 📱 Mobile Responsive | Bootstrap 5 responsive design |
| ⚙️ Agent Instructions | Easily customize agent behavior via `AGENT_CONFIG` dict |

---

## 🚀 Quick Start

### 1. Clone / Navigate to Project

```bash
cd nutrition_agent
```

### 2. Create Virtual Environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux / Mac
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```env
IBM_API_KEY=your_ibm_cloud_api_key_here
IBM_PROJECT_ID=your_watsonx_project_id_here
IBM_WATSONX_URL=https://us-south.ml.cloud.ibm.com
FLASK_SECRET_KEY=change_this_to_a_random_string
```

### 5. Run the Application

```bash
python app.py
```

Open **http://localhost:5000** in your browser. 🎉

---

## 🔑 Getting IBM Watsonx.ai Credentials

### Step 1: Create IBM Cloud Account
1. Go to [cloud.ibm.com](https://cloud.ibm.com) and sign up (free tier available)

### Step 2: Get IBM API Key
1. Go to **Manage → Access (IAM) → API Keys**
2. Click **"Create an IBM Cloud API key"**
3. Copy and save it — you'll only see it once!

### Step 3: Create Watsonx.ai Project
1. Go to [watsonx.ai](https://dataplatform.cloud.ibm.com/wx/)
2. Click **"New Project"** → **"Create an empty project"**
3. Copy the **Project ID** from project settings

### Step 4: Provision Watsonx.ai Service
1. In IBM Cloud Catalog, search for **"Watson Machine Learning"**
2. Create the service (Lite plan is free)
3. Associate it with your Watsonx project

---

## 🛠️ Customizing Agent Behavior

Open `app.py` and find the `AGENT_CONFIG` section (clearly marked). No AI knowledge needed!

```python
AGENT_CONFIG = {
    # Change agent name and tone
    "name": "NutriGenius",
    "tone": "friendly, warm, and encouraging",

    # Set diet specialization
    "diet_focus": "vegetarian",   # "keto", "vegan", "ayurvedic", etc.

    # Enable/disable Indian food preferences
    "indian_food_enabled": True,
    "preferred_cuisines": ["North Indian", "South Indian", "Punjabi"],

    # Safety rules
    "avoid_extreme_diets": True,
    "min_safe_calories": 1200,

    # Response style
    "use_emojis": True,
    "response_length": "medium",  # "short", "medium", "detailed"

    # Goals
    "primary_goal": "holistic nutrition and sustainable healthy eating",
}
```

---

## 📁 Project Structure

```
nutrition_agent/
├── app.py                    ← Main Flask app + AGENT_CONFIG + all routes
├── requirements.txt          ← Python dependencies
├── .env.example              ← Environment variable template
├── .env                      ← Your credentials (DO NOT commit!)
├── README.md                 ← This file
├── templates/
│   └── index.html            ← Full SPA frontend (Bootstrap 5)
└── static/
    ├── css/
    │   └── style.css         ← Custom styles + dark mode + animations
    └── js/
        └── app.js            ← Frontend logic (chat, BMI, meals, family)
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Main application |
| POST | `/api/chat` | AI chat with Granite model |
| POST | `/api/bmi` | BMI calculation |
| POST | `/api/tdee` | TDEE/calorie calculation |
| POST | `/api/meal-plan` | AI meal plan generation |
| POST | `/api/analyze` | Food nutrition analysis |
| GET/POST/DELETE | `/api/family` | Family member management |
| POST | `/api/family-advice` | AI family nutrition advice |
| GET/POST | `/api/profile` | User profile management |
| POST | `/api/clear-chat` | Clear chat history |
| GET | `/api/health` | Health check + config status |

---

## 🐳 Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "app:app"]
```

```bash
# Build
docker build -t nutrigenius-ai .

# Run
docker run -p 5000:5000 --env-file .env nutrigenius-ai
```

---

## ☁️ Deploy to IBM Code Engine

```bash
# Install IBM Cloud CLI + Code Engine plugin
ibmcloud plugin install code-engine

# Login
ibmcloud login --apikey $IBM_API_KEY -r us-south

# Target a project
ibmcloud ce project select --name my-project

# Deploy
ibmcloud ce application create \
  --name nutrigenius-ai \
  --image us.icr.io/my-namespace/nutrigenius-ai \
  --env-from-secret nutrigenius-secrets \
  --port 5000 \
  --min-scale 1 \
  --max-scale 3
```

---

## ☁️ Deploy to Heroku / Render / Railway

```bash
# Heroku
heroku create nutrigenius-ai
heroku config:set IBM_API_KEY=xxx IBM_PROJECT_ID=yyy FLASK_SECRET_KEY=zzz
git push heroku main
```

For **Render.com** or **Railway.app**:
1. Connect your GitHub repo
2. Set environment variables in the dashboard
3. Set start command: `gunicorn app:app`
4. Deploy! ✅

---

## ⚡ Running in Production

```bash
# Use gunicorn for production
gunicorn --bind 0.0.0.0:5000 --workers 4 --timeout 120 app:app
```

---

## 🔒 Security Notes

- Never commit your `.env` file — it's in `.gitignore`
- Rotate your `FLASK_SECRET_KEY` in production
- Use HTTPS in production (Nginx/Caddy reverse proxy recommended)
- Session data is server-side; profile data is stored in browser localStorage

---

## 🤝 Demo Mode

If IBM credentials are not configured, the app runs in **Demo Mode**:
- A yellow badge appears in the navbar
- Pre-written fallback responses are shown for common queries
- BMI and TDEE calculators work fully (they use server-side Python math)
- Perfect for testing the UI before connecting to Watsonx.ai

---

## 📝 License

MIT License — free to use, modify, and deploy.

---

*Built with ❤️ using IBM Watsonx.ai Granite · Flask · Bootstrap 5*
