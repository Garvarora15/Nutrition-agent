/* ═══════════════════════════════════════════════════════════════
   NutriGenius AI — Frontend JavaScript
   IBM Watsonx.ai Powered Nutrition Agent
═══════════════════════════════════════════════════════════════ */

'use strict';

// ── State ──────────────────────────────────────────────────────
const state = {
  currentSection: 'chat',
  userProfile: JSON.parse(localStorage.getItem('nutrigenius_profile') || '{}'),
  familyMembers: JSON.parse(localStorage.getItem('nutrigenius_family') || '[]'),
  theme: localStorage.getItem('nutrigenius_theme') || 'light',
  currentMealPlan: '',
};

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  restoreProfile();
  renderFamilyMembers();
  renderNutrientCards();
  rotateTips();
  setInterval(rotateTips, 12000);
  syncCalorieRange();
  // Auto-size calorie range sync
  document.getElementById('planCalories').addEventListener('input', function () {
    document.getElementById('calorieRange').value = this.value;
  });
});

// ── Section Navigation ─────────────────────────────────────────
function showSection(name) {
  // Hide all sections
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-pill').forEach(n => n.classList.remove('active'));

  // Hide hero if not on chat
  const hero = document.getElementById('heroBanner');
  hero.style.display = name === 'chat' ? '' : 'none';

  // Show target section
  const target = document.getElementById(`section-${name}`);
  if (target) target.classList.add('active');

  // Update nav
  document.querySelectorAll('.nav-pill').forEach(n => {
    if (n.getAttribute('onclick')?.includes(`'${name}'`)) n.classList.add('active');
  });

  state.currentSection = name;
  // Close mobile nav
  const nav = document.getElementById('navMenu');
  if (nav.classList.contains('show')) {
    document.querySelector('.navbar-toggler')?.click();
  }
}

// ── Dark Mode ──────────────────────────────────────────────────
document.getElementById('themeToggle').addEventListener('click', () => {
  const newTheme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
});

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('nutrigenius_theme', theme);
  const icon = document.getElementById('themeIcon');
  icon.className = theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
}

// ── Profile Management ─────────────────────────────────────────
function getProfileFromForm(prefix) {
  return {
    name:         document.getElementById(`${prefix}Name`)?.value || '',
    age:          document.getElementById(`${prefix}Age`)?.value || '',
    gender:       document.getElementById(`${prefix}Gender`)?.value || '',
    weight:       document.getElementById(`${prefix}Weight`)?.value || '',
    height:       document.getElementById(`${prefix}Height`)?.value || '',
    activity:     document.getElementById(`${prefix}Activity`)?.value || 'moderate',
    goal:         document.getElementById(`${prefix}Goal`)?.value || 'Balanced nutrition',
    restrictions: document.getElementById(`${prefix}Restrictions`)?.value || '',
    conditions:   document.getElementById(`${prefix}Conditions`)?.value || '',
    preferences:  document.getElementById(`${prefix}Preferences`)?.value || '',
  };
}

function saveQuickProfile() {
  const profile = {
    name:         document.getElementById('qName').value,
    age:          document.getElementById('qAge').value,
    gender:       document.getElementById('qGender').value,
    weight:       document.getElementById('qWeight').value,
    height:       document.getElementById('qHeight').value,
    goal:         document.getElementById('qGoal').value,
    restrictions: document.getElementById('qRestrictions').value,
  };
  state.userProfile = profile;
  localStorage.setItem('nutrigenius_profile', JSON.stringify(profile));
  // Sync to server session
  fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  showToast(`✅ Profile saved for ${profile.name || 'you'}!`, 'success');
}

function saveFullProfile() {
  const profile = getProfileFromForm('fp');
  state.userProfile = profile;
  localStorage.setItem('nutrigenius_profile', JSON.stringify(profile));
  fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  showToast('✅ Full profile saved!', 'success');
  bootstrap.Offcanvas.getInstance(document.getElementById('profileOffcanvas'))?.hide();
}

