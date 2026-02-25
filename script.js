// ==========================================
// --- 1. CONFIG & STATE ---
// ==========================================
const appId = typeof __app_id !== 'undefined' ? __app_id : 'vtt-default';
const firebaseConfig = JSON.parse(__firebase_config);

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const rtdb = firebase.database();
const firestore = firebase.firestore();

let currentCharacterId = null;
let currentPortraitString = "";
let isRunning = false;
let speedMultiplier = 1;
let totalCustomSeconds = 0;
let lastRealTime = Date.now();
let minPerHour = 60, hoursPerDay = 24, daysPerMonth = 30, monthsPerYear = 12;

// ==========================================
// --- 2. AUTHENTICATION (RULE 3) ---
// ==========================================
const initAuth = async () => {
    try {
        // Only sign in if a custom token is provided by the environment
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await auth.signInWithCustomToken(__initial_auth_token);
        }
        // Anonymous login removed as requested: Users must login manually.
    } catch (err) {
        console.error("Auth Initialization Error:", err);
    }
};

initAuth();

auth.onAuthStateChanged(async (user) => {
    const gameUI = document.getElementById('game-ui');
    const mainNav = document.getElementById('main-nav-tabs');

    if (!user) {
        // Force the login tab and hide game elements if no user is signed in
        openTab('tab-login');
        mainNav?.classList.add('hide-default');
        gameUI?.classList.add('hide-default');
        document.getElementById('logout-btn')?.classList.add('hide-default');
        return;
    }

    try {
        // Path follows RULE 1
        const userDoc = await firestore.collection('artifacts').doc(appId).collection('users').doc(user.uid).get();
        const userData = userDoc.data() || { role: 'Player' };
        
        // Update UI Header
        const userDisp = document.getElementById('user-display-name');
        const roleLabel = document.getElementById('user-role-label');
        if (userDisp) userDisp.innerText = user.email ? user.email.split('@')[0] : "Adventurer";
        if (roleLabel) roleLabel.innerText = userData.role;

        document.getElementById('logout-btn')?.classList.remove('hide-default');
        mainNav?.classList.remove('hide-default');
        gameUI?.classList.remove('hide-default');

        // Master/Admin permissions
        if (userData.role === 'Admin' || userData.role === 'Master') {
            document.getElementById('nav-control-panel')?.classList.remove('hide-default');
            document.getElementById('master-panel')?.classList.remove('hide-default');
            if (userData.role === 'Admin') document.getElementById('admin-panel')?.classList.remove('hide-default');
        }

        // Restore last session
        if (userData.lastActiveCharacter) {
            selectCharacter(userData.lastActiveCharacter);
        } else {
            loadUserCharacters();
            openTab('tab-character');
        }
    } catch (e) {
        console.error("User Profile Load Error:", e);
    }
});

function loginUser() {
    const e = document.getElementById('email-input').value;
    const p = document.getElementById('password-input').value;
    if (!e || !p) return console.error("Email and Password required.");
    auth.signInWithEmailAndPassword(e, p).catch(err => console.error(err.message));
}

function registerUser() {
    const e = document.getElementById('email-input').value;
    const p = document.getElementById('password-input').value;
    if (!e || !p) return console.error("Email and Password required.");
    auth.createUserWithEmailAndPassword(e, p).then(cred => {
        firestore.collection('artifacts').doc(appId).collection('users').doc(cred.user.uid).set({ 
            email: e, 
            role: 'Player' 
        });
    }).catch(err => console.error(err.message));
}

function logoutUser() { auth.signOut().then(() => location.reload()); }

// ==========================================
// --- 3. CLOCK ENGINE ---
// ==========================================
rtdb.ref(`artifacts/${appId}/clock`).on('value', (snap) => {
    const data = snap.val();
    if (data) {
        isRunning = data.isRunning;
        speedMultiplier = data.speedMultiplier;
        minPerHour = data.minPerHour || 60;
        hoursPerDay = data.hoursPerDay || 24;
        totalCustomSeconds = data.totalCustomSeconds;
        if (isRunning) {
            let delta = (Date.now() - data.lastRealWorldSaveTime) / 1000;
            totalCustomSeconds += (delta * speedMultiplier);
        }
        lastRealTime = Date.now();
        updateClockDisplay();
    }
});

setInterval(() => {
    if (isRunning) {
        let now = Date.now();
        let delta = (now - lastRealTime) / 1000;
        totalCustomSeconds += (delta * speedMultiplier);
        lastRealTime = now;
        updateClockDisplay();
    }
}, 50);

