// ==========================================
// --- 1. STATE VARIABLES & DEFAULTS ---
// ==========================================
let totalCustomSeconds = 0; // The master clock. 0 = Year 1, Month 1, Day 1, 00:00:00
let speedMultiplier = 1;
let isRunning = false;
let lastRealTime = Date.now();

let minPerHour = 60;
let hoursPerDay = 24;
let daysPerMonth = 30;
let monthsPerYear = 12;

let currentCampaignId = "global"; // The default room everyone joins for now


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

// Initialize Firebase services
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const rtdb = firebase.database();       // For the fast game clock
const firestore = firebase.firestore(); // For user roles and character sheets


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

// Listen for updates from the DM or other players
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

        // Update HTML Inputs
        document.getElementById('min-per-hour').value = minPerHour;
        document.getElementById('hours-per-day').value = hoursPerDay;
        document.getElementById('days-per-month').value = daysPerMonth;
        document.getElementById('months-per-year').value = monthsPerYear;
        document.getElementById('speed-label').innerText = speedMultiplier + "x";
        
        let btn = document.getElementById('play-btn');
        if (isRunning) {
            btn.innerText = "Pause Time";
            btn.className = "btn-stop";
        } else {
            btn.innerText = "Start Time";
            btn.className = "btn-start";
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

    let h = String(currentHour).padStart(2, '0');
    let m = String(currentMin).padStart(2, '0');
    let s = String(currentSec).padStart(2, '0');

    document.getElementById('time-display').innerText = `${h}:${m}:${s}`;
    document.getElementById('date-display').innerText = `Year ${currentYear}, Month ${currentMonth}, Day ${currentDay}`;
}

// Start the local engine loop (runs 20 times a second)
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
    daysPerMonth = parseInt(document.getElementById('days-per-month').value) || 30;
    monthsPerYear = parseInt(document.getElementById('months-per-year').value) || 12;
    
    updateDisplay(); 
    saveTimeState(); 
}


// ==========================================
// --- 6. AUTHENTICATION & ROLES ---
// ==========================================
function registerUser() {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;

    auth.createUserWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            const user = userCredential.user;
            firestore.collection('users').doc(user.uid).set({
                email: email,
                role: 'Player' 
            });
            alert("Account created!");
        })
        .catch((error) => alert(error.message));
}

function loginUser() {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    auth.signInWithEmailAndPassword(email, pass).catch((error) => alert(error.message));
}

function logoutUser() {
    auth.signOut();
}

// ==========================================
// --- 7. USER AUTHENTICATION ---
// ==========================================
// Reacts instantly when a user logs in or out
auth.onAuthStateChanged((user) => {
    // Grab all our UI pieces
    const gameUI = document.getElementById('game-ui');
    const controlPanelTabBtn = document.getElementById('nav-control-panel'); // The sidebar button
    const masterPanel = document.getElementById('master-panel');             // Level 2 content
    const adminPanel = document.getElementById('admin-panel');               // Level 3 content
    
    // Login Screen Inputs
    const loginTab = document.getElementById('tab-login');
    const emailInput = document.getElementById('email-input');
    const passInput = document.getElementById('password-input');
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');

    if (user) {
        // Fetch profile from Firestore
        firestore.collection('users').doc(user.uid).get().then((doc) => {
             if (doc.exists) {
                const userData = doc.data();
                const role = userData.role;
                        
                // FILL IN THE SHEET!
                loadCharacter(userData);
                
                // Show who is logged in
                document.getElementById('user-status').innerText = `User: ${user.email} (${role})`;
                document.getElementById('logout-btn').style.display = "inline-block";
                
                // Hide the login screen elements entirely
                if (emailInput) emailInput.style.display = "none";
                if (passInput) passInput.style.display = "none";
                if (loginBtn) loginBtn.style.display = "none";
                if (registerBtn) registerBtn.style.display = "none";
                
                // Automatically switch them to the Character Sheet tab on login
                openTab('tab-character');
                
                // ==========================================
                // --- THE HIERARCHY SECURITY CHECK ---
                // ==========================================
                
                // LEVEL 1: Player (Can see the clock)
                if (gameUI) gameUI.style.display = 'block';

                // LEVEL 2: Master (Can see the Control Panel Tab, and the Master Panel inside it)
                if (role === 'Master' || role === 'Admin') {
                    if (controlPanelTabBtn) controlPanelTabBtn.style.display = 'block';
                    if (masterPanel) masterPanel.style.display = 'block';
                } else {
                    if (controlPanelTabBtn) controlPanelTabBtn.style.display = 'none';
                    if (masterPanel) masterPanel.style.display = 'none';
                }

                // LEVEL 3: Admin (Can see the Admin Panel inside the Control Panel tab)
                if (role === 'Admin') {
                    if (adminPanel) adminPanel.style.display = 'block';
                } else {
                    if (adminPanel) adminPanel.style.display = 'none';
                }
            }
        });
    } else {
        // User is logged out
        document.getElementById('user-status').innerText = "Not logged in";
        document.getElementById('logout-btn').style.display = "none";
        
        // Show the login screen inputs
        if (emailInput) emailInput.style.display = "block";
        if (passInput) passInput.style.display = "block";
        if (loginBtn) loginBtn.style.display = "inline-block";
        if (registerBtn) registerBtn.style.display = "inline-block";
        
        // Force the screen back to the Login tab
        openTab('tab-login');
        
        // Hide game UI and restricted panels
        if (gameUI) gameUI.style.display = 'none';
        if (controlPanelTabBtn) controlPanelTabBtn.style.display = 'none';
        if (masterPanel) masterPanel.style.display = 'none';
        if (adminPanel) adminPanel.style.display = 'none';
    }
});



// ==========================================
// --- 8. UI NAVIGATION (TAB SWITCHER) ---
// ==========================================
function openTab(tabId) {
    // 1. Hide every single tab in the main content area
    const allTabs = document.querySelectorAll('.tab-content');
    allTabs.forEach(tab => tab.style.display = 'none');
    
    // 2. Unhide exactly the one we asked for
    document.getElementById(tabId).style.display = 'block';
}



// ==========================================
// --- 9. CHARACTER SHEET LOGIC ---
// ==========================================

// This runs automatically every time a player types a number and clicks away
function saveCharacter() {
    const user = auth.currentUser;
    if (!user) return; // Stop if they aren't logged in

    // 1. Gather all the data from the HTML inputs
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
        cha: document.getElementById('char-cha').value
    };

    // 2. Save it to Firestore inside a "character" object
    firestore.collection('users').doc(user.uid).set({
        character: charData
    }, { merge: true }).then(() => {
        console.log("Auto-saved character data to Firestore!");
    }).catch(error => console.error("Error saving character:", error));
}

// This function fills in the boxes when the user first logs in
function loadCharacter(userData) {
    if (userData && userData.character) {
        const char = userData.character;
        document.getElementById('char-name').value = char.name || "";
        document.getElementById('char-level').value = char.level || 1;
        document.getElementById('char-hp-current').value = char.hpCurrent || "";
        document.getElementById('char-hp-max').value = char.hpMax || "";
        document.getElementById('char-ac').value = char.ac || 10;
        document.getElementById('char-init').value = char.init || 0;
        document.getElementById('char-speed').value = char.speed || 30;
        document.getElementById('char-str').value = char.str || 10;
        document.getElementById('char-dex').value = char.dex || 10;
        document.getElementById('char-con').value = char.con || 10;
        document.getElementById('char-int').value = char.int || 10;
        document.getElementById('char-wis').value = char.wis || 10;
        document.getElementById('char-cha').value = char.cha || 10;
    }
}
