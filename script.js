/* ==========================================================================
   SECTION 1: CONFIGURATION, STATE & FIREBASE
   ========================================================================== */

// --- 1.1 CONSTANTS ---
const MAX_CHAR_LEVEL = 60;      
const MAX_ALLOCATED_STAT = 20;  
const MAX_GALLERY_SLOTS = 10;

// --- 1.2 STATE VARIABLES ---
let totalCustomSeconds = 0; 
let speedMultiplier = 1;
let isRunning = false;
let lastRealTime = Date.now();

let currentCampaignId = "global"; 
let currentCharacterId = null; 
let activeCharLevel = 1; 
let characterListener = null;

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
    auth.signOut().then(() => location.reload()); 
}

auth.onAuthStateChanged((user) => {
    const topNav = document.getElementById('top-nav');
    const appBody = document.querySelector('.app-body');
    const mainContent = document.getElementById('main-content');
    const sidebar = document.getElementById('sidebar');

    if (user) {
        // --- LOGGED IN ---
        const savedTab = localStorage.getItem('activeMainTab');
        if (!savedTab || savedTab === 'tab-login') {
            openTab('tab-character');
        } else {
            openTab(savedTab);
        }
        
        topNav.classList.remove('hide-default');
        appBody.classList.remove('hide-default');
        sidebar.classList.remove('hide-default'); 

        mainContent.style.width = "";
        mainContent.style.display = "";
        mainContent.style.justifyContent = "";
        mainContent.style.alignItems = "";
        mainContent.classList.remove('login-splash-mode');
        
        document.getElementById('main-nav-tabs').classList.remove('hide-default');
        document.getElementById('logout-btn').classList.remove('hide-default');
        document.getElementById('game-ui').classList.remove('hide-default');
        document.getElementById('user-display-name').innerText = user.email.split('@')[0];

        firestore.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                window.currentUserRole = data.role || 'Player';
                
                const isMaster = (data.role === 'Master' || data.role === 'Admin');
                if (isMaster) {
                    document.getElementById('nav-control-panel').classList.remove('hide-default');
                    document.getElementById('master-quick-controls').classList.remove('hide-default');
                }

                document.getElementById('user-role-label').innerText = data.role;
                initClockListener();
                initDiceLogListener();
                
                if (data.lastActiveCharacter) selectCharacter(data.lastActiveCharacter);
            }
        });
        syncRegistryToDropdowns();
        loadUserCharacters();
    } else {
        // --- LOGGED OUT ---
        window.currentUserRole = null;
        topNav.classList.add('hide-default');
        sidebar.classList.add('hide-default');
        appBody.classList.remove('hide-default'); 
        mainContent.classList.add('login-splash-mode'); 
        document.getElementById('active-char-hud').classList.add('hide-default');
        openTab('tab-login');
    }
});


/* ==========================================================================
   SECTION 4: UI NAVIGATION
   ========================================================================== */

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

    if (tabId !== 'tab-login') {
        localStorage.setItem('activeMainTab', tabId);
    }
    
    if (tabId === 'tab-control-panel' && (window.currentUserRole === 'Master' || window.currentUserRole === 'Admin')) {
        loadInstanceList();
        openMasterPanel();
        const savedSubTab = localStorage.getItem('activeMasterSubTab') || 'sub-instances';
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
}

