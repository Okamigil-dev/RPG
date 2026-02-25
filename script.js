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

let currentCampaignId = "global_world"; 
let currentCharacterId = null;
let currentPortraitString = "";

// ==========================================
// --- 2. FIREBASE SETUP ---
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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const rtdb = firebase.database();       
const firestore = firebase.firestore(); 

// Mandatory Artifact Path Helper
const getArtifactPath = () => `artifacts/${firebaseConfig.appId}`;

// ==========================================
// --- 3. DATABASE SYNC (RTDB) ---
// ==========================================
function saveTimeState() {
    const timeData = {
        totalCustomSeconds,
        speedMultiplier,
        isRunning,
        lastRealWorldSaveTime: Date.now(),
        minPerHour,
        hoursPerDay
    };
    rtdb.ref(`${getArtifactPath()}/campaigns/${currentCampaignId}/clock`).set(timeData);
}

rtdb.ref(`${getArtifactPath()}/campaigns/${currentCampaignId}/clock`).on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    speedMultiplier = data.speedMultiplier || 1;
    isRunning = data.isRunning || false;
    minPerHour = data.minPerHour || 60;
    hoursPerDay = data.hoursPerDay || 24;

    let now = Date.now();
    if (isRunning) {
        let deltaRealSeconds = (now - data.lastRealWorldSaveTime) / 1000;
        totalCustomSeconds = data.totalCustomSeconds + (deltaRealSeconds * speedMultiplier);
    } else {
        totalCustomSeconds = data.totalCustomSeconds;
    }
    lastRealTime = now;

    // UI Updates
    const speedLabel = document.getElementById('speed-label');
    if (speedLabel) speedLabel.innerText = speedMultiplier + "x";
    
    const btn = document.getElementById('play-btn');
    if (btn) btn.innerHTML = isRunning ? '<i class="fa-solid fa-pause"></i> Pause Time' : '<i class="fa-solid fa-play"></i> Start Time';
    
    updateDisplay();
});

// ==========================================
// --- 4. CLOCK ENGINE ---
// ==========================================
function tick() {
    if (!isRunning) return;
    let now = Date.now();
    let deltaRealSeconds = (now - lastRealTime) / 1000;
    lastRealTime = now;
    totalCustomSeconds += (deltaRealSeconds * speedMultiplier);
    updateDisplay();
}

