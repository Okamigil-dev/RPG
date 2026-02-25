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

        // Update Admin Panel Inputs if they exist
        if(document.getElementById('min-per-hour')) document.getElementById('min-per-hour').value = minPerHour;
        if(document.getElementById('hours-per-day')) document.getElementById('hours-per-day').value = hoursPerDay;
        if(document.getElementById('speed-label')) document.getElementById('speed-label').innerText = speedMultiplier + "x";
        
        let btn = document.getElementById('play-btn');
        if (btn) {
            if (isRunning) {
                btn.innerText = "Pause Time";
            } else {
                btn.innerText = "Start Time";
            }
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
        alert("Account created!");
    }).catch((error) => alert(error.message));
}

function loginUser() {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    auth.signInWithEmailAndPassword(email, pass).catch((error) => alert(error.message));
}

function logoutUser() { auth.signOut(); }


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

                // NEW: Handle Dashboard vs Sheet View on login
                if (userData.lastActiveCharacter) {
                    selectCharacter(userData.lastActiveCharacter);
                } else {
                    loadUserCharacters(); 
                    openTab('tab-character');
                    document.getElementById('char-selection-view').classList.remove('hide-default');
                    document.getElementById('char-sheet-view').classList.add('hide-default');
                }

                if (role === 'Master' || role === 'Admin') {
                    if (controlPanelTabBtn) controlPanelTabBtn.classList.remove('hide-default');
                    if (masterPanel) masterPanel.classList.remove('hide-default');
                }
                if (role === 'Admin' && adminPanel) adminPanel.classList.remove('hide-default');
            }
        });
    }


// ==========================================
// --- 8. UI NAVIGATION (TAB SWITCHER) ---
// ==========================================
function openTab(tabId) {
    // HARD LOCK: If there is no user logged in, refuse to open any tab except the login screen
    if (!auth.currentUser && tabId !== 'tab-login') {
        console.warn("Access denied: You must log in first.");
        return; 
    }

    const allTabs = document.querySelectorAll('.tab-content');
    allTabs.forEach(tab => tab.style.display = 'none');
    const target = document.getElementById(tabId);
    if (target) target.style.display = 'block';
}


// ==========================================
// --- 9. CHARACTER SHEET LOGIC ---
// ==========================================

function createNewCharacter() {
    const user = auth.currentUser;
    if (!user) return;
    
    // 1. Create the blank character profile
    const newRef = firestore.collection('users').doc(user.uid).collection('characters').doc();
    const initData = { name: "New Hero", level: 1, hpCurrent: 10, hpMax: 10, str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, portrait: "" };
    
    // 2. Save it to the database
    newRef.set(initData).then(() => {
        currentCharacterId = newRef.id;
        loadUserCharacters(); 
        
        // 3. THIS IS THE MISSING LINE: Force the screen to load the new blank stats!
        loadCharacterData(initData);
    });
}

function loadUserCharacters() {
    if (!auth.currentUser) return;
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').get().then(snap => {
        const listGrid = document.getElementById('char-list-grid');
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
    firestore.collection('users').doc(auth.currentUser.uid).set({
        lastActiveCharacter: id
    }, { merge: true });

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
    document.getElementById('char-selection-view').classList.remove('hide-default');
    document.getElementById('char-sheet-view').classList.add('hide-default');
    document.getElementById('active-char-hud').classList.add('hide-default');
}

function switchCharacter() {
    // This is now used primarily for internal reloads (like after image uploads)
    if (!currentCharacterId) return;
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).get().then(doc => {
        if (doc.exists) loadCharacterData(doc.data());
    });
}

function calculateModifier(val) {
    const mod = Math.floor((val - 10) / 2);
    return mod >= 0 ? `+${mod}` : mod;
}