function goBackToSelection() {
    document.getElementById('char-selection-view').classList.remove('hide-default');
    document.getElementById('char-sheet-view').classList.add('hide-default');
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
                rtdb.ref(`instance_logs/${currentCampaignId}/chatbox`).push({
                    type: 'roll', name: charName, sides: sides, result: finalRoll, timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            }
            btn.resetTimeout = setTimeout(() => { btn.classList.remove('active-roll'); }, 3000);
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


/* ==========================================================================
   SECTION 6: CHARACTER LOGIC (MATH & STATS)
   ========================================================================== */

function calculateLevelFromEXP(exp) {
    // Formula: Level = Floor(EXP / 200). Cap at 60.
    const calculatedLv = Math.floor(exp / 200);
    let finalLv = Math.max(1, calculatedLv);
    return Math.min(finalLv, MAX_CHAR_LEVEL);
}

async function getFinalMaxStats(charData) {
    const raceSnap = await firestore.collection('master_races').where('name', '==', charData.race).limit(1).get();
    const raceD = raceSnap.empty ? { hpPerLv: 1, mpPerLv: 1, baseBody: 0 } : raceSnap.docs[0].data();

    let baseHP = 10 + (charData.charLevel * (raceD.hpPerLv || 0));
    let baseMP = 10 + (charData.charLevel * (raceD.mpPerLv || 0));

    for (const [className, info] of Object.entries(charData.unlockedClasses || {})) {
        const classSnap = await firestore.collection('master_classes').where('name', '==', className).limit(1).get();
        if (!classSnap.empty) {
            const classD = classSnap.docs[0].data();
            baseHP += (info.level * (classD.hpPerLv || 0));
            baseMP += (info.level * (classD.mpPerLv || 0));
        }
    }

    const totalBody = (charData.body || 0) + (raceD.baseBody || 0);
    const totalSpirit = (charData.spirit || 0) + (raceD.baseSpirit || 0);
    
    baseHP += (totalBody * 2);
    baseMP += (totalSpirit * 2);

    const finalHP = Math.floor((baseHP + (charData.hpBonusFlat || 0)) * (1 + (charData.hpBonusPerc || 0) / 100));
    const finalMP = Math.floor((baseMP + (charData.mpBonusFlat || 0)) * (1 + (charData.mpBonusPerc || 0) / 100));

    return { finalHP, finalMP };
}

async function getTotalRegen(charData) {
    const raceSnap = await firestore.collection('master_races').where('name', '==', charData.race).limit(1).get();
    const raceD = raceSnap.empty ? { hpRegen: 0, mpRegen: 0 } : raceSnap.docs[0].data();

    let totalHPRegen = (charData.hpMax * 0.00208333) + (raceD.hpRegen || 0);
    let totalMPRegen = (charData.mpMax * 0.00208333) + (raceD.mpRegen || 0);

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


/* ==========================================================================
   SECTION 7: CHARACTER UI & CRUD
   ========================================================================== */

function createNewCharacter() {
    const user = auth.currentUser;
    const data = { 
        name: "New Hero", race: "", class: "",
        charLevel: 1, classLevel: 1, totalSP: 1, spentSP: 0,        
        hpBonusFlat: 0, hpBonusPerc: 0, mpBonusFlat: 0, mpBonusPerc: 0,
        basicSkills: [], intSkills: [], advSkills: [],
        body: 0, mind: 0, spirit: 0,
        hpMaxBonus: 0, mpMaxBonus: 0,
        hpCurrent: 10, hpMax: 10, mpCurrent: 10, mpMax: 10,
        expCurrent: 0, expMax: 400, 
        gallery: [], portrait: "",
        instanceId: "global", instanceName: "Global",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    firestore.collection('users').doc(user.uid).collection('characters').add(data).then(() => loadUserCharacters());
}

function loadUserCharacters() {
    const user = auth.currentUser;
    if (!user) return;

    firestore.collection('users').doc(user.uid).collection('characters').get().then(snap => {
        const grid = document.getElementById('char-list-grid');
        grid.innerHTML = "";
        
        snap.forEach(doc => {
            const d = doc.data();
            const card = document.createElement('div');
            card.className = 'char-card';
            card.onclick = () => selectCharacter(doc.id);
            card.innerHTML = `
                <div class="char-card-portrait" style="background-image: url(${d.portrait || ''});"></div>
                <strong>${d.name || 'New Hero'}</strong>
                <div class="char-card-meta">Lv.${d.charLevel || 1} ${d.class || ''}</div>
                <div class="char-realm-tag"><i class="fa-solid fa-globe"></i> ${d.instanceName || 'Global'}</div>
                <button class="btn-danger-small mt-m" onclick="deleteCharacter(event, '${doc.id}', '${d.name}')"><i class="fa-solid fa-trash"></i> Delete</button>
            `;
            grid.appendChild(card);
        });
    });
}

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
                initClockListener(); 
                initDiceLogListener();
            }
            if(document.getElementById('char-name')) {
                document.getElementById('char-name').value = d.name || "";
                document.getElementById('char-race').value = d.race || "";
                document.getElementById('char-exp-current').value = d.expCurrent || 0;
            }

            activeCharLevel = calculateLevelFromEXP(d.expCurrent || 0);
            if(document.getElementById('char-level-display')) {
                document.getElementById('char-level-display').innerText = `Lv. ${activeCharLevel}`;
            }
            
            originalStats = { body: d.body || 0, mind: d.mind || 0, spirit: d.spirit || 0 };
            pendingStats = { ...originalStats };
            const spentPoints = (originalStats.body + originalStats.mind + originalStats.spirit);
            totalAP = Math.max(0, activeCharLevel - spentPoints); 

            renderClassPills(d);
            refreshStatDisplay();
            renderGallery(d.gallery || [], d.portrait || "");
            renderSkills(d);

            const totals = await getFinalMaxStats(d);
            const nextLevelExp = (activeCharLevel + 1) * 200;

            if(document.getElementById('char-hp-max')) {
                document.getElementById('char-hp-max').value = totals.finalHP;
                document.getElementById('char-mp-max').value = totals.finalMP;
                document.getElementById('char-exp-max').value = nextLevelExp;
                
                const hpInput = document.getElementById('char-hp-current');
                const mpInput = document.getElementById('char-mp-current');
                
                hpInput.dataset.trueValue = d.hpCurrent || 0;
                hpInput.value = Math.floor(d.hpCurrent || 0);
                mpInput.dataset.trueValue = d.mpCurrent || 0;
                mpInput.value = Math.floor(d.mpCurrent || 0);
            }

            const hudData = { ...d, charLevel: activeCharLevel, hpMax: totals.finalHP, mpMax: totals.finalMP, expMax: nextLevelExp };
            updateHUD(hudData);
            
            document.getElementById('char-selection-view').classList.add('hide-default');
            document.getElementById('char-sheet-view').classList.remove('hide-default');
        }
    });

    firestore.collection('users').doc(user.uid).update({ lastActiveCharacter: id });
}