function updateClockDisplay() {
    let s = Math.floor(totalCustomSeconds % 60);
    let totalMins = Math.floor(totalCustomSeconds / 60);
    let m = Math.floor(totalMins % minPerHour);
    let totalHrs = Math.floor(totalMins / minPerHour);
    let h = Math.floor(totalHrs % hoursPerDay);
    let totalDays = Math.floor(totalHrs / hoursPerDay);
    let d = (totalDays % daysPerMonth) + 1;
    let totalMonths = Math.floor(totalDays / daysPerMonth);
    let mo = (totalMonths % monthsPerYear) + 1;
    let yr = Math.floor(totalMonths / monthsPerYear) + 1;

    const tDisp = document.getElementById('time-display');
    const dDisp = document.getElementById('date-display');
    if (tDisp) tDisp.innerText = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if (dDisp) dDisp.innerText = `Year ${yr}, Month ${mo}, Day ${d}`;
}

function toggleTime() { isRunning = !isRunning; saveClockState(); }
function setSpeed(sp) { speedMultiplier = sp; saveClockState(); }
function updateRules() {
    minPerHour = parseInt(document.getElementById('min-per-hour').value) || 60;
    hoursPerDay = parseInt(document.getElementById('hours-per-day').value) || 24;
    saveClockState();
}
function saveClockState() {
    rtdb.ref(`artifacts/${appId}/clock`).set({
        isRunning, speedMultiplier, minPerHour, hoursPerDay,
        totalCustomSeconds, lastRealWorldSaveTime: Date.now()
    });
}

// ==========================================
// --- 4. CHARACTER LOGIC ---
// ==========================================
function loadUserCharacters() {
    if (!auth.currentUser) return;
    firestore.collection('artifacts').doc(appId).collection('users').doc(auth.currentUser.uid).collection('characters').get().then(snap => {
        const grid = document.getElementById('char-list-grid');
        if (!grid) return;
        grid.innerHTML = "";
        snap.forEach(doc => {
            const d = doc.data();
            const card = document.createElement('div');
            card.className = 'char-card';
            card.onclick = () => selectCharacter(doc.id);
            card.innerHTML = `
                <div class="char-card-portrait" style="background-image: url('${d.portrait || ''}')">
                    ${!d.portrait ? '<i class="ph ph-user" style="font-size: 2em; line-height: 80px; color: #3f3f46;"></i>' : ''}
                </div>
                <span class="char-card-name">${d.name || 'Hero'}</span>
                <div class="char-card-meta">Lv. ${d.level || 1} ${d.class || ''}</div>
            `;
            grid.appendChild(card);
        });
    });
}

async function selectCharacter(id) {
    if (!auth.currentUser) return;
    currentCharacterId = id;
    const uid = auth.currentUser.uid;
    
    await firestore.collection('artifacts').doc(appId).collection('users').doc(uid).set({ lastActiveCharacter: id }, { merge: true });

    const doc = await firestore.collection('artifacts').doc(appId).collection('users').doc(uid).collection('characters').doc(id).get();
    if (doc.exists) {
        const char = doc.data();
        loadCharacterData(char);
        document.getElementById('char-selection-view')?.classList.add('hide-default');
        document.getElementById('char-sheet-view')?.classList.remove('hide-default');
        document.getElementById('active-char-hud')?.classList.remove('hide-default');
    }
}

function goBackToSelection() {
    currentCharacterId = null;
    const uid = auth.currentUser.uid;
    firestore.collection('artifacts').doc(appId).collection('users').doc(uid).update({ lastActiveCharacter: null });
    document.getElementById('char-selection-view')?.classList.remove('hide-default');
    document.getElementById('char-sheet-view')?.classList.add('hide-default');
    document.getElementById('active-char-hud')?.classList.add('hide-default');
    loadUserCharacters();
}

function calculateModifier(val) {
    const num = parseInt(val) || 10;
    const mod = Math.floor((num - 10) / 2);
    return mod >= 0 ? `+${mod}` : mod;
}

