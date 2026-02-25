// ==========================================
// --- 1. STATE VARIABLES & DEFAULTS ---
// ==========================================
let totalCustomSeconds = 0; 
let speedMultiplier = 1;
let isRunning = false;
let lastRealTime = Date.now();

let minPerHour = 60;
let hoursPerDay = 24;
let daysPerMonth = 30;
let monthsPerYear = 12;

let currentCampaignId = "global"; 
let currentCharacterId = null; 
let currentPortraitString = ""; 

// ==========================================
// --- 2. FIREBASE SETUP & INITIALIZATION ---
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCdwo2sWiMzLfnZ8o3oYkDYL45FuLiV4OI",
    authDomain: "virtual-tabletop-6cdab.firebaseapp.com",
    databaseURL: "https://virtual-tabletop-6cdab-default-rtdb.firebaseio.com",
    projectId: "virtual-tabletop-6cdab",
    storageBucket: "virtual-tabletop-6cdab.firebasestorage.app",
    messagingSenderId: "360507498207",
    appId: "1:360507498207:web:a2924052c05aba488b536a"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const rtdb = firebase.database();       
const firestore = firebase.firestore(); 

// ==========================================
// --- 3. DATABASE SYNC (RTDB) ---
// ==========================================
function saveTimeState() {
    const timeData = {
        totalCustomSeconds: totalCustomSeconds,
        speedMultiplier: speedMultiplier,
        isRunning: isRunning,
        lastRealWorldSaveTime: Date.now(),
        minPerHour: minPerHour,
        hoursPerDay: hoursPerDay,
        daysPerMonth: daysPerMonth,
        monthsPerYear: monthsPerYear
    };
    rtdb.ref(`campaigns/${currentCampaignId}/clock`).set(timeData);
}

rtdb.ref(`campaigns/${currentCampaignId}/clock`).on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
        speedMultiplier = data.speedMultiplier;
        isRunning = data.isRunning;
        minPerHour = data.minPerHour || 60;
        hoursPerDay = data.hoursPerDay || 24;
        daysPerMonth = data.daysPerMonth || 30;
        monthsPerYear = data.monthsPerYear || 12;

        let now = Date.now();
        if (data.isRunning) {
            let deltaRealSeconds = (now - data.lastRealWorldSaveTime) / 1000;
            totalCustomSeconds = data.totalCustomSeconds + (deltaRealSeconds * speedMultiplier);
        } else {
            totalCustomSeconds = data.totalCustomSeconds;
        }
        lastRealTime = now;

        if(document.getElementById('min-per-hour')) document.getElementById('min-per-hour').value = minPerHour;
        if(document.getElementById('hours-per-day')) document.getElementById('hours-per-day').value = hoursPerDay;
        if(document.getElementById('speed-label')) document.getElementById('speed-label').innerText = speedMultiplier + "x";
        
        let btn = document.getElementById('play-btn');
        if (btn) btn.innerText = isRunning ? "Pause Time" : "Start Time";
        updateDisplay();
    }
});

// ==========================================
// --- 4. CLOCK ENGINE & DISPLAY ---
// ==========================================
function tick() {
    let now = Date.now();
    let deltaRealSeconds = (now - lastRealTime) / 1000;
    lastRealTime = now;
    if (isRunning) {
        totalCustomSeconds += (deltaRealSeconds * speedMultiplier);
        updateDisplay();
    }
}