async function saveCharacter() {
    if (!currentCharacterId) return;
    const charRef = firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId);
    
    const doc = await charRef.get();
    const currentData = doc.data();

    const expInput = document.getElementById('char-exp-current');
    const currentExp = parseInt(expInput.value) || 0;
    
    activeCharLevel = calculateLevelFromEXP(currentExp); 
    const nextLevelExp = (activeCharLevel + 1) * 200; 
    document.getElementById('char-exp-max').value = nextLevelExp;

    const data = {
        name: document.getElementById('char-name').value,
        race: document.getElementById('char-race').value,
        expCurrent: currentExp,
        charLevel: activeCharLevel,
        body: originalStats.body || 0,
        mind: originalStats.mind || 0,
        spirit: originalStats.spirit || 0,
        hpCurrent: parseFloat(document.getElementById('char-hp-current').value) || 0,
        mpCurrent: parseFloat(document.getElementById('char-mp-current').value) || 0,
        portrait: currentData.portrait || "", 
        gallery: currentData.gallery || [],
        unlockedClasses: currentData.unlockedClasses || {}
    };

    try {
        await charRef.update(data);
        const totals = await getFinalMaxStats(data);
        updateHUD({ ...data, hpMax: totals.finalHP, mpMax: totals.finalMP, expMax: nextLevelExp });
        if (typeof showToast === "function") showToast("Character Saved.");
    } catch (e) { 
        console.error("Save Error:", e); 
    }
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

async function applyPassiveRegen() {
    if (!currentCharacterId) return;
    const charSnap = await firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).get();
    const charData = charSnap.data();
    
    const { totalHPRegen, totalMPRegen } = await getTotalRegen(charData);

    const hpInput = document.getElementById('char-hp-current');
    const mpInput = document.getElementById('char-mp-current');

    let hpCur = parseFloat(hpInput.dataset.trueValue) || parseFloat(hpInput.value) || 0;
    let mpCur = parseFloat(mpInput.dataset.trueValue) || parseFloat(mpInput.value) || 0;

    const hpMax = parseFloat(document.getElementById('char-hp-max').value) || 10;
    const mpMax = parseFloat(document.getElementById('char-mp-max').value) || 10;

    const newHP = Math.min(hpCur + totalHPRegen, hpMax);
    const newMP = Math.min(mpCur + totalMPRegen, mpMax);

    hpInput.dataset.trueValue = newHP;
    mpInput.dataset.trueValue = newMP;
    hpInput.value = Math.floor(newHP);
    mpInput.value = Math.floor(newMP);
    
    updateHUD({ ...charData, hpCurrent: newHP, mpCurrent: newMP, hpMax, mpMax });
}

