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
let currentCharacterId = null; // Tracks which specific character is open
let currentPortraitString = ""; // Safely holds the image string

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

// Initialize Firebase using Compat SDK
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
    // Using direct campaign path (no artifacts)
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

        // Update Admin Panel UI
        if(document.getElementById('speed-label')) document.getElementById('speed-label').innerText = speedMultiplier + "x";
        
        let btn = document.getElementById('play-btn');
        if (btn) {
            btn.innerText = isRunning ? "Pause Time" : "Start Time";
        }
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
setInterval(tick, 100);

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

// ==========================================
// --- 6. AUTHENTICATION & ROLES ---
// ==========================================
function registerUser() {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    auth.createUserWithEmailAndPassword(email, pass).then((userCredential) => {
        // Direct /users/ path
        firestore.collection('users').doc(userCredential.user.uid).set({ email: email, role: 'Player' });
        alert("Account created!");
    }).catch((error) => alert(error.message));
}

function loginUser() {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    auth.signInWithEmailAndPassword(email, pass).catch((error) => alert(error.message));
}

function logoutUser() { auth.signOut().then(() => location.reload()); }

// ==========================================
// --- 7. USER AUTHENTICATION OBSERVER ---
// ==========================================
auth.onAuthStateChanged((user) => {
    if (user) {
        firestore.collection('users').doc(user.uid).get().then((doc) => {
             if (doc.exists) {
                const userData = doc.data();
                const role = userData.role;
                
                document.getElementById('user-display-name').innerText = user.email.split('@')[0];
                document.getElementById('user-role-label').innerText = role;
                
                // Show UI Elements
                document.getElementById('logout-btn').classList.remove('hide-default');
                document.getElementById('main-nav-tabs').classList.remove('hide-default');
                document.getElementById('game-ui').classList.remove('hide-default');

                // Toggle Master Panel based on role
                if (role === 'Master' || role === 'Admin') {
                    document.getElementById('nav-control-panel').classList.remove('hide-default');
                }

                // Handle session restoration
                if (userData.lastActiveCharacter) {
                    selectCharacter(userData.lastActiveCharacter);
                } else {
                    loadUserCharacters(); 
                    openTab('tab-character');
                    document.getElementById('char-selection-view').classList.remove('hide-default');
                    document.getElementById('char-sheet-view').classList.add('hide-default');
                }
            }
        });
    } else {
        openTab('tab-login');
    }
});

// ==========================================
// --- 8. UI NAVIGATION (TAB SWITCHER) ---
// ==========================================
function openTab(tabId) {
    if (!auth.currentUser && tabId !== 'tab-login') return; 

    const allTabs = document.querySelectorAll('.tab-content');
    allTabs.forEach(tab => tab.style.display = 'none');
    const target = document.getElementById(tabId);
    if (target) target.style.display = 'block';
}

// ==========================================
// --- 9. CHARACTER SHEET LOGIC ---
// ==========================================
function calculateModifier(val) {
    const mod = Math.floor((val - 10) / 2);
    return mod >= 0 ? `+${mod}` : mod;
}

function createNewCharacter() {
    const user = auth.currentUser;
    if (!user) return;
    
    const newRef = firestore.collection('users').doc(user.uid).collection('characters').doc();
    const initData = { name: "New Hero", level: 1, hpCurrent: 10, hpMax: 10, body: 10, mind: 10, spirit: 10, portrait: "" };
    
    newRef.set(initData).then(() => {
        loadUserCharacters(); 
    });
}

function loadUserCharacters() {
    const user = auth.currentUser;
    if (!user) return;
    firestore.collection('users').doc(user.uid).collection('characters').get().then(snap => {
        const listGrid = document.getElementById('char-list-grid');
        listGrid.innerHTML = ""; 

        snap.forEach(doc => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'char-card';
            card.onclick = () => selectCharacter(doc.id);
            card.innerHTML = `
                <div class="char-card-portrait" style="background-image: url('${data.portrait || ''}')"></div>
                <span class="char-card-name">${data.name || 'Unnamed'}</span>
            `;
            listGrid.appendChild(card);
        });
    });
}

function selectCharacter(id) {
    currentCharacterId = id;
    const user = auth.currentUser;
    firestore.collection('users').doc(user.uid).set({ lastActiveCharacter: id }, { merge: true });

    firestore.collection('users').doc(user.uid).collection('characters').doc(id).get().then(doc => {
        if (doc.exists) {
            const char = doc.data();
            // Fill Inputs
            document.getElementById('char-name').value = char.name || "";
            document.getElementById('char-body').value = char.body || 10;
            document.getElementById('char-mind').value = char.mind || 10;
            document.getElementById('char-spirit').value = char.spirit || 10;
            document.getElementById('char-hp-current').value = char.hpCurrent || 10;
            document.getElementById('char-hp-max').value = char.hpMax || 10;
            
            // Switch Views
            document.getElementById('char-selection-view').classList.add('hide-default');
            document.getElementById('char-sheet-view').classList.remove('hide-default');
            updateHUD(char);
        }
    });
}

function saveCharacter() {
    if (!currentCharacterId || !auth.currentUser) return;
    
    const charData = {
        name: document.getElementById('char-name').value,
        body: parseInt(document.getElementById('char-body').value) || 10,
        mind: parseInt(document.getElementById('char-mind').value) || 10,
        spirit: parseInt(document.getElementById('char-spirit').value) || 10,
        hpCurrent: parseInt(document.getElementById('char-hp-current').value) || 0,
        hpMax: parseInt(document.getElementById('char-hp-max').value) || 10,
        portrait: currentPortraitString
    };
    
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).set(charData, { merge: true })
        .then(() => { updateHUD(charData); });
}

function goBackToSelection() {
    currentCharacterId = null;
    document.getElementById('char-selection-view').classList.remove('hide-default');
    document.getElementById('char-sheet-view').classList.add('hide-default');
    document.getElementById('active-char-hud').classList.add('hide-default');
}

// ==========================================
// --- 10. HUD HANDLING ---
// ==========================================
function updateHUD(char) {
    const hud = document.getElementById('active-char-hud');
    if (!char || !hud) return;

    hud.classList.remove('hide-default');
    document.getElementById('hud-name').innerText = char.name || "Unnamed";
    
    const hpPct = (char.hpMax > 0) ? (char.hpCurrent / char.hpMax) * 100 : 0;
    document.getElementById('hud-hp-fill').style.width = hpPct + "%";
    document.getElementById('hud-hp-text').innerText = `${char.hpCurrent} / ${char.hpMax}`;

    document.getElementById('hud-mod-body').innerText = calculateModifier(char.body || 10);
    document.getElementById('hud-mod-mind').innerText = calculateModifier(char.mind || 10);
    document.getElementById('hud-mod-spirit').innerText = calculateModifier(char.spirit || 10);
}

// ==========================================
// --- 11. DICE ROLLER ---
// ==========================================
function rollDice(sides) {
    const resultDisplay = document.getElementById('dice-result');
    let rolls = 0;
    const interval = setInterval(() => {
        resultDisplay.innerText = Math.floor(Math.random() * sides) + 1;
        if (++rolls > 10) {
            clearInterval(interval);
            const finalRoll = Math.floor(Math.random() * sides) + 1;
            resultDisplay.innerText = `d${sides}: ${finalRoll}`;
            resultDisplay.style.color = (sides === 20 && finalRoll === 20) ? "#fbbf24" : "#00ff88";
        }
    }, 40);
}
