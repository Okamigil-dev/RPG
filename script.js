// ==========================================
// --- 1. STATE VARIABLES & DEFAULTS ---
// ==========================================

let totalCustomSeconds = 0; 
let speedMultiplier = 1;
let isRunning = false;
let lastRealTime = Date.now();

let currentCampaignId = "global"; 
let currentCharacterId = null; 



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
        isRunning: isRunning,
        lastRealWorldSaveTime: Date.now()
    };
    // USE UPDATE, NOT SET. DO NOT INCLUDE speedMultiplier.
    rtdb.ref(`instance_clocks/${currentCampaignId}`).update(timeData);
}

function initClockListener() {
    rtdb.ref(`instance_clocks`).off(); 

    rtdb.ref(`instance_clocks/${currentCampaignId}`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Everyone (Master and Player) syncs to the DB speed
        isRunning = data.isRunning;
        speedMultiplier = data.speedMultiplier || 1;

        // Sync the Master's UI label if it exists on their screen
        const label = document.getElementById('speed-label');
        if (label) label.innerText = speedMultiplier + "x";

        let now = Date.now();
        if (data.isRunning) {
            let deltaRealSeconds = (now - data.lastRealWorldSaveTime) / 1000;
            totalCustomSeconds = (data.totalCustomSeconds || 0) + (deltaRealSeconds * speedMultiplier);
        } else {
            totalCustomSeconds = data.totalCustomSeconds || 0;
        }

        lastRealTime = now;
        updateDisplay();
    });
}


// ==========================================
// --- 4. CLOCK ENGINE & DISPLAY ---
// ==========================================

let lastRegenMinute = 0;
let syncCounter = 0;

function tick() {
    let now = Date.now();
    let deltaRealSeconds = (now - lastRealTime) / 1000;
    lastRealTime = now;

    if (isRunning) {
        totalCustomSeconds += (deltaRealSeconds * speedMultiplier);
        
        // Passive Regen
        let currentMinute = Math.floor(totalCustomSeconds / 60);
        if (currentMinute > lastRegenMinute) {
            applyPassiveRegen();
            lastRegenMinute = currentMinute;
        }

        // MASTER AUTO-SYNC: Heartbeat every 5 seconds
        if (window.currentUserRole === 'Master' || window.currentUserRole === 'Admin') {
            syncCounter += deltaRealSeconds;
            if (syncCounter > 5) {
                saveTimeState(); 
                syncCounter = 0;
            }
        }

        updateDisplay();
    }
}

function applyPassiveRegen() {
    if (!currentCharacterId) return;

    let hpCur = parseFloat(document.getElementById('char-hp-current').value) || 0;
    let hpMax = parseFloat(document.getElementById('char-hp-max').value) || 10;
    let mpCur = parseFloat(document.getElementById('char-mp-current').value) || 0;
    let mpMax = parseFloat(document.getElementById('char-mp-max').value) || 10;

    // Regen ~100% in 8 hours
    let hpRegen = hpMax * 0.00208333;
    let mpRegen = mpMax * 0.00208333;

    // Use .toFixed(2) to keep the fraction safe in the hidden input
    document.getElementById('char-hp-current').value = Math.min(hpCur + hpRegen, hpMax).toFixed(2);
    document.getElementById('char-mp-current').value = Math.min(mpCur + mpRegen, mpMax).toFixed(2);
    
    saveCharacter(); // Syncs to DB
}

function updateDisplay() {
    let tDays = Math.floor(totalCustomSeconds / 86400);
    let h = Math.floor((totalCustomSeconds / 3600) % 24);
    let m = Math.floor((totalCustomSeconds / 60) % 60);
    let s = Math.floor(totalCustomSeconds % 60);
    if(document.getElementById('time-display')) {
        document.getElementById('time-display').innerText = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
}
setInterval(tick, 100);



// ==========================================
// --- 5. CLOCK CONTROLS ---
// ==========================================

function toggleTime() { 
    isRunning = !isRunning; 
    saveTimeState(); 
    
    const btn = document.getElementById('sidebar-play-btn');
    if (btn) {
        btn.innerHTML = isRunning ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    }
}

function setSpeed(multiplier) {
    speedMultiplier = multiplier;
    const label = document.getElementById('speed-label');
    if (label) label.innerText = multiplier + "x";

    rtdb.ref(`instance_clocks/${currentCampaignId}`).update({
        speedMultiplier: multiplier,
        totalCustomSeconds: totalCustomSeconds,
        lastRealWorldSaveTime: Date.now()
    });
}



// ==========================================
// --- 6. AUTHENTICATION & ROLES ---
// ==========================================
function registerUser() {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    auth.createUserWithEmailAndPassword(email, pass).then((res) => {
        firestore.collection('users').doc(res.user.uid).set({ email: email, role: 'Player' });
    }).catch(err => alert(err.message));
}
function loginUser() {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
}
function logoutUser() { auth.signOut().then(() => location.reload()); }



// ==========================================
// --- 7. USER AUTHENTICATION ---
// ==========================================

auth.onAuthStateChanged((user) => {
    const diceUI = document.getElementById('dice-tray');
    
    if (user) {
        document.getElementById('main-nav-tabs').classList.remove('hide-default');
        document.getElementById('logout-btn').classList.remove('hide-default');
        document.getElementById('game-ui').classList.remove('hide-default');
        document.getElementById('user-display-name').innerText = user.email.split('@')[0];

        firestore.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                window.currentUserRole = data.role || 'Player';

                initClockListener();
                
                // --- NEW: Vitals Lock Check ---
                const isMaster = (data.role === 'Master' || data.role === 'Admin');
                const hpIn = document.getElementById('char-hp-current');
                const mpIn = document.getElementById('char-mp-current');
                [hpIn, mpIn].forEach(el => {
                    el.readOnly = !isMaster;
                    el.classList.toggle('locked-resource', !isMaster);
                });

                document.getElementById('user-role-label').innerText = data.role;
                if (isMaster) {
                    document.getElementById('nav-control-panel').classList.remove('hide-default');
                    document.getElementById('master-quick-controls').classList.remove('hide-default');
                    
                    // --- NEW: Load Registry immediately for Masters ---
                    loadInstanceList(); 
                }
                
                initDiceLogListener();
                if (data.lastActiveCharacter) selectCharacter(data.lastActiveCharacter);

                const savedTab = localStorage.getItem('activeMainTab') || 'tab-character';
                openTab(savedTab);
                
            }
        });
        loadUserCharacters();
    } else {
        window.currentUserRole = null; 

        document.getElementById('game-ui').classList.add('hide-default'); // <--- ADDED THIS: Hides game UI
        if (diceUI) diceUI.style.display = 'none'; // <--- ADDED THIS: Hides dice when logged out
        
        openTab('tab-login');
    }
});