function restoreProfile() {
  const p = state.userProfile;
  if (!p.name) return;
  // Quick form
  setVal('qName', p.name); setVal('qAge', p.age); setVal('qGender', p.gender);
  setVal('qWeight', p.weight); setVal('qHeight', p.height);
  setVal('qGoal', p.goal); setVal('qRestrictions', p.restrictions);
  // Full form
  setVal('fpName', p.name); setVal('fpAge', p.age); setVal('fpGender', p.gender);
  setVal('fpWeight', p.weight); setVal('fpHeight', p.height);
  setVal('fpActivity', p.activity); setVal('fpGoal', p.goal);
  setVal('fpRestrictions', p.restrictions);
  setVal('fpConditions', p.conditions);
  setVal('fpPreferences', p.preferences);
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

// ── Chat ───────────────────────────────────────────────────────
function handleChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  appendMessage('user', message);
  input.value = '';
  input.style.height = 'auto';

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;

  const typingId = appendTyping();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        user_profile: state.userProfile,
      }),
    });
    const data = await response.json();
    removeTyping(typingId);

    if (data.error) {
      appendMessage('bot', `⚠️ Error: ${data.error}`);
    } else {
      appendMessage('bot', data.reply, data.timestamp);
      if (data.demo_mode) showDemoBadge();
    }
  } catch (err) {
    removeTyping(typingId);
    appendMessage('bot', '⚠️ Connection error. Please check your server is running.');
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

function sendQuickMessage(text) {
  document.getElementById('chatInput').value = text;
  showSection('chat');
  setTimeout(() => sendMessage(), 100);
}

function appendMessage(role, text, time) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `message-row ${role === 'user' ? 'user-row' : 'bot-row'}`;
  const avatar = role === 'user'
    ? `<div class="message-avatar user-avatar">👤</div>`
    : `<div class="message-avatar bot-avatar">🥗</div>`;
  const timeStr = time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const formattedText = formatMarkdown(text);

  div.innerHTML = `
    ${role === 'bot' ? avatar : ''}
    <div class="message-bubble ${role === 'user' ? 'user-bubble' : 'bot-bubble'}">
      ${formattedText}
      <span class="message-time">${timeStr}</span>
    </div>
    ${role === 'user' ? avatar : ''}
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function appendTyping() {
  const container = document.getElementById('chatMessages');
  const id = 'typing_' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'message-row bot-row';
  div.innerHTML = `
    <div class="message-avatar bot-avatar">🥗</div>
    <div class="typing-indicator">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTyping(id) {
  document.getElementById(id)?.remove();
}

function clearChat() {
  if (!confirm('Clear all chat history?')) return;
  fetch('/api/clear-chat', { method: 'POST' });
  const container = document.getElementById('chatMessages');
  // Keep only the welcome message (first child)
  while (container.children.length > 1) container.removeChild(container.lastChild);
  showToast('🗑️ Chat cleared', 'info');
}

function showDemoBadge() {
  document.getElementById('demoBadge').classList.remove('d-none');
}

// ── Simple Markdown Formatter ──────────────────────────────────
function formatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^### (.*$)/gm, '<h6 class="fw-bold mt-2 mb-1">$1</h6>')
    .replace(/^## (.*$)/gm,  '<h5 class="fw-bold mt-2 mb-1">$1</h5>')
    .replace(/^# (.*$)/gm,   '<h4 class="fw-bold mt-2 mb-1">$1</h4>')
    // Bullet lists
    .replace(/^[\s]*[-•] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul class="ps-3 mb-1">$1</ul>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-2" />')
    // Line breaks
    .replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>');
}

// ── BMI Calculator ─────────────────────────────────────────────
async function calculateBMI() {
  const weight = parseFloat(document.getElementById('bmiWeight').value);
  const height = parseFloat(document.getElementById('bmiHeight').value);

  if (!weight || !height || weight < 20 || height < 50) {
    showToast('⚠️ Please enter valid weight and height.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/bmi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight, height }),
    });
    const data = await res.json();
    if (data.error) { showToast('⚠️ ' + data.error, 'warning'); return; }

    document.getElementById('bmiNumber').textContent = data.bmi;
    document.getElementById('bmiNumber').style.color = data.color;
    document.getElementById('bmiCategory').textContent = data.category;
    document.getElementById('bmiAdvice').textContent = data.advice;
    document.getElementById('bmiAdvice').style.borderLeft = `4px solid ${data.color}`;

    // Position marker: BMI scale approx 15–40
    const pct = Math.min(Math.max(((data.bmi - 15) / 25) * 100, 2), 98);
    document.getElementById('bmiMarker').style.left = pct + '%';

    document.getElementById('bmiResult').classList.remove('d-none');
  } catch (e) {
    showToast('⚠️ Error calculating BMI.', 'danger');
  }
}

// ── TDEE Calculator ────────────────────────────────────────────
async function calculateTDEE() {
  const weight   = parseFloat(document.getElementById('tdeeWeight').value);
  const height   = parseFloat(document.getElementById('tdeeHeight').value);
  const age      = parseInt(document.getElementById('tdeeAge').value);
  const gender   = document.getElementById('tdeeGender').value;
  const activity = document.getElementById('tdeeActivity').value;

  if (!weight || !height || !age) {
    showToast('⚠️ Please fill all TDEE fields.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/tdee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight, height, age, gender, activity }),
    });
    const data = await res.json();
    if (data.error) { showToast('⚠️ ' + data.error, 'warning'); return; }

    document.getElementById('tdeeMainten').textContent = data.maintain.toLocaleString();
    document.getElementById('tdeeLose').textContent = data.weight_loss.toLocaleString();
    document.getElementById('tdeeGain').textContent = data.weight_gain.toLocaleString();

    // Macro bars
    const tdee = data.maintain;
    const macros = [
      { name: 'Carbs', grams: Math.round(tdee * 0.45 / 4), color: '#f59e0b', pct: 45 },
      { name: 'Protein', grams: Math.round(tdee * 0.25 / 4), color: '#3b82f6', pct: 25 },
      { name: 'Fat', grams: Math.round(tdee * 0.30 / 9), color: '#22c55e', pct: 30 },
    ];

    document.getElementById('macroBars').innerHTML = macros.map(m => `
      <div class="macro-bar-item">
        <span class="macro-label">${m.name}</span>
        <div class="macro-bar-bg">
          <div class="macro-bar-fill" style="width:${m.pct}%; background:${m.color}"></div>
        </div>
        <span class="macro-value" style="color:${m.color}">${m.grams}g</span>
      </div>
    `).join('');

    document.getElementById('tdeeResult').classList.remove('d-none');

    // Pre-fill meal planner
    document.getElementById('planCalories').value = data.maintain;
    document.getElementById('calorieRange').value = data.maintain;
  } catch (e) {
    showToast('⚠️ Error calculating TDEE.', 'danger');
  }
}

// ── Meal Plan Generator ────────────────────────────────────────
async function generateMealPlan() {
  const calories   = parseInt(document.getElementById('planCalories').value) || 2000;
  const dietType   = document.getElementById('planDiet').value;
  const cuisine    = document.getElementById('planCuisine').value;
  const goal       = document.getElementById('planGoal').value;

  document.getElementById('mealPlanPlaceholder').classList.add('d-none');
  document.getElementById('mealPlanContent').classList.add('d-none');
  document.getElementById('mealPlanLoading').classList.remove('d-none');
  document.getElementById('copyPlanBtn').classList.add('d-none');

  try {
    const res = await fetch('/api/meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calories, diet_type: dietType, preferences: cuisine,
        goal, user_profile: state.userProfile,
      }),
    });
    const data = await res.json();

    document.getElementById('mealPlanLoading').classList.add('d-none');

    if (data.meal_plan) {
      state.currentMealPlan = data.meal_plan;
      document.getElementById('mealPlanContent').innerHTML = `
        <div class="meal-plan-content">${formatMarkdown(data.meal_plan)}</div>
        ${data.demo_mode ? '<div class="alert alert-warning mt-3 small py-2">⚠️ Demo mode — configure IBM_API_KEY for AI-personalized plans</div>' : ''}
      `;
      document.getElementById('mealPlanContent').classList.remove('d-none');
      document.getElementById('copyPlanBtn').classList.remove('d-none');
      if (data.demo_mode) showDemoBadge();
    }
  } catch (e) {
    document.getElementById('mealPlanLoading').classList.add('d-none');
    document.getElementById('mealPlanPlaceholder').classList.remove('d-none');
    showToast('⚠️ Error generating meal plan.', 'danger');
  }
}

