/* Jarvice — app.js
   Modular, commented, client-side only.
   Place this file at /js/app.js
*/

/* =========================
   Configuration & Globals
   ========================= */
const OWM_API_KEY = "a2703532108d36c83b7a48f44c542419"; // <-- Replace with your free key or leave empty to use fallback
const DEFAULT_CITY = "Mumbai";
const NEWS_FALLBACK = [
  {title: "Jarvice Demo: Local headlines fallback", source:"Local"},
  {title: "Try: 'Give me the news' or 'What's the weather?'", source:"Jarvice"}
];

const elements = {
  micStatus: document.getElementById('mic-status'),
  hotwordHint: document.getElementById('hotword-hint'),
  chatFeed: document.getElementById('chat-feed'),
  clock: document.getElementById('clock'),
  greeting: document.getElementById('greeting'),
  toggleListen: document.getElementById('toggle-listen'),
  openSettings: document.getElementById('open-settings'),
  settingsDialog: document.getElementById('settings-dialog'),
  themeSelect: document.getElementById('theme-select'),
  hotwordToggle: document.getElementById('hotword-toggle'),
  browserName: document.getElementById('browser-name'),
  platform: document.getElementById('platform'),
  battery: document.getElementById('battery'),
  todoText: document.getElementById('todo-text'),
  todoAdd: document.getElementById('todo-add'),
  todoList: document.getElementById('todo-list'),
  pulse: document.getElementById('pulse'),
  waveCanvas: document.getElementById('wave'),
  music: document.getElementById('jarvice-music')
};

let recognition, speechSynth;
let listening = false;
let activated = false; // hotword activated
let audioContext, analyser, dataArray, sourceNode;

/* =========================
   Utilities
   ========================= */
function speak(text, opts = {}) {
  const s = new SpeechSynthesisUtterance(text);
  if (opts.lang) s.lang = opts.lang;
  s.rate = opts.rate || 1;
  s.pitch = opts.pitch || 1;
  s.volume = opts.volume || 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(s);
  showMessage(text, 'jarvice');
}

function showMessage(text, who = 'jarvice') {
  const bubble = document.createElement('div');
  bubble.className = `msg ${who} enter`;
  const avatar = document.createElement('span'); avatar.className = 'avatar';
  const content = document.createElement('div'); content.className = 'content';
  const txt = document.createElement('div'); txt.className = 'text'; txt.innerText = text;
  const meta = document.createElement('div'); meta.className = 'meta'; meta.innerText = new Date().toLocaleTimeString();

  content.appendChild(txt); content.appendChild(meta);
  bubble.appendChild(avatar); bubble.appendChild(content);
  elements.chatFeed.appendChild(bubble);
  elements.chatFeed.scrollTop = elements.chatFeed.scrollHeight;
  // small enter animation
  setTimeout(() => bubble.classList.remove('enter'), 200);
}

/* sanitize and evaluate math expressions */
function safeEvalMath(expr) {
  // replace words with symbols
  expr = expr.toLowerCase()
    .replace(/times|x|multiplied by/g, '*')
    .replace(/plus|add(ed)?/g, '+')
    .replace(/minus|subtract(ed)?/g, '-')
    .replace(/divided by|over|÷/g, '/')
    .replace(/into/g, '*')
    .replace(/modulo|mod/g, '%')
    .replace(/[^\d+\-*/().% ]/g,''); // remove any letters/unsafe chars
  // avoid sequences like ** or // abuse
  if (/[^0-9+\-*/().% ]/.test(expr) || expr.length > 120) return null;
  try {
    // Using Function to evaluate a simple math expression
    // We already stripped letters; still be cautious
    // Evaluate digit-by-digit - basic check
    const result = Function(`"use strict"; return (${expr})`)();
    if (!isFinite(result)) return null;
    return result;
  } catch(e) { return null; }
}

/* =========================
   Chat Command Handler
   ========================= */