// ==========================================
// --- 8. UI NAVIGATION (TAB SWITCHER) ---
// ==========================================

function openTab(tabId) {
    const allTabs = document.querySelectorAll('.tab-content');
    allTabs.forEach(tab => {
        tab.style.display = 'none';
        tab.classList.add('hide-default');
    });
    
    const target = document.getElementById(tabId);
    if (target) {
        target.style.display = 'block';
        target.classList.remove('hide-default');
    }

    // --- NEW: Save the main tab to memory ---
    localStorage.setItem('activeMainTab', tabId);

    if (tabId === 'tab-control-panel' && (window.currentUserRole === 'Master' || window.currentUserRole === 'Admin')) {
        loadInstanceList();
        openMasterPanel();
        
        // --- NEW: Restore the last opened sub-tab automatically ---
        const savedSubTab = localStorage.getItem('activeMasterSubTab') || 'sub-instances';
        openControlSubTab(null, savedSubTab); 
    }
}


function openControlSubTab(evt, subTabId) {
    // --- NEW: Save the sub-tab to memory ---
    localStorage.setItem('activeMasterSubTab', subTabId);

    // 1. Hide all sub-content
    const contents = document.getElementsByClassName("control-sub-content");
    for (let content of contents) {
        content.classList.add("hide-default");
    }

    // 2. Remove 'active' class from all buttons
    const buttons = document.getElementsByClassName("sub-nav-btn");
    for (let btn of buttons) {
        btn.classList.remove("active");
    }

    // 3. Show the target tab and mark button as active
    document.getElementById(subTabId).classList.remove("hide-default");
    
    // Check if triggered by a click (evt) or by the auto-loader
    if (evt) {
        evt.currentTarget.classList.add("active");
    } else {
        const targetBtn = document.querySelector(`[onclick*="${subTabId}"]`);
        if (targetBtn) targetBtn.classList.add("active");
    }

    // 4. If opening instances or accounts, refresh the lists
    if (subTabId === 'sub-instances') loadInstanceList();
    if (subTabId === 'sub-accounts') loadUserList();
    if (subTabId === 'sub-characters') loadGlobalCharacterManager();
    if (subTabId === 'sub-classes') loadMasterClassList();
    if (subTabId === 'sub-races') loadMasterRaceList();
    if (subTabId === 'sub-skills') loadMasterSkillList();
}



// ==========================================
// --- 9. CHARACTER SHEET LOGIC ---
// ==========================================