function refreshStatDisplay() {
    let spentAP = (pendingStats.body - originalStats.body) + 
                  (pendingStats.mind - originalStats.mind) + 
                  (pendingStats.spirit - originalStats.spirit);
    
    let remAP = totalAP - spentAP;
    document.getElementById('char-ap-rem').innerText = remAP;
    
    document.getElementById('display-body').innerText = pendingStats.body;
    document.getElementById('display-mind').innerText = pendingStats.mind;
    document.getElementById('display-spirit').innerText = pendingStats.spirit;

    const hasChanges = spentAP !== 0;
    document.getElementById('attr-confirm-area').classList.toggle('hide-default', !hasChanges);
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
function handleSlotUpload(input) {
    const file = input.files[0];
    if (!file || !currentCharacterId) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const size = 256; // High quality portrait size
            canvas.width = size;
            canvas.height = size;

            let sourceSize = Math.min(img.width, img.height);
            let sourceX = (img.width - sourceSize) / 2;
            let sourceY = (img.height - sourceSize) / 2;

            ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
            
            // WebP + 0.8 Quality = Perfect balance of size, transparency, and clarity
            saveImageToNextSlot(canvas.toDataURL('image/webp', 0.8)); 
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function saveImageToNextSlot(base64Data) {
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);
    charRef.get().then(doc => {
        let gallery = doc.data().gallery || [];
        if (gallery.length >= MAX_GALLERY_SLOTS) return alert("Gallery Full!");
        gallery.push(base64Data);
        const updateData = { gallery: gallery };
        if (!doc.data().portrait) updateData.portrait = base64Data;
        charRef.update(updateData).then(() => {
            renderGallery(gallery, doc.data().portrait || base64Data);
            if (updateData.portrait) document.getElementById('hud-portrait').style.backgroundImage = `url(${base64Data})`;
        });
    });
}

function renderGallery(galleryArray, activePortrait) {
    const container = document.getElementById('char-gallery-grid');
    if (!container) return;
    container.innerHTML = "";

    const images = galleryArray || [];

    for (let i = 0; i < MAX_GALLERY_SLOTS; i++) {
        const slot = document.createElement('div');
        slot.className = 'gallery-item';

        if (images[i]) {
            // Add a neon border to the selected one
            if (images[i] === activePortrait) {
                slot.style.borderColor = "#10b981"; // Green for active
                slot.style.boxShadow = "0 0 10px #10b981";
            }

            slot.innerHTML = `
                <img src="${images[i]}" onclick="setActivePortrait('${images[i]}')">
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

function setActivePortrait(imgData) {
    const user = auth.currentUser;
    const charRef = firestore.collection('users').doc(user.uid).collection('characters').doc(currentCharacterId);
    charRef.update({ portrait: imgData }).then(() => {
        document.getElementById('hud-portrait').style.backgroundImage = `url(${imgData})`;
        loadUserCharacters(); 
        charRef.get().then(doc => renderGallery(doc.data().gallery, imgData));
    });
}

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
        if (doc.data().portrait === deletedImg) updateData.portrait = gallery.length > 0 ? gallery[0] : "";
        charRef.update(updateData).then(() => {
            renderGallery(gallery, updateData.portrait);
            document.getElementById('hud-portrait').style.backgroundImage = `url(${updateData.portrait || ''})`;
            loadUserCharacters();
        });
    });
}

function renderSkills(charData) {
    const container = document.getElementById('skills-container');
    if (!container) return;
    container.innerHTML = ""; 
    const tiers = [{ key: 'basicSkills', label: 'Basic Skills' }, { key: 'intSkills', label: 'Intermediate Skills' }, { key: 'advSkills', label: 'Advanced Skills' }];
    tiers.forEach(tier => {
        const section = document.createElement('div');
        section.className = 'skill-tier-section';
        section.innerHTML = `<h4 class="mt-m mb-s">${tier.label}</h4>`;
        const skills = charData[tier.key] || [];
        if (skills.length === 0) section.innerHTML += `<div class="text-muted" style="width:100%; text-align:center; font-size:0.8rem;">Empty</div>`;
        skills.forEach((s) => {
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

async function updateHUD(char) {
    const hud = document.getElementById('active-char-hud');
    if (!hud) return;
    hud.classList.remove('hide-default');
    
    const raceSnap = await firestore.collection('master_races').where('name', '==', char.race).limit(1).get();
    const raceD = raceSnap.empty ? { baseBody: 0, baseMind: 0, baseSpirit: 0 } : raceSnap.docs[0].data();

    const totalB = (char.body || 0) + (raceD.baseBody || 0);
    const totalM = (char.mind || 0) + (raceD.baseMind || 0);
    const totalS = (char.spirit || 0) + (raceD.baseSpirit || 0);

    const getMod = (totalVal) => {
        const mod = Math.floor(totalVal / 2);
        return mod >= 0 ? `+${mod}` : mod;
    };

    document.getElementById('hud-name').innerText = char.name || "Unnamed";
    const classes = char.unlockedClasses || {}; 
    const classStrings = Object.keys(classes).map(name => `${name} Lv.${classes[name].level}`);
    const classText = classStrings.length > 0 ? classStrings.join(', ') : (char.class || "Adventurer");
    
    document.getElementById('hud-meta').innerText = `Level ${activeCharLevel}`;
    document.getElementById('hud-hp-text').innerText = `${Math.floor(char.hpCurrent || 0)}/${Math.floor(char.hpMax || 0)}`;
    document.getElementById('hud-mp-text').innerText = `${Math.floor(char.mpCurrent || 0)}/${Math.floor(char.mpMax || 0)}`;
    document.getElementById('hud-portrait').style.backgroundImage = char.portrait ? `url(${char.portrait})` : "none";
    document.getElementById('hud-mod-body').innerText = `BODY ${getMod(totalB)}`;
    document.getElementById('hud-mod-mind').innerText = `MIND ${getMod(totalM)}`;
    document.getElementById('hud-mod-spirit').innerText = `SPIRIT ${getMod(totalS)}`;

    if(document.getElementById('total-body-label')) {
        document.getElementById('total-body-label').innerText = totalB;
        document.getElementById('total-mind-label').innerText = totalM;
        document.getElementById('total-spirit-label').innerText = totalS;
    }

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


/* ==========================================================================
   SECTION 9: MASTER PANEL LOGIC
   ========================================================================== */

function openMasterPanel() {
    const role = window.currentUserRole;
    if (role !== 'Master' && role !== 'Admin') {
        alert("Access Denied: Specialized clearance required.");
        openTab('tab-character'); 
        return;
    }
    const accountBtn = document.querySelector('[onclick*="sub-accounts"]');
    if (accountBtn) {
        if (role === 'Admin') {
            accountBtn.style.display = 'block';
            loadUserList(); 
        } else {
            accountBtn.style.display = 'none';
            const groupsBtn = document.querySelector('[onclick*="sub-instances"]');
            if (groupsBtn) groupsBtn.click(); 
        }
    }
}

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
            const rowStyle = (isAdmin && !isMyWorld) ? 'style="background: #1e1e24;"' : '';

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

// --- CHARACTER SUPERVISION ---
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
        rows[i].style.display = text.includes(filter) ? "" : "none";
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
        row.className = "flex-row mb-s";
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
        const calcHpMax = (newBody * 5) + hpBonus + 10;
        const calcMpMax = (newSpirit * 5) + mpBonus + 10;

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


/* ==========================================================================
   SECTION 10: REGISTRY EDITORS (Races, Classes, Skills)
   ========================================================================== */

// --- 10.1 RACE REGISTRY ---
async function createMasterRace() {
    const name = document.getElementById('m-race-name').value.trim();
    if (!name) return alert("Race name required!");
    const traitsArray = document.getElementById('m-race-traits').value.split(',').map(t => t.trim()).filter(t => t !== "");

    try {
        await firestore.collection('master_races').add({
            name, 
            bodyMod: parseInt(document.getElementById('m-race-body').value) || 0, 
            mindMod: parseInt(document.getElementById('m-race-mind').value) || 0, 
            spiritMod: parseInt(document.getElementById('m-race-spirit').value) || 0, 
            baseSpeed: parseInt(document.getElementById('m-race-speed').value) || 30, 
            description: document.getElementById('m-race-desc').value.trim(), 
            traits: traitsArray,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        resetRaceForm();
        loadMasterRaceList();
    } catch (e) { console.error(e); }
}

async function loadMasterRaceList() {
    const list = document.getElementById('master-race-list');
    if (!list) return;
    
    try {
        const snap = await firestore.collection('master_races').orderBy('name').get();
        list.innerHTML = "";

        if (snap.empty) {
            list.innerHTML = '<p class="text-muted text-center" style="padding:20px;">No races registered yet.</p>';
            return;
        }

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
                            <span class="join-code-pill">HP/Lv: +${d.hpPerLv || 0}</span>
                            <span class="join-code-pill">MP/Lv: +${d.mpPerLv || 0}</span>
                        </div>
                        <div style="font-size: 0.8rem; color: #71717a; margin-top: 8px;">
                            BODY: +${d.baseBody || 0} | MIND: +${d.baseMind || 0} | SPIRIT: +${d.baseSpirit || 0}
                        </div>
                    </div>
                    <div class="flex-row" style="gap: 5px;">
                        <button class="btn-small" onclick="editRace('${doc.id}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-danger-small" onclick="deleteMasterAsset('master_races', '${doc.id}', loadMasterRaceList)"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`;
            list.appendChild(card);
        });
    } catch (e) {
        console.error("Race Load Error:", e);
        list.innerHTML = `<p style="color:#ef4444; text-align:center;">Error loading races: ${e.message}</p>`;
    }
}

