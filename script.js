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

// Reacts instantly when a user logs in or out
// Reacts instantly when a user logs in or out
auth.onAuthStateChanged((user) => {
    // Grab the UI elements
    const gameUI = document.getElementById('game-ui');
    const controlsDiv = document.getElementById('time-controls');
    const settingsDiv = document.getElementById('time-settings');

    if (user) {
        // Fetch their profile from FIRESTORE
        firestore.collection('users').doc(user.uid).get().then((doc) => {
            if (doc.exists) {
                const userData = doc.data();
                const role = userData.role;
                
                // Update Login Panel UI
                document.getElementById('user-status').innerText = `Logged in as: ${user.email} (Role: ${role})`;
                document.getElementById('logout-btn').style.display = "inline-block";
                document.getElementById('auth-title').style.display = "none";
                document.getElementById('email-input').style.display = "none";
                document.getElementById('password-input').style.display = "none";
                document.querySelector('button[onclick="loginUser()"]').style.display = "none";
                document.querySelector('button[onclick="registerUser()"]').style.display = "none";
                
                // --- SECURITY CHECK ---
                // 1. Show the main clock to ALL logged-in players
                if (gameUI) gameUI.style.display = 'block';

                // 2. Only show the control buttons if they are an Admin
                if (role === 'Admin') {
                    if (controlsDiv) controlsDiv.style.display = 'block';
                    if (settingsDiv) settingsDiv.style.display = 'block';
                } else {
                    if (controlsDiv) controlsDiv.style.display = 'none';
                    if (settingsDiv) settingsDiv.style.display = 'none';
                }
            }
        });
    } else {
        // User is logged out
        document.getElementById('user-status').innerText = "Not logged in";
        document.getElementById('logout-btn').style.display = "none";
        
        // Reset Login Panel UI
        document.getElementById('auth-title').style.display = "block";
        document.getElementById('email-input').style.display = "inline-block";
        document.getElementById('password-input').style.display = "inline-block";
        document.querySelector('button[onclick="loginUser()"]').style.display = "inline-block";
        document.querySelector('button[onclick="registerUser()"]').style.display = "inline-block";
        
        // Hide absolutely everything on the right side from guests!
        if (gameUI) gameUI.style.display = 'none';
    }
});
