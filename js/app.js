/* Jarvice — Client-side AI Assistant (skeleton)
   Tech: HTML + CSS + JS only
*/
(function () {
  'use strict';

  // DOM refs
  const VISUALIZER = document.querySelector('#visualizer');
  const CHAT = document.querySelector('#chat');
  const LISTEN_STATUS = document.querySelector('#listenStatus');
  const PERM_OVERLAY = document.querySelector('#permissionOverlay');
  const ENABLE_MIC_BTN = document.querySelector('#enableMicBtn');
  const SETTINGS_BTN = document.querySelector('#settingsBtn');
  const SETTINGS_MODAL = document.querySelector('#settingsModal');
  const CLOSE_SETTINGS = document.querySelector('#closeSettings');
  const SAVE_SETTINGS = document.querySelector('#saveSettings');
  const OWM_KEY_INPUT = document.querySelector('#owmKey');
  const USER_NAME_INPUT = document.querySelector('#userName');
  const MUSIC = document.querySelector('#localMusic');

  const CLOCK = document.querySelector('#clock');
  const BATTERY_INFO = document.querySelector('#batteryInfo');
  const SYSTEM_INFO = document.querySelector('#systemInfo');

  const state = {
    userName: localStorage.getItem('jarvice_user_name') || 'Sir',
    owmKey: localStorage.getItem('jarvice_owm_key') || '',
    active: false,
    activeUntil: 0,
    recognizing: false,
    interim: '',
    todos: [],
    voices: [],
    synthReady: false,
    recognitionReady: false,
  };

  // UI helpers
  const Chat = {
    add(role, text, links) {
      const li = document.createElement('li');
      li.className = `msg ${role}`;
      if (role === 'jarvice') {
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        li.appendChild(avatar);
      }
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = text;
      if (links && links.length) {
        const ul = document.createElement('ul');
        ul.style.margin = '8px 0 0';
        ul.style.paddingLeft = '18px';
        links.forEach(l => {
          const li2 = document.createElement('li');
          const a = document.createElement('a');
          a.href = l.url; a.textContent = l.title; a.className = 'link'; a.target = '_blank'; a.rel = 'noopener noreferrer';
          li2.appendChild(a);
          ul.appendChild(li2);
        });
        bubble.appendChild(ul);
      }
      li.appendChild(bubble);
      CHAT.appendChild(li);
      CHAT.scrollTop = CHAT.scrollHeight;
    }
  };

  function setStatus(text){ if (LISTEN_STATUS) LISTEN_STATUS.textContent = text; }
  function setListening(on){ if (on) VISUALIZER.classList.add('listening'); else VISUALIZER.classList.remove('listening'); }
  function personalize(text){ return text.replace(/\b(Sir|User)\b/gi, state.userName || 'Sir'); }
  function respond(text){ Chat.add('jarvice', text); try { speak(text); } catch {} }
  function randomOf(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // Time & date
  function two(n){ return n.toString().padStart(2,'0'); }
  function formatTime(d){ return `${(d.getHours()%12)||12}:${two(d.getMinutes())} ${d.getHours()<12?'AM':'PM'}`; }
  function formatDate(d){ return d.toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' }); }
  setInterval(() => { if (CLOCK) CLOCK.textContent = formatTime(new Date()); }, 1000);

  // System info quick card
  function getSystemInfo(){
    const ua = navigator.userAgent;
    let browser = 'Browser';
    if (/Edg\//.test(ua)) browser = 'Microsoft Edge';
    else if (/Chrome\//.test(ua)) browser = 'Google Chrome';
    else if (/Firefox\//.test(ua)) browser = 'Mozilla Firefox';
    else if (/Safari\//.test(ua)) browser = 'Apple Safari';

    let os = 'OS';
    if (/Windows NT/.test(ua)) os = 'Windows';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
    else if (/Linux/.test(ua)) os = 'Linux';

    return { browser, os };
  }

  async function updateBatteryCard(){
    try {
      if (!navigator.getBattery) { BATTERY_INFO.textContent = 'Not supported'; return; }
      const b = await navigator.getBattery();
      BATTERY_INFO.textContent = `${Math.round(b.level*100)}%${b.charging?' (charging)':''}`;
      b.addEventListener('levelchange', () => BATTERY_INFO.textContent = `${Math.round(b.level*100)}%${b.charging?' (charging)':''}`);
      b.addEventListener('chargingchange', () => BATTERY_INFO.textContent = `${Math.round(b.level*100)}%${b.charging?' (charging)':''}`);
    } catch { BATTERY_INFO.textContent = 'Unavailable'; }
  }

  // Settings modal
  function openSettings(){ SETTINGS_MODAL.classList.remove('hidden'); OWM_KEY_INPUT.value = state.owmKey; USER_NAME_INPUT.value = state.userName; }
  function closeSettings(){ SETTINGS_MODAL.classList.add('hidden'); }
  function saveSettings(){
    state.owmKey = OWM_KEY_INPUT.value.trim();
    state.userName = USER_NAME_INPUT.value.trim() || 'Sir';
    localStorage.setItem('jarvice_owm_key', state.owmKey);
    localStorage.setItem('jarvice_user_name', state.userName);
    closeSettings();
    respond('Settings saved.');
  }

  // Placeholder speech functions (implemented later)
  let rec = null;
  let autoRestart = true;

  function startRecognition(){
    try {
      const SRCls = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SRCls) { setStatus('SpeechRecognition not supported'); Chat.add('jarvice','Speech recognition is not supported in this browser. Please use Chrome or Edge.'); return; }
      if (!rec) {
        rec = new SRCls();
        rec.lang = 'en-US';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onstart = () => { setListening(true); setStatus('Listening...'); };
        rec.onend = () => { setListening(false); if (autoRestart) setTimeout(() => { try { rec.start(); } catch {} }, 350); };
        rec.onerror = (ev) => {
          if (ev && ev.error === 'not-allowed') { PERM_OVERLAY.classList.remove('hidden'); setStatus('Microphone blocked'); }
          else if (ev && ev.error) { setStatus('Error: ' + ev.error); }
        };
        rec.onresult = onResultHandler;
      }
      rec.start();
    } catch {}
  }

  function speak(text){
    try {
      if (!('speechSynthesis' in window)) return;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'en-US';
      const voices = speechSynthesis.getVoices();
      const preferred = voices.find(v => /en-US|en_GB/i.test(v.lang) && /male|google uk|google us|daniel|alex/i.test(v.name));
      if (preferred) utter.voice = preferred;
      utter.rate = 1.02; utter.pitch = 1.0;
      speechSynthesis.cancel();
      speechSynthesis.speak(utter);
    } catch {}
  }

  function loadVoices(){ if (!('speechSynthesis' in window)) return; speechSynthesis.onvoiceschanged = () => {}; speechSynthesis.getVoices(); }

  function beep(freq = 880, duration = 120){
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
      g.gain.value = 0.001; const now = ctx.currentTime;
      g.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration/1000);
      o.start(now); o.stop(now + duration/1000 + 0.02);
    } catch {}
  }

  function onResultHandler(event){
    let finalText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const txt = res[0].transcript;
      if (res.isFinal) finalText += txt; else state.interim = txt;
    }
    finalText = (finalText || '').trim();
    if (!finalText) return;
    const lower = finalText.toLowerCase();
    Chat.add('user', finalText);
    if (!state.active) {
      if (containsWakeWord(lower)) { activate(lower); }
      else { setStatus('Say: "Hey Jarvice"'); }
      return;
    }
    const cleaned = stripWakeWord(lower).trim();
    handleCommand(cleaned);
  }

  function containsWakeWord(text){ return /(hey\s+jarvice|hey\s+jarvis|ok(?:ay)?\s+jarvice)/i.test(text); }
  function stripWakeWord(text){ return text.replace(/^(?:hey\s+jarvice|hey\s+jarvis|ok(?:ay)?\s+jarvice)[,\s]+/i, ''); }
  function activate(originalText){
    state.active = true; state.activeUntil = Date.now() + 1000 * 10; setStatus('Awake'); beep(1200, 120);
    const remainder = stripWakeWord(originalText).trim();
    if (remainder) handleCommand(remainder); else respond(personalize(['At your service.','Yes?','Listening.','Ready when you are.'][Math.floor(Math.random()*4)]));
  }
  function ensureActiveWindow(){ if (state.active && Date.now() > state.activeUntil) { state.active = false; setStatus('Listening... Say: "Hey Jarvice"'); } }

  async function handleCommand(raw){
    ensureActiveWindow(); if (!raw) return; const text = raw.trim();
    if (/^stop (listening|recognition)$/.test(text)) { try{rec && rec.stop();}catch{} respond('Standing by.'); return; }
    if (/^(start|resume) (listening|recognition)$/.test(text)) { startRecognition(); respond('Listening.'); return; }

    if (/(good\s+morning|good\s+afternoon|good\s+evening|hello|hi\b)/i.test(text)) { const t = new Date(); const hr = t.getHours(); const part = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening'; respond(personalize(`Good ${part}.`)); return; }
    if (/how are you|how's it going|what's up/.test(text)) { respond('Optimal. Always ready.'); return; }
    if (/who are you|what are you/.test(text)) { respond('I am Jarvice, your AI desktop assistant.'); return; }
    if (/thank(s| you)/.test(text)) { respond('Anytime.'); return; }
    if (/tell me a joke|joke/.test(text)) { respond(['I told my computer I needed a break, and it said: no problem, I’ll go to sleep.','Why do programmers prefer dark mode? Because light attracts bugs.'][Math.floor(Math.random()*2)]); return; }

    if (/\b(time|clock)\b/.test(text)) { respond(`It is ${formatTime(new Date())}.`); return; }
    if (/\b(date|day)\b/.test(text)) { respond(`Today is ${formatDate(new Date())}.`); return; }

    if (/\b(weather|temperature|forecast)\b/.test(text)) {
      const cityMatch = text.match(/in\s+([a-zA-Z\s]+)$/); const city = cityMatch ? cityMatch[1].trim() : '';
      const w = await getWeather(city);
      if (w.ok) respond(w.message); else respond(w.error || 'Unable to get weather right now.');
      return;
    }

    if (/\bnews|headlines\b/.test(text)) {
      const n = await getNews();
      if (n.ok) { Chat.add('jarvice', n.message, n.links); speak(n.message.replace(/<[^>]+>/g, '')); }
      else respond(n.error || 'Unable to get news at the moment.');
      return;
    }

    if (/what is|calculate|compute|solve|\d|\+|\-|\*|x|×|÷|percent|percentage|plus|minus|times|divide|multipl|power|to the power/i.test(text)) {
      const m = computeMath(text);
      if (m.ok) respond(`The result is ${m.value}.`); else if (m.tried) respond(m.error || 'I could not compute that.');
      if (m.tried) return;
    }

    if (/open\s+(youtube|gmail|google|calendar|drive|github)/.test(text)) {
      const dest = /open\s+(youtube|gmail|google|calendar|drive|github)/.exec(text)[1];
      const map = { youtube: 'https://www.youtube.com', gmail: 'https://mail.google.com', google: 'https://www.google.com', calendar: 'https://calendar.google.com', drive: 'https://drive.google.com', github: 'https://github.com' };
      window.open(map[dest], '_blank', 'noopener'); respond(`Opening ${dest}.`); return;
    }
    if (/^search\s+for\s+(.+)/.test(text)) { const q = /^search\s+for\s+(.+)/.exec(text)[1]; window.open('https://www.google.com/search?q=' + encodeURIComponent(q), '_blank', 'noopener'); respond(`Searching for ${q}.`); return; }

    if (/^(add|create)\s+(a\s+)?(task|todo|to-do)\s+(.*)/.test(text)) { const t = /^(add|create)\s+(?:a\s+)?(?:task|todo|to-do)\s+(.*)/.exec(text)[4]; addTodo(t); respond(`Added task: ${t}.`); return; }
    if (/^list\s+(my\s+)?(tasks|todos|to-dos?)/.test(text)) { const list = getTodos(); if (!list.length) { respond('Your to-do list is empty.'); return; } const msg = list.map((t, i) => `${i + 1}. ${t.text}`).join('\n'); respond('Your tasks:\n' + msg); return; }
    if (/^delete\s+(task\s+)?(number\s+)?(\d+)/.test(text)) { const n = parseInt(/^delete\s+(?:task\s+)?(?:number\s+)?(\d+)/.exec(text)[1], 10); const ok = deleteTodoIndex(n - 1); respond(ok ? `Deleted task ${n}.` : `I couldn't find task ${n}.`); return; }
    if (/^(clear|delete all)\s+(tasks|todos|to-dos?)/.test(text)) { clearTodos(); respond('Cleared your to-do list.'); return; }

    if (/battery/.test(text)) { reportBattery(); return; }
    if (/browser|os|system/.test(text)) { reportSystem(); return; }

    if (/play\s+(music|song|audio)/.test(text)) { playMusic(); respond('Playing music.'); return; }
    if (/(pause|stop)\s+(music|song|audio)/.test(text)) { pauseMusic(); respond('Paused.'); return; }
    if (/volume\s+up/.test(text)) { changeVolume(0.1); respond('Volume up.'); return; }
    if (/volume\s+down/.test(text)) { changeVolume(-0.1); respond('Volume down.'); return; }
    if (/^set\s+volume\s+to\s+(\d{1,3})\s*(%|percent)?/.test(text)) { const v = Math.max(0, Math.min(100, parseInt(/^set\s+volume\s+to\s+(\d{1,3})/.exec(text)[1]))); setVolume(v/100); respond(`Volume set to ${v}%.`); return; }

    respond(['I did not fully catch that. You can ask for weather, news, time, or say "open YouTube".','Pardon? Try: "weather in London", "play music", or "add task buy milk".'][Math.floor(Math.random()*2)]);
  }

  async function getWeather(city){
    try {
      const useOWM = !!state.owmKey;
      if (city) {
        if (useOWM) {
          const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${state.owmKey}&units=metric`);
          if (r.ok) { const j = await r.json(); const t = Math.round(j.main.temp); const desc = (j.weather && j.weather[0] && j.weather[0].description) || 'clear'; return { ok: true, message: `In ${j.name}, it is ${t}°C with ${desc}.` }; }
        }
        const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
        if (g.ok) { const gj = await g.json(); const loc = gj.results && gj.results[0]; if (loc) { const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true`); const wj = await w.json(); const cw = wj.current_weather; return { ok: true, message: `In ${loc.name}, it is ${Math.round(cw.temperature)}°C with wind ${Math.round(cw.windspeed)} km/h.` }; } }
        return { ok: false, error: `I couldn't find weather for ${city}.` };
      }
      const pos = await getPosition().catch(() => null);
      if (pos) {
        if (useOWM) {
          const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&appid=${state.owmKey}&units=metric`);
          if (r.ok) { const j = await r.json(); const t = Math.round(j.main.temp); const desc = (j.weather && j.weather[0] && j.weather[0].description) || 'clear'; return { ok: true, message: `It is ${t}°C with ${desc} in ${j.name}.` }; }
        }
        const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&current_weather=true`);
        const wj = await w.json(); const cw = wj.current_weather; return { ok: true, message: `It is ${Math.round(cw.temperature)}°C with wind ${Math.round(cw.windspeed)} km/h.` };
      }
      return { ok: false, error: 'Location permission denied. Try: "weather in London".' };
    } catch { return { ok: false, error: 'Weather service unavailable.' }; }
  }
  function getPosition(){ return new Promise((res, rej) => { if (!navigator.geolocation) return rej('no geo'); navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 }); }); }

  async function getNews(){
    try {
      const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
      const ids = (await idsRes.json()).slice(0, 8);
      const items = await Promise.all(ids.slice(0,5).map(async id => { const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`); return r.json(); }));
      const links = items.filter(i => i && i.title && i.url).slice(0,5).map(i => ({ title: i.title, url: i.url }));
      const msg = links.length ? `Top headlines: ${links.slice(0,3).map(l => l.title).join('; ')}.` : 'No headlines available.';
      return { ok: true, message: msg, links };
    } catch { return { ok: false, error: 'News service unavailable.' }; }
  }

  function computeMath(text){
    let expr = text.toLowerCase(); expr = expr.replace(/(hey\s+)?jarvis(e)?[,\s]*/g, ''); expr = expr.replace(/what is|calculate|compute|solve|equals|result of/g, ''); expr = expr.replace(/percent(age)?/g, '%'); expr = expr.replace(/x|×|\*/g, '*'); expr = expr.replace(/÷|\//g, '/'); expr = expr.replace(/plus/g, '+'); expr = expr.replace(/minus/g, '-'); expr = expr.replace(/times|multipl(y|ies|ied) by|into/g, '*'); expr = expr.replace(/divided by|over/g, '/'); expr = expr.replace(/to the power of|power of|power/g, '**'); expr = expr.replace(/\bpi\b/g, '3.141592653589793'); expr = expr.replace(/\s+/g, ' ').trim();
    if (!/^[-+*/%().\d\s*^]*$/.test(expr.replace(/\*\*/g, '^'))) { return { ok: false, tried: false }; }
    expr = expr.replace(/\^/g, '**');
    try { if (/^[*/%+]/.test(expr)) return { ok: false, tried: true, error: 'Invalid expression.' }; const result = Function('return (' + expr + ')')(); if (typeof result === 'number' && isFinite(result)) { const value = Math.round((result + Number.EPSILON) * 1e6) / 1e6; return { ok: true, tried: true, value }; } return { ok: false, tried: true, error: 'Invalid calculation.' }; } catch { return { ok: false, tried: true, error: 'Could not compute.' }; }
  }

  function loadTodos(){ try { state.todos = JSON.parse(localStorage.getItem('jarvice_todos') || '[]'); } catch { state.todos = []; } }
  function saveTodos(){ localStorage.setItem('jarvice_todos', JSON.stringify(state.todos)); }
  function addTodo(text){ if (!text) return; state.todos.push({ id: Date.now(), text: text.charAt(0).toUpperCase() + text.slice(1) }); saveTodos(); }
  function getTodos(){ return state.todos.slice(); }
  function deleteTodoIndex(idx){ if (idx < 0 || idx >= state.todos.length) return false; state.todos.splice(idx, 1); saveTodos(); return true; }
  function clearTodos(){ state.todos = []; saveTodos(); }

  function reportSystem(){ const info = getSystemInfo(); respond(`You are using ${info.browser} on ${info.os}.`); }
  async function reportBattery(){ try { if (!navigator.getBattery) { respond('Battery status is not supported in this browser.'); return; } const b = await navigator.getBattery(); const lvl = Math.round(b.level * 100); respond(`Battery is at ${lvl}%${b.charging ? ' and charging.' : '.'}`); } catch { respond('Unable to read battery.'); } }

  // Music controls
  function playMusic(){ try { if (MUSIC.currentSrc) { MUSIC.volume = Math.max(0.05, MUSIC.volume || 0.7); MUSIC.play(); } } catch {} }
  function pauseMusic(){ try { MUSIC.pause(); } catch {} }
  function changeVolume(delta){ try { MUSIC.volume = Math.max(0, Math.min(1, (MUSIC.volume || 0.7) + delta)); } catch {} }
  function setVolume(v){ try { MUSIC.volume = Math.max(0, Math.min(1, v)); } catch {} }

  // Init
  function init(){
    const info = getSystemInfo();
    SYSTEM_INFO.textContent = `${info.browser} on ${info.os}`;
    updateBatteryCard();
    loadVoices();
    loadTodos();

    setTimeout(() => {
      respond(personalize(randomOf([
        'At your service.',
        'Systems online.',
        'Hello, Sir.',
      ])));
    }, 400);

    startRecognition();

    SETTINGS_BTN.addEventListener('click', openSettings);
    CLOSE_SETTINGS.addEventListener('click', closeSettings);
    SAVE_SETTINGS.addEventListener('click', saveSettings);
    ENABLE_MIC_BTN.addEventListener('click', () => { PERM_OVERLAY.classList.add('hidden'); startRecognition(); });
  }

  init();
})();