async function handleCommand(transcript) {
  transcript = transcript.trim();
  if (!transcript) return;

  showMessage(transcript, 'user'); // show user bubble

  // normalize
  const text = transcript.toLowerCase();

  // Hotword — if present, activate and remove it from text
  const hotword = 'hey jarvice';
  let content = text;
  if (content.includes(hotword)) {
    activated = true;
    content = content.replace(hotword, '').trim();
  }

  // If not yet activated, ask user to say hotword
  if (!activated && !content.startsWith('jarvice')) {
    const resp = 'Say "Hey Jarvice" to activate me.';
    speak(resp);
    return;
  }

  // simple small-talk
  if (/hello|hi|hey|good morning|good afternoon|good evening/.test(content)) {
    const dt = new Date();
    const hour = dt.getHours();
    let prefix = 'Hello';
    if (hour < 12) prefix = 'Good morning';
    else if (hour < 17) prefix = 'Good afternoon';
    else prefix = 'Good evening';
    speak(`${prefix}, sir. How can I help you?`);
    return;
  }

  // time & date
  if (/time|date/.test(content) && !/time(s)? to|set time/.test(content)) {
    const now = new Date();
    const resp = `It's ${now.toLocaleTimeString()} on ${now.toLocaleDateString()}.`;
    speak(resp);
    return;
  }

  // weather
  if (/weather/.test(content)) {
    const cityMatch = content.match(/in ([a-zA-Z ]+)/);
    const city = cityMatch ? cityMatch[1].trim() : DEFAULT_CITY;
    speak(`Checking weather in ${city}.`);
    const w = await fetchWeather(city);
    if (w) speak(`In ${city}, ${w.description}. Temperature ${Math.round(w.temp)}°C, feels like ${Math.round(w.feels_like)}°C.`);
    else speak("Sorry, I couldn't fetch weather right now. Try again later.");
    return;
  }

  // news
  if (/news|headlines/.test(content)) {
    speak("Fetching latest headlines.");
    const headlines = await fetchNews();
    headlines.slice(0,5).forEach((h, i) => {
      speak(`${i+1}. ${h.title}`);
    });
    return;
  }

  // math
  if (/what is|calculate|what's|evaluate|solve|how much|=|plus|minus|times|divided/.test(content)) {
    // try to extract after 'calculate' or full phrase
    const expr = content.replace(/(calculate|what is|what's|solve|evaluate|equals|=)/g,'').trim();
    const result = safeEvalMath(expr);
    if (result === null) {
      speak("I couldn't parse that math expression. Try saying 'What is 45 times 12'.");
    } else {
      speak(`The answer is ${result}.`);
    }
    return;
  }

  // To-do commands
  if (/add (task )?(called )?(named )?(task )?(.+)/.test(content) || /add (.+) to (my )?to-?do/.test(content)) {
    const t = content.replace(/add |task |to (my )?to-?do|named |called /g,'').trim();
    if (t) { addTodo(t); speak(`Added task: ${t}`); } else speak("Tell me the task to add.");
    return;
  }
  if (/list (my )?(tasks|to-?dos|todos)|what are (my )?tasks/.test(content)) {
    const tasks = getTodos();
    if (!tasks.length) speak("Your to-do list is empty.");
    else {
      speak(`You have ${tasks.length} tasks.`);
  tasks.forEach((it, i) => speak(`${i+1}. ${it.text || it}`));
    }
    return;
  }
  if (/delete|remove.*task/.test(content)) {
    // delete by number or text
    const num = content.match(/(\d+)/);
    const tasks = getTodos();
    if (num && tasks[num[1]-1]) {
      const removed = removeTodoAt(num[1]-1);
      speak(`Removed task ${num[1]}: ${removed}`);
    } else {
      // try to remove by text
      const txt = content.replace(/delete|remove|task|remove /g,'').trim();
      const removed = removeTodoByText(txt);
      if (removed) speak(`Removed task: ${removed}`);
      else speak("Couldn't identify the task to remove. Say 'delete 1' to remove first task.");
    }
    return;
  }

  // open apps (simulate)
  if (/open (youtube|gmail|google|maps|calendar)/.test(content)) {
    const target = content.match(/open (youtube|gmail|google|maps|calendar)/)[1];
    speak(`Opening ${target} in a new tab.`);
    const urls = {
      youtube: 'https://www.youtube.com',
      gmail: 'https://mail.google.com',
      google: 'https://www.google.com',
      maps: 'https://www.google.com/maps',
      calendar: 'https://calendar.google.com'
    };
    window.open(urls[target], '_blank');
    return;
  }

  // music control
  if (/play (music|song)|resume music/.test(content)) {
    elements.music.play();
    speak("Playing music.");
    return;
  }
  if (/pause music|stop music|pause song/.test(content)) {
    elements.music.pause();
    speak("Music paused.");
    return;
  }

  // system info
  if (/battery|battery status/.test(content)) {
    const bat = elements.battery.innerText;
    speak(`Battery status: ${bat}`);
    return;
  }

  // fallback: witty line & suggestion
  const fallback = [
    "I can fetch weather, news, control music, manage tasks, and open apps. Try: 'Hey Jarvice, what's the weather in Delhi?'",
    "Sir, I didn't quite catch that. Try: 'add buy milk to my to-do list' or 'open YouTube'."
  ];
  speak(fallback[Math.floor(Math.random()*fallback.length)]);
}

/* =========================
   Weather & News (free APIs / fallback)
   ========================= */
async function fetchWeather(city) {
  if (!OWM_API_KEY) {
    // fallback: mock
    return {description: "clear sky (mock)", temp: 28, feels_like: 29};
  }
  try {
    const q = encodeURIComponent(city);
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${q}&units=metric&appid=${OWM_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const weather = data.weather && data.weather[0] ? data.weather[0].description : "unknown";
    return {description: weather, temp: data.main.temp, feels_like: data.main.feels_like};
  } catch (e) { return null; }
}

async function fetchNews() {
  // Attempt: free public endpoints are inconsistent — use fallback if fetch fails
  try {
    // Example public endpoint — may need a key; many free endpoints restrict origins.
    // We attempt but have a robust fallback.
    const res = await fetch('https://api.allorigins.win/raw?url=https://www.reddit.com/r/news/.json');
    if (!res.ok) throw new Error('fail');
    const data = await res.json();
    const items = (data.data.children || []).slice(0,6).map(c => ({title: c.data.title, source: 'reddit'}));
    if (items.length) return items;
  } catch(e) {
    // ignore and fallback
  }
  return NEWS_FALLBACK;
}

/* =========================
   To-Do (localStorage)
   ========================= */
function getTodos() {
  try { return JSON.parse(localStorage.getItem('jarvice_todos')||'[]'); }
  catch { return []; }
}
function saveTodos(list) { localStorage.setItem('jarvice_todos', JSON.stringify(list)); renderTodos(); }

function addTodo(text) {
  const list = getTodos();
  list.push({text: text, done: false});
  saveTodos(list);
}

function removeTodoAt(i) {
  const list = getTodos();
  if (i<0 || i>=list.length) return null;
  const removed = list.splice(i,1)[0];
  saveTodos(list);
  return removed.text || removed;
}

function removeTodoByText(text) {
  if (!text) return null;
  const list = getTodos();
  const idx = list.findIndex(t => (t.text||t).toLowerCase().includes(text.toLowerCase()));
  if (idx === -1) return null;
  return removeTodoAt(idx);
}

function renderTodos() {
  const list = getTodos();
  elements.todoList.innerHTML = '';
  list.forEach((t, i) => {
    const li = document.createElement('li');
    li.dataset.i = i;
    const left = document.createElement('div'); left.className = 'left';
    const chk = document.createElement('button'); chk.className = 'chk'; chk.title = 'Toggle done';
    chk.innerHTML = t.done ? '✓' : '';
    const txt = document.createElement('span'); txt.className = 'task-text'; txt.innerText = t.text || '';
    left.appendChild(chk); left.appendChild(txt);
    const actions = document.createElement('div');
    actions.innerHTML = `<button class="btn small ghost edit">Edit</button> <button class="btn small ghost delete" data-i="${i}">Delete</button>`;
    if (t.done) li.classList.add('done');
    li.appendChild(left); li.appendChild(actions);
    elements.todoList.appendChild(li);
  });
  // attach delete handlers
  elements.todoList.querySelectorAll('.delete').forEach(b => {
    b.onclick = () => { removeTodoAt(parseInt(b.dataset.i)); speak('Task removed.'); };
  });
  // toggle done
  elements.todoList.querySelectorAll('.chk').forEach((b, idx) => {
    b.onclick = (e) => { e.preventDefault(); toggleTodoDone(idx); };
  });
  // edit
  elements.todoList.querySelectorAll('.edit').forEach((b, idx)=>{
    b.onclick = () => { startEditTodo(idx); };
  });
}

function toggleTodoDone(i){
  const list = getTodos();
  if (!list[i]) return;
  list[i].done = !list[i].done;
  saveTodos(list);
}

function startEditTodo(i){
  const list = getTodos();
  if (!list[i]) return;
  const li = elements.todoList.querySelector(`li[data-i="${i}"]`);
  const textSpan = li.querySelector('.task-text');
  const current = list[i].text || '';
  const input = document.createElement('input'); input.value = current; input.style.flex = '1';
  textSpan.replaceWith(input);
  input.focus();
  input.addEventListener('blur', ()=> finishEditTodo(i, input.value));
  input.addEventListener('keydown', (e)=>{ if (e.key==='Enter') input.blur(); if (e.key==='Escape') renderTodos(); });
}

function finishEditTodo(i, value){
  const list = getTodos();
  if (!list[i]) return;
  list[i].text = value.trim() || list[i].text || list[i];
  saveTodos(list);
}

/* =========================
   System Info & Clock
   ========================= */
function updateClockGreeting() {
  const now = new Date();
  elements.clock.innerText = now.toLocaleTimeString();
  const hour = now.getHours();
  let g = 'At your service';
  if (hour < 12) g = 'Good Morning, sir';
  else if (hour < 18) g = 'Good Afternoon, sir';
  else g = 'Good Evening, sir';
  elements.greeting.innerText = g;
}
function detectSystemInfo() {
  elements.browserName.innerText = navigator.userAgent.split(') ')[0] || navigator.userAgent;
  elements.platform.innerText = navigator.platform || navigator.userAgentData?.platform || 'Unknown';
  // battery
  if (navigator.getBattery) {
    navigator.getBattery().then(b => {
      elements.battery.innerText = `${Math.round(b.level*100)}% ${b.charging? '(charging)':''}`;
      b.addEventListener('levelchange', ()=> elements.battery.innerText = `${Math.round(b.level*100)}% ${b.charging? '(charging)':''}`);
    });
  } else elements.battery.innerText = 'Unavailable';
}

/* =========================
   Microphone & Waveform
   ========================= */
async function setupAudioVisuals() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    sourceNode = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect(analyser);
    dataArray = new Uint8Array(analyser.fftSize);
    drawWave();
  } catch(e) {
    console.warn('Audio visuals unavailable', e);
  }
}

function drawWave(){
  if (!analyser) return;
  requestAnimationFrame(drawWave);
  analyser.getByteTimeDomainData(dataArray);
  const canvas = elements.waveCanvas;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.lineWidth = 2;
  ctx.beginPath();
  const slice = canvas.width / dataArray.length;
  for (let i=0;i<dataArray.length;i++){
    const v = (dataArray[i] - 128) / 128.0;
    const y = (v * canvas.height/2) + canvas.height/2;
    if (i===0) ctx.moveTo(0,y); else ctx.lineTo(i*slice,y);
  }
  ctx.strokeStyle = 'rgba(0,186,255,0.65)';
  ctx.stroke();
}

/* =========================
   Speech Recognition Init
   ========================= */
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    elements.micStatus.innerText = 'SpeechRecognition not supported in this browser.';
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onstart = () => {
    elements.micStatus.innerText = 'Listening... (hotword: Hey Jarvice)';
    elements.pulse.classList.add('listening');
    listening = true;
  };
  recognition.onend = () => {
    elements.micStatus.innerText = 'Stopped';
    elements.pulse.classList.remove('listening');
    listening = false;
    // attempt auto-restart for continuous listening
    setTimeout(() => {
      try { recognition.start(); } catch(e) {}
    }, 500);
  };
  recognition.onerror = (e) => {
    console.error('Speech error', e);
    elements.micStatus.innerText = 'Microphone error';
  };

  let interim = '';
  let finalTranscript = '';

  recognition.onresult = (event) => {
    interim = '';
    for (let i=event.resultIndex;i<event.results.length;i++){
      const result = event.results[i];
      const t = result[0].transcript;
      if (result.isFinal){
        finalTranscript += t + ' ';
        // hotword detection (case-insensitive)
        if (t.toLowerCase().includes('hey jarvice')) {
          activated = true;
          // when hotword recognized, respond
          speak('Yes sir?');
        }
        // If activated or hotword included, forward text to handler
        if (activated || t.toLowerCase().includes('jarvice')) handleCommand(t);
      } else {
        interim += t;
      }
    }
    // Optionally show interim in chat feed as ghost (not implemented to avoid spam)
  };

  // Try to auto-start; many browsers require gesture — handle gracefully.
  try {
    recognition.start();
  } catch(e) {
    // Start might throw if not allowed: update UI and wait for "Toggle Listen" click
    console.warn('Auto-start failed (gesture required?)', e);
    elements.micStatus.innerText = 'Click "Toggle Listen" to enable mic (browser may require permission)';
    listening = false;
  }
}