async function editRace(id) {
    const d = (await firestore.collection('master_races').doc(id).get()).data();
    if (!d) return;

    document.getElementById('m-race-id').value = id;
    document.getElementById('m-race-name').value = d.name || "";
    document.getElementById('m-race-hp').value = d.hpPerLv || 0;
    document.getElementById('m-race-mp').value = d.mpPerLv || 0;
    document.getElementById('m-race-body').value = d.baseBody || 0;
    document.getElementById('m-race-mind').value = d.baseMind || 0;
    document.getElementById('m-race-spirit').value = d.baseSpirit || 0;
    document.getElementById('m-race-exp-bonus').value = d.expBonus || 0;
    document.getElementById('m-race-hp-regen').value = d.hpRegen || 0;
    document.getElementById('m-race-mp-regen').value = d.mpRegen || 0;
    document.getElementById('m-race-speed').value = d.speed || 30;
    document.getElementById('m-race-accuracy').value = d.accuracy || 0;
    document.getElementById('m-race-ac').value = d.acBonus || 0;
    document.getElementById('m-race-crit-chance').value = d.critChance || 0;
    document.getElementById('m-race-traits').value = (d.traits || []).join(", ");
    document.getElementById('m-race-desc').value = d.description || "";

    document.getElementById('race-editor-title').innerText = "Editing Race: " + (d.name || "Unknown");
    document.getElementById('race-cancel-btn').classList.remove('hide-default');
    document.querySelector('.master-workspace').scrollTop = 0;
}