function loadCharacterData(char) {
    const fields = {
        'char-name': char.name || "",
        'char-race': char.race || "",
        'char-class': char.class || "",
        'char-level': char.level || 1,
        'char-hp-current': char.hpCurrent || 10,
        'char-hp-max': char.hpMax || 10,
        'char-mp-current': char.mpCurrent || 10,
        'char-mp-max': char.mpMax || 10,
        'char-body': char.body || 10,
        'char-mind': char.mind || 10,
        'char-spirit': char.spirit || 10,
        'char-ac': char.ac || 10,
        'char-init': char.init || 0,
        'char-speed': char.speed || 30
    };

    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.value = val;
    }

    updateModifiers();
    updateHUD(char);
    renderGallery(char.gallery || [], char.portrait || "");
    renderSkills(char.skills || getDefaultSkills(char.class));
}

function updateModifiers() {
    const b = document.getElementById('char-body')?.value;
    const m = document.getElementById('char-mind')?.value;
    const s = document.getElementById('char-spirit')?.value;

    if (document.getElementById('mod-body')) document.getElementById('mod-body').innerText = calculateModifier(b);
    if (document.getElementById('mod-mind')) document.getElementById('mod-mind').innerText = calculateModifier(m);
    if (document.getElementById('mod-spirit')) document.getElementById('mod-spirit').innerText = calculateModifier(s);
}

function saveCharacter() {
    if (!currentCharacterId || !auth.currentUser) return;
    updateModifiers();
    const data = {
        name: document.getElementById('char-name').value,
        race: document.getElementById('char-race').value,
        class: document.getElementById('char-class').value,
        level: parseInt(document.getElementById('char-level').value) || 1,
        hpCurrent: parseInt(document.getElementById('char-hp-current').value) || 0,
        hpMax: parseInt(document.getElementById('char-hp-max').value) || 10,
        mpCurrent: parseInt(document.getElementById('char-mp-current').value) || 0,
        mpMax: parseInt(document.getElementById('char-mp-max').value) || 10,
        body: parseInt(document.getElementById('char-body').value) || 10,
        mind: parseInt(document.getElementById('char-mind').value) || 10,
        spirit: parseInt(document.getElementById('char-spirit').value) || 10,
        ac: parseInt(document.getElementById('char-ac').value) || 10,
        init: parseInt(document.getElementById('char-init').value) || 0,
        speed: parseInt(document.getElementById('char-speed').value) || 30
    };
    firestore.collection('artifacts').doc(appId).collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).update(data);
    updateHUD(data);
}

function updateHUD(char) {
    const hud = document.getElementById('active-char-hud');
    if (!char || !hud) return;

    const name = document.getElementById('hud-name');
    const meta = document.getElementById('hud-meta');
    if (name) name.innerText = char.name || "Unnamed";
    if (meta) meta.innerText = `Lv. ${char.level || 1} ${char.race || ''} ${char.class || ''}`;
    
    // Bars
    const hpPct = (char.hpMax > 0) ? (char.hpCurrent / char.hpMax) * 100 : 0;
    const mpPct = (char.mpMax > 0) ? (char.mpCurrent / char.mpMax) * 100 : 0;

    const hpFill = document.getElementById('hud-hp-fill');
    const mpFill = document.getElementById('hud-mp-fill');
    if (hpFill) hpFill.style.width = hpPct + "%";
    if (mpFill) mpFill.style.width = mpPct + "%";

    const hpText = document.getElementById('hud-hp-text');
    const mpText = document.getElementById('hud-mp-text');
    if (hpText) hpText.innerText = `${char.hpCurrent}/${char.hpMax}`;
    if (mpText) mpText.innerText = `${char.mpCurrent}/${char.mpMax}`;
    
    // Sidebar Modifiers
    const hBody = document.getElementById('hud-mod-body');
    const hMind = document.getElementById('hud-mod-mind');
    const hSpirit = document.getElementById('hud-mod-spirit');
    if (hBody) hBody.innerText = calculateModifier(char.body);
    if (hMind) hMind.innerText = calculateModifier(char.mind);
    if (hSpirit) hSpirit.innerText = calculateModifier(char.spirit);

    if (char.portrait) {
        const port = document.getElementById('hud-portrait');
        const navPort = document.getElementById('nav-user-portrait');
        if (port) port.style.backgroundImage = `url('${char.portrait}')`;
        if (navPort) navPort.style.backgroundImage = `url('${char.portrait}')`;
    }
}

