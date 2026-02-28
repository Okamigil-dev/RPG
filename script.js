// ==========================================
// --- 1. STATE VARIABLES & DEFAULTS ---
// ==========================================

let totalCustomSeconds = 0; 
let speedMultiplier = 1;
let isRunning = false;
let lastRealTime = Date.now();

let currentCampaignId = "global"; 
let currentCharacterId = null; 

let pendingStats = { body: 0, mind: 0, spirit: 0 };
let originalStats = { body: 0, mind: 0, spirit: 0 };
let totalAP = 0;
let activeCharLevel = 1;
let characterListener = null;

const MAX_CHAR_LEVEL = 60;      // Hard Cap for Base Level
const MAX_ALLOCATED_STAT = 20;  // Hard Cap for Body/Mind/Spirit (Allocated points only)


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

async function getTotalRegen(charData) {
    // 1. Fetch Race Regen
    const raceSnap = await firestore.collection('master_races').where('name', '==', charData.race).limit(1).get();
    const raceD = raceSnap.empty ? { hpRegen: 0, mpRegen: 0 } : raceSnap.docs[0].data();

    // 2. Baseline (~100% in 8 hours) + Racial Bonus
    let totalHPRegen = (charData.hpMax * 0.00208333) + (raceD.hpRegen || 0);
    let totalMPRegen = (charData.mpMax * 0.00208333) + (raceD.mpRegen || 0);

    // 3. Add Class Regen Bonuses
    for (const className of Object.keys(charData.unlockedClasses || {})) {
        const classSnap = await firestore.collection('master_classes').where('name', '==', className).limit(1).get();
        if (!classSnap.empty) {
            const classD = classSnap.docs[0].data();
            totalHPRegen += (classD.hpRegenBonus || 0);
            totalMPRegen += (classD.mpRegenBonus || 0);
        }
    }

    return { totalHPRegen, totalMPRegen };
}

async function applyPassiveRegen() {
    if (!currentCharacterId) return;

    // 1. Fetch data for accurate regen rates (Race + Class bonuses)
    const charSnap = await firestore.collection('users').doc(auth.currentUser.uid)
        .collection('characters').doc(currentCharacterId).get();
    const charData = charSnap.data();
    
    // 2. Calculate the Regen Amount
    const { totalHPRegen, totalMPRegen } = await getTotalRegen(charData);

    const hpInput = document.getElementById('char-hp-current');
    const mpInput = document.getElementById('char-mp-current');

    // 3. Get current high-precision values
    let hpCur = parseFloat(hpInput.dataset.trueValue) || parseFloat(hpInput.value) || 0;
    let mpCur = parseFloat(mpInput.dataset.trueValue) || parseFloat(mpInput.value) || 0;

    // 4. Apply Regen (Clamped to Max)
    // We use the calculated max from the sheet inputs to be safe
    const hpMax = parseFloat(document.getElementById('char-hp-max').value) || 10;
    const mpMax = parseFloat(document.getElementById('char-mp-max').value) || 10;

    const newHP = Math.min(hpCur + totalHPRegen, hpMax);
    const newMP = Math.min(mpCur + totalMPRegen, mpMax);

    // 5. UPDATE CHARACTER SHEET (Inputs)
    hpInput.dataset.trueValue = newHP;
    mpInput.dataset.trueValue = newMP;
    
    hpInput.value = Math.floor(newHP);
    mpInput.value = Math.floor(newMP);
    
    // 6. UPDATE SIDEBAR HUD (Visuals)
    // This answers your question: We use the same 'newHP' variable for both!
    document.getElementById('hud-hp-text').innerText = `${Math.floor(newHP)}/${hpMax}`;
    document.getElementById('hud-mp-text').innerText = `${Math.floor(newMP)}/${mpMax}`;

    const hpPerc = Math.min((newHP / hpMax) * 100, 100);
    const mpPerc = Math.min((newMP / mpMax) * 100, 100);

    document.getElementById('hud-hp-fill').style.width = hpPerc + "%";
    document.getElementById('hud-mp-fill').style.width = mpPerc + "%";
}


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

setInterval(tick, 100);