function resetRaceForm() {
    document.getElementById('m-race-id').value = "";
    document.querySelectorAll('#sub-races input').forEach(i => i.value = (i.type === "number" ? 0 : ""));
    document.getElementById('m-race-desc').value = "";
    document.getElementById('m-race-speed').value = 30;
    document.getElementById('race-editor-title').innerText = "Register New Race";
    document.getElementById('race-cancel-btn').classList.add('hide-default');
}

async function saveMasterRace() {
    const raceId = document.getElementById('m-race-id').value;
    if (!document.getElementById('m-race-name').value.trim()) return alert("Race name required!");

    const raceData = {
        name: document.getElementById('m-race-name').value.trim(),
        hpPerLv: parseInt(document.getElementById('m-race-hp').value) || 0,
        mpPerLv: parseInt(document.getElementById('m-race-mp').value) || 0,
        baseBody: parseInt(document.getElementById('m-race-body').value) || 0,
        baseMind: parseInt(document.getElementById('m-race-mind').value) || 0,
        baseSpirit: parseInt(document.getElementById('m-race-spirit').value) || 0,
        expBonus: parseInt(document.getElementById('m-race-exp-bonus').value) || 0,
        hpRegen: parseFloat(document.getElementById('m-race-hp-regen').value) || 0,
        mpRegen: parseFloat(document.getElementById('m-race-mp-regen').value) || 0,
        speed: parseInt(document.getElementById('m-race-speed').value) || 30,
        accuracy: parseInt(document.getElementById('m-race-accuracy').value) || 0,
        acBonus: parseInt(document.getElementById('m-race-ac').value) || 0,
        critChance: parseInt(document.getElementById('m-race-crit-chance').value) || 0,
        traits: document.getElementById('m-race-traits').value.split(',').map(t => t.trim()).filter(t => t !== ""),
        description: document.getElementById('m-race-desc').value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (raceId) {
            await firestore.collection('master_races').doc(raceId).update(raceData);
            alert("Race updated!");
        } else {
            raceData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await firestore.collection('master_races').add(raceData);
            alert("Race created!");
        }
        resetRaceForm();
        loadMasterRaceList();
    } catch (e) { alert("Error saving race."); }
}

// --- 10.2 CLASS REGISTRY ---
async function createMasterClass() { saveMasterClass(); } // Helper alias

async function saveMasterClass() {
    const classId = document.getElementById('m-class-id').value;
    const name = document.getElementById('m-class-name').value.trim();
    if (!name) return alert("Class name required!");

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
        traits: document.getElementById('m-class-traits').value.split(',').map(t => t.trim()).filter(t => t !== ""),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (classId) {
            await firestore.collection('master_classes').doc(classId).update(classData);
            alert("Class updated!");
        } else {
            classData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await firestore.collection('master_classes').add(classData);
            alert("Class created!");
        }
        resetClassForm();
        loadMasterClassList();
    } catch (e) { console.error(e); }
}

