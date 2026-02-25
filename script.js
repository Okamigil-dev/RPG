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
                
                // NEW: Grab the saved character ID from the user's profile
                currentCharacterId = userData.lastActiveCharacter || null;
                
                if(document.getElementById('user-display-name')) document.getElementById('user-display-name').innerText = user.email.split('@')[0];
                if(document.getElementById('user-role-label')) document.getElementById('user-role-label').innerText = role;
                document.getElementById('logout-btn').classList.remove('hide-default');
                if(mainNavTabs) mainNavTabs.classList.remove('hide-default');
                
                loadUserCharacters(); 
                openTab('tab-character');

                if (gameUI) gameUI.classList.remove('hide-default');
                if (role === 'Master' || role === 'Admin') {
                    if (controlPanelTabBtn) controlPanelTabBtn.classList.remove('hide-default');
                    if (masterPanel) masterPanel.classList.remove('hide-default');
                }
                if (role === 'Admin' && adminPanel) adminPanel.classList.remove('hide-default');
            }
        });
    } else {
        if(document.getElementById('user-display-name')) document.getElementById('user-display-name').innerText = "Guest";
        if(document.getElementById('user-role-label')) document.getElementById('user-role-label').innerText = "Offline";
        if(document.getElementById('nav-user-portrait')) document.getElementById('nav-user-portrait').style.backgroundImage = "";
        
        document.getElementById('logout-btn').classList.add('hide-default');
        if(mainNavTabs) mainNavTabs.classList.add('hide-default');
        const hud = document.getElementById('active-char-hud');
        if(hud) hud.classList.add('hide-default');
        
        openTab('tab-login');
        if (gameUI) gameUI.classList.add('hide-default');
        if (controlPanelTabBtn) controlPanelTabBtn.classList.add('hide-default');
        currentCharacterId = null;
    }
});


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
        const select = document.getElementById('character-select');
        select.innerHTML = '<option value="">-- Switch Character --</option>';
        
        let firstCharId = null;
        let foundSavedChar = false;

        snap.forEach(doc => {
            if (!firstCharId) firstCharId = doc.id;
            let opt = document.createElement('option');
            opt.value = doc.id; 
            opt.innerText = `Lv. ${doc.data().level} | ${doc.data().name}`;
            
            // Check if this is the character you had open
            if (doc.id === currentCharacterId) {
                opt.selected = true;
                foundSavedChar = true;
            }
            select.appendChild(opt);
        });

        // If no saved character is found, lock onto the first one in the list
        if (!foundSavedChar && firstCharId) {
            currentCharacterId = firstCharId;
            select.value = firstCharId;
        }

        // THIS IS THE FIX: Force the sidebar HUD to appear instantly
        if (currentCharacterId) {
            switchCharacter();
        }
    });
}

function switchCharacter() {
    currentCharacterId = document.getElementById('character-select').value;
    
    if (!currentCharacterId) {
        document.getElementById('active-char-hud').classList.add('hide-default');
        return;
    }

    // NEW: Save the active character choice to the user's main profile tag
    firestore.collection('users').doc(auth.currentUser.uid).set({
        lastActiveCharacter: currentCharacterId
    }, { merge: true });

    // Load the character data
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).get().then(doc => {
        if (doc.exists) loadCharacterData(doc.data());
    });
}

function saveCharacter() {
    if (!currentCharacterId || !auth.currentUser) return;
    const charData = {
        name: document.getElementById('char-name').value,
        level: document.getElementById('char-level').value,
        hpCurrent: document.getElementById('char-hp-current').value,
        hpMax: document.getElementById('char-hp-max').value,
        ac: document.getElementById('char-ac').value,
        init: document.getElementById('char-init').value,
        speed: document.getElementById('char-speed').value,
        str: document.getElementById('char-str').value,
        dex: document.getElementById('char-dex').value,
        con: document.getElementById('char-con').value,
        int: document.getElementById('char-int').value,
        wis: document.getElementById('char-wis').value,
        cha: document.getElementById('char-cha').value,
        
        // FIXED: No more slicing HTML! We just save the raw variable directly.
        portrait: currentPortraitString
    };
    firestore.collection('users').doc(auth.currentUser.uid).collection('characters').doc(currentCharacterId).set(charData, { merge: true })
        .then(() => {
            updateHUD(charData);
            loadUserCharacters(); 
        });
}

function loadCharacterData(char) {
    document.getElementById('char-name').value = char.name || "";
    document.getElementById('char-level').value = char.level || 1;
    document.getElementById('char-hp-current').value = char.hpCurrent || 0;
    document.getElementById('char-hp-max').value = char.hpMax || 0;
    document.getElementById('char-ac').value = char.ac || 10;
    document.getElementById('char-init').value = char.init || 0;
    document.getElementById('char-speed').value = char.speed || 30;
    document.getElementById('char-str').value = char.str || 10;
    document.getElementById('char-dex').value = char.dex || 10;
    document.getElementById('char-con').value = char.con || 10;
    document.getElementById('char-int').value = char.int || 10;
    document.getElementById('char-wis').value = char.wis || 10;
    document.getElementById('char-cha').value = char.cha || 10;
    
    // FIXED: Safely load the portrait into our variable
    currentPortraitString = char.portrait || "";
    updatePortraitUI(currentPortraitString);
    renderGallery(char.gallery || [], char.portrait || "");
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
    const navPortrait = document.getElementById('nav-user-portrait'); 
    
    if (!char) {
        if(hud) hud.classList.add('hide-default');
        if(navPortrait) navPortrait.style.backgroundImage = '';
        return;
    }
    
    if(hud) hud.classList.remove('hide-default');
    document.getElementById('hud-name').innerText = char.name || "Unnamed";
    
    const hpPercent = (char.hpMax > 0) ? (char.hpCurrent / char.hpMax) * 100 : 0;
    document.getElementById('hud-hp-fill').style.width = hpPercent + "%";
    document.getElementById('hud-hp-text').innerText = `${char.hpCurrent || 0} / ${char.hpMax || 0}`;
    
    if (navPortrait) navPortrait.style.backgroundImage = char.portrait ? `url('${char.portrait}')` : '';
}



// ==========================================
// --- 11. ---
// ==========================================