function copyMealPlan() {
  if (!state.currentMealPlan) return;
  navigator.clipboard.writeText(state.currentMealPlan).then(() => {
    showToast('📋 Meal plan copied to clipboard!', 'success');
  });
}

function syncCalorieRange() {
  const cal = document.getElementById('planCalories');
  const range = document.getElementById('calorieRange');
  if (cal && range) range.value = cal.value;
}

// ── Food Analyzer ──────────────────────────────────────────────
async function analyzeFood() {
  const input = document.getElementById('analyzeInput').value.trim();
  if (!input) { showToast('⚠️ Please enter a food item.', 'warning'); return; }

  document.getElementById('analysisPlaceholder').classList.add('d-none');
  document.getElementById('analysisResult').classList.add('d-none');
  document.getElementById('analysisLoading').classList.remove('d-none');

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foods: input }),
    });
    const data = await res.json();

    document.getElementById('analysisLoading').classList.add('d-none');
    if (data.analysis) {
      document.getElementById('analysisResult').innerHTML = `
        <div class="analysis-result">${formatMarkdown(data.analysis)}</div>
        ${data.demo_mode ? '<div class="alert alert-warning mt-3 small py-2">⚠️ Demo mode — configure IBM_API_KEY for AI analysis</div>' : ''}
      `;
      document.getElementById('analysisResult').classList.remove('d-none');
      if (data.demo_mode) showDemoBadge();
    }
  } catch (e) {
    document.getElementById('analysisLoading').classList.add('d-none');
    document.getElementById('analysisPlaceholder').classList.remove('d-none');
    showToast('⚠️ Error analyzing food.', 'danger');
  }
}