async function loadMasterClassList() {
    const list = document.getElementById('master-class-list');
    if (!list) return;

    try {
        // FIX: Only sort by 'tier' to avoid the 400 Index Error
        const snap = await firestore.collection('master_classes').orderBy('tier').get();
        list.innerHTML = "";

        if (snap.empty) {
            list.innerHTML = '<p class="text-muted text-center" style="padding:20px;">No classes registered yet.</p>';
            return;
        }

        snap.forEach(doc => {
            const d = doc.data();
            const card = document.createElement('div');
            card.className = "panel-card mb-s";
            card.style.background = "#18181b";
            // Color coding tiers: Gold (3), Indigo (2), Dark Grey (1)
            card.style.borderLeft = `4px solid ${d.tier == 3 ? '#fbbf24' : d.tier == 2 ? '#6366f1' : '#3f3f46'}`;
            
            const traitTags = (d.traits || []).map(t => 
                `<span style="background:#312e81; color:#c7d2fe; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-right:4px;">${t}</span>`
            ).join('');

            card.innerHTML = `
                <div class="flex-row" style="justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1;">
                        <div class="flex-row" style="gap:10px;">
                            <strong style="color:white;">${d.name}</strong> 
                            <span class="join-code-pill" style="opacity:0.6;">T${d.tier}</span>
                            <span class="join-code-pill" style="color:#a855f7;">${d.mainStat}</span>
                        </div>
                        <div class="mt-s" style="margin-bottom:8px;">${traitTags}</div>
                        <div style="font-size: 0.7rem; color: #71717a;">
                            HP/Lv: +${d.hpPerLv} | MP/Lv: +${d.mpPerLv}
                        </div>
                    </div>
                    <div class="flex-row" style="gap: 5px;">
                        <button class="btn-small" onclick="editClass('${doc.id}')" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
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

async function editClass(id) {
    const d = (await firestore.collection('master_classes').doc(id).get()).data();
    if (!d) return;

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
    document.querySelectorAll('#sub-classes input').forEach(i => i.value = (i.type === "number" ? 0 : ""));
    document.getElementById('m-class-desc').value = "";
    document.getElementById('class-editor-title').innerText = "Register New Class Archetype";
    document.getElementById('class-cancel-btn').classList.add('hide-default');
}

// ==========================================
// --- 10.3 SKILL REGISTRY (Refined) ---
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

// 1. Image Logic
document.getElementById('reg-skill-icon').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const size = 128; // The final output size
            canvas.width = size;
            canvas.height = size;

            let sourceX = 0, sourceY = 0, sourceSize = Math.min(img.width, img.height);
            sourceX = (img.width - sourceSize) / 2;
            sourceY = (img.height - sourceSize) / 2;

            ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
            
            const dataURL = canvas.toDataURL('image/webp', 0.8);
            document.getElementById('reg-skill-icon-base64').value = dataURL;
            document.getElementById('icon-preview').innerHTML = `<img src="${dataURL}" style="width:64px; height:64px; border-radius:4px;">`;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
});

// 2. Save / Update Logic
async function saveSkillToRegistry() {
    const skillId = document.getElementById('ms-skill-id').value; 
    const name = document.getElementById('reg-skill-name').value.trim();
    const skillClass = document.getElementById('reg-skill-class').value;
    const tier = parseInt(document.getElementById('reg-skill-tier').value);
    
    if (!name || !skillClass) return alert("Name and Class are required.");

    const skillData = {
        name: name,
        class: skillClass,
        tier: tier,
        baseCost: parseInt(document.getElementById('reg-skill-cost').value) || (10 * Math.pow(2, tier - 1)),
        description: document.getElementById('reg-skill-desc').value.trim(),
        iconData: document.getElementById('reg-skill-icon-base64').value, 
        
        // Combat Fields
        range: document.getElementById('reg-skill-range').value, // Now saves "Touch"
        aoe: document.getElementById('reg-skill-aoe').value.trim(),
        damageType: document.getElementById('reg-skill-dmg-type').value,
        savingThrow: document.getElementById('reg-skill-save').value,
        
        scalingStat: document.getElementById('reg-skill-stat').value,
        scalingFactor: parseFloat(document.getElementById('reg-skill-factor').value) || 1.0,
        
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (skillId) {
            await firestore.collection('master_skills').doc(skillId).update(skillData);
            alert("Skill Updated!");
        } else {
            const newId = `${skillClass.toLowerCase()}_${name.replace(/\s+/g, '_').toLowerCase()}_t${tier}`;
            skillData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            skillData.castTime = 0; 
            skillData.cooldown = 0;
            await firestore.collection('master_skills').doc(newId).set(skillData);
            alert("New Skill Created!");
        }
        
        resetSkillForm();
        loadSkillRegistry();
    } catch (e) {
        console.error("Error saving skill:", e);
        alert("Error saving skill.");
    }
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
    
    if (d.iconData) {
        document.getElementById('icon-preview').innerHTML = `<img src="${d.iconData}" style="width:100%; height:100%; border-radius:4px;">`;
    } else {
        document.getElementById('icon-preview').innerHTML = "";
    }

    document.getElementById('reg-skill-range').value = d.range || "Touch"; // Default to Touch
    document.getElementById('reg-skill-aoe').value = d.aoe || ""; 
    document.getElementById('reg-skill-dmg-type').value = d.damageType || "";
    document.getElementById('reg-skill-save').value = d.savingThrow || "none";
    document.getElementById('reg-skill-stat').value = d.scalingStat || "none";
    document.getElementById('reg-skill-factor').value = d.scalingFactor || 1.0;

    document.getElementById('skill-save-btn').innerText = "Update Skill";
    document.getElementById('skill-save-btn').classList.remove('btn-success');
    document.getElementById('skill-save-btn').classList.add('btn-primary'); 
    document.getElementById('skill-cancel-btn').classList.remove('hide-default');
    
    document.querySelector('.master-workspace').scrollTop = 0;
}

// 4. Reset Form
function resetSkillForm() {
    document.getElementById('ms-skill-id').value = "";
    document.getElementById('reg-skill-name').value = "";
    document.getElementById('reg-skill-desc').value = "";
    document.getElementById('reg-skill-icon').value = "";
    document.getElementById('reg-skill-icon-base64').value = "";
    document.getElementById('icon-preview').innerHTML = "";
    
    document.getElementById('reg-skill-tier').value = "1";
    document.getElementById('reg-skill-cost').value = "10";
    document.getElementById('reg-skill-range').value = "Touch"; // Updated Default
    document.getElementById('reg-skill-aoe').value = "";
    document.getElementById('reg-skill-dmg-type').value = "";
    document.getElementById('reg-skill-save').value = "none";
    document.getElementById('reg-skill-stat').value = "body";
    document.getElementById('reg-skill-factor').value = "1.0";

    document.getElementById('skill-save-btn').innerText = "Save Skill to Library";
    document.getElementById('skill-save-btn').classList.add('btn-success');
    document.getElementById('skill-save-btn').classList.remove('btn-primary');
    document.getElementById('skill-cancel-btn').classList.add('hide-default');
}

// 5. Load List
async function loadSkillRegistry() {
    const container = document.getElementById('registry-skill-list');
    container.innerHTML = '<p>Loading...</p>';
    
    try {
        const snap = await firestore.collection('master_skills').orderBy('class').get();
        if(snap.empty) { container.innerHTML = '<p class="text-center opacity-50">No skills defined yet.</p>'; return; }

        let html = ''; 
        
        snap.forEach(doc => {
            const d = doc.data();
            // 64x64 Icon logic (display only)
            const icon = d.iconData ? 
                `<img src="${d.iconData}" style="width:64px; height:64px; object-fit:cover; border-radius:4px; border:1px solid #333; flex-shrink:0;">` 
                : `<div style="width:64px; height:64px; background:#222; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#444;"><i class="fa-solid fa-image"></i></div>`;
            
            html += `
            <div class="panel-card mb-s" style="padding:10px; background:#18181b;">
                <div class="flex-row" style="align-items: flex-start; justify-content: space-between;">
                    
                    <div class="flex-row" style="gap: 15px; align-items: flex-start; flex-grow: 1;">
                        ${icon}
                        <div>
                            <div class="flex-row" style="gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
                                <strong style="color:#e879f9; font-size: 1.1rem;">${d.name}</strong>
                                <span class="join-code-pill" style="opacity:0.8;">${d.class}</span>
                                <span class="join-code-pill" style="opacity:0.8;">T${d.tier}</span>
                                <span class="join-code-pill" style="opacity:0.8;">${d.baseCost} MP</span>
                            </div>
                            
                            <div style="font-size:0.85rem; color:#ccc; margin-bottom: 6px;">${d.description}</div>
                            
                            <div style="font-size:0.75rem; color:#71717a; display:flex; gap:10px; flex-wrap:wrap;">
                                <span><i class="fa-solid fa-ruler-combined"></i> ${d.range} ${d.aoe ? `(${d.aoe})` : ''}</span>
                                <span><i class="fa-solid fa-burst"></i> ${d.damageType || 'Utility'}</span>
                                ${d.savingThrow !== 'none' ? `<span><i class="fa-solid fa-shield-halved"></i> Save: ${d.savingThrow}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="flex-row" style="gap: 5px;">
                        <button class="btn-small" onclick="editMasterSkill('${doc.id}')" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-danger-small" onclick="deleteMasterAsset('master_skills', '${doc.id}', loadSkillRegistry)" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>

                </div>
            </div>`;
        });
        
        container.innerHTML = html;
        
    } catch (e) {
        console.error("Load Error:", e);
    }
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
        card.innerHTML = `<div class="form-group"><strong style="color: #00ff88;">${t.name}</strong>
                <textarea class="form-input w-100 mt-s" style="height: 60px;" 
                    onchange="updateTraitDescription('${doc.id}', this.value)">${t.description}</textarea>
            </div>`;
        list.appendChild(card);
    });
}

async function updateTraitDescription(id, val) {
    await firestore.collection('master_traits').doc(id).update({ description: val });
}
