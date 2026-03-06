/*  ===================== Version 0.4.X ======================================   */



/* ==========================================================================
   SECTION 1: CONFIGURATION, STATE & FIREBASE
   ========================================================================== */

// --- 1.1 CONSTANTS ---
const MAX_CHAR_LEVEL = 60;      
const MAX_ALLOCATED_STAT = 20;  
const MAX_GALLERY_SLOTS = 8;
const STAT_RESOURCE_MULT = 5;

// --- 1.2 STATE VARIABLES ---
let totalCustomSeconds = 0; 
let speedMultiplier = 1;
let isRunning = false;
let lastRealTime = Date.now();


window.RPG_APP = {
    role: null,                     // replace currentUserRole
    activeCharId: null,             // replace currentCharacterId 
    campainId: "global",            // replace currentCampaignId
    themeColor: '#3498db',         // new theme color for the future WIP
    isLoaded: false 
};

let currentCampaignId = "global"; 
let currentCharacterId = null; 
let activeCharLevel = 1; 
let characterListener = null;
let currentRaceTraits = [];      // Stores selected traits (e.g. ["Darkvision"])
let currentRaceAttributes = {};  // Stores attributes (e.g. { "body": 2, "speed": 30 })
let attributeDefinitions = {};   // Maps keys to names (e.g. { "body": "Body" })

let pendingStats = { body: 0, mind: 0, spirit: 0 };
let originalStats = { body: 0, mind: 0, spirit: 0 };
let totalAP = 0;

// --- 1.3 FIREBASE INITIALIZATION ---
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


/* ==========================================================================
   SECTION 2: UTILITIES & TOASTS
   ========================================================================== */


/** CONSOLE ERROR MESSAGE ( the bandaid that isn't silent ) */
         function setSafeText(id, value) {
             const el = document.getElementById(id);
             if (el) {
                 el.innerText = value;
             } else {
                 console.warn(`Missing element ID: "${id}" (Value: ${value})`);
             }
         }
         
   /* Safely updates an input's value.*/
         function setSafeValue(id, value) {
             const el = document.getElementById(id);
             if (el) {
                 el.value = value;
             } else {
                 console.warn(`Missing input ID: "${id}" (Value: ${value})`);
             }
         }
/** CONSOLE ERROR MESSAGE ( the bandaid that isn't silent ) */


         function showToast(message) {
             const toast = document.createElement('div');
             toast.className = 'toast-container';
             toast.innerText = message;
             document.body.appendChild(toast);
             setTimeout(() => toast.remove(), 3000);
         }

         async function deleteMasterAsset(collection, id, callback) {
             if (!confirm("Permanently remove this asset?")) return;
             try {
                 await firestore.collection(collection).doc(id).delete();
                 if (callback) callback();
             } catch (e) { console.error(e); }
         }

/* === UNIVERSAL WEBP HANDLER (100% QUALITY) === */
function handleWebPUpload(inputElement, callback, size = 128, quality = 1) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = size;
            canvas.height = size;

            // Your proven crop math
            let sourceSize = Math.min(img.width, img.height);
            let sourceX = (img.width - sourceSize) / 2;
            let sourceY = (img.height - sourceSize) / 2;

            ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
            
            // Generate the WebP string
            const optimizedBase64 = canvas.toDataURL('image/webp', quality);
            
            // FIX: Changed dataURL.length to optimizedBase64.length
            const kbSize = Math.round(optimizedBase64.length / 1024);
            console.log(`WebP ${size}x${size} Processed. Size: ${kbSize} KB | Qual: ${quality}`);
            
            callback(optimizedBase64);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// --- The "Proxy Click"
function triggerInput(inputId) {
    const input = document.getElementById(inputId);
    if (input) input.click();
}

/**
 * A universal tooltip generator for any object or string.
 */
function buildUniversalTooltip(data, header = "") {
    let tooltip = header ? `${header}\n${"=".repeat(header.length)}\n` : "";

    if (!data) return tooltip + "No data available.";

    // Case 1: Handle Arrays (Traits)
    if (Array.isArray(data)) {
        if (data.length === 0) return tooltip + "No traits.";
        return tooltip + "Traits:\n • " + data.join('\n • ');
    }

    // Case 2: Handle Objects (Attributes)
    if (typeof data === 'object') {
        const lines = Object.entries(data).map(([key, val]) => {
            const label = attributeDefinitions[key] || key.replace(/_/g, ' ').toUpperCase();
            return `${label}: ${val}`;
        });
        return tooltip + (lines.length > 0 ? lines.join('\n') : "No attributes.");
    }

    // Case 3: Handle Strings
    return tooltip + data;
}



/* ==========================================================================
   SECTION 3: AUTHENTICATION
   ========================================================================== */

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

function logoutUser() { 
    // 1. Check if the "Stop Button" exists
    if (characterListener && typeof characterListener === 'function') {
        console.log("Stopping active character listener...");
        characterListener(); // This kills the live stream
        characterListener = null; // Clears the variable
    }

    // 2. Now sign out safely
    auth.signOut().then(() => {
        console.log("User signed out successfully.");
        // No location.reload() needed anymore!
    }).catch(err => console.error("Logout Error:", err));
}

auth.onAuthStateChanged((user) => {
    const topNav = document.getElementById('top-nav');
    const appBody = document.querySelector('.app-body');
    const loginTab = document.getElementById('tab-login');

    if (user) {
        
        
        // 3. Get Role from Firestore BEFORE opening any tabs
        firestore.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                window.currentUserRole = data.role || 'Player'; //
                              
                // Step 1- Set UI labels
                document.getElementById('user-display-name').innerText = user.email.split('@')[0];
                document.getElementById('user-role-label').innerText = data.role;

                syncRegistryToDropdowns();
                loadUserCharacters();

                // Step 2- Master and Admin Check
                const isMasterOrAbove = (data.role === 'Master' || data.role === 'Admin'); //
                if (isMasterOrAbove) {
                    document.getElementById('nav-control-panel').classList.remove('hide-default');
                    document.getElementById('master-quick-controls').classList.remove('hide-default');
                }

                if (data.role === 'Admin') {
                    const adminElements = document.querySelectorAll('.admin-only'); //
                    adminElements.forEach(el => el.classList.remove('hide-default')); //
                }
                
                // Step 3- openTab function runs the check to load the correct tab
                const savedTab = localStorage.getItem('activeMainTab');
                if (!savedTab || savedTab === 'tab-login') {
                    openTab('tab-character');
                } else {
                    openTab(savedTab);
                }

                // Step 4- Reveal the "Mother" containers first
                topNav.classList.remove('hide-default');
                appBody.classList.remove('hide-default');
                
                // Step 5- Clear login splash effects
                loginTab.classList.remove('login-splash-mode');
                loginTab.classList.add('hide-default');

                // Step 6- Start listeners
                initClockListener();
                initDiceLogListener();
                if (data.lastActiveCharacter) selectCharacter(data.lastActiveCharacter);
            }
        });

        

    } else {
        // --- LOGGED OUT ---
        window.currentUserRole = null;
        
        // Hide mothers (children like logout-btn inherit this)
        topNav.classList.add('hide-default');
        appBody.classList.add('hide-default');
        
        // Prepare login screen
        loginTab.classList.add('login-splash-mode');
        loginTab.classList.remove('hide-default'); 
        
        openTab('tab-login');
    }
});


/* ==========================================================================
   SECTION 4: UI NAVIGATION
   ========================================================================== */

function openTab(tabId) {
    document.querySelectorAll('.closed-tab').forEach(tab => {
        tab.classList.add('hide-default');
    });

    const target = document.getElementById(tabId);
    if (target) {
        target.classList.remove('hide-default');
    }

    if (tabId !== 'tab-login') {
        localStorage.setItem('activeMainTab', tabId);
    }
    
    if (tabId === 'tab-control-panel' && (window.currentUserRole === 'Master' || window.currentUserRole === 'Admin')) {
        loadInstanceList();
        
        let savedSubTab = localStorage.getItem('activeMasterSubTab') || 'sub-instances';
        if (window.currentUserRole === 'Master' && savedSubTab === 'sub-accounts') {
            savedSubTab = 'sub-instances';
        }

        openControlSubTab(null, savedSubTab); 
    }
}





function openControlSubTab(evt, subTabId) {
    localStorage.setItem('activeMasterSubTab', subTabId);

    const contents = document.getElementsByClassName("control-sub-content");
    for (let content of contents) {
        content.classList.add("hide-default");
    }

    const buttons = document.getElementsByClassName("sub-nav-btn");
    for (let btn of buttons) {
        btn.classList.remove("active");
    }

    document.getElementById(subTabId).classList.remove("hide-default");
    
    if (evt) {
        evt.currentTarget.classList.add("active");
    } else {
        const targetBtn = document.querySelector(`[onclick*="${subTabId}"]`);
        if (targetBtn) targetBtn.classList.add("active");
    }

    // --- LOADER SWITCHBOARD ---
    if (subTabId === 'sub-instances') loadInstanceList();
    if (subTabId === 'sub-accounts') loadUserList();
    if (subTabId === 'sub-characters') loadGlobalCharacterManager();
    if (subTabId === 'sub-classes') loadMasterClassList(); // This triggers Section 10.2
    if (subTabId === 'sub-races') loadMasterRaceList();    // This triggers Section 10.1
    if (subTabId === 'sub-skills') { refreshSkillClassDropdown(); loadSkillRegistry(); }
    if (subTabId === 'sub-traits') loadMasterTraitList();
    if (subTabId === 'sub-attributes') loadAttributeList();
}

function goBackToSelection() {
    // 1. Kill the live listener so it stops watching the database
    if (characterListener) {
        characterListener();
        characterListener = null;
    }
    
    // 2. Clear the active ID
    currentCharacterId = null;

    // 3. Swap the views
    document.getElementById('char-selection-view').classList.remove('hide-default');
    document.getElementById('char-sheet-view').classList.add('hide-default');
    
    // 4. Hide the sidebar HUD since no one is active
    document.getElementById('active-char-hud').classList.add('hide-default');
}


/* ==========================================================================
   SECTION 5: GAME ENGINE (CLOCK & CHAT)
   ========================================================================== */