/* =========================
   Events & Init
   ========================= */
elements.toggleListen.addEventListener('click', () => {
  if (!recognition) initSpeechRecognition();
  try {
    if (listening) { recognition.stop(); elements.toggleListen.innerText = 'Start Listen'; }
    else { recognition.start(); elements.toggleListen.innerText = 'Stop Listen'; }
  } catch(e) { console.warn(e); }
});

// settings dialog handlers
if (elements.openSettings) elements.openSettings.addEventListener('click', ()=>{
  if (elements.settingsDialog && typeof elements.settingsDialog.showModal === 'function') elements.settingsDialog.showModal();
});
if (document.getElementById('settings-save')) document.getElementById('settings-save').addEventListener('click', ()=>{
  const theme = elements.themeSelect.value;
  localStorage.setItem('jarvice_theme', theme);
  applyTheme(theme);
  const hotword = elements.hotwordToggle.checked;
  localStorage.setItem('jarvice_hotword', hotword ? '1' : '0');
  if (elements.settingsDialog) elements.settingsDialog.close();
});
if (document.getElementById('settings-close')) document.getElementById('settings-close').addEventListener('click', ()=> elements.settingsDialog.close());

// keyboard shortcuts
window.addEventListener('keydown', (e)=>{
  if (e.ctrlKey && e.key.toLowerCase()==='m') { e.preventDefault(); elements.toggleListen.click(); }
  if (e.ctrlKey && e.key===',') { e.preventDefault(); if (elements.openSettings) elements.openSettings.click(); }
});