function updateDisplay() {
    let secPerMin = 60;
    let currentSec = Math.floor(totalCustomSeconds % secPerMin);
    let totalMinutes = Math.floor(totalCustomSeconds / secPerMin);
    let currentMin = Math.floor(totalMinutes % minPerHour);
    let totalHours = Math.floor(totalMinutes / minPerHour);
    let currentHour = Math.floor(totalHours % hoursPerDay);
    let totalDays = Math.floor(totalHours / hoursPerDay);
    let currentDay = (totalDays % daysPerMonth) + 1; 
    let totalMonths = Math.floor(totalDays / daysPerMonth);
    let currentMonth = (totalMonths % monthsPerYear) + 1; 
    let currentYear = Math.floor(totalMonths / monthsPerYear) + 1; 

    const timeDisp = document.getElementById('time-display');
    const dateDisp = document.getElementById('date-display');
    
    if (timeDisp) timeDisp.innerText = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}:${String(currentSec).padStart(2, '0')}`;
    if (dateDisp) dateDisp.innerText = `Year ${currentYear}, Month ${currentMonth}, Day ${currentDay}`;
}
setInterval(tick, 100);

function toggleTime() { isRunning = !isRunning; saveTimeState(); }
function setSpeed(s) { speedMultiplier = s; saveTimeState(); }

// ==========================================
// --- 5. AUTH & NAVIGATION ---
// ==========================================
function openTab(tabId) {
    if (!auth.currentUser && tabId !== 'tab-login') return;
    
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none'; // Backup for older CSS
    });
    
    const target = document.getElementById(tabId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }
}

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await firestore.doc(`${getArtifactPath()}/users/${user.uid}`).get();
        if (!userDoc.exists) {
            await firestore.doc(`${getArtifactPath()}/users/${user.uid}`).set({ email: user.email, role: 'Player' });
        }
        
        const userData = userDoc.data() || { role: 'Player' };
        document.getElementById('user-display-name').innerText = user.email.split('@')[0];
        document.getElementById('user-role-label').innerText = userData.role;
        
        // Show protected UI
        document.getElementById('main-nav-tabs').classList.remove('hide-default');
        document.getElementById('game-ui').classList.remove('hide-default');
        document.getElementById('logout-btn').classList.remove('hide-default');
        
        if (userData.role === 'Master' || userData.role === 'Admin') {
            document.getElementById('nav-control-panel').classList.remove('hide-default');
        }

        if (userData.lastActiveCharacter) {
            selectCharacter(userData.lastActiveCharacter);
        } else {
            loadUserCharacters();
            openTab('tab-character');
        }
    } else {
        openTab('tab-login');
    }
});

function loginUser() {
    const e = document.getElementById('email-input').value;
    const p = document.getElementById('password-input').value;
    auth.signInWithEmailAndPassword(e, p).catch(err => console.error(err));
}

function logoutUser() { auth.signOut().then(() => location.reload()); }

// ==========================================
// --- 6. CHARACTER LOGIC ---
// ==========================================
function calculateModifier(val) {
    const mod = Math.floor((val - 10) / 2);
    return mod >= 0 ? `+${mod}` : mod;
}

async function createNewCharacter() {
    const user = auth.currentUser;
    const charRef = firestore.collection(`${getArtifactPath()}/users/${user.uid}/characters`).doc();
    const data = { name: "New Hero", level: 1, body: 10, mind: 10, spirit: 10, hpCurrent: 10, hpMax: 10, portrait: "" };
    await charRef.set(data);
    loadUserCharacters();
}

async function loadUserCharacters() {
    const snap = await firestore.collection(`${getArtifactPath()}/users/${auth.currentUser.uid}/characters`).get();
    const grid = document.getElementById('char-list-grid');
    grid.innerHTML = "";
    snap.forEach(doc => {
        const d = doc.data();
        const card = document.createElement('div');
        card.className = 'char-card';
        card.onclick = () => selectCharacter(doc.id);
        card.innerHTML = `
            <div class="char-card-portrait" style="background-image: url('${d.portrait || ''}')"></div>
            <span class="char-card-name">${d.name || 'Unnamed'}</span>
        `;
        grid.appendChild(card);
    });
}

async function selectCharacter(id) {
    currentCharacterId = id;
    const doc = await firestore.doc(`${getArtifactPath()}/users/${auth.currentUser.uid}/characters/${id}`).get();
    if (doc.exists) {
        loadCharacterData(doc.data());
        document.getElementById('char-selection-view').classList.add('hide-default');
        document.getElementById('char-sheet-view').classList.remove('hide-default');
        // Save as last active
        firestore.doc(`${getArtifactPath()}/users/${auth.currentUser.uid}`).update({ lastActiveCharacter: id });
    }
}

function loadCharacterData(char) {
    document.getElementById('char-name').value = char.name || "";
    document.getElementById('char-body').value = char.body || 10;
    document.getElementById('char-mind').value = char.mind || 10;
    document.getElementById('char-spirit').value = char.spirit || 10;
    document.getElementById('char-hp-current').value = char.hpCurrent || 10;
    document.getElementById('char-hp-max').value = char.hpMax || 10;
    
    currentPortraitString = char.portrait || "";
    updateHUD(char);
}

function saveCharacter() {
    if (!currentCharacterId) return;
    const data = {
        name: document.getElementById('char-name').value,
        body: parseInt(document.getElementById('char-body').value) || 10,
        mind: parseInt(document.getElementById('char-mind').value) || 10,
        spirit: parseInt(document.getElementById('char-spirit').value) || 10,
        hpCurrent: parseInt(document.getElementById('char-hp-current').value) || 0,
        hpMax: parseInt(document.getElementById('char-hp-max').value) || 10,
        portrait: currentPortraitString
    };
    
    firestore.doc(`${getArtifactPath()}/users/${auth.currentUser.uid}/characters/${currentCharacterId}`).update(data);
    updateHUD(data);
}

function updateHUD(char) {
    document.getElementById('active-char-hud').classList.remove('hide-default');
    document.getElementById('hud-name').innerText = char.name || "Unnamed";
    document.getElementById('hud-mod-body').innerText = calculateModifier(char.body);
    document.getElementById('hud-mod-mind').innerText = calculateModifier(char.mind);
    document.getElementById('hud-mod-spirit').innerText = calculateModifier(char.spirit);
    
    const hpPct = (char.hpCurrent / char.hpMax) * 100;
    document.getElementById('hud-hp-fill').style.width = hpPct + "%";
    document.getElementById('hud-hp-text').innerText = `${char.hpCurrent} / ${char.hpMax}`;
    
    if (char.portrait) {
        document.getElementById('hud-portrait').style.backgroundImage = `url('${char.portrait}')`;
    }
}

// ==========================================
// --- 7. DICE ROLLER ---
// ==========================================
function rollDice(sides) {
    const res = document.getElementById('dice-result');
    let count = 0;
    const anim = setInterval(() => {
        res.innerText = Math.floor(Math.random() * sides) + 1;
        if (++count > 15) {
            clearInterval(anim);
            const val = Math.floor(Math.random() * sides) + 1;
            res.innerText = `d${sides}: ${val}`;
            res.style.color = (sides === 20 && val === 20) ? "#fbbf24" : "#00ff88";
        }
    }, 40);
}