// ==========================================
// --- 5. ALERT ALTERNATIVE ---
// ==========================================

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-container';
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
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
    const topNav = document.getElementById('top-nav');
    const appBody = document.querySelector('.app-body');
    const mainContent = document.getElementById('main-content');
    const sidebar = document.getElementById('sidebar');

    if (user) {
        // Inside the 'if (user)' block:
        const savedTab = localStorage.getItem('activeMainTab');
        
        // If there's no saved tab, or the saved tab is the login tab, default to character sheet
        if (!savedTab || savedTab === 'tab-login') {
            openTab('tab-character');
        } else {
            openTab(savedTab);
        }
        // --- LOGGED IN STATE ---
        topNav.classList.remove('hide-default');
        appBody.classList.remove('hide-default');
        sidebar.classList.remove('hide-default'); // Make sure sidebar comes back

        // RESET main-content from Splash Mode to Dashboard Mode
        mainContent.style.width = "";
        mainContent.style.display = "";
        mainContent.style.justifyContent = "";
        mainContent.style.alignItems = "";
        mainContent.classList.remove('login-splash-mode');
        
        // Ensure sidebar and nav items are visible
        document.getElementById('main-nav-tabs').classList.remove('hide-default');
        document.getElementById('logout-btn').classList.remove('hide-default');
        document.getElementById('game-ui').classList.remove('hide-default');
        document.getElementById('user-display-name').innerText = user.email.split('@')[0];

        firestore.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                window.currentUserRole = data.role || 'Player';
                
                // Master/Admin specific UI
                const isMaster = (data.role === 'Master' || data.role === 'Admin');
                if (isMaster) {
                    document.getElementById('nav-control-panel').classList.remove('hide-default');
                    document.getElementById('master-quick-controls').classList.remove('hide-default');
                }

                document.getElementById('user-role-label').innerText = data.role;
                initClockListener();
                initDiceLogListener();
                
                if (data.lastActiveCharacter) selectCharacter(data.lastActiveCharacter);
                const savedTab = localStorage.getItem('activeMainTab') || 'tab-character';
                openTab(savedTab);
            }
        });
        syncRegistryToDropdowns();
        loadUserCharacters();
    } else {
        // --- LOGGED OFF MODE ---
        window.currentUserRole = null;
        
        // 1. Hide the top bar
        topNav.classList.add('hide-default');
        
        // 2. Hide the sidebar but KEEP app-body visible so we can see main-content
        sidebar.classList.add('hide-default');
        appBody.classList.remove('hide-default'); 

        // 3. Apply the Splash Screen centering
        mainContent.classList.add('login-splash-mode'); 
        // Note: Using the class .login-splash-mode is cleaner than setting .style manually
        
        // 4. Hide character HUD
        document.getElementById('active-char-hud').classList.add('hide-default');
        
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

    // --- Only save to memory if it's NOT the login tab ---
    if (tabId !== 'tab-login') {
        localStorage.setItem('activeMainTab', tabId);
    }
    
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
    if (subTabId === 'sub-skills') { refreshSkillClassDropdown(); loadMasterSkillList(); }
    if (subTabId === 'sub-classes') loadMasterClassList();
    if (subTabId === 'sub-traits') loadMasterTraitList();
    
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
        
        hpBonusFlat: 0,  
        hpBonusPerc: 0,  
        mpBonusFlat: 0,
        mpBonusPerc: 0,
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

async function selectCharacter(id) {
    // 0. CLEANUP: Unsubscribe from previous character updates
    if (characterListener) characterListener(); 

    // 1. RESET UI
    const allInputs = document.querySelectorAll('#char-sheet-view input');
    allInputs.forEach(input => { if(input.type !== 'file') input.value = ""; });

    currentCharacterId = id;
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(id);

    // 2. START LISTENING (Real-Time Connection)
    characterListener = charRef.onSnapshot(async (doc) => {
        if (doc.exists) {
            const d = doc.data();

            // === SWITCH INSTANCE LISTENERS (Only if changed) ===
            if (currentCampaignId !== (d.instanceId || "global")) {
                currentCampaignId = d.instanceId || "global"; 
                initClockListener(); 
                initDiceLogListener();
            }
            
            // 3. SYNC INPUTS (This updates your sheet if the Master edits it!)
            // We verify elements exist to prevent errors during tab switching
            if(document.getElementById('char-name')) {
                document.getElementById('char-name').value = d.name || "";
                document.getElementById('char-race').value = d.race || "";
                document.getElementById('char-exp-current').value = d.expCurrent || 0;
            }

            // 4. CALCULATE LEVEL & STATS
            activeCharLevel = calculateLevelFromEXP(d.expCurrent || 0);
            
            if(document.getElementById('char-level-display')) {
                document.getElementById('char-level-display').innerText = `Lv. ${activeCharLevel}`;
            }
            
            // Initialize Stats & AP
            originalStats = { body: d.body || 0, mind: d.mind || 0, spirit: d.spirit || 0 };
            pendingStats = { ...originalStats };

            const spentPoints = (originalStats.body + originalStats.mind + originalStats.spirit);
            totalAP = Math.max(0, activeCharLevel - spentPoints); 

            // 5. CLASS PILLS
            const classListContainer = document.getElementById('char-class-list-display');
            if(classListContainer) {
                classListContainer.innerHTML = "";
                const classes = d.unlockedClasses || {};
                if (Object.keys(classes).length === 0) {
                    classListContainer.innerHTML = '<span class="text-muted" style="font-size: 0.8rem;">No classes unlocked</span>';
                } else {
                    Object.keys(classes).forEach(className => {
                        const pill = document.createElement('span');
                        pill.className = 'join-code-pill';
                        pill.innerText = `${className} Lv.${classes[className].level}`;
                        classListContainer.appendChild(pill);
                    });
                }
            }

            refreshStatDisplay();

            // 6. CALCULATE TOTALS (Async calculation)
            const totals = await getFinalMaxStats(d);
            const nextLevelExp = (activeCharLevel + 1) * 200;

            if(document.getElementById('char-hp-max')) {
                document.getElementById('char-hp-max').value = totals.finalHP;
                document.getElementById('char-mp-max').value = totals.finalMP;
                document.getElementById('char-exp-max').value = nextLevelExp;
                
                // Sync Current Values
                const hpInput = document.getElementById('char-hp-current');
                const mpInput = document.getElementById('char-mp-current');
                
                // Only update inputs if they are not currently being typed in (optional polish)
                // For now, we force update to ensure sync
                hpInput.dataset.trueValue = d.hpCurrent || 0;
                hpInput.value = Math.floor(d.hpCurrent || 0);
                
                mpInput.dataset.trueValue = d.mpCurrent || 0;
                mpInput.value = Math.floor(d.mpCurrent || 0);
            }

            // 7. RENDER GALLERY & SKILLS
            renderGallery(d.gallery || [], d.portrait || "");
            renderSkills(d);

            // 8. UPDATE HUD (This creates the "Real-Time Bar" effect)
            const hudData = { 
                ...d, 
                charLevel: activeCharLevel, 
                hpMax: totals.finalHP, 
                mpMax: totals.finalMP,
                expMax: nextLevelExp
            };
            updateHUD(hudData);
            
            // Show the sheet if hidden
            document.getElementById('char-selection-view').classList.add('hide-default');
            document.getElementById('char-sheet-view').classList.remove('hide-default');
        }
    });

    // Update "Last Active" without triggering a full reload
    firestore.collection('users').doc(user.uid).update({ lastActiveCharacter: id });
}

async function saveCharacter() {
    if (!currentCharacterId) return;

    const charRef = firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId);
    
    // 1. Get current data to preserve protected fields (like portrait)
    const doc = await charRef.get();
    const currentData = doc.data();

// 1. Recalculate Level & Target based on new Input
    const expInput = document.getElementById('char-exp-current');
    const currentExp = parseInt(expInput.value) || 0;
    
    activeCharLevel = calculateLevelFromEXP(currentExp); 
    const nextLevelExp = (activeCharLevel + 1) * 200; // New Target

    // 2. Update the "Max" display immediately
    document.getElementById('char-exp-max').value = nextLevelExp;

    const data = {
        name: document.getElementById('char-name').value,
        race: document.getElementById('char-race').value,
        expCurrent: currentExp,
        charLevel: activeCharLevel,
        
        // Use global stats variables
        body: originalStats.body || 0,
        mind: originalStats.mind || 0,
        spirit: originalStats.spirit || 0,
        
        hpCurrent: parseFloat(document.getElementById('char-hp-current').value) || 0,
        mpCurrent: parseFloat(document.getElementById('char-mp-current').value) || 0,
        
        // Preserve existing data
        portrait: currentData.portrait || "", 
        gallery: currentData.gallery || [],
        unlockedClasses: currentData.unlockedClasses || {}
    };

    try {
        await charRef.update(data);
        
        // Update UI using Global
        document.getElementById('char-level-display').innerText = `Lv. ${activeCharLevel}`;
        
        // 5. Update the Sidebar HUD immediately
        const totals = await getFinalMaxStats(data);
        updateHUD({ 
            ...data, 
            hpMax: totals.finalHP, 
            mpMax: totals.finalMP,
            expMax: nextLevelExp // <--- Ensures sidebar bar fills correctly
        });
        
        if (typeof showToast === "function") showToast("Character Saved.");
        
    } catch (e) { 
        console.error("Save Error:", e); 
        if (typeof showToast === "function") showToast("Error: Save Failed");
    }
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

function refreshStatDisplay() {
    // Calculate spent AP by comparing current pending to original database values
    let spentAP = (pendingStats.body - originalStats.body) + 
                  (pendingStats.mind - originalStats.mind) + 
                  (pendingStats.spirit - originalStats.spirit);
    
    let remAP = totalAP - spentAP;
    document.getElementById('char-ap-rem').innerText = remAP;
    
    // Update display labels
    document.getElementById('display-body').innerText = pendingStats.body;
    document.getElementById('display-mind').innerText = pendingStats.mind;
    document.getElementById('display-spirit').innerText = pendingStats.spirit;

    // Show/Hide confirm button only if there are changes
    const hasChanges = spentAP !== 0;
    document.getElementById('attr-confirm-area').classList.toggle('hide-default', !hasChanges);
}

function adjustPendingStat(stat, amount) {
    if (!currentCharacterId) return;

    const currentVal = pendingStats[stat];
    
    // CAP CHECK: Prevent increasing if already at 20
    if (amount > 0 && currentVal >= MAX_ALLOCATED_STAT) {
        showToast(`Stat Cap Reached! (Max ${MAX_ALLOCATED_STAT})`);
        return;
    }

    // Prevent negative stats
    if (amount < 0 && currentVal <= 0) return;

    // Check AP availability logic (existing logic)...
    const cost = amount; 
    if (amount > 0 && totalAP < cost) return;

    // Apply change
    pendingStats[stat] += amount;
    totalAP -= cost;
    
    refreshStatDisplay();
}

async function confirmAttributeChanges() {
    if (!currentCharacterId) return;
    
    // Calculate points spent in this specific transaction
    let spentInThisBatch = (pendingStats.body - originalStats.body) + 
                           (pendingStats.mind - originalStats.mind) + 
                           (pendingStats.spirit - originalStats.spirit);

    try {
        await firestore.collection('users').doc(auth.currentUser.uid)
            .collection('characters').doc(currentCharacterId).update({
                body: pendingStats.body,
                mind: pendingStats.mind,
                spirit: pendingStats.spirit
            });
            
        // --- CRITICAL FIXES ---
        // 1. Deduct from the "Available" pool permanently
        totalAP -= spentInThisBatch; 
        
        // 2. Lock in the new baseline
        originalStats = { ...pendingStats };
        
        // 3. Use Toast instead of Alert
        if (typeof showToast === "function") showToast("Attributes committed.");
        
        refreshStatDisplay(); // Updates the "AP Available" text to 0
        saveCharacter();      // Recalculates HP/MP Max
    } catch (e) { 
        console.error("Update failed:", e); 
        if (typeof showToast === "function") showToast("Update Failed");
    }
}





function goBackToSelection() {
    document.getElementById('char-selection-view').classList.remove('hide-default');
    document.getElementById('char-sheet-view').classList.add('hide-default');
}

// This replaces the hardcoded lists by fetching YOUR registry
// This replaces the hardcoded lists by fetching YOUR registry
async function syncRegistryToDropdowns() {
    const raceSelect = document.getElementById('char-race');
    if (!raceSelect) return; // Safety check

    try {
        const raceSnap = await firestore.collection('master_races').get();
        raceSelect.innerHTML = '<option value="">Select Race</option>';
        raceSnap.forEach(doc => {
            const d = doc.data();
            raceSelect.innerHTML += `<option value="${d.name}">${d.name}</option>`;
        });
    } catch (error) {
        console.error("Error syncing registry:", error);
    }
} // <--- Ensure only ONE brace here



/* ==========================================
   --- 10. HUD HANDLING ---
   ========================================== */

async function updateHUD(char) {
    const hud = document.getElementById('active-char-hud');
    if (!hud) return;
    hud.classList.remove('hide-default');
    
    // 1. Fetch live Race data for Natural Bonuses
    const raceSnap = await firestore.collection('master_races').where('name', '==', char.race).limit(1).get();
    const raceD = raceSnap.empty ? { baseBody: 0, baseMind: 0, baseSpirit: 0 } : raceSnap.docs[0].data();

    // 2. Calculate the ACTUAL Totals (Spent Points + Natural Racial Bonus)
    const totalB = (char.body || 0) + (raceD.baseBody || 0);
    const totalM = (char.mind || 0) + (raceD.baseMind || 0);
    const totalS = (char.spirit || 0) + (raceD.baseSpirit || 0);

    // Helper for HUD Effective Modifiers: Floor(Total / 2)
    const getMod = (totalVal) => {
        const mod = Math.floor(totalVal / 2);
        return mod >= 0 ? `+${mod}` : mod;
    };

    // 3. Identity and Metadata
    document.getElementById('hud-name').innerText = char.name || "Unnamed";
    
    const classes = char.unlockedClasses || {}; 
    const classStrings = Object.keys(classes).map(name => `${name} Lv.${classes[name].level}`);
    const classText = classStrings.length > 0 ? classStrings.join(', ') : (char.class || "Adventurer");
    
    // --- GLOBAL USE: Just use the global variable for the sidebar ---
    document.getElementById('hud-meta').innerText = `Lv.${activeCharLevel} (${classText})`;

    // 4. Text Resources (Floored for visual clarity)
    document.getElementById('hud-hp-text').innerText = 
        `${Math.floor(char.hpCurrent || 0)}/${Math.floor(char.hpMax || 0)}`;
    document.getElementById('hud-mp-text').innerText = 
        `${Math.floor(char.mpCurrent || 0)}/${Math.floor(char.mpMax || 0)}`;

    // 5. Portrait Stabilizer
    const portraitEl = document.getElementById('hud-portrait');
    portraitEl.style.backgroundImage = char.portrait ? `url(${char.portrait})` : "none";
    
    // 6. Sidebar Modifiers
    document.getElementById('hud-mod-body').innerText = `BODY ${getMod(totalB)}`;
    document.getElementById('hud-mod-mind').innerText = `MIND ${getMod(totalM)}`;
    document.getElementById('hud-mod-spirit').innerText = `SPIRIT ${getMod(totalS)}`;

    // 7. SYNC: Update Character Sheet Green Pills (Visual Reflection)
    if(document.getElementById('total-body-label')) {
        document.getElementById('total-body-label').innerText = totalB;
        document.getElementById('total-mind-label').innerText = totalM;
        document.getElementById('total-spirit-label').innerText = totalS;
    }

    // 8. Progress Bar Widths
    const hpPerc = Math.min(((char.hpCurrent || 0) / (char.hpMax || 1)) * 100, 100);
    const mpPerc = Math.min(((char.mpCurrent || 0) / (char.mpMax || 1)) * 100, 100);
    const expPerc = Math.min(((char.expCurrent || 0) / (char.expMax || 1000)) * 100, 100);

    document.getElementById('hud-hp-fill').style.width = hpPerc + "%";
    document.getElementById('hud-mp-fill').style.width = mpPerc + "%";
    document.getElementById('hud-exp-fill').style.width = expPerc + "%";
    if(document.getElementById('hud-exp-text')) {
        document.getElementById('hud-exp-text').innerText = `${Math.floor(expPerc)}%`;
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
    // 1. CLEAR THE LOG before starting the listener
    const log = document.getElementById('dice-log');
    if (log) {
        log.innerHTML = '<div class="dice-log-placeholder">Loading history...</div>';
    }
    
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


// --- OPEN MASTER PANEL --- /
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


// --- LOAD ALL USERS FROM FIRESTORE --- //
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

    const isAdmin = (window.currentUserRole === 'Admin');

    try {
        let snapshot;

        // 1. Fetch Logic: Admins see ALL, Masters see THEIRS
        if (isAdmin) {
            snapshot = await firestore.collection('instances').get();
        } else {
            snapshot = await firestore.collection('instances')
                .where('masters', 'array-contains', user.uid)
                .get();
        }

        if (snapshot.empty) {
            listContainer.innerHTML = `<p class="text-center" style="opacity: 0.5; padding: 20px;">No active instances found.</p>`;
            return;
        }

        let html = `<table class="admin-table">
            <thead><tr><th>World Name</th><th>Join Code</th><th>Masters</th><th>Actions</th></tr></thead>
            <tbody>`;

        snapshot.forEach(doc => {
            const data = doc.data();
            const id = doc.id;
            
            // Check if I am ALREADY a master (for UI styling)
            const isMyWorld = data.masters && data.masters.includes(user.uid);
            
            // Visual tweak: Darker background if it's an "Admin View" row
            const rowStyle = (isAdmin && !isMyWorld) ? 'style="background: #1e1e24;"' : '';

            html += `
                <tr ${rowStyle}>
                    <td>
                        <strong>${data.name || 'Unnamed World'}</strong>
                        ${(isAdmin && !isMyWorld) ? '<span style="font-size:0.6rem; color:#facc15; margin-left:5px;">(ADMIN VIEW)</span>' : ''}
                    </td>
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
        listContainer.innerHTML = `<p class="text-center" style="color: #ef4444; padding: 20px;">Database error.</p>`;
    }
}

// --- CREATE INSTANCE BUTTON --- //
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

/* === SHOW ALL INSTANCES === */
async function viewInstanceDetails(instanceId) {
    const user = auth.currentUser;
    const role = window.currentUserRole;

    // --- ADMIN AUTO-JOIN LOGIC ---
    // If I am an Admin, I force the door open.
    if (role === 'Admin') {
        try {
            // "arrayUnion" is smart: It only adds the ID if it isn't already there.
            // This prevents duplicates and saves database writes.
            await firestore.collection('instances').doc(instanceId).update({
                masters: firebase.firestore.FieldValue.arrayUnion(user.uid)
            });
            console.log("Admin privileges: Access granted to instance.");
        } catch (e) {
            console.error("Auto-join failed:", e);
            // We don't stop the function; we try to load anyway in case we were already a master
        }
    }

    // 2. Load the Controls
    currentCampaignId = instanceId; 
    initClockListener();
    
    // Update the UI label so you know which world you are controlling
    const label = document.getElementById('current-instance-name');
    if(label) label.innerText = instanceId; 

    // Show confirmation
    if (typeof showToast === "function") {
        showToast(`Controls synced to: ${instanceId}`);
    } else {
        alert(`Controls synced to: ${instanceId}`);
    }
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

// --- LOAD ALL CHARACTERS FROM FIRESTORE --- //
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

// --- SAVE CHARACTERS INSTANCES BUTTON --- //
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

// --- CHARACTER MANAGEMENT FILTER --- //
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

// --- CHARACTER MANAGEMENT MODAL UI --- //
async function openCharacterManagerModal(uid, cid) {
    document.getElementById('edit-modal-uid').value = uid;
    document.getElementById('edit-modal-cid').value = cid;

    try {
        const charRef = firestore.collection('users').doc(uid).collection('characters').doc(cid);
        const doc = await charRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            
            // 1. Fill standard inputs
            
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

            // 2. Populate YOUR tailored classes dynamically
            const classPicker = document.getElementById('modal-class-picker');
            const classSnap = await firestore.collection('master_classes').orderBy('name').get();
            
            classPicker.innerHTML = '<option value="">Select Class to Add...</option>';
            classSnap.forEach(doc => {
                const className = doc.data().name;
                classPicker.innerHTML += `<option value="${className}">${className}</option>`;
            });
        
            // 3. Render the list of classes they already have
            renderModalClassList(uid, cid);
            
            // 4. Show the modal
            document.getElementById('master-char-edit-modal').classList.remove('hide-default');
        }
    } catch (error) {
        console.error("Error fetching character details:", error);
        alert("Failed to load character data.");
    }
}

function closeCharacterManagerModal() {
    const modal = document.getElementById('master-char-edit-modal');
    modal.classList.add('hide-default');
}

// --- ADD EXP TO CHARACTER IN MODAL UI --- //
function addExpQuick(amount) {
    const expInput = document.getElementById('edit-modal-exp');
    let currentExp = parseInt(expInput.value) || 0;
    
    // NOTE FOR LATER: This is exactly where we will inject the logic to check their backpack 
    // for "+15% EXP Amulets" and multiply the 'amount' before adding it!
    
    expInput.value = currentExp + amount;
}

// --- Class Assigning & Removing --- //
async function assignClassToCharacter() {
    const uid = document.getElementById('edit-modal-uid').value;
    const cid = document.getElementById('edit-modal-cid').value;
    const newClassName = document.getElementById('modal-class-picker').value;

    if (!newClassName) return;

    const charRef = firestore.collection('users').doc(uid).collection('characters').doc(cid);
    const doc = await charRef.get();
    let currentClasses = doc.data().unlockedClasses || {};

    // Only add if they don't have it yet
    if (!currentClasses[newClassName]) {
        currentClasses[newClassName] = {
            level: 1,
            exp: 0,
            tier: 1 // You can fetch the actual tier from master_classes if needed
        };

        await charRef.update({ unlockedClasses: currentClasses });
        sendSystemMessage(`${doc.data().name} was granted the ${newClassName} class.`);
        renderModalClassList(uid, cid);
    } else {
        alert("Character already has this class.");
    }
}

// --- LOAD CLASS LIST FROM FIRESTORE --- //
async function renderModalClassList(uid, cid) {
    const container = document.getElementById('modal-active-classes');
    const charRef = firestore.collection('users').doc(uid).collection('characters').doc(cid);
    const doc = await charRef.get();
    const classes = doc.data().unlockedClasses || {};

    container.innerHTML = "";
    
    Object.keys(classes).forEach(className => {
        const row = document.createElement('div');
        row.className = "flex-row mb-s";
        row.style.justifyContent = "space-between";
        row.style.background = "#111";
        row.style.padding = "8px";
        row.style.borderRadius = "4px";

        row.innerHTML = `
            <span><strong>${className}</strong> (Lv.${classes[className].level})</span>
            <button class="btn-danger-small" onclick="removeClassFromCharacter('${className}')">Remove</button>
        `;
        container.appendChild(row);
    });
}

// --- REMOVE CLASS FROM CHARACTER IN MODAL --- //
async function removeClassFromCharacter(className) {
    if (!confirm(`Are you sure you want to strip the ${className} class from this character?`)) return;

    const uid = document.getElementById('edit-modal-uid').value;
    const cid = document.getElementById('edit-modal-cid').value;
    const charRef = firestore.collection('users').doc(uid).collection('characters').doc(cid);

    const doc = await charRef.get();
    let currentClasses = doc.data().unlockedClasses || {};
    
    delete currentClasses[className];

    await charRef.update({ unlockedClasses: currentClasses });
    renderModalClassList(uid, cid);
}

// --- SAVE CHARACTER MODAL UI BUTTON --- //
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
            spirit: newSpirit,
            hpBonusFlat: parseInt(document.getElementById('edit-modal-hp-flat').value) || 0,
            hpBonusPerc: parseInt(document.getElementById('edit-modal-hp-perc').value) || 0,
            mpBonusFlat: parseInt(document.getElementById('edit-modal-mp-flat').value) || 0,
            mpBonusPerc: parseInt(document.getElementById('edit-modal-mp-perc').value) || 0
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

async function saveMasterRace() {
    const raceId = document.getElementById('m-race-id').value;
    const name = document.getElementById('m-race-name').value.trim();
    if (!name) return alert("Race name required!");

    const traitsArray = document.getElementById('m-race-traits').value.split(',').map(t => t.trim()).filter(t => t !== "");

    const raceData = {
        name: name,
        // 1-3 Growth
        hpPerLv: parseInt(document.getElementById('m-race-hp').value) || 0,
        mpPerLv: parseInt(document.getElementById('m-race-mp').value) || 0,
        
        // Natural Stats
        baseBody: parseInt(document.getElementById('m-race-body').value) || 0,
        baseMind: parseInt(document.getElementById('m-race-mind').value) || 0,
        baseSpirit: parseInt(document.getElementById('m-race-spirit').value) || 0,
        
        // Modifiers
        expBonus: parseInt(document.getElementById('m-race-exp-bonus').value) || 0,
        hpRegen: parseFloat(document.getElementById('m-race-hp-regen').value) || 0,
        mpRegen: parseFloat(document.getElementById('m-race-mp-regen').value) || 0,
        speed: parseInt(document.getElementById('m-race-speed').value) || 30,
        accuracy: parseInt(document.getElementById('m-race-accuracy').value) || 0,
        acBonus: parseInt(document.getElementById('m-race-ac').value) || 0,
        critChance: parseInt(document.getElementById('m-race-crit-chance').value) || 0,
        
        traits: traitsArray,
        description: document.getElementById('m-race-desc').value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (raceId) {
            await firestore.collection('master_races').doc(raceId).update(raceData);
            alert("Race updated successfully!");
        } else {
            raceData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await firestore.collection('master_races').add(raceData);
            alert("New race registered!");
        }
        
        resetRaceForm();
        loadMasterRaceList();
    } catch (e) { 
        console.error("Save Error:", e);
        alert("Error saving race. Check console.");
    }
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
        
        card.innerHTML = `
            <div class="flex-row" style="justify-content: space-between; align-items: flex-start;">
                <div style="flex-grow: 1;">
                    <div class="flex-row" style="gap: 10px;">
                        <strong style="color: #10b981; font-size: 1.1rem;">${d.name}</strong>
                        <span class="join-code-pill">HP/Lv: +${d.hpPerLv}</span>
                        <span class="join-code-pill">MP/Lv: +${d.mpPerLv}</span>
                    </div>
                    <div style="font-size: 0.8rem; color: #71717a; margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                        <span>BODY: +${d.baseBody} | MIND: +${d.baseMind} | SPIRIT: +${d.baseSpirit}</span>
                        <span>SPD: ${d.speed} | AC: +${d.acBonus} | ACC: +${d.accuracy}</span>
                    </div>
                </div>
                <div class="flex-row" style="gap: 5px;">
                    <button class="btn-small" onclick="editRace('${doc.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-danger-small" onclick="deleteMasterAsset('master_races', '${doc.id}', loadMasterRaceList)"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

async function editRace(id) {
    const doc = await firestore.collection('master_races').doc(id).get();
    if (!doc.exists) return;
    const d = doc.data();

    // Mapping Firestore data back to the UI with safety fallbacks
    document.getElementById('m-race-id').value = id;
    document.getElementById('m-race-name').value = d.name || "";
    
    // Core Growth
    document.getElementById('m-race-hp').value = d.hpPerLv || 0;
    document.getElementById('m-race-mp').value = d.mpPerLv || 0;
    
    // Base Attributes
    document.getElementById('m-race-body').value = d.baseBody || 0;
    document.getElementById('m-race-mind').value = d.baseMind || 0;
    document.getElementById('m-race-spirit').value = d.baseSpirit || 0;
    
    // Special Modifiers (The ones causing the 'undefined' error)
    document.getElementById('m-race-exp-bonus').value = d.expBonus || 0;
    document.getElementById('m-race-hp-regen').value = d.hpRegen || 0;
    document.getElementById('m-race-mp-regen').value = d.mpRegen || 0;
    document.getElementById('m-race-speed').value = d.speed || 30;
    document.getElementById('m-race-accuracy').value = d.accuracy || 0;
    document.getElementById('m-race-ac').value = d.acBonus || 0;
    document.getElementById('m-race-crit-chance').value = d.critChance || 0;
    
    // Metadata
    document.getElementById('m-race-traits').value = (d.traits || []).join(", ");
    document.getElementById('m-race-desc').value = d.description || "";

    document.getElementById('race-editor-title').innerText = "Editing Race: " + (d.name || "Unknown");
    document.getElementById('race-cancel-btn').classList.remove('hide-default');
    
    // Scroll back to the top of the workspace so you can see the editor
    document.querySelector('.master-workspace').scrollTop = 0;
}

function resetRaceForm() {
    document.getElementById('m-race-id').value = "";
    const inputs = document.querySelectorAll('#sub-races input, #sub-races textarea');
    inputs.forEach(i => {
        if (i.type === "number") i.value = 0;
        else i.value = "";
    });
    // Set default speed back to 30
    document.getElementById('m-race-speed').value = 30;
    
    document.getElementById('race-editor-title').innerText = "Register New Race";
    document.getElementById('race-cancel-btn').classList.add('hide-default');
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

async function saveMasterClass() {
    const classId = document.getElementById('m-class-id').value;
    const name = document.getElementById('m-class-name').value.trim();
    if (!name) return alert("Class name required!");

    const traitsArray = document.getElementById('m-class-traits').value.split(',').map(t => t.trim()).filter(t => t !== "");

    const classData = {
        name: name,
        tier: parseInt(document.getElementById('m-class-tier').value),
        mainStat: document.getElementById('m-class-main-stat').value,
        hpPerLv: parseInt(document.getElementById('m-class-hp').value) || 0,
        mpPerLv: parseInt(document.getElementById('m-class-mp').value) || 0,
        hpRegenBonus: parseFloat(document.getElementById('m-class-hp-regen').value) || 0,
        mpRegenBonus: parseFloat(document.getElementById('m-class-mp-regen').value) || 0,
        critMultiplier: parseFloat(document.getElementById('m-class-crit').value) || 2.0,
        critChanceBonus: parseInt(document.getElementById('m-class-crit-chance').value) || 0,
        accuracyBonus: parseInt(document.getElementById('m-class-accuracy').value) || 0,
        armorClassBonus: parseInt(document.getElementById('m-class-ac').value) || 0,
        speedBonus: parseInt(document.getElementById('m-class-speed-bonus').value) || 0,
        requirements: document.getElementById('m-class-reqs').value.trim(),
        description: document.getElementById('m-class-desc').value.trim(),
        traits: traitsArray,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (classId) {
            await firestore.collection('master_classes').doc(classId).update(classData);
            alert("Class updated successfully!");
        } else {
            classData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await firestore.collection('master_classes').add(classData);
            alert("New class archetype registered!");
        }

        // Future-proof: Index traits automatically
        traitsArray.forEach(traitName => ensureTraitExists(traitName));

        resetClassForm();
        loadMasterClassList();
    } catch (e) { console.error(e); }
}

async function loadMasterClassList() {
    const list = document.getElementById('master-class-list');
    if (!list) return;

    // This may require a composite index (Tier + Name) in Firestore Console
    const snap = await firestore.collection('master_classes').orderBy('tier').orderBy('name').get();
    list.innerHTML = "";

    snap.forEach(doc => {
        const d = doc.data();
        const card = document.createElement('div');
        card.className = "panel-card mb-s";
        card.style.background = "#18181b";
        card.style.borderLeft = `4px solid ${d.tier == 3 ? '#fbbf24' : d.tier == 2 ? '#6366f1' : '#3f3f46'}`;
        
        const traitTags = (d.traits || []).map(t => 
            `<span style="background:#312e81; color:#c7d2fe; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-right:4px;">${t}</span>`
        ).join('');

        card.innerHTML = `
            <div class="flex-row" style="justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                    <div class="flex-row" style="gap:10px;">
                        <strong>${d.name}</strong> <span style="font-size:0.7rem; opacity:0.6;">T${d.tier}</span>
                    </div>
                    <div class="mt-s" style="margin-bottom:8px;">${traitTags}</div>
                    <div style="font-size: 0.7rem; color: #71717a;">
                        HP/Lv: +${d.hpPerLv} | MP/Lv: +${d.mpPerLv} | Crit: ${d.critMultiplier}x (+${d.critChanceBonus})
                    </div>
                </div>
                <div class="flex-row" style="gap: 5px;">
                    <button class="btn-small" onclick="editClass('${doc.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="btn-danger-small" onclick="deleteMasterAsset('master_classes', '${doc.id}', loadMasterClassList)">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

async function editClass(id) {
    const doc = await firestore.collection('master_classes').doc(id).get();
    if (!doc.exists) return;
    const d = doc.data();

    document.getElementById('m-class-id').value = id;
    document.getElementById('m-class-name').value = d.name;
    document.getElementById('m-class-tier').value = d.tier;
    document.getElementById('m-class-main-stat').value = d.mainStat;
    document.getElementById('m-class-hp').value = d.hpPerLv;
    document.getElementById('m-class-mp').value = d.mpPerLv;
    document.getElementById('m-class-hp-regen').value = d.hpRegenBonus || 0;
    document.getElementById('m-class-mp-regen').value = d.mpRegenBonus || 0;
    document.getElementById('m-class-crit').value = d.critMultiplier || 2.0;
    document.getElementById('m-class-crit-chance').value = d.critChanceBonus || 0;
    document.getElementById('m-class-accuracy').value = d.accuracyBonus || 0;
    document.getElementById('m-class-ac').value = d.armorClassBonus || 0;
    document.getElementById('m-class-speed-bonus').value = d.speedBonus || 0;
    document.getElementById('m-class-reqs').value = d.requirements || "";
    document.getElementById('m-class-desc').value = d.description || "";
    document.getElementById('m-class-traits').value = (d.traits || []).join(", ");

    document.getElementById('class-editor-title').innerText = "Editing Class: " + d.name;
    document.getElementById('class-cancel-btn').classList.remove('hide-default');
    document.querySelector('.master-workspace').scrollTop = 0;
}

function resetClassForm() {
    document.getElementById('m-class-id').value = "";
    document.getElementById('m-class-name').value = "";
    document.getElementById('m-class-desc').value = "";
    document.getElementById('m-class-reqs').value = "";
    document.getElementById('m-class-traits').value = "";
    document.getElementById('class-editor-title').innerText = "Register New Class Archetype";
    document.getElementById('class-cancel-btn').classList.add('hide-default');
}

function getEffectiveMainStat(character, classData) {
    const stats = character.baseStats; // {BODY: 14, MIND: 10, SPIRIT: 16}
    
    switch(classData.mainStat) {
        case 'BODY_OR_SPIRIT':
            return Math.max(stats.BODY, stats.SPIRIT);
        case 'BODY_OR_MIND':
            return Math.max(stats.BODY, stats.MIND);
        case 'MIND_OR_SPIRIT':
            return Math.max(stats.MIND, stats.SPIRIT);
        case 'ANY':
            return Math.max(stats.BODY, stats.MIND, stats.SPIRIT);
        default:
            return stats[classData.mainStat]; // Returns the single stat
    }
}

// --- SKILL REGISTRY LOGIC ---

// 1. Switch Tabs Helper
function switchAdminTab(tabName) {
    document.getElementById('admin-instances-tab').classList.add('hide-default');
    document.getElementById('admin-skill-registry-tab').classList.add('hide-default');
    
    if(tabName === 'instances') {
        document.getElementById('admin-instances-tab').classList.remove('hide-default');
        loadInstanceList();
    } else if (tabName === 'skill-registry') {
        document.getElementById('admin-skill-registry-tab').classList.remove('hide-default');
        loadSkillRegistry();
    }
}

function openSkillCreator() {
    document.getElementById('skill-creator-form').classList.remove('hide-default');
    // Clear inputs...
    document.getElementById('reg-skill-name').value = '';
    document.getElementById('reg-skill-desc').value = '';
    document.getElementById('reg-skill-icon-base64').value = '';
    document.getElementById('icon-preview').innerHTML = '';
}

// 2. Image Resizer (The 64x64 Logic)
document.getElementById('reg-skill-icon').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // Resize logic
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 64;
            canvas.height = 64;
            
            // Draw image scaled to 64x64
            ctx.drawImage(img, 0, 0, 64, 64);
            
            // Convert to Base64 string
            const dataURL = canvas.toDataURL('image/png');
            
            // Store and Preview
            document.getElementById('reg-skill-icon-base64').value = dataURL;
            document.getElementById('icon-preview').innerHTML = `<img src="${dataURL}" style="width:64px; height:64px; border-radius:4px;">`;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
});

// 3. Save Skill to Firestore
async function saveSkillToRegistry() {
    const name = document.getElementById('reg-skill-name').value;
    const skillClass = document.getElementById('reg-skill-class').value;
    const tier = parseInt(document.getElementById('reg-skill-tier').value);
    
    if (!name || !skillClass) return alert("Name and Class are required.");

    // Auto-Calculate Base Cost (10 -> 20 -> 40)
    const baseCost = 10 * Math.pow(2, tier - 1);

    const skillData = {
        name: name,
        class: skillClass,
        tier: tier,
        description: document.getElementById('reg-skill-desc').value,
        iconData: document.getElementById('reg-skill-icon-base64').value, // Base64
        
        // Combat
        range: document.getElementById('reg-skill-range').value,
        damageType: document.getElementById('reg-skill-dmg-type').value,
        savingThrow: document.getElementById('reg-skill-save').value,
        
        // Scaling
        scalingStat: document.getElementById('reg-skill-stat').value,
        scalingFactor: parseFloat(document.getElementById('reg-skill-factor').value) || 1.0,
        cap: parseInt(document.getElementById('reg-skill-cap').value) || 110,
        
        // Costs (Calculated)
        baseCost: baseCost,
        castTime: 0, // Default for now
        cooldown: 0, // Default for now
        
        targetType: "single", // Default
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        // Create a readable ID: "cleric_fireball_t1"
        const docId = `${skillClass.toLowerCase()}_${name.replace(/\s+/g, '_').toLowerCase()}_t${tier}`;
        
        await firestore.collection('master_skills').doc(docId).set(skillData);
        alert("Skill Saved to Registry!");
        document.getElementById('skill-creator-form').classList.add('hide-default');
        loadSkillRegistry(); // Refresh list
    } catch (e) {
        console.error("Error saving skill:", e);
        alert("Error saving skill.");
    }
}

// 4. Load List
async function loadSkillRegistry() {
    const container = document.getElementById('registry-skill-list');
    container.innerHTML = '<p>Loading...</p>';
    
    try {
        const snap = await firestore.collection('master_skills').orderBy('class').get();
        
        if(snap.empty) {
            container.innerHTML = '<p>No skills defined yet.</p>';
            return;
        }

        let html = '<div class="grid-3-col">'; // Grid layout for cards
        snap.forEach(doc => {
            const d = doc.data();
            const icon = d.iconData ? `<img src="${d.iconData}" style="width:32px; height:32px; vertical-align:middle; margin-right:10px;">` : '';
            
            html += `
            <div class="panel-dark" style="border:1px solid #333; padding:10px;">
                <div class="flex-row">
                    ${icon}
                    <div>
                        <strong style="color:#e879f9;">${d.name}</strong> <br>
                        <span style="font-size:0.75rem; color:#aaa;">${d.class} | T${d.tier} | ${d.baseCost} MP</span>
                    </div>
                </div>
                <div style="font-size:0.8rem; margin-top:5px; color:#ccc;">${d.description}</div>
                <div style="margin-top:5px; font-size:0.7rem;">
                    ${d.damageType ? `<span class="join-code-pill">${d.damageType}</span>` : ''}
                    ${d.range ? `<span class="join-code-pill">${d.range}</span>` : ''}
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
        
    } catch (e) {
        console.error("Load Error:", e);
    }
}

// --- TRAIT LIBRARY LOGIC ---
async function ensureTraitExists(traitName) {
    const slug = traitName.toLowerCase().trim().replace(/\s+/g, '-');
    const traitRef = firestore.collection('master_traits').doc(slug);
    const doc = await traitRef.get();
    if (!doc.exists) {
        await traitRef.set({ name: traitName, description: "Detailed mechanics needed.", createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
}

async function loadMasterTraitList() {
    const list = document.getElementById('master-trait-list');
    if (!list) return;
    const snap = await firestore.collection('master_traits').orderBy('name').get();
    list.innerHTML = "";
    snap.forEach(doc => {
        const t = doc.data();
        const card = document.createElement('div');
        card.className = "panel-card mb-s";
        card.style.background = "#121214";
        card.innerHTML = `
            <div class="form-group">
                <strong style="color: #00ff88;">${t.name}</strong>
                <textarea class="form-input w-100 mt-s" style="height: 60px;" 
                    onchange="updateTraitDescription('${doc.id}', this.value)">${t.description}</textarea>
            </div>
        `;
        list.appendChild(card);
    });
}

async function updateTraitDescription(id, val) {
    await firestore.collection('master_traits').doc(id).update({ description: val });
}

async function deleteMasterAsset(collection, id, callback) {
    if (!confirm("Permanently remove this asset?")) return;
    await firestore.collection(collection).doc(id).delete();
    callback();
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

async function respecCharacterAttributes() {
    const uid = document.getElementById('edit-modal-uid').value;
    const cid = document.getElementById('edit-modal-cid').value;
    
    if (!confirm("WARNING: This will reset BODY, MIND, and SPIRIT to 0.\nThe player will regain all AP based on their current Level.\n\nContinue?")) return;

    try {
        const charRef = firestore.collection('users').doc(uid).collection('characters').doc(cid);
        
        // 1. Reset Stats to 0
        await charRef.update({
            body: 0,
            mind: 0,
            spirit: 0
        });

        // 2. Refresh the inputs in the modal immediately
        document.getElementById('edit-modal-body').value = 0;
        document.getElementById('edit-modal-mind').value = 0;
        document.getElementById('edit-modal-spirit').value = 0;

        // 3. Recalculate derived stats (Max HP/MP will drop)
        const doc = await charRef.get();
        const data = doc.data();
        const totals = await getFinalMaxStats(data);
        
        await charRef.update({
            hpMax: totals.finalHP,
            mpMax: totals.finalMP
        });

        // 4. Update the Max HP/MP inputs in the modal to reflect the drop
        // We clamp current HP so it doesn't exceed the new Max
        document.getElementById('edit-modal-hp').value = Math.min(data.hpCurrent, totals.finalHP);
        document.getElementById('edit-modal-mp').value = Math.min(data.mpCurrent, totals.finalMP);

        alert("Character attributes have been reset!");
        
    } catch (e) {
        console.error("Respec failed:", e);
        alert("Error resetting attributes.");
    }
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



/* ==========================================
   --- 15. PURE MATH ---
   ========================================== */

// --- EXP FORMULA --- //
function calculateLevelFromEXP(exp) {
    // Formula: Threshold = Target Level * 200
    // We floor the result. If it's less than 1, we return 1.
    const calculatedLv = Math.floor(exp / 200);
    let finalLv = Math.max(1, calculatedLv);
    
    // ENFORCE CAP
    return Math.min(finalLv, MAX_CHAR_LEVEL);
}

function adjustModalExp(multiplier) {
    // 1. Get the amount to change (e.g., 100)
    const amount = parseInt(document.getElementById('exp-adjust-amount').value) || 0;
    
    // 2. Get the current total from the hidden input
    const hiddenInput = document.getElementById('edit-modal-exp');
    let currentTotal = parseInt(hiddenInput.value) || 0;
    
    // 3. Calculate new total (prevent negative EXP)
    const newTotal = Math.max(0, currentTotal + (amount * multiplier));
    
    // 4. Update the hidden input (for saving) and the label (for display)
    hiddenInput.value = newTotal;
    document.getElementById('modal-current-exp-display').innerText = newTotal;
}

async function getFinalMaxStats(charData) {
    // 1. Fetch live Registry data (Retroactive part)
    const raceSnap = await firestore.collection('master_races').where('name', '==', charData.race).limit(1).get();
    const raceD = raceSnap.empty ? { hpPerLv: 1, mpPerLv: 1, baseBody: 0 } : raceSnap.docs[0].data();

    // 2. Calculate Base Max (Registry + Levels)
    let baseHP = 10 + (charData.charLevel * (raceD.hpPerLv || 0));
    let baseMP = 10 + (charData.charLevel * (raceD.mpPerLv || 0));

    // 3. Add Class Growth (Retroactive)
    // Assuming unlockedClasses is an object { Warrior: { level: 5 }, ... }
    for (const [className, info] of Object.entries(charData.unlockedClasses || {})) {
        const classSnap = await firestore.collection('master_classes').where('name', '==', className).limit(1).get();
        if (!classSnap.empty) {
            const classD = classSnap.docs[0].data();
            baseHP += (info.level * (classD.hpPerLv || 0));
            baseMP += (info.level * (classD.mpPerLv || 0));
        }
    }

    // 4. Add Stat-to-Pool Ratio (1:2)
    const totalBody = (charData.body || 0) + (raceD.baseBody || 0);
    const totalSpirit = (charData.spirit || 0) + (raceD.baseSpirit || 0);
    
    baseHP += (totalBody * 2);
    baseMP += (totalSpirit * 2);

    // 5. Apply Equipment Layer
    const finalHP = Math.floor((baseHP + (charData.hpBonusFlat || 0)) * (1 + (charData.hpBonusPerc || 0) / 100));
    const finalMP = Math.floor((baseMP + (charData.mpBonusFlat || 0)) * (1 + (charData.mpBonusPerc || 0) / 100));

    return { finalHP, finalMP };
}