function saveCharacter() {
    if (!currentCharacterId || !auth.currentUser) return;
    
    // Update visual modifiers immediately
    document.getElementById('mod-body').innerText = calculateModifier(document.getElementById('char-body').value);
    document.getElementById('mod-mind').innerText = calculateModifier(document.getElementById('char-mind').value);
    document.getElementById('mod-spirit').innerText = calculateModifier(document.getElementById('char-spirit').value);

    const charData = {
        name: document.getElementById('char-name').value,
        race: document.getElementById('char-race').value,
        class: document.getElementById('char-class').value,
        level: document.getElementById('char-level').value,
        hpCurrent: parseInt(document.getElementById('char-hp-current').value) || 0,
        hpMax: parseInt(document.getElementById('char-hp-max').value) || 0,
        mpCurrent: parseInt(document.getElementById('char-mp-current').value) || 0,
        mpMax: parseInt(document.getElementById('char-mp-max').value) || 0,
        body: parseInt(document.getElementById('char-body').value) || 10,
        mind: parseInt(document.getElementById('char-mind').value) || 10,
        spirit: parseInt(document.getElementById('char-spirit').value) || 10,
        ac: document.getElementById('char-ac').value,
        init: document.getElementById('char-init').value,
        speed: document.getElementById('char-speed').value,
        portrait: currentPortraitString
    };
    
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).set(charData, { merge: true })
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
            let width = img.width, height = img.height;
            const maxSize = 400; // Scaled slightly to fit multiple images safely in the database

            if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } } 
            else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }

            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            
            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            
            // Add the new image to the gallery array AND set it as the main portrait
            firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).update({
                gallery: firebase.firestore.FieldValue.arrayUnion(base64),
                portrait: base64
            }).then(() => {
                switchCharacter(); // Reloads the screen to show the new image
            });
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function setMainPortrait(base64String) {
    // When you click an image in the gallery, it updates the main portrait
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).update({
        portrait: base64String
    }).then(() => switchCharacter());
}

function renderGallery(galleryArray, currentMain) {
    const container = document.getElementById('gallery-container');
    if (!container) return;
    container.innerHTML = ""; // Clear old images
    
    galleryArray.forEach(base64 => {
        let img = document.createElement('img');
        img.src = base64;
        img.className = "gallery-img";
        if (base64 === currentMain) img.classList.add('is-main');
        
        // Make the image clickable
        img.onclick = () => setMainPortrait(base64);
        container.appendChild(img);
    });
}

function updatePortraitUI(url) {
    const preview = document.getElementById('portrait-preview');
    const placeholder = document.getElementById('portrait-placeholder');
    if (url) {
        preview.style.backgroundImage = `url('${url}')`;
        placeholder.style.display = 'none';
    } else {
        preview.style.backgroundImage = '';
        placeholder.style.display = 'block';
    }
}

function updateHUD(char) {
    const hud = document.getElementById('active-char-hud');
    if (!char || !hud) return;

    hud.classList.remove('hide-default');
    
    // Identity
    document.getElementById('hud-name').innerText = char.name || "Unnamed";
    const hudMeta = document.getElementById('hud-meta');
    if(hudMeta) hudMeta.innerText = `Lv. ${char.level || 1} ${char.race || ''} ${char.class || ''}`;
    
    // Portrait
    const port = document.getElementById('hud-portrait') || document.getElementById('portrait-preview');
    if (char.portrait) port.style.backgroundImage = `url('${char.portrait}')`;
    else port.style.backgroundImage = '';

    // Bars
    const hpPct = (char.hpMax > 0) ? (char.hpCurrent / char.hpMax) * 100 : 0;
    document.getElementById('hud-hp-fill').style.width = hpPct + "%";
    document.getElementById('hud-hp-text').innerText = `${char.hpCurrent} / ${char.hpMax}`;

    const mpPct = (char.mpMax > 0) ? (char.mpCurrent / char.mpMax) * 100 : 0;
    const mpFill = document.getElementById('hud-mp-fill');
    const mpText = document.getElementById('hud-mp-text');
    if(mpFill) mpFill.style.width = mpPct + "%";
    if(mpText) mpText.innerText = `${char.mpCurrent} / ${char.mpMax}`;

    // Sidebar Stats (The +0 modifiers)
    const hBody = document.getElementById('hud-mod-body');
    const hMind = document.getElementById('hud-mod-mind');
    const hSpirit = document.getElementById('hud-mod-spirit');
    
    if(hBody) hBody.innerText = calculateModifier(char.body || 10);
    if(hMind) hMind.innerText = calculateModifier(char.mind || 10);
    if(hSpirit) hSpirit.innerText = calculateModifier(char.spirit || 10);
}



// ==========================================
// --- 11. DICE ROLLER ---
// ==========================================

function rollDice(sides) {
    const resultDisplay = document.getElementById('dice-result');
    let rolls = 0;
    
    // Simple "rolling" animation
    const interval = setInterval(() => {
        resultDisplay.innerText = Math.floor(Math.random() * sides) + 1;
        rolls++;
        if (rolls > 10) {
            clearInterval(interval);
            const finalRoll = Math.floor(Math.random() * sides) + 1;
            resultDisplay.innerText = `d${sides}: ${finalRoll}`;
            
            // Highlight criticals on d20
            if (sides === 20 && finalRoll === 20) resultDisplay.style.color = "#fbbf24";
            else if (sides === 20 && finalRoll === 1) resultDisplay.style.color = "#ef4444";
            else resultDisplay.style.color = "#00ff88";
        }
    }, 40);
}