function createNewCharacter() {
    const user = auth.currentUser;
    const data = { 
        name: "New Hero", 
        race: "",
        class: "",
        
        charLevel: 1,      
        classLevel: 1,     
        totalSP: 1,        
        spentSP: 0,        

        // SKILL SLOTS WITH USAGE TRACKING
        // name: The name of the skill
        // level: 1-10 (used for merging requirements)
        // exp: How many times it has been used this level
        // expMax: How many uses are needed to reach the next level
        basicSkills: [
            { name: "", level: 1, exp: 0, expMax: 10 },
            { name: "", level: 1, exp: 0, expMax: 10 },
            { name: "", level: 1, exp: 0, expMax: 10 },
            { name: "", level: 1, exp: 0, expMax: 10 }
        ],
        intSkills: [
            { name: "", level: 1, exp: 0, expMax: 20 },
            { name: "", level: 1, exp: 0, expMax: 20 }
        ],
        advSkills: [
            { name: "", level: 1, exp: 0, expMax: 50 }
        ],

        body: 0, mind: 0, spirit: 0,
        hpMaxBonus: 0, mpMaxBonus: 0,
        hpCurrent: 10, hpMax: 10,
        mpCurrent: 10, mpMax: 10,
        expCurrent: 0, expMax: 1000,
        gallery: [], portrait: "",
        instanceId: "global",
        instanceName: "Global",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    firestore.collection('users').doc(user.uid)
        .collection('characters').add(data)
        .then(() => loadUserCharacters());
}

/**
 * Loads characters and builds the selection grid with Delete capability.
 */
function loadUserCharacters() {
    const user = auth.currentUser;
    if (!user) return;

    firestore.collection('users').doc(user.uid).collection('characters').get().then(snap => {
        const grid = document.getElementById('char-list-grid');
        grid.innerHTML = ""; // Prevents "weird" stacking
        
        snap.forEach(doc => {
            const d = doc.data();
            const card = document.createElement('div');
            card.className = 'char-card';
            
            // Selection Logic
            card.onclick = () => selectCharacter(doc.id);
            
            card.innerHTML = `
                <div class="portrait-circle-small" style="background-image: url(${d.portrait || ''}); margin: 0 auto 10px;"></div>
                <strong>${d.name || 'New Hero'}</strong>
                <div class="char-card-meta">Lv.${d.charLevel || 1} ${d.class || ''}</div>
                
                <div style="font-size: 0.75rem; color: #a855f7; margin-top: 5px; font-weight: bold;">
                    <i class="fa-solid fa-globe"></i> Realm: ${d.instanceName || 'Global'}
                </div>
                
                <button class="btn-danger-small mt-m" onclick="deleteCharacter(event, '${doc.id}', '${d.name}')">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
                
            `;
            grid.appendChild(card);
        });
    });
}

function selectCharacter(id) {
    // 0. RESET UI (Clears ghost data)
    const allInputs = document.querySelectorAll('#char-sheet-view input');
    allInputs.forEach(input => { if(input.type !== 'file') input.value = ""; });

    currentCharacterId = id;
    const user = auth.currentUser;
    
    firestore.collection('users').doc(user.uid).collection('characters').doc(id).get().then(doc => {
        if (doc.exists) {
            const d = doc.data();

            // === SWITCH INSTANCE LISTENERS ===
            currentCampaignId = d.instanceId || "global"; 
            initClockListener(); 
            initDiceLogListener();
            // ===============================================
            
            // 1. IDENTITY & METADATA
            document.getElementById('char-name').value = d.name || "";
            document.getElementById('char-race').value = d.race || "";
            document.getElementById('char-class').value = d.class || "";
            
            // DUAL LEVELS
            document.getElementById('char-level').value = d.charLevel || 1; // Base Level
            document.getElementById('char-class-level').value = d.classLevel || 1; // Class Level
            
            // 2. STATS & NEW BONUSES
            document.getElementById('char-body').value = d.body || 0;
            document.getElementById('char-mind').value = d.mind || 0;
            document.getElementById('char-spirit').value = d.spirit || 0;
            
            document.getElementById('char-hp-bonus-input').value = d.hpMaxBonus || 0;
            document.getElementById('char-mp-bonus-input').value = d.mpMaxBonus || 0;

            // 3. RESOURCES & EXP
            const hpCur = d.hpCurrent || 0;
            const mpCur = d.mpCurrent || 0;

            const hpInput = document.getElementById('char-hp-current');
            hpInput.dataset.trueValue = hpCur;           // Hides the exact decimal (e.g. 10.5)
            hpInput.value = Math.floor(hpCur);           // Shows the integer (e.g. 10)

            const mpInput = document.getElementById('char-mp-current');
            mpInput.dataset.trueValue = mpCur;
            mpInput.value = Math.floor(mpCur);
            
            document.getElementById('char-hp-max').value = d.hpMax || 10;
            document.getElementById('char-mp-max').value = d.mpMax || 10;
            
            document.getElementById('char-exp-current').value = d.expCurrent || 0;
            document.getElementById('char-exp-max').value = d.expMax || 1000;

            // 4. GALLERY & SKILLS
            renderGallery(d.gallery || [], d.portrait || "");
            renderSkills(d); // We'll build this next to show the Pyramid

            // 5. UI NAVIGATION
            document.getElementById('char-selection-view').classList.add('hide-default');
            document.getElementById('char-sheet-view').classList.remove('hide-default');
            
            updateHUD(d);
            firestore.collection('users').doc(user.uid).update({ lastActiveCharacter: id });
        }
    });
}

async function deleteCharacter(event, charId, name) {
    event.stopPropagation(); // Stops selectCharacter from firing
    
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    try {
        const user = auth.currentUser;
        await firestore.collection('users').doc(user.uid).collection('characters').doc(charId).delete();
        
        if (currentCharacterId === charId) {
            currentCharacterId = null;
            goBackToSelection();
        }
        
        loadUserCharacters();
    } catch (err) {
        alert("Error: " + err.message);
    }
}

function saveCharacter() {
    if (!currentCharacterId) return;
    
    // 1. Get raw stat values
    const body = parseInt(document.getElementById('char-body').value) || 0;
    const mind = parseInt(document.getElementById('char-mind').value) || 0;
    const spirit = parseInt(document.getElementById('char-spirit').value) || 0;
    
    // 2. Get bonus values (if you've added the inputs to your HTML)
    const hpBonus = parseInt(document.getElementById('char-hp-bonus-input')?.value) || 0;
    const mpBonus = parseInt(document.getElementById('char-mp-bonus-input')?.value) || 0;

    // 3. Prepare the update object
    const data = {
        name: document.getElementById('char-name').value,
        race: document.getElementById('char-race').value,
        class: document.getElementById('char-class').value,
        
        // DUAL TRACK LEVELS
        charLevel: parseInt(document.getElementById('char-level').value) || 1,
        classLevel: parseInt(document.getElementById('char-class-level')?.value) || 1,
        
        // STATS & BONUSES
        body: body,
        mind: mind,
        spirit: spirit,
        hpMaxBonus: hpBonus,
        mpMaxBonus: mpBonus,

        // CALCULATED TOTALS (Stat * 5 + Bonus + 10 base)
        hpMax: (body * 5) + hpBonus + 10,
        mpMax: (spirit * 5) + mpBonus + 10,

        // CURRENT RESOURCES & EXP
        hpCurrent: parseFloat(document.getElementById('char-hp-current').value) || 0,
        mpCurrent: parseFloat(document.getElementById('char-mp-current').value) || 0,
        expCurrent: parseInt(document.getElementById('char-exp-current').value) || 0,
        expMax: parseInt(document.getElementById('char-exp-max').value) || 1000
        
        // Note: We do NOT include 'basicSkills', 'intSkills', etc. here 
        // because we want those to be updated only by specific skill functions.
    };

    firestore.collection('users').doc(auth.currentUser.uid)
        .collection('characters').doc(currentCharacterId)
        .update(data).then(() => {
            updateHUD(data);
            console.log("System: Character state synchronized.");
        });
}

function goBackToSelection() {
    document.getElementById('char-selection-view').classList.remove('hide-default');
    document.getElementById('char-sheet-view').classList.add('hide-default');
}



/* ==========================================
   --- 10. HUD HANDLING ---
   ========================================== */

function updateHUD(char) {
    const hud = document.getElementById('active-char-hud');
    if (!hud) return;
    hud.classList.remove('hide-default');
    
    // 1. Names and Dual-Level Metadata
    document.getElementById('hud-name').innerText = char.name || "Unnamed";
    
    // Show both Character Level and Class Level in the HUD
    const charLv = char.charLevel || 1;
    const classLv = char.classLevel || 1;
    const raceClassText = `Lv.${charLv} (${char.class || 'Adventurer'} Lv.${classLv})`;
    document.getElementById('hud-meta').innerText = raceClassText;
    
    // 2. Text Resources with Bonus Visualization (Rounded down for display)
    const hpBonus = char.hpMaxBonus || 0;
    const mpBonus = char.mpMaxBonus || 0;

    // Regen Formula
    document.getElementById('hud-hp-text').innerText = 
        `${Math.floor(char.hpCurrent || 0)}/${Math.floor(char.hpMax || 10)} ${hpBonus > 0 ? '(+' + hpBonus + ')' : ''}`;
    document.getElementById('hud-mp-text').innerText = 
        `${Math.floor(char.mpCurrent || 0)}/${Math.floor(char.mpMax || 10)} ${mpBonus > 0 ? '(+' + mpBonus + ')' : ''}`;
    
    // 3. New Modifier Calculation: Stat / 2
    const getMod = (val) => {
        const mod = Math.floor((val || 0) / 2); // Stat divided by 2, rounded down
        return mod >= 0 ? `+${mod}` : mod;
    };
    
    document.getElementById('hud-mod-body').innerText = getMod(char.body);
    document.getElementById('hud-mod-mind').innerText = getMod(char.mind);
    document.getElementById('hud-mod-spirit').innerText = getMod(char.spirit);

    // 4. Progress Bars (HP, MP, and EXP)
    const hpPerc = Math.min(((char.hpCurrent || 0) / (char.hpMax || 10)) * 100, 100);
    const mpPerc = Math.min(((char.mpCurrent || 0) / (char.mpMax || 10)) * 100, 100);
    const expPerc = Math.min(((char.expCurrent || 0) / (char.expMax || 1000)) * 100, 100);

    document.getElementById('hud-hp-fill').style.width = hpPerc + "%";
    document.getElementById('hud-mp-fill').style.width = mpPerc + "%";
    
    const expFill = document.getElementById('hud-exp-fill');
    if (expFill) {
        expFill.style.width = expPerc + "%";
    }

    // 5. Portrait
    if (char.portrait !== undefined) {
        const portraitEl = document.getElementById('hud-portrait');
        if (char.portrait) {
            portraitEl.style.backgroundImage = `url(${char.portrait})`;
        } else {
            portraitEl.style.backgroundImage = "none";
        }
    }
}


// ==========================================
// --- 11. DICE ROLLER & CHATBOX (RTDB) ---
// ==========================================

function handleChatEnter(event) {
    if (event.key === "Enter") {
        sendChatMessage();
    }
}

function sendChatMessage() {
    const input = document.getElementById('chat-msg-input');
    const text = input.value.trim();
    
    if (!text || !currentCharacterId) return; // Prevent empty messages or sending while not logged in
    
    const charName = document.getElementById('hud-name').innerText || "Unknown";
    
    const payload = {
        type: 'chat',
        name: charName,
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    // Push to the new shared chatbox stream
    rtdb.ref(`instance_logs/${currentCampaignId}/chatbox`).push(payload);
    input.value = ''; // Clear the input box
}

// Master function to announce EXP or items to the room
function sendSystemMessage(text) {
    if (!currentCampaignId) return;
    
    const payload = {
        type: 'system',
        name: 'System',
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    
    rtdb.ref(`instance_logs/${currentCampaignId}/chatbox`).push(payload);
}

function rollDice(sides, btn) {
    const numDisplay = btn.querySelector('.roll-number');
    
    if (btn.rollInterval) clearInterval(btn.rollInterval);
    if (btn.resetTimeout) clearTimeout(btn.resetTimeout);
    
    btn.classList.add('active-roll');
    
    let rolls = 0;
    btn.rollInterval = setInterval(() => {
        numDisplay.innerText = Math.floor(Math.random() * sides) + 1;
        
        if (++rolls > 12) {
            clearInterval(btn.rollInterval);
            const finalRoll = Math.floor(Math.random() * sides) + 1;
            numDisplay.innerText = finalRoll;
            
            if (currentCharacterId) {
                const charName = document.getElementById('hud-name').innerText || "Unknown";
                
                // NEW: Added type 'roll'
                const payload = {
                    type: 'roll',
                    name: charName,
                    sides: sides,
                    result: finalRoll,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                };

                rtdb.ref(`instance_logs/${currentCampaignId}/chatbox`).push(payload);
            }
            
            btn.resetTimeout = setTimeout(() => {
                btn.classList.remove('active-roll');
            }, 3000);
        }
    }, 40);
}

function initDiceLogListener() {
    // Note: We use the same function name so your existing code calls it normally
    rtdb.ref(`instance_logs/${currentCampaignId}/chatbox`).off();

    // Pull the last 50 messages instead of 10 so people can read back
    rtdb.ref(`instance_logs/${currentCampaignId}/chatbox`).limitToLast(50).on('child_added', (snapshot) => {
        const data = snapshot.val();
        renderChatLogEntry(data);
    });
}

function renderChatLogEntry(data) {
    const log = document.getElementById('dice-log');
    if (!log) return;

    const placeholder = log.querySelector('.dice-log-placeholder');
    if (placeholder) placeholder.remove();

    const entry = document.createElement('div');
    
    // Sort the HTML based on what type of message it is
    if (data.type === 'system') {
        entry.className = 'chat-entry system-type';
        entry.innerHTML = `<span><strong>[System]:</strong> ${data.text}</span>`;
    } 
    else if (data.type === 'roll') {
        entry.className = 'chat-entry roll-type';
        entry.innerHTML = `<span class="chat-name">${data.name}</span> rolled a d${data.sides}: <span class="roll-result">${data.result}</span>`;
    } 
    else {
        // Default to text chat
        entry.className = 'chat-entry';
        entry.innerHTML = `<span class="chat-name">${data.name}:</span> <span>${data.text}</span>`;
    }
    
    // Prepend puts newest at the bottom because of our CSS flex-direction: column-reverse
    log.prepend(entry); 
    
    // Keep the DOM clean by removing old elements if it gets above 50
    if (log.children.length > 50) {
        log.removeChild(log.lastChild);
    }
}



/* ==========================================
   --- 12. GALLERY MANAGEMENT ---
   ========================================== */
const MAX_SLOTS = 10;

// 1. Triggered when you click an empty [+] slot
function handleSlotUpload(input) {
    const file = input.files[0];
    if (!file || !currentCharacterId) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // Resize to 800px max for Firestore safety
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height, max = 800;
            if (w > h) { if (w > max) { h *= max / w; w = max; } } 
            else { if (h > max) { w *= max / h; h = max; } }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            
            saveImageToNextSlot(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// 2. Saves the resized image string to Firestore
function saveImageToNextSlot(base64Data) {
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);

    charRef.get().then(doc => {
        let gallery = doc.data().gallery || [];
        if (gallery.length >= MAX_SLOTS) return alert("Gallery Full!");
        
        gallery.push(base64Data);
        const updateData = { gallery: gallery };
        
        // If this is the first image ever, make it the portrait
        if (!doc.data().portrait) updateData.portrait = base64Data;
        
        charRef.update(updateData).then(() => {
            // RE-RENDER: This puts the new image on the screen
            renderGallery(gallery, doc.data().portrait || base64Data);
            
            // If we just set a new portrait, update the HUD too
            if (updateData.portrait) {
                document.getElementById('hud-portrait').style.backgroundImage = `url(${base64Data})`;
            }
        });
    });
}

// 3. DRAWING THE GRID (THE ESSENTIAL PART)
function renderGallery(galleryArray, activePortrait) {
    const container = document.getElementById('char-gallery-grid');
    if (!container) return;
    container.innerHTML = "";

    const images = galleryArray || [];

    for (let i = 0; i < MAX_SLOTS; i++) {
        const slot = document.createElement('div');
        slot.className = 'gallery-item';

        if (images[i]) {
            // OCCUPIED SLOT: Show the image
            const isActive = images[i] === activePortrait;
            if (isActive) slot.classList.add('active-img');
            
            slot.innerHTML = `
                <img src="${images[i]}" onclick="setActivePortrait('${images[i]}')">
                <button class="delete-img-btn" onclick="deleteImage(event, ${i})">×</button>
            `;
        } else {
            // EMPTY SLOT: Show the [+] button
            slot.className = 'gallery-item empty-slot';
            slot.innerHTML = `<i class="fa-solid fa-plus"></i>`;
            slot.onclick = () => document.getElementById('slot-upload').click();
        }
        container.appendChild(slot);
    }
}

// 4. Sets which image appears in the HUD and Selection Grid
function setActivePortrait(imgData) {
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);
    
    charRef.update({ portrait: imgData }).then(() => {
        // Update HUD instantly
        document.getElementById('hud-portrait').style.backgroundImage = `url(${imgData})`;
        loadUserCharacters(); // Update the tiny circle in selection grid
        
        // Re-render gallery to move the "active" green border
        charRef.get().then(doc => renderGallery(doc.data().gallery, imgData));
    });
}

// 5. Removes image and handles portrait fallback
function deleteImage(event, index) {
    event.stopPropagation();
    if (!confirm("Delete this image?")) return;

    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);

    charRef.get().then(doc => {
        let gallery = doc.data().gallery || [];
        const deletedImg = gallery[index];
        gallery.splice(index, 1);

        const updateData = { gallery: gallery };
        
        // If we deleted the one they were using as a portrait, pick the first available one
        if (doc.data().portrait === deletedImg) {
            updateData.portrait = gallery.length > 0 ? gallery[0] : "";
        }

        charRef.update(updateData).then(() => {
            renderGallery(gallery, updateData.portrait);
            // Sync HUD and Selection view
            document.getElementById('hud-portrait').style.backgroundImage = `url(${updateData.portrait || ''})`;
            loadUserCharacters();
        });
    });
}



/* ==========================================
   --- 13. MASTER CONTROL PANEL ---
   ========================================== */



function openMasterPanel() {
    const role = window.currentUserRole;

    // 1. Security check - if somehow a Player gets here, kick them out
    if (role !== 'Master' && role !== 'Admin') {
        alert("Access Denied: Specialized clearance required.");
        openTab('tab-character'); // Redirect back to character sheet
        return;
    }

    // 2. Handle Admin-Only visibility for Account Management
    const accountBtn = document.querySelector('[onclick*="sub-accounts"]');
    
    if (accountBtn) {
        if (role === 'Admin') {
            accountBtn.style.display = 'block';
            loadUserList(); // Only Admins fetch the user database
        } else {
            accountBtn.style.display = 'none';
            
            // If a Master opens the panel, move them to the first tab they ARE allowed to see
            const groupsBtn = document.querySelector('[onclick*="sub-instances"]');
            if (groupsBtn) {
                groupsBtn.click(); 
            }
        }
    }
}


// Fetches all users from Firestore and displays them in the Admin panel
async function loadUserList() {
    const listContainer = document.getElementById('admin-user-list');
    listContainer.innerHTML = '<p style="padding: 20px; text-align: center;">Fetching database...</p>';

    try {
        const snapshot = await firestore.collection('users').get();
        listContainer.innerHTML = ""; 

        snapshot.forEach(doc => {
            const user = doc.data();
            const row = document.createElement('div');
            const displayRole = user.role || 'Player';
            
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '2fr 1fr';
            row.style.padding = '12px 10px';
            row.style.borderBottom = '1px solid #18181b';
            row.style.alignItems = 'center';

            // Use data-userid to identify this row later
            row.innerHTML = `
                <span style="font-size: 0.85rem; color: #e4e4e7;">${user.email || 'Anonymous'}</span>
                <select class="role-selector form-input" data-userid="${doc.id}" style="padding: 5px; font-size: 0.8rem;">
                    <option value="Player" ${displayRole === 'Player' ? 'selected' : ''}>Player</option>
                    <option value="Master" ${displayRole === 'Master' ? 'selected' : ''}>Master</option>
                    <option value="Admin" ${displayRole === 'Admin' ? 'selected' : ''}>Admin</option>
                </select>
            `;
            listContainer.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading user list:", error);
        listContainer.innerHTML = '<p style="color: #ef4444;">Error fetching users.</p>';
    }
}

// Collects all dropdown values and saves them to Firestore in a single batch
 
async function saveAllUserRoles() {
    const selectors = document.querySelectorAll('.role-selector');
    const batch = firestore.batch(); 
    let changesCount = 0;

    selectors.forEach(select => {
        const userId = select.getAttribute('data-userid');
        const newRole = select.value;
        
        const userRef = firestore.collection('users').doc(userId);
        batch.update(userRef, { role: newRole });
        changesCount++;
    });

    try {
        await batch.commit(); 
        alert(`Successfully updated ${changesCount} accounts!`);
        loadUserList(); // Refresh the UI
    } catch (error) {
        console.error("Error saving roles:", error);
        alert("Failed to save changes. You might not have Admin permissions in Firestore Rules.");
    }
}


// Loads all instances where the current user is a Master
async function loadInstanceList() {
    const listContainer = document.getElementById('admin-instance-list');
    const user = auth.currentUser;
    if (!listContainer || !user) return;

    try {
        // Fetch only instances where YOU are a Master
        const snapshot = await firestore.collection('instances')
            .where('masters', 'array-contains', user.uid)
            .get();

        if (snapshot.empty) {
            listContainer.innerHTML = `<p class="text-center" style="opacity: 0.5; padding: 20px;">No active instances found for this Master.</p>`;
            return;
        }

        let html = `<table class="admin-table">
            <thead><tr><th>World Name</th><th>Join Code</th><th>Masters</th><th>Actions</th></tr></thead>
            <tbody>`;

        snapshot.forEach(doc => {
            const data = doc.data();
            const id = doc.id; // Added this variable back in
            html += `
                <tr>
                    <td><strong>${data.name || 'Unnamed World'}</strong></td>
                    <td><code class="join-code-pill">${data.joinCode || 'N/A'}</code></td>
                    <td>${data.masters ? data.masters.length : 1}</td>
                    <td>
                        <div class="flex-row" style="gap: 5px;">
                            <button class="btn-small" onclick="viewInstanceDetails('${id}')">Manage</button>
                            <button class="btn-danger-small" onclick="deleteInstance('${id}', '${data.name}')">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        });

        html += `</tbody></table>`;
        listContainer.innerHTML = html;
    } catch (error) {
        console.error("Registry Error:", error);
        listContainer.innerHTML = `<p class="text-center" style="color: #ef4444; padding: 20px;">Database error. Check Firestore Index.</p>`;
    }
}

async function spawnInstance() {
    const nameInput = document.getElementById('new-instance-name');
    const instanceName = nameInput.value.trim();
    const currentUser = auth.currentUser;

    if (!instanceName) return alert("Please name your instance!");

    try {
        // 1. Create the Instance Record in Firestore
        const instanceRef = await firestore.collection('instances').add({
            name: instanceName,
            masters: [currentUser.uid],
            members: [currentUser.uid],
            joinCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            isActive: true
        });

        const instanceId = instanceRef.id;

        // 2. Initialize the Clock "Heartbeat" in RTDB
        await rtdb.ref(`instance_clocks/${instanceId}`).set({
            totalCustomSeconds: 32400, // 09:00 AM
            speedMultiplier: 1,
            isRunning: false,
            lastRealWorldSaveTime: Date.now()
        });

        nameInput.value = "";
        alert(`Instance spawned!`);
        loadInstanceList(); 

    } catch (error) {
        console.error("Spawn Error:", error);
    }
}

function viewInstanceDetails(instanceId) {
    currentCampaignId = instanceId; // Update the ID
    initClockListener();           // REBOOT THE BRAIN
    alert("Controls now synced to Instance: " + instanceId);
}

// Deletes an instance from both Firestore and Realtime Database
async function deleteInstance(instanceId, name) {
    if (!confirm(`Are you sure you want to PERMANENTLY delete "${name}"? This cannot be undone.`)) return;

    try {
        // 1. Remove from Firestore (Permissions & Metadata)
        await firestore.collection('instances').doc(instanceId).delete();

        // 2. Remove from RTDB (The Live Clock)
        await rtdb.ref(`instance_clocks/${instanceId}`).remove();

        alert("Instance deleted successfully.");
        loadInstanceList(); // Refresh the table
    } catch (error) {
        console.error("Delete Error:", error);
        alert("Failed to delete instance. Check console.");
    }
}


async function loadGlobalCharacterManager() {
    const listContainer = document.getElementById('admin-character-list'); 
    if (!listContainer) return;

    listContainer.innerHTML = '<p class="text-center" style="opacity:0.5;">Scanning all realms...</p>';

    try {
        const instanceSnap = await firestore.collection('instances').get();
        let instances = [];
        instanceSnap.forEach(doc => instances.push({ id: doc.id, name: doc.data().name }));

        const usersSnap = await firestore.collection('users').get();
        
        let html = `
            <div class="flex-row" style="justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <input type="text" id="char-search-input" class="form-input" placeholder="Search character or owner..." onkeyup="filterCharacterTable()" style="width: 250px;">
                <div class="flex-row" style="gap: 10px;">
                    <button class="btn-primary" style="background-color: #059669; border-color: #059669;" onclick="saveAllCharacterInstances()">Save All Assignments</button>
                    <button class="btn-secondary" onclick="loadGlobalCharacterManager()"><i class="fa-solid fa-rotate-right"></i> Refresh</button>
                </div>
            </div>
            
            <table class="admin-table" id="admin-char-table">
            <thead><tr><th>Character</th><th>Owner</th><th>Current World</th><th>Action</th></tr></thead>
            <tbody>`;

        for (const userDoc of usersSnap.docs) {
            const charSnap = await firestore.collection('users').doc(userDoc.id).collection('characters').get();
            
            charSnap.forEach(charDoc => {
                const charData = charDoc.data();
                const ownerEmail = userDoc.data().email || "Unknown";
                
                html += `
                    <tr>
                        <td><strong>${charData.name}</strong></td>
                        <td><small>${ownerEmail}</small></td>
                        <td>
                            <select class="realm-assign-select form-input" data-uid="${userDoc.id}" data-cid="${charDoc.id}" style="padding: 5px; font-size: 0.8rem; width: 100%;">
                                <option value="global">Global (None)</option>
                                ${instances.map(inst => `
                                    <option value="${inst.id}" ${charData.instanceId === inst.id ? 'selected' : ''}>
                                        ${inst.name}
                                    </option>
                                `).join('')}
                            </select>
                        </td>
                        <td>
                             <button class="btn-small" onclick="openCharacterManagerModal('${userDoc.id}', '${charDoc.id}')">Edit</button>
                        </td>
                    </tr>`;
            });
        }

        html += `</tbody></table>`; 
        listContainer.innerHTML = html;

    } catch (error) {
        console.error("Char Manager Error:", error);
        listContainer.innerHTML = `<p style="color: #ef4444;">Error fetching global characters.</p>`;
    }
}

async function saveAllCharacterInstances() {
    // 1. Find all dropdowns we just generated using the exact class
    const selectors = document.querySelectorAll('.realm-assign-select');
    
    // Safety check
    if (selectors.length === 0) {
        alert("System Error: No dropdowns found to save.");
        return;
    }

    const batch = firestore.batch(); 
    let changesCount = 0;
    let activeCharMoved = false; 

    // 2. Loop through every dropdown and queue a database update
    selectors.forEach(select => {
        // Pull the exact IDs we embedded in the HTML
        const userId = select.getAttribute('data-uid');
        const charId = select.getAttribute('data-cid');
        
        if (!userId || !charId) return; // Skip if somehow missing

        const newInstanceId = select.value;
        const newInstanceName = select.options[select.selectedIndex].text.trim();
        
        const charRef = firestore.collection('users').doc(userId).collection('characters').doc(charId);
        
        // Add to the batch
        batch.update(charRef, { 
            instanceId: newInstanceId,
            instanceName: newInstanceName 
        });
        changesCount++;

        // 3. Update Master's view if they moved their current character
        if (currentCharacterId === charId && currentCampaignId !== newInstanceId) {
            currentCampaignId = newInstanceId;
            activeCharMoved = true;
        }
    });

    // 4. Commit to Firestore
    try {
        await batch.commit(); 
        alert(`Successfully saved ${changesCount} character assignments!`);
        
        if (activeCharMoved) {
            initClockListener();
            if (typeof initDiceLogListener === "function") initDiceLogListener();
        }
        
        loadGlobalCharacterManager(); // Reload the table
    } catch (error) {
        console.error("Batch Save Error:", error);
        alert("Failed to save. Check the console for permissions errors.");
    }
}


function filterCharacterTable() {
    const input = document.getElementById('char-search-input');
    const filter = input.value.toLowerCase();
    const table = document.getElementById('admin-char-table');
    const tr = table.getElementsByTagName('tr');

    // Loop through all table rows, starting at 1 to skip the header row
    for (let i = 1; i < tr.length; i++) {
        // Look at the Character Name (column 0) and Owner Email (column 1)
        const charNameCol = tr[i].getElementsByTagName('td')[0];
        const ownerCol = tr[i].getElementsByTagName('td')[1];
        
        if (charNameCol || ownerCol) {
            const charName = charNameCol.textContent || charNameCol.innerText;
            const owner = ownerCol.textContent || ownerCol.innerText;
            
            // If the search text is in either the name or the email, show the row. Otherwise, hide it.
            if (charName.toLowerCase().indexOf(filter) > -1 || owner.toLowerCase().indexOf(filter) > -1) {
                tr[i].style.display = "";
            } else {
                tr[i].style.display = "none";
            }
        }
    }
}


async function openCharacterManagerModal(uid, cid) {
    // 1. Store the IDs secretly in the modal so the save function knows who to update
    document.getElementById('edit-modal-uid').value = uid;
    document.getElementById('edit-modal-cid').value = cid;

    try {
        // 2. Fetch their exact current stats from Firestore
        const charRef = firestore.collection('users').doc(uid).collection('characters').doc(cid);
        const doc = await charRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            
            // 3. Fill in the modal inputs
            document.getElementById('edit-modal-title').innerText = `Editing: ${data.name}`;
            document.getElementById('edit-modal-exp').value = data.exp || 0;
            document.getElementById('edit-modal-hp').value = data.hpCurrent || 0;
            document.getElementById('edit-modal-mp').value = data.mpCurrent || 0;
            document.getElementById('edit-modal-gold').value = data.gold || 0;
            document.getElementById('edit-modal-body').value = data.body || 0;
            document.getElementById('edit-modal-mind').value = data.mind || 0;
            document.getElementById('edit-modal-spirit').value = data.spirit || 0;

            // 4. Unhide the modal
            const modal = document.getElementById('master-char-edit-modal');
            modal.classList.remove('hide-default');
        }
    } catch (error) {
        console.error("Error fetching character details:", error);
        alert("Failed to load character data. Check console.");
    }
}

function closeCharacterManagerModal() {
    const modal = document.getElementById('master-char-edit-modal');
    modal.classList.add('hide-default');
}

function addExpQuick(amount) {
    const expInput = document.getElementById('edit-modal-exp');
    let currentExp = parseInt(expInput.value) || 0;
    
    // NOTE FOR LATER: This is exactly where we will inject the logic to check their backpack 
    // for "+15% EXP Amulets" and multiply the 'amount' before adding it!
    
    expInput.value = currentExp + amount;
}


async function saveCharacterManagerEdits() {
    const uid = document.getElementById('edit-modal-uid').value;
    const cid = document.getElementById('edit-modal-cid').value;
    
    // 1. Gather all inputs
    const newExp = parseInt(document.getElementById('edit-modal-exp').value) || 0;
    const newHp = parseInt(document.getElementById('edit-modal-hp').value) || 0;
    const newMp = parseInt(document.getElementById('edit-modal-mp').value) || 0;
    const newGold = parseInt(document.getElementById('edit-modal-gold').value) || 0;
    
    const newBody = parseInt(document.getElementById('edit-modal-body').value) || 0;
    const newMind = parseInt(document.getElementById('edit-modal-mind').value) || 0;
    const newSpirit = parseInt(document.getElementById('edit-modal-spirit').value) || 0;

    try {
        const charRef = firestore.collection('users').doc(uid).collection('characters').doc(cid);
        const oldDoc = await charRef.get();
        const oldData = oldDoc.data();
        
        // 2. Recalculate Max Values based on your existing formula: (Stat * 5) + Bonus + 10
        const hpBonus = oldData.hpMaxBonus || 0;
        const mpBonus = oldData.mpMaxBonus || 0;
        const calcHpMax = (newBody * 5) + hpBonus + 10;
        const calcMpMax = (newSpirit * 5) + mpBonus + 10;

        // 3. Update Database
        await charRef.update({
            expCurrent: newExp,
            hpCurrent: newHp,
            hpMax: calcHpMax, // Auto-sync max to the new Body stat
            mpCurrent: newMp,
            mpMax: calcMpMax, // Auto-sync max to the new Spirit stat
            gold: newGold,
            body: newBody,
            mind: newMind,
            spirit: newSpirit
        });

        // 4. Log the changes
        const expGained = newExp - (oldData.expCurrent || 0);
        if (expGained !== 0) {
            sendSystemMessage(`${oldData.name} EXP adjusted by ${expGained}.`);
        }
        
        // Optional: announce stat changes if you want the players to know
        // sendSystemMessage(`${oldData.name}'s core attributes were adjusted by the Master.`);

        closeCharacterManagerModal();
        
    } catch (error) {
        console.error("Error saving character edits:", error);
        alert("Failed to save. Check console.");
    }
}

// --- RACE REGISTRY LOGIC ---
async function createMasterRace() {
    const name = document.getElementById('m-race-name').value.trim();
    const body = parseInt(document.getElementById('m-race-body').value) || 0;
    const mind = parseInt(document.getElementById('m-race-mind').value) || 0;
    const spirit = parseInt(document.getElementById('m-race-spirit').value) || 0;
    const speed = parseInt(document.getElementById('m-race-speed').value) || 30;
    const desc = document.getElementById('m-race-desc').value.trim();
    
    const traitsRaw = document.getElementById('m-race-traits').value;
    const traitsArray = traitsRaw.split(',').map(t => t.trim()).filter(t => t !== "");

    if (!name) return alert("Race name required!");

    try {
        await firestore.collection('master_races').add({
            name, bodyMod: body, mindMod: mind, spiritMod: spirit, 
            baseSpeed: speed, description: desc, traits: traitsArray,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        document.getElementById('m-race-name').value = "";
        document.getElementById('m-race-traits').value = "";
        document.getElementById('m-race-desc').value = "";
        
        loadMasterRaceList();
    } catch (e) { console.error(e); }
}

async function loadMasterRaceList() {
    const list = document.getElementById('master-race-list');
    if (!list) return;

    const snap = await firestore.collection('master_races').orderBy('name').get();
    list.innerHTML = "";

    snap.forEach(doc => {
        const d = doc.data();
        const card = document.createElement('div');
        card.className = "panel-card mb-s";
        card.style.background = "#18181b";
        
        const traitTags = (d.traits || []).map(t => 
            `<span style="background:#064e3b; color:#a7f3d0; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-right:4px;">${t}</span>`
        ).join('');

        card.innerHTML = `
            <div class="flex-row" style="justify-content: space-between; align-items: flex-start;">
                <div>
                    <strong style="color: #10b981;">${d.name}</strong>
                    <div class="mt-s" style="margin-bottom:8px;">${traitTags}</div>
                    <p style="font-size: 0.8rem; opacity: 0.8;">${d.description || 'No description.'}</p>
                    <div style="font-size: 0.7rem; color: #71717a;">
                        Mods: B+${d.bodyMod} M+${d.mindMod} S+${d.spiritMod} | Spd: ${d.baseSpeed}
                    </div>
                </div>
                <button class="btn-danger-small" onclick="deleteMasterAsset('master_races', '${doc.id}', loadMasterRaceList)">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        list.appendChild(card);
    });
}

// --- CLASS REGISTRY LOGIC ---
async function createMasterClass() {
    const name = document.getElementById('m-class-name').value.trim();
    const tier = parseInt(document.getElementById('m-class-tier').value);
    const mainStat = document.getElementById('m-class-main-stat').value;
    const hpPerLv = parseInt(document.getElementById('m-class-hp').value) || 0;
    const mpPerLv = parseInt(document.getElementById('m-class-mp').value) || 0;
    const reqs = document.getElementById('m-class-reqs').value.trim(); // NEW
    const desc = document.getElementById('m-class-desc').value.trim();
    
    const traitsRaw = document.getElementById('m-class-traits').value;
    const traitsArray = traitsRaw.split(',').map(t => t.trim()).filter(t => t !== "");

    if (!name) return alert("Class name required!");

    try {
        await firestore.collection('master_classes').add({
            name, 
            tier,
            mainStat,
            hpPerLv, 
            mpPerLv, 
            requirements: reqs, // Saved for unlock logic later
            description: desc, 
            traits: traitsArray,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Reset Form
        document.getElementById('m-class-name').value = "";
        document.getElementById('m-class-reqs').value = "";
        document.getElementById('m-class-desc').value = "";
        
        loadMasterClassList();
    } catch (e) { console.error(e); }
}

async function loadMasterClassList() {
    const list = document.getElementById('master-class-list');
    if (!list) return;

    // Order by Tier then Name
    const snap = await firestore.collection('master_classes').orderBy('tier').orderBy('name').get();
    list.innerHTML = "";

    snap.forEach(doc => {
        const d = doc.data();
        const card = document.createElement('div');
        card.className = "panel-card mb-s";
        card.style.borderLeft = `4px solid ${d.tier == 3 ? '#fbbf24' : d.tier == 2 ? '#6366f1' : '#71717a'}`;
        card.style.background = "#18181b";
        
        const traitTags = (d.traits || []).map(t => 
            `<span style="background:#312e81; color:#c7d2fe; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-right:4px;">${t}</span>`
        ).join('');

        card.innerHTML = `
            <div class="flex-row" style="justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                    <div class="flex-row" style="gap: 10px;">
                        <strong style="color: #e4e4e7; font-size: 1.1rem;">${d.name}</strong>
                        <span style="font-size: 0.65rem; background: #27272a; padding: 2px 8px; border-radius: 10px; color: #a1a1aa;">Tier ${d.tier}</span>
                    </div>
                    <div style="margin: 8px 0;">${traitTags}</div>
                    <p style="font-size: 0.85rem; opacity: 0.8; margin-bottom: 8px;">${d.description || 'No description.'}</p>
                    <div style="font-size: 0.75rem; color: #a855f7; font-weight: bold;">
                        MAIN STAT: ${d.mainStat} | HP/Lv: +${d.hpPerLv} | MP/Lv: +${d.mpPerLv}
                    </div>
                </div>
                <button class="btn-danger-small" onclick="deleteMasterAsset('master_classes', '${doc.id}', loadMasterClassList)">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        list.appendChild(card);
    });
}

// --- MASTER SKILLS REGISTRY LOGIC ---
async function createMasterSkill() {
    const name = document.getElementById('ms-name').value.trim();
    const tier = document.getElementById('ms-tier').value;
    const classTag = document.getElementById('ms-class-tag').value;
    const classLvReq = parseInt(document.getElementById('ms-class-lv-req').value) || 1;
    const scalingStat = document.getElementById('ms-scaling-stat').value;
    const desc = document.getElementById('ms-desc').value.trim();

    if (!name) return alert("Skill name is required!");

    try {
        await firestore.collection('master_skills').add({
            name,
            tier,
            classTag,
            classLvReq,
            scalingStat,
            description: desc,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Reset fields
        document.getElementById('ms-name').value = "";
        document.getElementById('ms-desc').value = "";
        
        alert(`${name} added to global library.`);
        loadMasterSkillList(); 
    } catch (error) {
        console.error("Error creating skill:", error);
    }
}

async function loadMasterSkillList() {
    const listContainer = document.getElementById('master-skill-list');
    if (!listContainer) return;

    try {
        const snapshot = await firestore.collection('master_skills').orderBy('name').get();
        listContainer.innerHTML = "";

        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="text-center opacity-50">No skills registered yet.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const s = doc.data();
            const card = document.createElement('div');
            card.className = 'panel-card mb-s';
            card.style.background = '#18181b';
            
            card.innerHTML = `
                <div class="flex-row" style="justify-content: space-between; align-items: flex-start;">
                    <div>
                        <strong style="color: #a855f7;">${s.name}</strong>
                        <div style="font-size: 0.7rem; color: #71717a; text-transform: uppercase; margin-top: 4px;">
                            ${s.classTag} (Req. Class Lv.${s.classLvReq}) | Scales: ${s.scalingStat}
                        </div>
                        <p style="font-size: 0.85rem; margin-top: 8px; opacity: 0.8;">${s.description || 'No description.'}</p>
                    </div>
                    <button class="btn-danger-small" onclick="deleteMasterAsset('master_skills', '${doc.id}', loadMasterSkillList)">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            listContainer.appendChild(card);
        });
    } catch (error) {
        console.error("Error loading master skills:", error);
    }
}

async function refreshSkillClassDropdown() {
    const dropdown = document.getElementById('ms-class-tag');
    if (!dropdown) return;

    try {
        const snap = await firestore.collection('master_classes').orderBy('name').get();
        
        // Keep "All Classes", then add the rest
        let html = `<option value="All">All Classes</option>`;
        
        snap.forEach(doc => {
            const className = doc.data().name;
            html += `<option value="${className}">${className}</option>`;
        });

        dropdown.innerHTML = html;
    } catch (e) {
        console.error("Error updating skill dropdown:", e);
    }
}

// Global utility for deleting any master asset
async function deleteMasterAsset(collection, id, callback) {
    if (!confirm("Permanently remove this asset?")) return;
    try {
        await firestore.collection(collection).doc(id).delete();
        callback();
    } catch (e) { console.error(e); }
}

/* ==========================================
   --- 14. SKILLS ---
   ========================================== */


function renderSkills(charData) {
    const container = document.getElementById('skills-container');
    if (!container) return;
    container.innerHTML = ""; // Clear for fresh draw

    const tiers = [
        { key: 'basicSkills', label: 'Basic Skills' },
        { key: 'intSkills', label: 'Intermediate Skills' },
        { key: 'advSkills', label: 'Advanced Skills' }
    ];

    tiers.forEach(tier => {
        const section = document.createElement('div');
        section.className = 'skill-tier-section';
        section.innerHTML = `<h4 class="mt-m mb-s">${tier.label}</h4>`;
        
        const skills = charData[tier.key] || [];
        skills.forEach((s, i) => {
            const perc = Math.min((s.exp / (s.expMax || 10)) * 100, 100);
            const slot = document.createElement('div');
            slot.className = 'skill-slot-card';
            slot.innerHTML = `
                <div class="flex-row" style="justify-content: space-between;">
                    <strong>${s.name || '---'}</strong>
                    <span style="font-size: 0.8rem; opacity: 0.7;">Lv.${s.level}</span>
                </div>
                <div class="skill-exp-bg" style="height: 4px; background: #27272a; margin-top: 5px; border-radius: 2px;">
                    <div class="skill-exp-fill" style="width: ${perc}%; height: 100%; background: #a855f7; border-radius: 2px;"></div>
                </div>
            `;
            section.appendChild(slot);
        });
        container.appendChild(section);
    });
}