function analyzeQuick(food) {
  document.getElementById('analyzeInput').value = food;
  analyzeFood();
}

// ── Family Management ──────────────────────────────────────────
async function addFamilyMember() {
  const member = {
    name:         document.getElementById('famName').value.trim(),
    age:          document.getElementById('famAge').value,
    gender:       document.getElementById('famGender').value,
    weight:       document.getElementById('famWeight').value,
    height:       document.getElementById('famHeight').value,
    activity:     document.getElementById('famActivity').value,
    goal:         document.getElementById('famGoal').value,
    restrictions: document.getElementById('famRestrictions').value,
  };

  if (!member.name || !member.age) {
    showToast('⚠️ Please enter member name and age.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/family', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(member),
    });
    const data = await res.json();
    if (data.success) {
      state.familyMembers.push(data.member);
      localStorage.setItem('nutrigenius_family', JSON.stringify(state.familyMembers));
      renderFamilyMembers();
      clearFamilyForm();
      showToast(`✅ ${member.name} added to family!`, 'success');
    }
  } catch (e) {
    // Fallback: add locally
    const localMember = { ...member, id: Date.now() };
    state.familyMembers.push(localMember);
    localStorage.setItem('nutrigenius_family', JSON.stringify(state.familyMembers));
    renderFamilyMembers();
    clearFamilyForm();
    showToast(`✅ ${member.name} added!`, 'success');
  }
}