async function createNewCharacter() {
    const uid = auth.currentUser.uid;
    const initData = { 
        name: "New Hero", race: "Human", class: "Adventurer", level: 1, 
        hpCurrent: 10, hpMax: 10, mpCurrent: 10, mpMax: 10,
        body: 10, mind: 10, spirit: 10, ac: 10, init: 0, speed: 30,
        portrait: "", gallery: [], skills: getDefaultSkills("Adventurer")
    };
    const ref = await firestore.collection('artifacts').doc(appId).collection('users').doc(uid).collection('characters').add(initData);
    selectCharacter(ref.id);
}

// ==========================================
// --- 5. SKILLS & UTILS ---
// ==========================================
function openTab(tabId) {
    // Block tab access if not authenticated, unless it's the login tab
    if (!auth.currentUser && tabId !== 'tab-login') return;
    
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hide-default'));
    const target = document.getElementById(tabId);
    if (target) target.classList.remove('hide-default');
    
    // UI Button state logic
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');

    if (tabId === 'tab-character' && !currentCharacterId) loadUserCharacters();
}

function rollDice(sides) {
    const res = document.getElementById('dice-result');
    if (!res) return;
    let rolls = 0;
    const interval = setInterval(() => {
        res.innerText = Math.floor(Math.random() * sides) + 1;
        if (++rolls > 12) {
            clearInterval(interval);
            const final = Math.floor(Math.random() * sides) + 1;
            res.innerText = `d${sides}: ${final}`;
        }
    }, 40);
}

function handlePortraitUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentCharacterId) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const max = 400;
            let w = img.width, h = img.height;
            if (w > h) { if (w > max) { h *= max/w; w = max; } } else { if (h > max) { w *= max/h; h = max; } }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            
            firestore.collection('artifacts').doc(appId).collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).update({
                portrait: base64, 
                gallery: firebase.firestore.FieldValue.arrayUnion(base64)
            }).then(() => {
                currentPortraitString = base64;
                switchCharacterReload();
            });
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function switchCharacterReload() {
    if (!currentCharacterId) return;
    const doc = await firestore.collection('artifacts').doc(appId).collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).get();
    if (doc.exists) loadCharacterData(doc.data());
}

function renderGallery(gallery, main) {
    const container = document.getElementById('gallery-container');
    if (!container) return;
    container.innerHTML = "";
    gallery.forEach(img => {
        const el = document.createElement('img');
        el.src = img;
        el.className = `gallery-img ${img === main ? 'is-main' : ''}`;
        el.onclick = () => {
            firestore.collection('artifacts').doc(appId).collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).update({ portrait: img });
            switchCharacterReload();
        };
        container.appendChild(el);
    });
}

function getDefaultSkills(cls) {
    if (cls?.toLowerCase() === 'cleric') {
        return [
            { name: "Heal", level: 1, uses: 0, target: 5, cost: 10 },
            { name: "Barrier", level: 1, uses: 0, target: 5, cost: 10 }
        ];
    }
    return [{ name: "Strike", level: 1, uses: 0, target: 10, cost: 0 }];
}

function renderSkills(skills) {
    const list = document.getElementById('skills-list');
    if (!list) return;
    list.innerHTML = "";
    skills.forEach((s, i) => {
        const div = document.createElement('div');
        div.className = 'skill-item';
        div.innerHTML = `
            <div class="skill-info">
                <strong>${s.name} <small>Lv.${s.level}</small></strong>
                <div class="skill-progress-container"><div class="skill-progress-fill" style="width:${(s.uses/s.target)*100}%"></div></div>
            </div>
            <button onclick="castSkill(${i})" class="btn-primary btn-small">Cast</button>
        `;
        list.appendChild(div);
    });
}

async function castSkill(idx) {
    const uid = auth.currentUser.uid;
    if (!uid || !currentCharacterId) return;
    const doc = await firestore.collection('artifacts').doc(appId).collection('users').doc(uid).collection('characters').doc(currentCharacterId).get();
    const char = doc.data();
    const skills = char.skills || getDefaultSkills(char.class);
    const skill = skills[idx];
    
    if (char.mpCurrent < (skill.cost || 0)) return console.warn("Out of MP!");
    
    char.mpCurrent -= (skill.cost || 0);
    skill.uses++;
    if (skill.uses >= skill.target) {
        skill.level++;
        skill.uses = 0;
        skill.target = Math.floor(skill.target * 1.5);
    }
    
    await firestore.collection('artifacts').doc(appId).collection('users').doc(uid).collection('characters').doc(currentCharacterId).update({ 
        mpCurrent: char.mpCurrent, 
        skills: skills 
    });
    loadCharacterData(char);
}