function updateDisplay() {
    let secPerMin = 60;
    let currentSec = Math.floor(totalCustomSeconds % secPerMin);
    let totalMinutes = Math.floor(totalCustomSeconds / secPerMin);
    let currentMin = Math.floor(totalMinutes % minPerHour);
    let totalHours = Math.floor(totalMinutes / minPerHour);
    let currentHour = Math.floor(totalHours % hoursPerDay);
    let totalDays = Math.floor(totalHours / hoursPerDay);
    let currentDay = Math.floor(totalDays % daysPerMonth) + 1; 
    let totalMonths = Math.floor(totalDays / daysPerMonth);
    let currentMonth = Math.floor(totalMonths % monthsPerYear) + 1; 
    let currentYear = Math.floor(totalMonths / monthsPerYear) + 1; 

    if(document.getElementById('time-display')) {
        document.getElementById('time-display').innerText = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}:${String(currentSec).padStart(2, '0')}`;
    }
    if(document.getElementById('date-display')) {
        document.getElementById('date-display').innerText = `Year ${currentYear}, Month ${currentMonth}, Day ${currentDay}`;
    }
}
setInterval(tick, 50);

// ==========================================
// --- 5. CLOCK CONTROLS (ADMIN ONLY) ---
// ==========================================
function toggleTime() {
    isRunning = !isRunning;
    if (isRunning) lastRealTime = Date.now();
    saveTimeState(); 
}

function setSpeed(newSpeed) {
    speedMultiplier = newSpeed;
    saveTimeState(); 
}

function updateRules() {
    minPerHour = parseInt(document.getElementById('min-per-hour').value) || 60;
    hoursPerDay = parseInt(document.getElementById('hours-per-day').value) || 24;
    updateDisplay(); 
    saveTimeState(); 
}

// ==========================================
// --- 6. AUTHENTICATION & ROLES ---
// ==========================================
function registerUser() {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    auth.createUserWithEmailAndPassword(email, pass).then((userCredential) => {
        firestore.collection('users').doc(userCredential.user.uid).set({ email: email, role: 'Player' });
    }).catch((error) => alert(error.message));
}

function loginUser() {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    auth.signInWithEmailAndPassword(email, pass).catch((error) => alert(error.message));
}

function logoutUser() { auth.signOut().then(() => location.reload()); }

// ==========================================
// --- 7. USER AUTHENTICATION ---
// ==========================================
auth.onAuthStateChanged((user) => {
    const gameUI = document.getElementById('game-ui');
    const controlPanelTabBtn = document.getElementById('nav-control-panel');
    const masterPanel = document.getElementById('master-panel');
    const adminPanel = document.getElementById('admin-panel');
    const mainNavTabs = document.getElementById('main-nav-tabs'); 

    if (user) {
        firestore.collection('users').doc(user.uid).get().then((doc) => {
             if (doc.exists) {
                const userData = doc.data();
                const role = userData.role;
                
                if(document.getElementById('user-display-name')) document.getElementById('user-display-name').innerText = user.email.split('@')[0];
                if(document.getElementById('user-role-label')) document.getElementById('user-role-label').innerText = role;
                document.getElementById('logout-btn').classList.remove('hide-default');
                if(mainNavTabs) mainNavTabs.classList.remove('hide-default');
                if (gameUI) gameUI.classList.remove('hide-default');

                if (userData.lastActiveCharacter) {
                    selectCharacter(userData.lastActiveCharacter);
                } else {
                    loadUserCharacters(); 
                    openTab('tab-character');
                }

                if (role === 'Master' || role === 'Admin') {
                    if (controlPanelTabBtn) controlPanelTabBtn.classList.remove('hide-default');
                    if (masterPanel) masterPanel.classList.remove('hide-default');
                }
                if (role === 'Admin' && adminPanel) adminPanel.classList.remove('hide-default');
            }
        });
    } else {
        openTab('tab-login');
        if(mainNavTabs) mainNavTabs.classList.add('hide-default');
    }
}); // FIX: Added missing closing bracket and parenthesis

// ==========================================
// --- 8. UI NAVIGATION (TAB SWITCHER) ---
// ==========================================
function openTab(tabId) {
    if (!auth.currentUser && tabId !== 'tab-login') return;

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hide-default'));
    const target = document.getElementById(tabId);
    if (target) target.classList.remove('hide-default');

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    // Find button associated with this tabId if needed
}

// ==========================================
// --- 9. CHARACTER SHEET LOGIC ---
// ==========================================
function createNewCharacter() {
    const user = auth.currentUser;
    if (!user) return;
    
    const newRef = firestore.collection('users').doc(user.uid).collection('characters').doc();
    // FIX: Updated to Body, Mind, Spirit and added MP
    const initData = { 
        name: "New Hero", race: "Human", class: "Adventurer", level: 1, 
        hpCurrent: 10, hpMax: 10, mpCurrent: 10, mpMax: 10,
        body: 10, mind: 10, spirit: 10, ac: 10, init: 0, speed: 30,
        portrait: "", gallery: [], skills: getDefaultSkills("Adventurer")
    };
    
    newRef.set(initData).then(() => {
        currentCharacterId = newRef.id;
        loadUserCharacters(); 
        loadCharacterData(initData);
        document.getElementById('char-selection-view').classList.add('hide-default');
        document.getElementById('char-sheet-view').classList.remove('hide-default');
    });
}

function loadUserCharacters() {
    if (!auth.currentUser) return;
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').get().then(snap => {
        const listGrid = document.getElementById('char-list-grid');
        if (!listGrid) return;
        listGrid.innerHTML = ""; 

        snap.forEach(doc => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'char-card';
            card.onclick = () => selectCharacter(doc.id);
            card.innerHTML = `
                <div class="char-card-portrait" style="background-image: url('${data.portrait || ''}')">
                    ${!data.portrait ? '<i class="ph ph-user" style="font-size: 2em; line-height: 80px; color: #3f3f46;"></i>' : ''}
                </div>
                <span class="char-card-name">${data.name || 'Unnamed'}</span>
                <div class="char-card-meta">Lv. ${data.level || 1} ${data.class || ''}</div>
            `;
            listGrid.appendChild(card);
        });
    });
}

function selectCharacter(id) {
    currentCharacterId = id;
    firestore.collection('users').doc(auth.currentUser.uid).set({ lastActiveCharacter: id }, { merge: true });

    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(id).get().then(doc => {
        if (doc.exists) {
            loadCharacterData(doc.data());
            document.getElementById('char-selection-view').classList.add('hide-default');
            document.getElementById('char-sheet-view').classList.remove('hide-default');
        }
    });
}

function goBackToSelection() {
    currentCharacterId = null;
    firestore.collection('users').doc(auth.currentUser.uid).update({ lastActiveCharacter: null });
    document.getElementById('char-selection-view').classList.remove('hide-default');
    document.getElementById('char-sheet-view').classList.add('hide-default');
    if(document.getElementById('active-char-hud')) document.getElementById('active-char-hud').classList.add('hide-default');
    loadUserCharacters();
}

function calculateModifier(val) {
    const mod = Math.floor((parseInt(val) - 10) / 2);
    return mod >= 0 ? `+${mod}` : mod;
}

function saveCharacter() {
    if (!currentCharacterId || !auth.currentUser) return;
    
    const charData = {
        name: document.getElementById('char-name').value,
        race: document.getElementById('char-race').value,
        class: document.getElementById('char-class').value,
        level: parseInt(document.getElementById('char-level').value) || 1,
        hpCurrent: parseInt(document.getElementById('char-hp-current').value) || 0,
        hpMax: parseInt(document.getElementById('char-hp-max').value) || 0,
        mpCurrent: parseInt(document.getElementById('char-mp-current').value) || 0,
        mpMax: parseInt(document.getElementById('char-mp-max').value) || 0,
        body: parseInt(document.getElementById('char-body').value) || 10,
        mind: parseInt(document.getElementById('char-mind').value) || 10,
        spirit: parseInt(document.getElementById('char-spirit').value) || 10,
        ac: parseInt(document.getElementById('char-ac').value) || 10,
        init: parseInt(document.getElementById('char-init').value) || 0,
        speed: parseInt(document.getElementById('char-speed').value) || 30,
        portrait: currentPortraitString
    };
    
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).update(charData)
        .then(() => { updateHUD(charData); });
}

function loadCharacterData(char) {
    document.getElementById('char-name').value = char.name || "";
    document.getElementById('char-race').value = char.race || "";
    document.getElementById('char-class').value = char.class || "";
    document.getElementById('char-level').value = char.level || 1;
    document.getElementById('char-hp-current').value = char.hpCurrent || 0;
    document.getElementById('char-hp-max').value = char.hpMax || 0;
    document.getElementById('char-mp-current').value = char.mpCurrent || 0;
    document.getElementById('char-mp-max').value = char.mpMax || 0;
    document.getElementById('char-body').value = char.body || 10;
    document.getElementById('char-mind').value = char.mind || 10;
    document.getElementById('char-spirit').value = char.spirit || 10;
    document.getElementById('char-ac').value = char.ac || 10;
    document.getElementById('char-init').value = char.init || 0;
    document.getElementById('char-speed').value = char.speed || 30;

    document.getElementById('mod-body').innerText = calculateModifier(char.body || 10);
    document.getElementById('mod-mind').innerText = calculateModifier(char.mind || 10);
    document.getElementById('mod-spirit').innerText = calculateModifier(char.spirit || 10);
    
    currentPortraitString = char.portrait || "";
    renderGallery(char.gallery || [], currentPortraitString);
    updatePortraitUI(currentPortraitString);
    updateHUD(char);
    renderSkills(char.skills || getDefaultSkills(char.class));
}

// ==========================================
// --- 10. IMAGE GALLERY & HUD HANDLING ---
// ==========================================
function handlePortraitUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentCharacterId) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width, height = img.height, maxSize = 400;
            if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } } 
            else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            
            firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).update({
                gallery: firebase.firestore.FieldValue.arrayUnion(base64),
                portrait: base64
            }).then(() => {
                currentPortraitString = base64;
                switchCharacter(); 
            });
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function setMainPortrait(base64String) {
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).update({
        portrait: base64String
    }).then(() => {
        currentPortraitString = base64String;
        switchCharacter();
    });
}

function renderGallery(galleryArray, currentMain) {
    const container = document.getElementById('gallery-container');
    if (!container) return;
    container.innerHTML = ""; 
    galleryArray.forEach(base64 => {
        let img = document.createElement('img');
        img.src = base64;
        img.className = "gallery-img" + (base64 === currentMain ? " is-main" : "");
        img.onclick = () => setMainPortrait(base64);
        container.appendChild(img);
    });
}

function updatePortraitUI(url) {
    const port = document.getElementById('hud-portrait');
    if (port) {
        port.style.backgroundImage = url ? `url('${url}')` : '';
        port.innerHTML = url ? "" : '<i class="ph ph-user"></i>';
    }
}

function updateHUD(char) {
    const hud = document.getElementById('active-char-hud');
    if (!char || !hud) return;
    hud.classList.remove('hide-default');
    
    document.getElementById('hud-name').innerText = char.name || "Unnamed";
    if(document.getElementById('hud-meta')) document.getElementById('hud-meta').innerText = `Lv. ${char.level || 1} ${char.race || ''} ${char.class || ''}`;
    
    const hpPct = (char.hpMax > 0) ? (char.hpCurrent / char.hpMax) * 100 : 0;
    document.getElementById('hud-hp-fill').style.width = hpPct + "%";
    document.getElementById('hud-hp-text').innerText = `${char.hpCurrent}/${char.hpMax}`;

    const mpPct = (char.mpMax > 0) ? (char.mpCurrent / char.mpMax) * 100 : 0;
    if(document.getElementById('hud-mp-fill')) document.getElementById('hud-mp-fill').style.width = mpPct + "%";
    if(document.getElementById('hud-mp-text')) document.getElementById('hud-mp-text').innerText = `${char.mpCurrent}/${char.mpMax}`;
    if(document.getElementById('skill-mp-display')) document.getElementById('skill-mp-display').innerText = `MP: ${char.mpCurrent} / ${char.mpMax}`;

    if(document.getElementById('hud-mod-body')) document.getElementById('hud-mod-body').innerText = calculateModifier(char.body || 10);
    if(document.getElementById('hud-mod-mind')) document.getElementById('hud-mod-mind').innerText = calculateModifier(char.mind || 10);
    if(document.getElementById('hud-mod-spirit')) document.getElementById('hud-mod-spirit').innerText = calculateModifier(char.spirit || 10);

    const navPort = document.getElementById('nav-user-portrait');
    if(navPort) navPort.style.backgroundImage = char.portrait ? `url('${char.portrait}')` : '';
}

// ==========================================
// --- 11. DICE ROLLER ---
// ==========================================
function rollDice(sides) {
    const res = document.getElementById('dice-result');
    if(!res) return;
    let rolls = 0;
    const interval = setInterval(() => {
        res.innerText = Math.floor(Math.random() * sides) + 1;
        if (++rolls > 10) {
            clearInterval(interval);
            const final = Math.floor(Math.random() * sides) + 1;
            res.innerText = `d${sides}: ${final}`;
            res.style.color = (sides === 20 && final === 20) ? "#fbbf24" : (sides === 20 && final === 1) ? "#ef4444" : "#10b981";
        }
    }, 40);
}

// ==========================================
// --- 12. SKILLS ENGINE ---
// ==========================================
function getDefaultSkills(cls) {
    const className = (cls || "").toLowerCase();
    if (className === 'cleric') {
        return [
            { name: "Heal", level: 1, uses: 0, targetUses: 5, baseCost: 10 },
            { name: "Cure", level: 1, uses: 0, targetUses: 5, baseCost: 10 },
            { name: "Blessing", level: 1, uses: 0, targetUses: 5, baseCost: 10 },
            { name: "Barrier", level: 1, uses: 0, targetUses: 5, baseCost: 10 }
        ];
    }
    return [{ name: "Strike", level: 1, uses: 0, targetUses: 10, baseCost: 0 }];
}

function renderSkills(skills) {
    const list = document.getElementById('skills-list');
    if(!list) return;
    list.innerHTML = "";
    skills.forEach((s, i) => {
        const cost = Math.max(1, s.baseCost - Math.floor(s.level / 2));
        const prog = (s.uses / s.targetUses) * 100;
        const div = document.createElement('div');
        div.className = 'skill-item';
        div.innerHTML = `
            <div class="skill-info">
                <strong>${s.name} <small>Lv.${s.level}</small></strong>
                <div><small style="color:var(--mana)">Cost: ${cost} MP</small></div>
                <div class="skill-progress-container"><div class="skill-progress-fill" style="width:${prog}%"></div></div>
            </div>
            <button onclick="castSkill(${i})" class="btn-primary">Cast</button>
        `;
        list.appendChild(div);
    });
}

async function castSkill(idx) {
    const uid = auth.currentUser.uid;
    const doc = await firestore.collection('users').doc(uid).collection('characters').doc(currentCharacterId).get();
    if(!doc.exists) return;
    const char = doc.data();
    const skills = char.skills || getDefaultSkills(char.class);
    const skill = skills[idx];
    const cost = Math.max(1, skill.baseCost - Math.floor(skill.level / 2));

    if (char.mpCurrent < cost) return alert("Not enough MP");

    char.mpCurrent -= cost;
    skill.uses += 1;
    if (skill.uses >= skill.targetUses) {
        skill.level++;
        skill.uses = 0;
        skill.targetUses = Math.floor(skill.targetUses * 1.5);
    }
    await firestore.collection('users').doc(uid).collection('characters').doc(currentCharacterId).update({ 
        mpCurrent: char.mpCurrent, 
        skills: skills 
    });
    loadCharacterData(char);
}