function clearFamilyForm() {
  ['famName','famAge','famWeight','famHeight','famRestrictions'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function renderFamilyMembers() {
  const list = document.getElementById('familyMembersList');
  const count = document.getElementById('memberCount');
  const members = state.familyMembers;
  count.textContent = `${members.length} member${members.length !== 1 ? 's' : ''}`;

  if (!members.length) {
    list.innerHTML = `
      <div class="empty-family text-center py-4">
        <div class="empty-icon">👨‍👩‍👧</div>
        <p class="text-muted">No family members added yet.<br>Add your family for personalized nutrition advice!</p>
      </div>`;
    return;
  }

  list.innerHTML = members.map(m => {
    const icon = getAgeIcon(parseInt(m.age));
    const goalLabel = m.goal?.replace(/_/g, ' ') || 'Health';
    return `
      <div class="family-member-card">
        <span class="member-avatar-icon">${icon}</span>
        <div class="member-info">
          <div class="member-name">${escHtml(m.name)}</div>
          <div class="member-details">
            ${m.age} yrs • ${m.gender || '?'} • ${m.weight ? m.weight + 'kg' : ''} • ${m.activity || 'moderate'}
            ${m.restrictions ? `<br>🚫 ${escHtml(m.restrictions)}` : ''}
          </div>
        </div>
        <div class="d-flex flex-column align-items-end gap-2">
          <span class="member-goal-badge">${goalLabel}</span>
          <button class="btn btn-sm btn-outline-danger" onclick="removeFamilyMember(${m.id})">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      </div>`;
  }).join('');
}

function getAgeIcon(age) {
  if (age < 13) return '🧒';
  if (age < 20) return '🧑';
  if (age > 59) return '🧓';
  return '👨';
}

async function removeFamilyMember(id) {
  state.familyMembers = state.familyMembers.filter(m => m.id !== id);
  localStorage.setItem('nutrigenius_family', JSON.stringify(state.familyMembers));
  try {
    await fetch('/api/family', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  } catch {}
  renderFamilyMembers();
  showToast('🗑️ Member removed.', 'info');
}

async function getFamilyAdvice() {
  if (!state.familyMembers.length) {
    showToast('⚠️ Add family members first!', 'warning');
    return;
  }

  document.getElementById('familyAdvicePlaceholder').classList.add('d-none');
  document.getElementById('familyAdviceResult').classList.add('d-none');
  document.getElementById('familyAdviceLoading').classList.remove('d-none');

  try {
    const res = await fetch('/api/family-advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: state.familyMembers }),
    });
    const data = await res.json();

    document.getElementById('familyAdviceLoading').classList.add('d-none');
    if (data.advice) {
      document.getElementById('familyAdviceResult').innerHTML = `
        <div class="family-advice-result">${formatMarkdown(data.advice)}</div>
        ${data.demo_mode ? '<div class="alert alert-warning mt-3 small py-2">⚠️ Demo mode — configure IBM_API_KEY for AI advice</div>' : ''}
      `;
      document.getElementById('familyAdviceResult').classList.remove('d-none');
      if (data.demo_mode) showDemoBadge();
    }
  } catch (e) {
    document.getElementById('familyAdviceLoading').classList.add('d-none');
    document.getElementById('familyAdvicePlaceholder').classList.remove('d-none');
    showToast('⚠️ Error getting family advice.', 'danger');
  }
}

// ── Nutrient Cards ─────────────────────────────────────────────
const NUTRIENTS = [
  { icon: '💪', name: 'Protein', rda: '50–60g/day', sources: 'Dal, Paneer, Eggs, Soy, Chickpeas, Milk' },
  { icon: '🦴', name: 'Calcium', rda: '1000mg/day', sources: 'Milk, Curd, Ragi, Sesame seeds, Spinach' },
  { icon: '🌞', name: 'Vitamin D', rda: '600 IU/day', sources: 'Sunlight, Fortified milk, Mushrooms, Eggs' },
  { icon: '🩸', name: 'Iron', rda: '18mg/day (women)', sources: 'Spinach, Rajma, Jaggery, Sesame, Moringa' },
  { icon: '🌿', name: 'Folate (B9)', rda: '400mcg/day', sources: 'Green leafy veg, Chana, Beetroot, Broccoli' },
  { icon: '🍊', name: 'Vitamin C', rda: '65–90mg/day', sources: 'Amla, Guava, Lemon, Bell peppers, Tomatoes' },
  { icon: '🧠', name: 'Omega-3', rda: '1.1–1.6g/day', sources: 'Flaxseeds, Walnuts, Chia seeds, Mustard oil' },
  { icon: '⚡', name: 'Magnesium', rda: '310–420mg/day', sources: 'Cashews, Pumpkin seeds, Whole grains, Banana' },
  { icon: '🛡️', name: 'Zinc', rda: '8–11mg/day', sources: 'Pumpkin seeds, Chana, Cashews, Dairy, Eggs' },
  { icon: '🌾', name: 'Fiber', rda: '25–38g/day', sources: 'Whole grains, Vegetables, Fruits, Legumes, Oats' },
  { icon: '💧', name: 'Potassium', rda: '3500mg/day', sources: 'Banana, Potato, Dal, Coconut water, Tomato' },
  { icon: '🔬', name: 'Vitamin B12', rda: '2.4mcg/day', sources: 'Dairy products, Eggs, Fortified cereals, Fish' },
];

function renderNutrientCards() {
  const container = document.getElementById('nutrientCards');
  container.innerHTML = NUTRIENTS.map(n => `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="nutrient-card">
        <div class="nutrient-icon">${n.icon}</div>
        <div class="nutrient-name">${n.name}</div>
        <div class="nutrient-sources">${n.sources}</div>
        <div class="nutrient-rda">RDA: ${n.rda}</div>
      </div>
    </div>
  `).join('');
}

// ── Nutrition Tips ─────────────────────────────────────────────
const TIPS = [
  { emoji: '🌿', text: 'Start your day with warm water and lemon — boosts metabolism and aids digestion.' },
  { emoji: '🥗', text: 'Fill half your plate with vegetables at every meal for vitamins, minerals, and fiber.' },
  { emoji: '💧', text: 'Drink 8–10 glasses of water daily. Add sabja (basil) seeds for extra hydration.' },
  { emoji: '🌾', text: 'Replace white rice with brown rice or add millets like jowar, bajra, and ragi.' },
  { emoji: '🥜', text: 'Soak 10 almonds overnight and eat in the morning for brain health and energy.' },
  { emoji: '🧘', text: 'Eat mindfully — chew slowly, avoid screens while eating for better digestion.' },
  { emoji: '🍎', text: 'Amla (Indian gooseberry) has 20x more Vitamin C than an orange — eat daily!' },
  { emoji: '⏰', text: 'Avoid eating within 2 hours of bedtime to improve sleep and metabolism.' },
  { emoji: '🫘', text: 'Sprout your legumes before cooking — it doubles their nutrient bioavailability!' },
  { emoji: '🌶️', text: 'Turmeric + black pepper = powerful anti-inflammatory combo. Add to your dal daily.' },
  { emoji: '🥦', text: 'Seasonal vegetables are more nutritious and affordable — shop local and seasonal.' },
  { emoji: '🍵', text: 'Replace sugary drinks with herbal teas like tulsi, ginger, or chamomile.' },
];

let tipIndex = 0;
function rotateTips() {
  const tip = TIPS[tipIndex % TIPS.length];
  document.querySelector('.tip-emoji').textContent = tip.emoji;
  document.getElementById('tipText').textContent = tip.text;
  tipIndex++;
}

// ── Toast Notification ─────────────────────────────────────────
function showToast(message, type = 'info') {
  const toastEl = document.getElementById('notifToast');
  const toastMsg = document.getElementById('toastMessage');
  toastMsg.textContent = message;
  toastEl.className = 'toast align-items-center border-0';
  const colorMap = { success: 'text-bg-success', danger: 'text-bg-danger', warning: 'text-bg-warning', info: 'text-bg-info' };
  toastEl.classList.add(colorMap[type] || 'text-bg-secondary');
  const toast = new bootstrap.Toast(toastEl, { delay: 3500 });
  toast.show();
}

// ── Utility ────────────────────────────────────────────────────
function escHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}