function applyTheme(theme){
  if (theme === 'light') document.documentElement.classList.add('light');
  else document.documentElement.classList.remove('light');
}

elements.todoAdd.addEventListener('click', () => {
  const txt = elements.todoText.value.trim();
  if (!txt) return;
  addTodo(txt);
  elements.todoText.value = '';
  speak(`Added task ${txt}`);
});
elements.todoText.addEventListener('keydown', (e) => { if (e.key === 'Enter') elements.todoAdd.click(); });

/* init on load */
async function init() {
  updateClockGreeting();
  setInterval(updateClockGreeting, 1000);
  detectSystemInfo();
  renderTodos();

  // speech synthesis voice setup
  speechSynth = window.speechSynthesis;

  // load settings
  const savedTheme = localStorage.getItem('jarvice_theme') || 'dark';
  try { if (elements.themeSelect) elements.themeSelect.value = savedTheme; } catch(e){}
  applyTheme(savedTheme);
  const hot = localStorage.getItem('jarvice_hotword');
  if (elements.hotwordToggle) elements.hotwordToggle.checked = hot !== '0';

  // initialize speech recognition (try auto)
  initSpeechRecognition();

  // setup audio visuals (waveform) — will request mic permission if not already granted
  setupAudioVisuals();

  // initial greeting
  setTimeout(()=> speak("Jarvice online. Say 'Hey Jarvice' to wake me up."), 1200);

  // make sure chat has a welcome message
  showMessage("Jarvice online. Ask for weather, news, tasks, or open apps. Say 'Hey Jarvice' to activate me.", 'jarvice');
}

init();