function initClockListener() {
    rtdb.ref(`instance_clocks`).off(); 
    rtdb.ref(`instance_clocks/${currentCampaignId}`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        isRunning = data.isRunning;
        speedMultiplier = data.speedMultiplier || 1;
        
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

function saveTimeState() {
    const timeData = {
        totalCustomSeconds: totalCustomSeconds,
        isRunning: isRunning,
        lastRealWorldSaveTime: Date.now()
    };
    rtdb.ref(`instance_clocks/${currentCampaignId}`).update(timeData);
}

// --- TICK LOOP ---
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

        // Master Sync
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
setInterval(tick, 100);

function updateDisplay() {
    let tDays = Math.floor(totalCustomSeconds / 86400);
    let h = Math.floor((totalCustomSeconds / 3600) % 24);
    let m = Math.floor((totalCustomSeconds / 60) % 60);
    let s = Math.floor(totalCustomSeconds % 60);
    
    if(document.getElementById('time-display')) {
        document.getElementById('time-display').innerText = 
            `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
}

function toggleTime() { 
    isRunning = !isRunning; 
    saveTimeState(); 
    const btn = document.getElementById('sidebar-play-btn');
    if (btn) btn.innerHTML = isRunning ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
}

function setSpeed(multiplier) {
    speedMultiplier = multiplier;
    rtdb.ref(`instance_clocks/${currentCampaignId}`).update({
        speedMultiplier: multiplier,
        totalCustomSeconds: totalCustomSeconds,
        lastRealWorldSaveTime: Date.now()
    });
}

// --- CHAT LOGIC ---
function initDiceLogListener() {
    const log = document.getElementById('dice-log');
    if (log) log.innerHTML = '<div class="dice-log-placeholder">Loading history...</div>';
    
    rtdb.ref(`instance_logs/${currentCampaignId}/chatbox`).off();
    rtdb.ref(`instance_logs/${currentCampaignId}/chatbox`).limitToLast(50).on('child_added', (snapshot) => {
        renderChatLogEntry(snapshot.val());
    });
}

function sendChatMessage() {
    const input = document.getElementById('chat-msg-input');
    const text = input.value.trim();
    if (!text || !currentCharacterId) return; 
    
    const charName = document.getElementById('hud-name').innerText || "Unknown";
    rtdb.ref(`instance_logs/${currentCampaignId}/chatbox`).push({
        type: 'chat', name: charName, text: text, timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    input.value = ''; 
}

function sendSystemMessage(text) {
    if (!currentCampaignId) return;
    rtdb.ref(`instance_logs/${currentCampaignId}/chatbox`).push({
        type: 'system', name: 'System', text: text, timestamp: firebase.database.ServerValue.TIMESTAMP
    });
}

function rollDice(sides, btn, modifier = 0, label = "Roll") {
    const numDisplay = btn.querySelector('.roll-number');
    if (btn.rollInterval) clearInterval(btn.rollInterval);
    if (btn.resetTimeout) clearTimeout(btn.resetTimeout);
    
    btn.classList.add('active-roll');
    
    let rolls = 0;
    btn.rollInterval = setInterval(() => {
        // Animation spinning
        numDisplay.innerText = Math.floor(Math.random() * sides) + 1;
        
        if (++rolls > 12) {
            clearInterval(btn.rollInterval);
            const naturalRoll = Math.floor(Math.random() * sides) + 1;
            const finalTotal = naturalRoll + modifier;
            
            numDisplay.innerText = finalTotal;
            
            // Database Sync
            if (currentCharacterId) {
                const charName = document.getElementById('hud-name').innerText || "Unknown";
                
                // Format the result: "21 (18 +3)" or just "18"
                const sign = modifier >= 0 ? '+' : '';
                const resultText = modifier !== 0 ? 
                    `${finalTotal} (${naturalRoll} ${sign}${modifier})` : 
                    `${finalTotal}`;

                rtdb.ref(`instance_logs/${currentCampaignId}/chatbox`).push({
                    type: 'roll', 
                    name: charName, 
                    sides: sides,       // Required to prevent "dundefined" in chat
                    rollLabel: label,   // Uses the label (e.g., "Initiative")
                    result: resultText, 
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            }
            
            btn.resetTimeout = setTimeout(() => { 
                btn.classList.remove('active-roll'); 
            }, 3000);
        }
    }, 40);
}

function handleChatEnter(event) {
    if (event.key === "Enter") sendChatMessage();
}

function renderChatLogEntry(data) {
    const log = document.getElementById('dice-log');
    if (!log) return;
    const placeholder = log.querySelector('.dice-log-placeholder');
    if (placeholder) placeholder.remove();

    const entry = document.createElement('div');
    if (data.type === 'system') {
        entry.className = 'chat-entry system-type';
        entry.innerHTML = `<span><strong>[System]:</strong> ${data.text}</span>`;
    } else if (data.type === 'roll') {
        entry.className = 'chat-entry roll-type';
        entry.innerHTML = `<span class="chat-name">${data.name}</span> rolled a d${data.sides}: <span class="roll-result">${data.result}</span>`;
    } else {
        entry.className = 'chat-entry';
        entry.innerHTML = `<span class="chat-name">${data.name}:</span> <span>${data.text}</span>`;
    }
    log.prepend(entry); 
    if (log.children.length > 50) log.removeChild(log.lastChild);
}

function triggerInitiative(btn) {
    // Pull the already-calculated bonus from the UI
    const displayVal = document.getElementById('char-init-display').innerText;
    // Remove the "+" and convert to integer
    const modifier = parseInt(displayVal.replace('+', '')) || 0;
    
    // Call your rollDice: (sides, element, modifier, label)
    rollDice(20, btn, modifier, "Initiative");
}



/* ==========================================================================
   SECTION 6: CHARACTER LOGIC (MATH & STATS)
   ========================================================================== */
// Calculate Level from exp
function calculateLevelFromEXP(exp) {
    // Formula: Level = Floor(EXP / 200). Cap at 60.
    const calculatedLv = Math.floor(exp / 200);
    let finalLv = Math.max(1, calculatedLv);
    return Math.min(finalLv, MAX_CHAR_LEVEL);
}

// Safely gets a value from the dynamic attributes map
function getAttrValue(source, key) {
    if (!source || !source.attributes) return 0;
    return parseFloat(source.attributes[key]) || 0;
}

/** * Core Engine: Gathers all sources (Race, Classes, etc.) and sums their attributes.
 */
async function resolveAllStats(charData) {
    const registry = {
        inherent: {}, // Race, Class, Background
        equipment: {}, // Weapons, Armor, Accessories
        status: {},    // Potions, Spells, Buffs
        totals: {}     // Final sum of everything
    };

    const sources = [];

    // --- 1. GATHER INHERENT SOURCES ---
    const raceSnap = await firestore.collection('master_races').where('name', '==', charData.race).limit(1).get();
    if (!raceSnap.empty) {
        let d = raceSnap.docs[0].data();
        d._sourceType = 'inherent';
        d._sourceName = 'Race';
        sources.push(d);
    }

    for (const className of Object.keys(charData.unlockedClasses || {})) {
        const classSnap = await firestore.collection('master_classes').where('name', '==', className).limit(1).get();
        if (!classSnap.empty) {
            let d = classSnap.docs[0].data();
            d._sourceType = 'inherent';
            d._sourceName = className;
            sources.push(d);
        }
    }

    // --- 2. GATHER EQUIPMENT SOURCES (Placeholder for your future Item system) ---
    // (charData.equippedItems || []).forEach(item => { ... push to sources with _sourceType: 'equipment' ... });

    // --- 3. GATHER STATUS SOURCES (Placeholder for your future Buff system) ---
    // (charData.activeBuffs || []).forEach(buff => { ... push to sources with _sourceType: 'status' ... });


    // --- 4. THE MULTI-LAYER MERGE ---
    sources.forEach(src => {
        if (!src.attributes) return;
        
        const type = src._sourceType; 
        const name = src._sourceName; 

        for (const [key, value] of Object.entries(src.attributes)) {
            const val = parseFloat(value) || 0;

            // Save to specific category (The "Receipt")
            if (!registry[type][key]) registry[type][key] = {};
            registry[type][key][name] = val;

            // Add to the final totals map
            registry.totals[key] = (registry.totals[key] || 0) + val;
        }
    });

    return registry;
}


// Fetches the 'Nice Name' (e.g., "HP per Level") for a key (e.g., "hp_lv")
async function getAttributeDefinitions() {
    if (Object.keys(attributeDefinitions).length > 0) return attributeDefinitions;
    const snap = await firestore.collection('master_attributes').get();
    snap.forEach(doc => {
        const d = doc.data();
        attributeDefinitions[d.key] = d.name;
    });
    return attributeDefinitions;
}

// Calculates Vitals (HP/MP) based on dynamic attributes
async function getFinalMaxStats(charData) {
    // 1. Get Race/Class data
    const raceSnap = await firestore.collection('master_races').where('name', '==', charData.race).limit(1).get();
    const raceD = raceSnap.empty ? {} : raceSnap.docs[0].data();

    // 2. Start with Base 10
    let baseHP = 10;
    let baseMP = 10;

    // 3. Add Level-based bonuses from Race
    baseHP += (charData.charLevel * getAttrValue(raceD, 'hp_lv'));
    baseMP += (charData.charLevel * getAttrValue(raceD, 'mp_lv'));

    // 4. Add Level-based bonuses from Classes
    for (const [className, info] of Object.entries(charData.unlockedClasses || {})) {
        const classSnap = await firestore.collection('master_classes').where('name', '==', className).limit(1).get();
        if (!classSnap.empty) {
            const classD = classSnap.docs[0].data();
            baseHP += (info.level * getAttrValue(classD, 'hp_lv'));
            baseMP += (info.level * getAttrValue(classD, 'mp_lv'));
        }
    }

    // 5. Add Stat-based bonuses (Body for HP, Spirit for MP)
    // We get the TOTAL stat (Base + Race Bonus)
    const totalBody = (charData.body || 0) + getAttrValue(raceD, 'body');
    const totalSpirit = (charData.spirit || 0) + getAttrValue(raceD, 'spirit');
    
    baseHP += (totalBody * STAT_RESOURCE_MULT);
    baseMP += (totalSpirit * STAT_RESOURCE_MULT);

    // 6. Final Percentages
    const finalHP = Math.floor((baseHP + (charData.hpBonusFlat || 0)) * (1 + (charData.hpBonusPerc || 0) / 100));
    const finalMP = Math.floor((baseMP + (charData.mpBonusFlat || 0)) * (1 + (charData.mpBonusPerc || 0) / 100));

    return { finalHP, finalMP };
}



/* ==========================================================================
   SECTION 7: CHARACTER UI & CRUD
   ========================================================================== */

function createNewCharacter() {
    const user = auth.currentUser;
    const data = { 
        name: "New Hero", race: "", class: "", charLevel: 1, 
        body: 0, mind: 0, spirit: 0,
        hpCurrent: 10, mpCurrent: 10,
        expCurrent: 0, notes: "",
        skills: { basic: [], intermediate: [], advanced: [] },
        gallery: [], portrait: 0, unlockedClasses: {}, 
        instanceId: "global", instanceName: "Global",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    firestore.collection('users').doc(user.uid).collection('characters').add(data)
        .then(() => loadUserCharacters());
}

function loadUserCharacters() {
    const user = auth.currentUser;
    if (!user) return;
    firestore.collection('users').doc(user.uid).collection('characters').get().then(snap => {
        const grid = document.getElementById('char-list-grid');
        if (!grid) return;
        grid.innerHTML = "";
        snap.forEach(doc => {
            const d = doc.data();
            const gallery = d.gallery || [];
            const activeIdx = d.portrait !== undefined ? d.portrait : 0;
            const displayImg = gallery[activeIdx] || ''; 
            const card = document.createElement('div');
            card.className = 'char-card';
            card.onclick = () => selectCharacter(doc.id);
            card.innerHTML = `
                <div class="char-card-portrait" style="background-image: url('${displayImg}');">
                    ${!displayImg ? '<i class="fa-solid fa-user"></i>' : ''}
                </div>
                <strong>${d.name || 'New Hero'}</strong>
                <div class="char-card-meta">Lv.${d.charLevel || 1}</div>
                <button class="btn-danger-small m-m" onclick="deleteCharacter(event, '${doc.id}', '${d.name}')">Delete</button>
            `;
            grid.appendChild(card);
        });
    });
}

    // SELECT CHARACTER FUNCTION
    async function selectCharacter(id) {
    if (characterListener) characterListener(); 
    const allInputs = document.querySelectorAll('#char-sheet-view input');
    allInputs.forEach(input => { if(input.type !== 'file') input.value = ""; });

    currentCharacterId = id;
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(id);

    characterListener = charRef.onSnapshot(async (doc) => {
        if (doc.exists) {
            const d = doc.data();
            if (currentCampaignId !== (d.instanceId || "global")) {
                currentCampaignId = d.instanceId || "global"; 
                initClockListener(); initDiceLogListener();
            }
            setSafeValue('char-name', d.name || "");
            setSafeValue('char-race', d.race || "");
            activeCharLevel = calculateLevelFromEXP(d.expCurrent || 0);
            setSafeText('char-level-display', `Lv. ${activeCharLevel}`);
            
            originalStats = { body: d.body || 0, mind: d.mind || 0, spirit: d.spirit || 0 };
            pendingStats = { ...originalStats };
            totalAP = Math.max(0, activeCharLevel - (originalStats.body + originalStats.mind + originalStats.spirit)); 

            renderClassPills(d);
            refreshStatDisplay();
            renderGallery(d.gallery || [], d.portrait !== undefined ? d.portrait : 0);
            renderSkills(d);

            const notesEl = document.getElementById('char-notes');
            if (notesEl && document.activeElement !== notesEl) { notesEl.value = d.notes || ""; }

            setSafeValue('char-hp-current', Math.floor(d.hpCurrent || 0));
            setSafeValue('char-mp-current', Math.floor(d.mpCurrent || 0));

            const nextLevelExp = (activeCharLevel + 1) * 200;
            updateHUD({ ...d, charLevel: activeCharLevel, expMax: nextLevelExp });
            
            const selectionView = document.getElementById('char-selection-view');
            if (selectionView && !selectionView.classList.contains('hide-default')) {
                selectionView.classList.add('hide-default');
                document.getElementById('char-sheet-view').classList.remove('hide-default');
            }
        }
    });
    firestore.collection('users').doc(user.uid).update({ lastActiveCharacter: id });
}

async function saveCharacter() {
    if (!currentCharacterId) return;
    const charRef = firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId);
    try {
        const hpIn = document.getElementById('char-hp-current');
        const mpIn = document.getElementById('char-mp-current');
        if (!hpIn || !mpIn) return; 

        const doc = await charRef.get();
        const currentData = doc.data();

        const data = {
            name: document.getElementById('char-name').value,
            race: document.getElementById('char-race').value,
            notes: document.getElementById('char-notes').value,
            body: originalStats.body || 0,
            mind: originalStats.mind || 0,
            spirit: originalStats.spirit || 0,
            hpCurrent: parseFloat(hpIn.value) || 0,
            mpCurrent: parseFloat(mpIn.value) || 0,
            portrait: currentData.portrait !== undefined ? currentData.portrait : 0,
            gallery: currentData.gallery || [],
            unlockedClasses: currentData.unlockedClasses || {}
        };
        await charRef.update(data);
        if (typeof showToast === "function") showToast("Character Saved.");
    } catch (e) { console.error("Save Error:", e); }
}

async function deleteCharacter(event, charId, name) {
    event.stopPropagation();
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
        const user = auth.currentUser;
        await firestore.collection('users').doc(user.uid).collection('characters').doc(charId).delete();
        if (currentCharacterId === charId) { currentCharacterId = null; goBackToSelection(); }
        loadUserCharacters();
    } catch (err) { alert("Error: " + err.message); }
}

// Updated to use the new resolveAllStats engine
async function applyPassiveRegen() {
    if (!currentCharacterId) return;
    const charSnap = await firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).get();
    const charData = charSnap.data();
    
    // 1. Resolve all dynamic bonuses (Speed, Regen, etc.)
    const bonuses = await resolveAllStats(charData);

    // 2. USE YOUR ENGINE: Get the true Max HP/MP for this character
    const maxStats = await getFinalMaxStats(charData); 
    const hpMax = maxStats.finalHP;
    const mpMax = maxStats.finalMP;

    // 3. Calculate Regen amounts (Now using real numbers, not undefined/NaN)
    const totalHPRegen = (hpMax * 0.00208333) + (bonuses.totals['hp_regen'] || 0);
    const totalMPRegen = (mpMax * 0.00208333) + (bonuses.totals['mp_regen'] || 0);

    // 4. Fallback Logic: Always start with Database values to prevent "Zeroing" bugs
    let hpCur = charData.hpCurrent || 0;
    let mpCur = charData.mpCurrent || 0;

    const newHP = Math.min(hpCur + totalHPRegen, hpMax);
    const newMP = Math.min(mpCur + totalMPRegen, mpMax);

    // 5. Sync to Database immediately so the change is permanent
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).update({
        hpCurrent: newHP,
        mpCurrent: newMP
    });
    
    // 6. Push to HUD (This will update sidebar and bars automatically)
    updateHUD({ ...charData, hpCurrent: newHP, mpCurrent: newMP });
}

function refreshStatDisplay() {
    setSafeText('display-body', pendingStats.body);
    setSafeText('display-mind', pendingStats.mind);
    setSafeText('display-spirit', pendingStats.spirit);
    setSafeText('char-ap-rem', `AP: ${totalAP}`);

    const confirmArea = document.getElementById('attr-confirm-area');
    if (confirmArea) {
        const hasChanges = JSON.stringify(pendingStats) !== JSON.stringify(originalStats);
        if (hasChanges) {
            confirmArea.classList.remove('hide-default');
        } else {
            confirmArea.classList.add('hide-default');
        }
    }
}

function adjustPendingStat(stat, amount) {
    if (!currentCharacterId) return;
    const currentVal = pendingStats[stat];
    
    if (amount > 0 && currentVal >= MAX_ALLOCATED_STAT) {
        showToast(`Stat Cap Reached! (Max ${MAX_ALLOCATED_STAT})`);
        return;
    }
    if (amount < 0 && currentVal <= 0) return;

    const cost = amount; 
    if (amount > 0 && totalAP < cost) return;

    pendingStats[stat] += amount;
    totalAP -= cost;
    refreshStatDisplay();
}

async function confirmAttributeChanges() {
    if (!currentCharacterId) return;
    let spentInThisBatch = (pendingStats.body - originalStats.body) + 
                           (pendingStats.mind - originalStats.mind) + 
                           (pendingStats.spirit - originalStats.spirit);
    try {
        await firestore.collection('users').doc(auth.currentUser.uid)
            .collection('characters').doc(currentCharacterId).update({
                body: pendingStats.body, mind: pendingStats.mind, spirit: pendingStats.spirit
            });
        totalAP -= spentInThisBatch; 
        originalStats = { ...pendingStats };
        if (typeof showToast === "function") showToast("Attributes committed.");
        refreshStatDisplay(); 
        saveCharacter();      
    } catch (e) { console.error("Update failed:", e); }
}

async function syncRegistryToDropdowns() {
    const raceSelect = document.getElementById('char-race');
    if (!raceSelect) return; 
    try {
        const raceSnap = await firestore.collection('master_races').get();
        raceSelect.innerHTML = '<option value="">Select Race</option>';
        raceSnap.forEach(doc => {
            const d = doc.data();
            raceSelect.innerHTML += `<option value="${d.name}">${d.name}</option>`;
        });
    } catch (error) { console.error("Error syncing registry:", error); }
} 

function renderClassPills(charData) {
    const container = document.getElementById('char-class-list-display');
    if(!container) return;
    container.innerHTML = "";
    const classes = charData.unlockedClasses || {};
    if (Object.keys(classes).length === 0) {
        container.innerHTML = '<span class="text-muted" style="font-size: 0.8rem;">No classes unlocked</span>';
    } else {
        Object.keys(classes).forEach(className => {
            const pill = document.createElement('span');
            pill.className = 'join-code-pill';
            pill.innerText = `${className} Lv.${classes[className].level}`;
            container.appendChild(pill);
        });
    }
}

// --- GALLERY LOGIC ---
function saveImageToNextSlot(base64Data) {
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);

    charRef.get().then(doc => {
        const data = doc.data();
        let gallery = data.gallery || [];
        
        if (gallery.length >= MAX_GALLERY_SLOTS) return alert("Gallery Full!");

        // 1. Add the new high-res WebP to the gallery array
        gallery.push(base64Data);

        const updateData = { gallery: gallery };

        // 2. If it's the very first image, make sure portrait points to index 0
        // We check if portrait is currently "" or undefined
        if (data.portrait === "" || data.portrait === undefined) {
            updateData.portrait = 0; 
        }

        charRef.update(updateData).then(() => {
            // 3. Refresh UI using the (potentially new) portrait index
            const activeIndex = updateData.portrait !== undefined ? updateData.portrait : data.portrait;
            
            renderGallery(gallery, activeIndex);
            
            document.getElementById('hud-portrait').style.backgroundImage = `url(${base64Data})`;
        });
    });
}

function renderGallery(galleryArray, activeIndex) {
    const container = document.getElementById('char-gallery-grid');
    if (!container) return;
    container.innerHTML = "";

    const images = galleryArray || [];

    for (let i = 0; i < MAX_GALLERY_SLOTS; i++) {
        const slot = document.createElement('div');
        slot.className = 'gallery-item';

        if (images[i]) {
            // Compare the Index (Numbers), not the Strings!
            if (i === activeIndex) {
                slot.style.borderColor = "#10b981"; 
                slot.style.boxShadow = "0 0 10px #10b981";
            }

            slot.innerHTML = `
                <img src="${images[i]}" onclick="setActivePortrait(${i})">
                <button class="delete-img-btn" onclick="deleteImage(event, ${i})">×</button>
            `;
        } else {
            slot.className = 'gallery-item empty-slot';
            slot.innerHTML = `<i class="fa-solid fa-plus"></i>`;
            slot.onclick = () => document.getElementById('slot-upload').click();
        }
        container.appendChild(slot);
    }
}

function setActivePortrait(index) {
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);
    
    charRef.update({ portrait: index }).then(() => {
        charRef.get().then(doc => {
            const data = doc.data();
            const imgData = data.gallery[index];
            document.getElementById('hud-portrait').style.backgroundImage = `url(${imgData})`;
            loadUserCharacters(); 
            renderGallery(data.gallery, index);
        });
    });
}

function deleteImage(event, index) {
    event.stopPropagation();
    if (!confirm("Delete this image?")) return;
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);

    charRef.get().then(doc => {
        let gallery = doc.data().gallery || [];
        let activeIdx = doc.data().portrait;

        gallery.splice(index, 1);
        const updateData = { gallery: gallery };

        // Adjust index logic after a deletion
        if (activeIdx === index) {
            // If we deleted the active one, default to the first image or nothing
            updateData.portrait = gallery.length > 0 ? 0 : -1;
        } else if (index < activeIdx) {
            // If we deleted an image BEFORE the active one, shift the index down
            updateData.portrait = activeIdx - 1;
        }

        charRef.update(updateData).then(() => {
            const finalIdx = updateData.portrait !== undefined ? updateData.portrait : activeIdx;
            const finalImg = gallery[finalIdx] || '';
            
            renderGallery(gallery, finalIdx);
            document.getElementById('hud-portrait').style.backgroundImage = `url(${finalImg})`;
            loadUserCharacters();
        });
    });
}

function renderSkills(charData) {
    const container = document.getElementById('skills-container');
    if (!container) return;
    container.innerHTML = ""; 
    
    // Safety: Fallback to empty object if skills haven't been created yet
    const skillRegistry = charData.skills || {};

    // Map the UI labels to the database keys
    const tiers = [
        { key: 'basic', label: 'Basic Skills' }, 
        { key: 'intermediate', label: 'Intermediate Skills' }, 
        { key: 'advanced', label: 'Advanced Skills' }
    ];

    tiers.forEach(tier => {
        const section = document.createElement('div');
        section.className = 'skill-tier-section';
        section.innerHTML = `<h4 class="m-m m-s">${tier.label}</h4>`;
        
        // Read from the new registry
        const skills = skillRegistry[tier.key] || [];
        
        if (skills.length === 0) {
            section.innerHTML += `<div class="text-muted" style="width:100%; text-align:center; font-size:0.8rem;">Empty</div>`;
        }

        skills.forEach((s) => {
            const perc = Math.min((s.exp / (s.expMax || 10)) * 100, 100);
            const slot = document.createElement('div');
            slot.className = 'skill-slot-card';
            
            const iconHtml = s.icon ? `<img src="${s.icon}" class="registry-icon" style="width:32px; height:32px; margin-right:10px;">` : '';

            slot.innerHTML = `
                <div class="flex-row" style="align-items: center;">
                    ${iconHtml}
                    <div style="flex-grow: 1;">
                        <div class="flex-row" style="justify-content: space-between;">
                            <strong>${s.name || '---'}</strong>
                            <span style="font-size: 0.8rem; opacity: 0.7;">Lv.${s.level}</span>
                        </div>
                        <div class="skill-exp-bg" style="height: 4px; background: #27272a; margin-top: 5px; border-radius: 2px;">
                            <div class="skill-exp-fill" style="width: ${perc}%; height: 100%; background: #a855f7; border-radius: 2px;"></div>
                        </div>
                    </div>
                </div>
            `;
            section.appendChild(slot);
        });
        container.appendChild(section);
    });
}

/* ==========================================================================
   SECTION 8: UPDATE HUD & UI SYNC
   ========================================================================== */
 
async function updateHUD(char) {
    if (!char) return;

    // 1. Resolve general bonuses (BOD/MIN/SPI totals)
    const bonuses = await resolveAllStats(char);
    const totals = {
        body: (char.body || 0) + (bonuses.totals['body'] || 0),
        mind: (char.mind || 0) + (bonuses.totals['mind'] || 0),
        spirit: (char.spirit || 0) + (bonuses.totals['spirit'] || 0)
    };

    // 2. USE YOUR ENGINE: Get the true Max HP/MP (Stops the HUD mismatch)
    const maxStats = await getFinalMaxStats(char); 
    const hpMax = maxStats.finalHP;
    const mpMax = maxStats.finalMP;

    // 3. Update UI Elements (Character Sheet Boxes)
    setSafeValue('char-hp-max', Math.floor(hpMax));
    setSafeValue('char-mp-max', Math.floor(mpMax));
    setSafeValue('char-hp-current', Math.floor(char.hpCurrent || 0));
    setSafeValue('char-mp-current', Math.floor(char.mpCurrent || 0));

    // 4. Update Visual Progress Bars
    updateVisualBars(char.hpCurrent, hpMax, char.mpCurrent, mpMax);

    // 5. Calculate Percentages for Sidebar
    const hpP = (char.hpCurrent / (hpMax || 1)) * 100;
    const mpP = (char.mpCurrent / (mpMax || 1)) * 100;
    const expP = ((char.expCurrent || 0) / ((char.charLevel + 1) * 200)) * 100;

    // 6. Final Sync
    if (document.getElementById('active-char-hud')) {
        document.getElementById('active-char-hud').classList.remove('hide-default'); 
    }

    syncSidebarUI(char, totals, hpP, mpP, expP, hpMax, mpMax);
    syncSheetDashboardUI(char, totals, bonuses, char.race); 
}

//SYNC SIDE BAR
function syncSidebarUI(char, totals, hpP, mpP, expP, hpMax, mpMax) {
    const getMod = (val) => {
        const m = Math.floor(val / 2);
        return m >= 0 ? `+${m}` : m;
    };
    const gallery = char.gallery || [];
    const activeIdx = char.portrait !== undefined ? char.portrait : 0;
    const activeImg = gallery[activeIdx] || "";
    
    const portEl = document.getElementById('hud-portrait');
    if (portEl) {
        portEl.style.backgroundImage = activeImg ? `url(${activeImg})` : "none";
        portEl.innerHTML = activeImg ? "" : '<i class="fa-solid fa-user"></i>';
    }

    setSafeText('hud-name', char.name || "Unnamed");
    setSafeText('hud-meta', `Level ${char.charLevel || 1}`);
    setSafeText('hud-hp-text', `${Math.floor(char.hpCurrent || 0)}/${Math.floor(hpMax)}`);
    setSafeText('hud-mp-text', `${Math.floor(char.mpCurrent || 0)}/${Math.floor(mpMax)}`);
    
    setSafeText('hud-mod-body', `BOD ${getMod(totals.body)}`);
    setSafeText('hud-mod-mind', `MIN ${getMod(totals.mind)}`);
    setSafeText('hud-mod-spirit', `SPI ${getMod(totals.spirit)}`);

    const hpFill = document.getElementById('hud-hp-fill');
    const mpFill = document.getElementById('hud-mp-fill');
    const expFill = document.getElementById('hud-exp-fill');
    if (hpFill) hpFill.style.width = hpP + "%";
    if (mpFill) mpFill.style.width = mpP + "%";
    if (expFill) expFill.style.width = expP + "%";
    setSafeText('hud-exp-text', `${Math.floor(expP)}%`);
}

// SYNC SHEET DASHBOARD
function syncSheetDashboardUI(char, totals, bonuses, raceName) {
    setSafeText('total-body-label', totals.body);
    setSafeText('total-mind-label', totals.mind);
    setSafeText('total-spirit-label', totals.spirit);
    setSafeText('char-speed-display', (bonuses.totals['speed'] || 6) + "m");
    setSafeText('char-ac-display', 10 + (bonuses.totals['ac'] || 0));

    const initEl = document.getElementById('char-init-display');
    if (initEl) {
        const bestMod = Math.max(Math.floor(totals.body/2), Math.floor(totals.mind/2));
        initEl.innerText = (bestMod >= 0 ? "+" : "") + bestMod;
    }
    renderClassPills(char);
}


/* ==========================================================================
   SECTION 9: MASTER PANEL LOGIC
   ========================================================================== */

// --- INSTANCE MANAGEMENT ---
async function loadInstanceList() {
    const listContainer = document.getElementById('admin-instance-list');
    const user = auth.currentUser;
    if (!listContainer || !user) return;
    const isAdmin = (window.currentUserRole === 'Admin');

    try {
        let snapshot;
        if (isAdmin) snapshot = await firestore.collection('instances').get();
        else snapshot = await firestore.collection('instances').where('masters', 'array-contains', user.uid).get();

        if (snapshot.empty) {
            listContainer.innerHTML = `<p class="text-center" style="opacity: 0.5; padding: 20px;">No active instances found.</p>`;
            return;
        }

        let html = `<table class="admin-table"><thead><tr><th>World Name</th><th>Join Code</th><th>Masters</th><th>Actions</th></tr></thead><tbody>`;
        snapshot.forEach(doc => {
            const data = doc.data();
            const id = doc.id;
            const isMyWorld = data.masters && data.masters.includes(user.uid);
            const rowStyle = (isAdmin && !isMyWorld) ? 'class="admin-view-row"' : '';

            html += `<tr ${rowStyle}>
                    <td><strong>${data.name || 'Unnamed World'}</strong> ${(isAdmin && !isMyWorld) ? '<span style="font-size:0.6rem; color:#facc15; margin-left:5px;">(ADMIN VIEW)</span>' : ''}</td>
                    <td><code class="join-code-pill">${data.joinCode || 'N/A'}</code></td>
                    <td>${data.masters ? data.masters.length : 1}</td>
                    <td><div class="flex-row" style="gap: 5px;">
                            <button class="btn-small" onclick="viewInstanceDetails('${id}')">Manage</button>
                            <button class="btn-danger-small" onclick="deleteInstance('${id}', '${data.name}')"><i class="fa-solid fa-trash"></i></button>
                        </div></td></tr>`;
        });
        html += `</tbody></table>`;
        listContainer.innerHTML = html;
    } catch (error) { console.error("Registry Error:", error); }
}

async function spawnInstance() {
    const instanceName = document.getElementById('new-instance-name').value.trim();
    if (!instanceName) return alert("Please name your instance!");
    try {
        const instanceRef = await firestore.collection('instances').add({
            name: instanceName, masters: [auth.currentUser.uid], members: [auth.currentUser.uid],
            joinCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(), isActive: true
        });
        await rtdb.ref(`instance_clocks/${instanceRef.id}`).set({
            totalCustomSeconds: 32400, speedMultiplier: 1, isRunning: false, lastRealWorldSaveTime: Date.now()
        });
        document.getElementById('new-instance-name').value = "";
        alert(`Instance spawned!`);
        loadInstanceList(); 
    } catch (error) { console.error("Spawn Error:", error); }
}

async function viewInstanceDetails(instanceId) {
    if (window.currentUserRole === 'Admin') {
        try {
            await firestore.collection('instances').doc(instanceId).update({
                masters: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.uid)
            });
        } catch (e) { console.error("Auto-join failed:", e); }
    }
    currentCampaignId = instanceId; 
    initClockListener();
    const label = document.getElementById('current-instance-name');
    if(label) label.innerText = instanceId; 
    if (typeof showToast === "function") showToast(`Controls synced to: ${instanceId}`);
    else alert(`Controls synced to: ${instanceId}`);
}

async function deleteInstance(instanceId, name) {
    if (!confirm(`Are you sure you want to PERMANENTLY delete "${name}"?`)) return;
    try {
        await firestore.collection('instances').doc(instanceId).delete();
        await rtdb.ref(`instance_clocks/${instanceId}`).remove();
        alert("Instance deleted.");
        loadInstanceList(); 
    } catch (error) { console.error("Delete Error:", error); }
}

// --- USER MANAGEMENT ---
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
            row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr; padding: 12px 10px; border-bottom: 1px solid #18181b; align-items: center;';
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
    } catch (error) { console.error("Error loading user list:", error); }
}
 
async function saveAllUserRoles() {
    const selectors = document.querySelectorAll('.role-selector');
    const batch = firestore.batch(); 
    selectors.forEach(select => {
        const userRef = firestore.collection('users').doc(select.getAttribute('data-userid'));
        batch.update(userRef, { role: select.value });
    });
    try {
        await batch.commit(); 
        alert(`Successfully updated accounts!`);
        loadUserList(); 
    } catch (error) { alert("Failed to save changes."); }
}

// --- CHARACTER MANAGEMENT ---
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
                <input type="text" id="char-search-input" class="form-input" placeholder="Search character..." onkeyup="filterCharacterTable()" style="width: 250px;">
                <div class="flex-row" style="gap: 10px;">
                    <button class="btn-primary" style="background-color: #059669; border-color: #059669;" onclick="saveAllCharacterInstances()">Save Assignments</button>
                    <button class="btn-secondary" onclick="loadGlobalCharacterManager()"><i class="fa-solid fa-rotate-right"></i></button>
                </div>
            </div>
            <table class="admin-table" id="admin-char-table"><thead><tr><th>Character</th><th>Owner</th><th>Current World</th><th>Action</th></tr></thead><tbody>`;

        for (const userDoc of usersSnap.docs) {
            const charSnap = await firestore.collection('users').doc(userDoc.id).collection('characters').get();
            charSnap.forEach(charDoc => {
                const c = charDoc.data();
                html += `<tr>
                        <td><strong>${c.name}</strong></td>
                        <td><small>${userDoc.data().email || "Unknown"}</small></td>
                        <td><select class="realm-assign-select form-input" data-uid="${userDoc.id}" data-cid="${charDoc.id}" style="padding: 5px; font-size: 0.8rem; width: 100%;">
                                <option value="global">Global (None)</option>
                                ${instances.map(inst => `<option value="${inst.id}" ${c.instanceId === inst.id ? 'selected' : ''}>${inst.name}</option>`).join('')}
                            </select></td>
                        <td><button class="btn-small" onclick="openCharacterManagerModal('${userDoc.id}', '${charDoc.id}')">Edit</button></td>
                    </tr>`;
            });
        }
        html += `</tbody></table>`; 
        listContainer.innerHTML = html;
    } catch (error) { console.error("Char Manager Error:", error); }
}

async function saveAllCharacterInstances() {
    const selectors = document.querySelectorAll('.realm-assign-select');
    const batch = firestore.batch(); 
    let activeCharMoved = false; 

    selectors.forEach(select => {
        const userId = select.getAttribute('data-uid');
        const charId = select.getAttribute('data-cid');
        const newInstanceId = select.value;
        const newInstanceName = select.options[select.selectedIndex].text.trim();
        const charRef = firestore.collection('users').doc(userId).collection('characters').doc(charId);
        batch.update(charRef, { instanceId: newInstanceId, instanceName: newInstanceName });

        if (currentCharacterId === charId && currentCampaignId !== newInstanceId) {
            currentCampaignId = newInstanceId;
            activeCharMoved = true;
        }
    });

    try {
        await batch.commit(); 
        alert(`Assignments Saved!`);
        if (activeCharMoved) initClockListener();
        loadGlobalCharacterManager(); 
    } catch (error) { alert("Failed to save."); }
}

function filterCharacterTable() {
    const filter = document.getElementById('char-search-input').value.toLowerCase();
    const rows = document.getElementById('admin-char-table').getElementsByTagName('tr');
    for (let i = 1; i < rows.length; i++) {
        const text = rows[i].textContent.toLowerCase();
        rows[i].classList.toggle('hide-default', !text.includes(filter));
    }
}

// --- CHARACTER MANAGER MODAL ---
async function openCharacterManagerModal(uid, cid) {
    document.getElementById('edit-modal-uid').value = uid;
    document.getElementById('edit-modal-cid').value = cid;

    try {
        const doc = await firestore.collection('users').doc(uid).collection('characters').doc(cid).get();
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('edit-modal-title').innerText = `Editing: ${data.name}`;
            document.getElementById('edit-modal-exp').value = data.expCurrent || 0;
            document.getElementById('modal-current-exp-display').innerText = data.expCurrent || 0;
            document.getElementById('exp-adjust-amount').value = 100; 
            document.getElementById('edit-modal-mp').value = data.mpCurrent || 0;
            document.getElementById('edit-modal-gold').value = data.gold || 0;
            document.getElementById('edit-modal-body').value = data.body || 0;
            document.getElementById('edit-modal-mind').value = data.mind || 0;
            document.getElementById('edit-modal-spirit').value = data.spirit || 0;
            document.getElementById('edit-modal-hp-flat').value = data.hpBonusFlat || 0;
            document.getElementById('edit-modal-hp-perc').value = data.hpBonusPerc || 0;
            document.getElementById('edit-modal-mp-flat').value = data.mpBonusFlat || 0;
            document.getElementById('edit-modal-mp-perc').value = data.mpBonusPerc || 0;

            const classPicker = document.getElementById('modal-class-picker');
            const classSnap = await firestore.collection('master_classes').orderBy('name').get();
            classPicker.innerHTML = '<option value="">Select Class to Add...</option>';
            classSnap.forEach(doc => {
                classPicker.innerHTML += `<option value="${doc.data().name}">${doc.data().name}</option>`;
            });
        
            renderModalClassList(uid, cid);
            document.getElementById('master-char-edit-modal').classList.remove('hide-default');
        }
    } catch (error) { alert("Failed to load character data."); }
}

function closeCharacterManagerModal() {
    document.getElementById('master-char-edit-modal').classList.add('hide-default');
}

function addExpQuick(amount) {
    const expInput = document.getElementById('edit-modal-exp');
    let currentExp = parseInt(expInput.value) || 0;
    expInput.value = currentExp + amount;
}

function adjustModalExp(multiplier) {
    const amount = parseInt(document.getElementById('exp-adjust-amount').value) || 0;
    const hiddenInput = document.getElementById('edit-modal-exp');
    let currentTotal = parseInt(hiddenInput.value) || 0;
    const newTotal = Math.max(0, currentTotal + (amount * multiplier));
    hiddenInput.value = newTotal;
    document.getElementById('modal-current-exp-display').innerText = newTotal;
}

async function assignClassToCharacter() {
    const uid = document.getElementById('edit-modal-uid').value;
    const cid = document.getElementById('edit-modal-cid').value;
    const newClassName = document.getElementById('modal-class-picker').value;
    if (!newClassName) return;

    const charRef = firestore.collection('users').doc(uid).collection('characters').doc(cid);
    const doc = await charRef.get();
    let currentClasses = doc.data().unlockedClasses || {};

    if (!currentClasses[newClassName]) {
        currentClasses[newClassName] = { level: 1, exp: 0, tier: 1 };
        await charRef.update({ unlockedClasses: currentClasses });
        sendSystemMessage(`${doc.data().name} was granted the ${newClassName} class.`);
        renderModalClassList(uid, cid);
    } else {
        alert("Character already has this class.");
    }
}

async function renderModalClassList(uid, cid) {
    const container = document.getElementById('modal-active-classes');
    const doc = await firestore.collection('users').doc(uid).collection('characters').doc(cid).get();
    const classes = doc.data().unlockedClasses || {};

    container.innerHTML = "";
    Object.keys(classes).forEach(className => {
        const row = document.createElement('div');
        row.className = "flex-row m-s";
        row.style.cssText = "justify-content: space-between; background: #111; padding: 8px; border-radius: 4px;";
        row.innerHTML = `<span><strong>${className}</strong> (Lv.${classes[className].level})</span>
                         <button class="btn-danger-small" onclick="removeClassFromCharacter('${className}')">Remove</button>`;
        container.appendChild(row);
    });
}

async function removeClassFromCharacter(className) {
    if (!confirm(`Strip ${className} class?`)) return;
    const uid = document.getElementById('edit-modal-uid').value;
    const cid = document.getElementById('edit-modal-cid').value;
    const charRef = firestore.collection('users').doc(uid).collection('characters').doc(cid);
    const doc = await charRef.get();
    let currentClasses = doc.data().unlockedClasses || {};
    delete currentClasses[className];
    await charRef.update({ unlockedClasses: currentClasses });
    renderModalClassList(uid, cid);
}

async function saveCharacterManagerEdits() {
    const uid = document.getElementById('edit-modal-uid').value;
    const cid = document.getElementById('edit-modal-cid').value;
    
    // Gather inputs
    const newExp = parseInt(document.getElementById('edit-modal-exp').value) || 0;
    const newBody = parseInt(document.getElementById('edit-modal-body').value) || 0;
    const newMind = parseInt(document.getElementById('edit-modal-mind').value) || 0;
    const newSpirit = parseInt(document.getElementById('edit-modal-spirit').value) || 0;

    try {
        const charRef = firestore.collection('users').doc(uid).collection('characters').doc(cid);
        const oldData = (await charRef.get()).data();
        
        // Recalculate Max
        const hpBonus = oldData.hpMaxBonus || 0;
        const mpBonus = oldData.mpMaxBonus || 0;
        const calcHpMax = (newBody * STAT_RESOURCE_MULT) + hpBonus + 10;
        const calcMpMax = (newSpirit * STAT_RESOURCE_MULT) + mpBonus + 10;

        await charRef.update({
            expCurrent: newExp,
            hpCurrent: parseInt(document.getElementById('edit-modal-hp').value) || 0,
            hpMax: calcHpMax, 
            mpCurrent: parseInt(document.getElementById('edit-modal-mp').value) || 0,
            mpMax: calcMpMax, 
            gold: parseInt(document.getElementById('edit-modal-gold').value) || 0,
            body: newBody, mind: newMind, spirit: newSpirit,
            hpBonusFlat: parseInt(document.getElementById('edit-modal-hp-flat').value) || 0,
            hpBonusPerc: parseInt(document.getElementById('edit-modal-hp-perc').value) || 0,
            mpBonusFlat: parseInt(document.getElementById('edit-modal-mp-flat').value) || 0,
            mpBonusPerc: parseInt(document.getElementById('edit-modal-mp-perc').value) || 0
        });

        const expGained = newExp - (oldData.expCurrent || 0);
        if (expGained !== 0) sendSystemMessage(`${oldData.name} EXP adjusted by ${expGained}.`);
        
        closeCharacterManagerModal();
    } catch (error) { console.error("Error saving edits:", error); alert("Failed to save."); }
}

async function respecCharacterAttributes() {
    const uid = document.getElementById('edit-modal-uid').value;
    const cid = document.getElementById('edit-modal-cid').value;
    if (!confirm("Reset Attributes to 0? Player will regain AP.")) return;

    try {
        const charRef = firestore.collection('users').doc(uid).collection('characters').doc(cid);
        await charRef.update({ body: 0, mind: 0, spirit: 0 });

        // Update Modal Inputs Live
        document.getElementById('edit-modal-body').value = 0;
        document.getElementById('edit-modal-mind').value = 0;
        document.getElementById('edit-modal-spirit').value = 0;

        // Recalculate Derived Stats
        const data = (await charRef.get()).data();
        const totals = await getFinalMaxStats(data);
        await charRef.update({ hpMax: totals.finalHP, mpMax: totals.finalMP });

        // Update Modal Pool Inputs
        document.getElementById('edit-modal-hp').value = Math.min(data.hpCurrent, totals.finalHP);
        document.getElementById('edit-modal-mp').value = Math.min(data.mpCurrent, totals.finalMP);

        alert("Character attributes reset!");
    } catch (e) { alert("Error resetting attributes."); }
}

// --- TRAIT MANAGEMENT --- //
async function saveTraitToRegistry() {
    const name = document.getElementById('reg-trait-name').value.trim();
    const source = document.getElementById('reg-trait-source').value;
    const desc = document.getElementById('reg-trait-desc').value.trim();
    const traitId = document.getElementById('m-trait-id').value; 

    if (!name || !desc) {
        alert("Name and Description are required.");
        return;
    }

    const traitData = {
        name: name,
        sourceType: source,
        description: desc,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (traitId) {
            await firestore.collection('master_traits').doc(traitId).update(traitData);
        } else {
            await firestore.collection('master_traits').add(traitData);
        }
        
        resetTraitForm();
        loadMasterTraitList();
        closeTraitModal();
    } catch (error) { console.error(error); }
}


async function prepTraitEdit(id) {
    const doc = await firestore.collection('master_traits').doc(id).get();
    if (!doc.exists) return;
    const data = doc.data();

    document.getElementById('m-trait-id').value = id;
    document.getElementById('reg-trait-name').value = data.name || "";
    document.getElementById('reg-trait-source').value = data.sourceType || "General";
    document.getElementById('reg-trait-desc').value = data.description || "";
    
    // Open Modal
    document.getElementById('trait-modal-title').innerText = "Editing: " + data.name;
    document.getElementById('trait-modal').classList.remove('hide-default');
}

function resetTraitForm() {
    document.getElementById('m-trait-id').value = "";
    document.getElementById('reg-trait-name').value = "";
    document.getElementById('reg-trait-desc').value = "";
    document.getElementById('reg-trait-source').value = "General";
    
    // Correct ID for the modal title
    const title = document.getElementById('trait-modal-title');
    if (title) title.innerText = "Define Global Trait";
}

// --- Modal Trait UI --- //
function openTraitModal() {
    resetTraitForm(); // Use your existing reset function
    document.getElementById('trait-modal-title').innerText = "Define Global Trait";
    document.getElementById('trait-modal').classList.remove('hide-default');
}

function closeTraitModal() {
    document.getElementById('trait-modal').classList.add('hide-default');
}



/* ==========================================================================
   SECTION 10: REGISTRY EDITORS (Races, Classes, Skills)
   ========================================================================== */

// --- 10.1 RACE REGISTRY ---
// --- 1. MODAL CONTROLS ---
function openRaceModal() {
    resetRaceForm();
    populateRaceAttrPicker();     // <--- ADD THIS
    populateRaceTraitChecklist(); 
    document.getElementById('race-modal-title').innerText = "Register New Race";
    document.getElementById('race-modal').classList.remove('hide-default');
}

function closeRaceModal() {
    document.getElementById('race-modal').classList.add('hide-default');
}


// --- 2. TRAIT & ATTRIBUTE LOGIC ---

// --- A. TRAIT HELPERS ---
async function populateRaceTraitChecklist() {
    const container = document.getElementById('trait-checklist-container');
    container.innerHTML = '<p class="text-muted small">Loading traits...</p>';
    
    try {
        // Fetch all traits sorted by name
        const snap = await firestore.collection('master_traits').orderBy('name').get();
        container.innerHTML = "";

        snap.forEach(doc => {
            const t = doc.data();
            
            // Create the row
            const div = document.createElement('div');
            div.className = "checklist-item";
            
            // Create Checkbox
            const checkbox = document.createElement('input');
            checkbox.type = "checkbox";
            checkbox.id = `trait-check-${doc.id}`;
            checkbox.value = t.name;
            checkbox.checked = currentRaceTraits.includes(t.name); // Check if already selected
            
            // Click Event: Update global array immediately
            checkbox.onchange = function() {
                if (this.checked) {
                    if (!currentRaceTraits.includes(t.name)) currentRaceTraits.push(t.name);
                } else {
                    currentRaceTraits = currentRaceTraits.filter(item => item !== t.name);
                }
                renderRaceTraitTags();
            };

            // Create Label
            const label = document.createElement('label');
            label.htmlFor = `trait-check-${doc.id}`;
            label.innerText = t.name;

            div.appendChild(checkbox);
            div.appendChild(label);
            container.appendChild(div);
        });
        
        renderRaceTraitTags(); // Update visual summary
    } catch (e) { console.error("Trait Load Error:", e); }
}

function filterTraitChecklist() {
    const filter = document.getElementById('trait-checklist-search').value.toLowerCase();
    const items = document.querySelectorAll('.checklist-item');
    items.forEach(div => {
        const text = div.innerText.toLowerCase();
        item.classList.toggle('hide-default', !text.includes(filter));
    });
}

function renderRaceTraitTags() {
    const container = document.getElementById('race-active-traits');
    container.innerHTML = "";
    if(currentRaceTraits.length === 0) {
        container.innerHTML = "<span class='text-muted small'>No traits selected</span>";
        return;
    }
    
    currentRaceTraits.forEach(t => {
        const tag = document.createElement('span');
        tag.className = "badge-stat";
        tag.innerText = t;
        container.appendChild(tag);
    });
}


// --- B. ATTRIBUTE HELPERS ---

// 1. Populate the "Add Attribute" dropdown from your Library
async function populateRaceAttrPicker() {
    const select = document.getElementById('race-attr-picker');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select stat...</option>';
    
    try {
        const snap = await firestore.collection('master_attributes').orderBy('name').get();
        attributeDefinitions = {}; // Reset cache
        
        snap.forEach(doc => {
            const d = doc.data();
            attributeDefinitions[d.key] = d.name; // Store for display later
            
            // Only show in dropdown if not already added to the race
            if (!currentRaceAttributes.hasOwnProperty(d.key)) {
                const opt = document.createElement('option');
                opt.value = d.key;
                opt.innerText = d.name;
                select.appendChild(opt);
            }
        });
    } catch (e) { console.error("Attr Load Error:", e); }
}

// 2. Add selected attribute to the race
function addAttrToRace() {
    const select = document.getElementById('race-attr-picker');
    const key = select.value;
    if (!key) return;

    // Add with default value 0
    currentRaceAttributes[key] = 0;
    
    renderRaceAttributes();
    populateRaceAttrPicker(); // Refresh dropdown to hide the one we just picked
}

// 3. Remove attribute
function removeAttrFromRace(key) {
    delete currentRaceAttributes[key];
    renderRaceAttributes();
    populateRaceAttrPicker(); // Put it back in the dropdown
}

// 4. Update the value in memory when you type numbers
function updateAttrValue(key, val) {
    currentRaceAttributes[key] = parseFloat(val) || 0;
}

// 5. Render the list of inputs
function renderRaceAttributes() {
    const container = document.getElementById('race-dynamic-attributes');
    container.innerHTML = "";

    for (const [key, value] of Object.entries(currentRaceAttributes)) {
        const name = attributeDefinitions[key] || key; // Use nice name if available
        
        const div = document.createElement('div');
        div.className = "flex-row space-between p-s trait-item-border m-s";
        div.style.background = "#27272a";
        div.innerHTML = `
            <strong class="text-muted" style="width: 120px;">${name}</strong>
            <input type="number" class="form-input" style="width: 80px; text-align: right;" 
                   value="${value}" onchange="updateAttrValue('${key}', this.value)">
            <button class="btn-icon-tiny btn-danger" onclick="removeAttrFromRace('${key}')">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        container.appendChild(div);
    }
}

// --- 3. RESET FORM ---
function resetRaceForm() {
    // 1. Clear Basic Text
    document.getElementById('m-race-id').value = "";
    document.getElementById('m-race-name').value = "";
    document.getElementById('m-race-desc').value = "";
    document.getElementById('trait-checklist-search').value = "";

    // 2. Clear Attributes (The Fix)
    currentRaceAttributes = {}; 
    document.getElementById('race-dynamic-attributes').innerHTML = "";
    
    // 3. Clear Traits
    currentRaceTraits = [];
    document.getElementById('race-active-traits').innerHTML = "";
    
    // 4. Reset Title
    document.getElementById('race-modal-title').innerText = "Register New Race";
}



// --- 4. PREP EDIT (Load data into Modal) ---
async function prepRaceEdit(id) {
    const doc = await firestore.collection('master_races').doc(id).get();
    if (!doc.exists) return;
    const d = doc.data();

    // 1. Basic Info
    document.getElementById('m-race-id').value = id;
    document.getElementById('m-race-name').value = d.name || "";
    document.getElementById('m-race-desc').value = d.description || "";

    // 2. Load Attributes (The Fix)
    currentRaceAttributes = d.attributes || {}; 
    
    // (Legacy Support: If you have old data like 'baseBody', you might want to manually map it here, 
    // but for now we assume you are starting fresh with the new system)
    
    // 3. Load Traits
    currentRaceTraits = d.traits || [];

    // 4. Render Everything
    await populateRaceAttrPicker(); // Load library definitions first so names show up
    renderRaceAttributes();         // Draw the stat inputs
    populateRaceTraitChecklist();   // Draw the trait checkboxes
    renderRaceTraitTags();          // Draw green trait badges

    // 5. Open Modal
    document.getElementById('race-modal-title').innerText = "Editing: " + d.name;
    document.getElementById('race-modal').classList.remove('hide-default');
}




// --- 5. SAVE RACE (Unified) ---
async function saveMasterRace() {
    const id = document.getElementById('m-race-id').value;
    const name = document.getElementById('m-race-name').value.trim();
    if (!name) return alert("Race Name is required.");

    const raceData = {
        name: name,
        description: document.getElementById('m-race-desc').value.trim(),
        
        // SAVE THE DYNAMIC MAP
        attributes: currentRaceAttributes, 
        
        // SAVE THE TRAIT ARRAY
        traits: currentRaceTraits,
        
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (id) {
            await firestore.collection('master_races').doc(id).update(raceData);
        } else {
            raceData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await firestore.collection('master_races').add(raceData);
        }
        loadMasterRaceList();
        closeRaceModal();
    } catch (e) { console.error(e); }
}

// --- 6. LOAD LIST ---
async function loadMasterRaceList() {
    const list = document.getElementById('master-race-list');
    if(!list) return;

    // Ensure we have the latest attribute names for the tooltip
    await getAttributeDefinitions(); 

    const searchTerm = document.getElementById('race-search-input') ? document.getElementById('race-search-input').value.toLowerCase() : "";
    const snap = await firestore.collection('master_races').orderBy('name').get();
    list.innerHTML = "";

    snap.forEach(doc => {
        const r = doc.data();
        if (r.name.toLowerCase().includes(searchTerm)) {
            const card = document.createElement('div');
            card.className = "panel-card m-s trait-item-border";
            
            // 1. Generate the individual tooltip sections
            const descSection = buildUniversalTooltip(r.description || "No description.", "DESCRIPTION");
            const attrSection = buildUniversalTooltip(r.attributes, "STATS");
            const traitSection = buildUniversalTooltip(r.traits, "TRAITS");

            // 2. Combine them into the final hover text
            // Organized as: NAME -> DESCRIPTION -> STATS -> TRAITS
            card.title = `${r.name.toUpperCase()}\n\n${descSection}\n\n${attrSection}\n\n${traitSection}`;

            const traitBadges = (r.traits || []).map(t => `<span class="badge-stat" style="font-size:0.7rem; margin-right:4px;">${t}</span>`).join("");

            card.innerHTML = `
                <div class="flex-row space-between m-s">
                    <strong class="text-success" style="cursor: help;">
                        ${r.name} <i class="fa-solid fa-circle-info" style="font-size:0.7rem; opacity:0.5;"></i>
                    </strong>
                    <div>
                        <button class="btn-icon-tiny" onclick="prepRaceEdit('${doc.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="btn-icon-tiny btn-danger" onclick="deleteMasterAsset('master_races', '${doc.id}', loadMasterRaceList)"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div class="flex-row flex-wrap m-s">${traitBadges}</div>
                <div class="text-muted" style="font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90%;">
                    ${r.description || "No description provided."}
                </div>
            `;
            list.appendChild(card);
        }
    });
}

/* ==========================================================================
   SECTION 10.2: CLASS REGISTRY (Version 0.3.1 - Traits & Attributes)
   ========================================================================== */

    let currentClassAttributes = {}; 
    let currentClassTraits = []; // NEW: Array to hold selected traits

    // --- A. MODAL CONTROLS ---

    function openClassModal() {
        resetClassForm(); 
        populateClassAttrPicker(); 
        populateClassTraitPicker(); // NEW: Load traits
        setSafeText('class-modal-title', "Register New Class");
        document.getElementById('class-modal').classList.remove('hide-default');
    }

    function closeClassModal() {
        document.getElementById('class-modal').classList.add('hide-default');
    }

    // --- B. HELPER FUNCTIONS (Attributes) ---

    async function populateClassAttrPicker() {
        const select = document.getElementById('class-attr-picker');
        if (!select) return;
        
        select.innerHTML = '<option value="">Select stat bonus...</option>';
        
        try {
            const snap = await firestore.collection('master_attributes').orderBy('name').get();
            attributeDefinitions = {}; 
            
            snap.forEach(doc => {
                const d = doc.data();
                attributeDefinitions[d.key] = d.name; 
                if (!currentClassAttributes.hasOwnProperty(d.key)) {
                    const opt = document.createElement('option');
                    opt.value = d.key;
                    opt.innerText = d.name;
                    select.appendChild(opt);
                }
            });
        } catch (e) { console.error("Attr Load Error:", e); }
    }

    function addClassAttr() {
        const select = document.getElementById('class-attr-picker');
        const key = select.value;
        if (!key) return;
        currentClassAttributes[key] = 0; 
        renderClassAttributes();
        populateClassAttrPicker(); 
    }

    function removeClassAttr(key) {
        delete currentClassAttributes[key];
        renderClassAttributes();
        populateClassAttrPicker();
    }

    function updateClassAttrValue(key, val) {
        currentClassAttributes[key] = parseFloat(val) || 0;
    }

    function renderClassAttributes() {
        const container = document.getElementById('class-dynamic-attributes');
        if (!container) return;
        container.innerHTML = "";

        if (Object.keys(currentClassAttributes).length === 0) {
            container.innerHTML = `<div class="text-muted text-center" style="font-size:0.8rem; padding:10px;">No bonuses defined.</div>`;
            return;
        }

        for (const [key, value] of Object.entries(currentClassAttributes)) {
            const name = attributeDefinitions[key] || key;
            const div = document.createElement('div');
            div.className = "flex-row space-between p-s trait-item-border m-s";
            div.style.background = "#27272a";
            div.innerHTML = `
                <strong class="text-muted" style="width: 140px;">${name}</strong>
                <input type="number" class="form-input" style="width: 80px; text-align: right;" 
                    value="${value}" step="0.1" onchange="updateClassAttrValue('${key}', this.value)">
                <button class="btn-icon-tiny btn-danger" onclick="removeClassAttr('${key}')">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            container.appendChild(div);
        }
    }

    // --- C. HELPER FUNCTIONS (Traits) ---

    async function populateClassTraitPicker() {
        const select = document.getElementById('class-trait-picker');
        const searchVal = document.getElementById('class-trait-search').value.toLowerCase();
        const filterVal = document.getElementById('class-trait-filter').value;
        
        if (!select) return;
        select.innerHTML = '<option value="">Select trait...</option>';

        try {
            const snap = await firestore.collection('master_traits').orderBy('name').get();
            
            snap.forEach(doc => {
                const d = doc.data();
                const nameMatch = d.name.toLowerCase().includes(searchVal);
                const typeMatch = (filterVal === "All" || d.source === filterVal);
                const alreadyAdded = currentClassTraits.includes(d.name);

                // Only add to dropdown if it matches search/filter AND isn't already in the class
                if (nameMatch && typeMatch && !alreadyAdded) {
                    const opt = document.createElement('option');
                    opt.value = d.name;
                    opt.innerText = d.name;
                    select.appendChild(opt);
                }
            });
        } catch (e) { console.error("Trait Picker Error:", e); }
    }

    function addClassTrait() {
        const select = document.getElementById('class-trait-picker');
        const val = select.value;
        if (!val) return;

        if (!currentClassTraits.includes(val)) {
            currentClassTraits.push(val);
            renderClassTraits();
            populateClassTraitPicker(); // Refresh list
        }
    }

    function removeClassTrait(name) {
        currentClassTraits = currentClassTraits.filter(t => t !== name);
        renderClassTraits();
        populateClassTraitPicker();
    }

    function renderClassTraits() {
        const container = document.getElementById('class-active-traits');
        if (!container) return;
        container.innerHTML = "";

        currentClassTraits.forEach(t => {
            const tag = document.createElement('div');
            tag.className = "trait-tag flex-row gap-s";
            tag.style.padding = "4px 8px";
            tag.innerHTML = `
                <span>${t}</span>
                <i class="fa-solid fa-xmark" style="cursor:pointer; opacity:0.7;" onclick="removeClassTrait('${t}')"></i>
            `;
            container.appendChild(tag);
        });
    }

    // --- D. MAIN CRUD ---

    async function saveMasterClass() {
        const classId = document.getElementById('m-class-id').value;
        const name = document.getElementById('m-class-name').value.trim();
        if (!name) return alert("Class name required!");

        const classData = {
            name: name,
            tier: parseInt(document.getElementById('m-class-tier').value) || 1,
            mainStat: document.getElementById('m-class-main-stat').value,
            attributes: currentClassAttributes,
            
            // NEW: Save the dynamic trait array
            traits: currentClassTraits,
            
            requirements: document.getElementById('m-class-reqs').value.trim(),
            description: document.getElementById('m-class-desc').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            if (classId) {
                await firestore.collection('master_classes').doc(classId).update(classData);
                if(typeof showToast === "function") showToast("Class Updated");
            } else {
                classData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await firestore.collection('master_classes').add(classData);
                if(typeof showToast === "function") showToast("Class Created");
            }
            closeClassModal(); 
            loadMasterClassList();
        } catch (e) { console.error(e); }
    }

    async function loadMasterClassList() {
    const list = document.getElementById('master-class-list');
    if (!list) return;

    try {
        // Ensure nice names for attributes are loaded
        await getAttributeDefinitions(); 

        const snap = await firestore.collection('master_classes').orderBy('tier').get();
        list.innerHTML = "";

        if (snap.empty) {
            list.innerHTML = '<p class="text-muted text-center" style="padding:20px;">No classes registered yet.</p>';
            return;
        }

        snap.forEach(doc => {
            const d = doc.data();

            // 1. Generate the Tooltip (Attributes + Description, No Traits)
            const descSection = buildUniversalTooltip(d.description || "No description provided.", "DESCRIPTION");
            const attrSection = buildUniversalTooltip(d.attributes, "STAT BONUSES");
            
            const card = document.createElement('div');
            card.className = "panel-card m-s";
            card.style.background = "#18181b";
            card.style.borderLeft = `4px solid ${d.tier == 3 ? '#fbbf24' : d.tier == 2 ? '#6366f1' : '#3f3f46'}`;
            
            // Apply the modular tooltip to the whole card
            card.title = `${d.name.toUpperCase()} (T${d.tier})\n\n${descSection}\n\n${attrSection}`;

            // 2. Render Trait Tags (keeping them visible as requested)
            const traitTags = (d.traits || []).map(t => 
                `<span style="background:#312e81; color:#c7d2fe; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-right:4px;">${t}</span>`
            ).join('');

            card.innerHTML = `
                <div class="flex-row" style="justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1;">
                        <div class="flex-row" style="gap:10px; align-items: center; margin-bottom: 8px;">
                            <strong style="color:white; font-size: 1.1rem; cursor: help;">${d.name} <i class="fa-solid fa-circle-info" style="font-size:0.7rem; opacity:0.4;"></i></strong> 
                            <span class="join-code-pill" style="opacity:0.6;">T${d.tier}</span>
                            <span class="join-code-pill" style="color:#a855f7;">${d.mainStat || ""}</span>
                        </div>
                        <div style="margin-top: 5px;">${traitTags}</div>
                    </div>
                    <div class="flex-row" style="gap: 5px;">
                        <button class="btn-small" onclick="prepClassEdit('${doc.id}')" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="btn-danger-small" onclick="deleteMasterAsset('master_classes', '${doc.id}', loadMasterClassList)" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            list.appendChild(card);
        });
    } catch (e) {
        console.error("Class Load Error:", e);
        list.innerHTML = `<p style="color:#ef4444; text-align:center;">Error: ${e.message}</p>`;
    }
}

    async function prepClassEdit(id) {
        const d = (await firestore.collection('master_classes').doc(id).get()).data();
        if (!d) return;

        document.getElementById('m-class-id').value = id;
        setSafeValue('m-class-name', d.name);
        setSafeValue('m-class-tier', d.tier);
        setSafeValue('m-class-main-stat', d.mainStat);
        setSafeValue('m-class-reqs', d.requirements || "");
        setSafeValue('m-class-desc', d.description || "");
        
        // LOAD LISTS
        currentClassAttributes = d.attributes || {};
        currentClassTraits = d.traits || []; // NEW
        
        setSafeText('class-modal-title', "Editing Class: " + d.name);
        document.getElementById('class-modal').classList.remove('hide-default');
        
        await populateClassAttrPicker();
        renderClassAttributes();
        
        // NEW
        await populateClassTraitPicker();
        renderClassTraits();
    }

    function resetClassForm() {
        document.getElementById('m-class-id').value = "";
        setSafeValue('m-class-name', "");
        setSafeValue('m-class-tier', "1");
        setSafeValue('m-class-main-stat', "");
        setSafeValue('m-class-desc', "");
        setSafeValue('m-class-reqs', "");
        
        currentClassAttributes = {};
        currentClassTraits = []; // Reset traits
        
        renderClassAttributes();
        renderClassTraits(); // Clear display
    }

// ==========================================
// --- 10.3 SKILL REGISTRY ---
// ==========================================

function openSkillCreator() {
    document.getElementById('skill-creator-form').classList.remove('hide-default');
    resetSkillForm(); // Ensure clean slate
}

function autoSetMpCost() {
    const tier = parseInt(document.getElementById('reg-skill-tier').value) || 1;
    // Formula: 10 * 2^(tier-1) -> 10, 20, 40
    const cost = 10 * Math.pow(2, tier - 1);
    document.getElementById('reg-skill-cost').value = cost;
}

// 1. Process Skill Icon
function processSkillIcon(base64) {
    document.getElementById('reg-skill-icon-base64').value = base64;
    
    const preview = document.getElementById('icon-preview');
    if (preview) {
        // We use your existing registry-icon class for the look
        preview.innerHTML = `<img src="${base64}" class="registry-icon">`;
    }
}

// 2. Save / Update Logic
async function saveSkillToRegistry() {
    const skillId = document.getElementById('ms-skill-id').value; 
    const name = document.getElementById('reg-skill-name').value.trim();
    const skillClass = document.getElementById('reg-skill-class').value;
    
    if (!name || !skillClass) return alert("Name and Class are required.");

    const skillData = {
        name,
        class: skillClass,
        tier: parseInt(document.getElementById('reg-skill-tier').value),
        baseCost: parseInt(document.getElementById('reg-skill-cost').value) || 0,
        description: document.getElementById('reg-skill-desc').value.trim(),
        iconData: document.getElementById('reg-skill-icon-base64').value,
        range: document.getElementById('reg-skill-range').value,
        castTime: parseFloat(document.getElementById('reg-skill-cast').value) || 0,
        cooldown: parseFloat(document.getElementById('reg-skill-cooldown').value) || 0,
        aoe: document.getElementById('reg-skill-aoe').value.trim(),
        damageType: document.getElementById('reg-skill-dmg-type').value,
        scalingStat: document.getElementById('reg-skill-stat').value,
        scalingFactor: parseFloat(document.getElementById('reg-skill-factor').value) || 1.0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (skillId) {
            await firestore.collection('master_skills').doc(skillId).update(skillData);
        } else {
            const newId = `${skillClass.toLowerCase()}_${name.replace(/\s+/g, '_').toLowerCase()}`;
            skillData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await firestore.collection('master_skills').doc(newId).set(skillData);
        }
        resetSkillForm();
        loadSkillRegistry();
    } catch (e) { console.error(e); }
}

// 3. Edit Mode
async function editMasterSkill(id) {
    const doc = await firestore.collection('master_skills').doc(id).get();
    if (!doc.exists) return;
    const d = doc.data();

    document.getElementById('ms-skill-id').value = id;
    document.getElementById('reg-skill-name').value = d.name;
    document.getElementById('reg-skill-class').value = d.class;
    document.getElementById('reg-skill-tier').value = d.tier;
    document.getElementById('reg-skill-cost').value = d.baseCost || 10;
    document.getElementById('reg-skill-desc').value = d.description || "";
    document.getElementById('reg-skill-icon-base64').value = d.iconData || "";
    document.getElementById('reg-skill-cast').value = d.castTime || 0;
    document.getElementById('reg-skill-cooldown').value = d.cooldown || 0;
    document.getElementById('reg-skill-range').value = d.range || "Touch";
    document.getElementById('reg-skill-aoe').value = d.aoe || ""; 
    document.getElementById('reg-skill-dmg-type').value = d.damageType || "";
    document.getElementById('reg-skill-stat').value = d.scalingStat || "none";
    document.getElementById('reg-skill-factor').value = d.scalingFactor || 1.0;

    if (d.iconData) {
        document.getElementById('icon-preview').innerHTML = `<img src="${d.iconData}">`;
    }

    document.getElementById('skill-save-btn').innerText = "Update Skill";
    document.getElementById('skill-cancel-btn').classList.remove('hide-default');
    document.querySelector('.master-workspace').scrollTop = 0;
}

// 4. Reset Form
function resetSkillForm() {
    document.getElementById('ms-skill-id').value = "";
    document.getElementById('reg-skill-icon-base64').value = "";
    document.getElementById('icon-preview').innerHTML = "";
    document.querySelectorAll('#sub-skills input').forEach(i => {
        if(i.type === "number") i.value = 0;
        else if(i.type !== "hidden") i.value = "";
    });
    document.getElementById('reg-skill-tier').value = "1";
    document.getElementById('reg-skill-cost').value = "10";
    document.getElementById('skill-save-btn').innerText = "Save Skill to Library";
    document.getElementById('skill-cancel-btn').classList.add('hide-default');
}

// 5. Load List
async function loadSkillRegistry() {
    const container = document.getElementById('registry-skill-list');
    if (!container) return;
    container.innerHTML = '<p class="text-center">Loading Library...</p>';
    try {
        // THIS MATCHES YOUR NEW INDEX EXACTLY
        const snap = await firestore.collection('master_skills')
            .orderBy('class')
            .orderBy('tier')
            .orderBy('name')
            .get();
            
        if(snap.empty) { container.innerHTML = '<p class="text-center opacity-50">No skills defined yet.</p>'; return; }
        
        let html = ''; 
        snap.forEach(doc => {
            const d = doc.data();
            const icon = d.iconData ? `<img src="${d.iconData}" class="registry-icon">` : `<div class="registry-icon-placeholder"><i class="fa-solid fa-image"></i></div>`;
            html += `
            <div class="panel-card m-s registry-skill-card">
                <div class="flex-row align-start space-between">
                    <div class="flex-row align-start gap-m">
                        ${icon}
                        <div class="skill-info-block">
                            <div class="flex-row gap-s wrap">
                                <strong class="skill-title-text">${d.name}</strong>
                                <span class="join-code-pill">${d.class}</span>
                                <span class="join-code-pill">T${d.tier}</span>
                                <span class="join-code-pill MP-pill">${d.baseCost} MP</span>
                            </div>
                            <p class="skill-desc-text">${d.description}</p>
                            <div class="skill-meta-tags">
                                <span><i class="fa-solid fa-clock"></i> ${d.castTime || 0}s / ${d.cooldown || 0}s</span>
                                <span><i class="fa-solid fa-ruler-combined"></i> ${d.range}</span>
                                <span><i class="fa-solid fa-burst"></i> ${d.damageType || 'Utility'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex-row gap-s">
                        <button class="btn-small" onclick="editMasterSkill('${doc.id}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-danger-small" onclick="deleteMasterAsset('master_skills', '${doc.id}', loadSkillRegistry)"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (e) { console.error(e); }
}

async function refreshSkillClassDropdown() {
    const dropdown = document.getElementById('reg-skill-class');
    if (!dropdown) return;
    try {
        const snap = await firestore.collection('master_classes').orderBy('name').get();
        let html = ``;
        snap.forEach(doc => { html += `<option value="${doc.data().name}">${doc.data().name}</option>`; });
        dropdown.innerHTML = html;
    } catch (e) { console.error(e); }
}

// --- 10.4 TRAIT LIBRARY ---
async function deleteTrait(id) {
    if (!confirm("Are you sure?")) return;
    try {
        await firestore.collection('master_traits').doc(id).delete();
        loadMasterTraitList(); // CHANGE: from loadTraitLibrary
    } catch (error) { console.error(error); }
}



async function ensureTraitExists(traitName) {
    if (!traitName) return;
    const query = await firestore.collection('master_traits').where("name", "==", traitName).get();
    if (query.empty) {
        console.log(`Auto-registering placeholder for: ${traitName}`);
        await firestore.collection('master_traits').add({ 
            name: traitName, 
            sourceType: "General",
            description: "Mechanical details needed.", 
            statTarget: "none",
            createdAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        
        loadMasterTraitList();
    }
}



let traitSortMode = 'alpha'; // Global toggle state: 'alpha' or 'newest'

function toggleTraitSort() {
    traitSortMode = traitSortMode === 'alpha' ? 'newest' : 'alpha';
    const icon = document.getElementById('trait-sort-icon');
    icon.className = traitSortMode === 'alpha' ? 'fa-solid fa-sort-alpha-down' : 'fa-solid fa-clock';
    loadMasterTraitList();
}

async function loadMasterTraitList() {
    // 1. Target the INNER list div, NOT the whole panel
    const list = document.getElementById('master-trait-list'); 
    if (!list) return;

    const searchTerm = document.getElementById('trait-search-input').value.toLowerCase();
    const filterSource = document.getElementById('trait-filter-source').value;

    try {
        let query = firestore.collection('master_traits');
        query = (traitSortMode === 'alpha') ? query.orderBy('name', 'asc') : query.orderBy('updatedAt', 'desc');

        const snap = await query.get();
        
        // 2. This clears the CARDS only. It leaves the Header and Button alone.
        list.innerHTML = ""; 

        snap.forEach(doc => {
            const t = doc.data();
            if (t.name.toLowerCase().includes(searchTerm) && (filterSource === "All" || t.sourceType === filterSource)) {
                const card = document.createElement('div');
                card.className = "panel-card m-s trait-item-border"; 
                card.style.borderLeftColor = getSourceColor(t.sourceType);

                // Added logic fallback to fix the "(undefined)" labels
                const sourceDisplay = t.sourceType || "General";

                card.innerHTML = `
                    <div class="trait-card-header m-s">
                        <div>
                            <strong class="text-success">${t.name}</strong>
                            <span class="text-muted ml-s" style="font-size: 0.7rem;">(${sourceDisplay})</span>
                        </div>
                        <div class="flex-row gap-s">
                            <button class="btn-icon-tiny" onclick="prepTraitEdit('${doc.id}')">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button class="btn-icon-tiny btn-danger" onclick="deleteTrait('${doc.id}')">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <textarea class="form-input w-100" style="height: 50px; font-size: 0.8rem;" 
                        onchange="updateTraitDescription('${doc.id}', this.value)" 
                        placeholder="Add mechanical description...">${t.description || ""}</textarea>
                `;
                list.appendChild(card);
            }
        });
    } catch (err) { console.error("Load Error:", err); }
}

// Helper for color coding the left border
function getSourceColor(source) {
    switch(source) {
        case 'Race': return '#ef4444';      // Red
        case 'Class': return '#3b82f6';     // Blue
        case 'Backstory': return '#10b981'; // Green
        default: return '#3f3f46';          // Gray
    }
}

async function updateTraitDescription(id, val) {
    await firestore.collection('master_traits').doc(id).update({ description: val });
}

// --- 10.5 ATTRIBUTE LIBRARY LOGIC ---

function openAttributeModal() {
    // Reset fields
    document.getElementById('m-attr-id').value = "";
    document.getElementById('m-attr-name').value = "";
    document.getElementById('m-attr-key').value = "";
    document.getElementById('m-attr-default').value = 0;
    
    // Reset UI State
    document.getElementById('attr-modal-title').innerText = "Define Attribute";
    document.getElementById('m-attr-key').disabled = false; // Re-enable for new entries
    
    document.getElementById('attribute-modal').classList.remove('hide-default');
}

function closeAttrModal() {
    document.getElementById('attribute-modal').classList.add('hide-default');
}

async function saveAttribute() {
    const id = document.getElementById('m-attr-id').value;
    const name = document.getElementById('m-attr-name').value.trim();
    const key = document.getElementById('m-attr-key').value.trim().toLowerCase().replace(/\s+/g, '_'); // Auto-format key
    const defVal = parseFloat(document.getElementById('m-attr-default').value) || 0;

    if (!name || !key) return alert("Name and Key are required.");

    const data = { name, key, defaultValue: defVal };

    try {
        if (id) {
            await firestore.collection('master_attributes').doc(id).update(data);
        } else {
            // Check if key exists first to prevent duplicates
            const check = await firestore.collection('master_attributes').where('key', '==', key).get();
            if (!check.empty) return alert("This Key already exists!");
            
            await firestore.collection('master_attributes').add(data);
        }
        closeAttrModal();
        loadAttributeList();
    } catch (e) { console.error(e); }
}

async function loadAttributeList() {
    const list = document.getElementById('master-attribute-list');
    if (!list) return;
    
    list.innerHTML = '<div class="text-muted p-s">Loading attributes...</div>';

    try {
        const snap = await firestore.collection('master_attributes').orderBy('name').get();
        list.innerHTML = "";

        if (snap.empty) {
            list.innerHTML = '<div class="text-muted p-s">No attributes defined yet.</div>';
            return;
        }

        snap.forEach(doc => {
            const d = doc.data();
            const div = document.createElement('div');
            div.className = "panel-card m-s flex-row space-between trait-item-border";
            div.innerHTML = `
                <div>
                    <strong class="text-success">${d.name}</strong>
                    <div class="text-muted small">Key: <code style="color:#a1a1aa">${d.key}</code> | Default: ${d.defaultValue}</div>
                </div>
                <div class="flex-row gap-s">
                    <button class="btn-icon-tiny" onclick="prepAttributeEdit('${doc.id}')">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn-icon-tiny btn-danger" onclick="deleteMasterAsset('master_attributes', '${doc.id}', loadAttributeList)">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (e) {
        console.error("Attribute Load Error:", e);
        list.innerHTML = `<div class="text-danger p-s">Error: ${e.message}</div>`;
    }
}


async function prepAttributeEdit(id) {
    try {
        const doc = await firestore.collection('master_attributes').doc(id).get();
        if (!doc.exists) return;
        const d = doc.data();

        // Fill the modal fields
        document.getElementById('m-attr-id').value = id;
        document.getElementById('m-attr-name').value = d.name || "";
        document.getElementById('m-attr-key').value = d.key || "";
        document.getElementById('m-attr-default').value = d.defaultValue || 0;

        // Change Title
        document.getElementById('attr-modal-title').innerText = "Edit Attribute: " + d.name;

        // Optional: Disable the key field so they don't break existing references
        document.getElementById('m-attr-key').disabled = true;

        // Show Modal
        document.getElementById('attribute-modal').classList.remove('hide-default');
    } catch (e) { console.error("Error prepping attribute edit:", e); }
}



/* ==========================================================================
   SECTION 15: GLOBAL UTILITIES & CLAMPING (v0.4.1)
   ========================================================================== */

    function updateVisualBars(hp, hpMax, mp, mpMax) {
        const hpFill = document.getElementById('char-hp-fill-main');
        const mpFill = document.getElementById('char-mp-fill-main');

        if (hpFill) {
            const hpPercent = (hp / (hpMax || 1)) * 100;
            hpFill.style.width = `${Math.max(0, Math.min(100, hpPercent))}%`;
        }

        if (mpFill) {
            const mpPercent = (mp / (mpMax || 1)) * 100;
            mpFill.style.width = `${Math.max(0, Math.min(100, mpPercent))}%`;
        }
    }