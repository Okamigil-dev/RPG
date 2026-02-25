// --- STATE VARIABLES ---
let totalCustomSeconds = 0; // The master clock. 0 = Year 1, Month 1, Day 1, 00:00:00
let speedMultiplier = 1;
let isRunning = false;
let lastRealTime = Date.now();

// --- THE LAWS OF TIME (Defaults) ---
// Note: We leave seconds-per-minute hardcoded to 60 here for simplicity, 
// but you can make it dynamic too!
let minPerHour = 60;
let hoursPerDay = 24;
let daysPerMonth = 30;
let monthsPerYear = 12;

// --- FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyCdwo2sWiMzLfnZ8o3oYkDYL45FuLiV4OI",
    authDomain: "virtual-tabletop-6cdab.firebaseapp.com",
    databaseURL: "https://your-project-default-rtdb.firebaseio.com",
    projectId: "virtual-tabletop-6cdab",
    storageBucket: "virtual-tabletop-6cdab.firebasestorage.app",
    messagingSenderId: "360507498207",
    appId: "1:360507498207:web:a2924052c05aba488b536a"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- ENGINE ---
function tick() {
    let now = Date.now();
    
    // Calculate how many real seconds passed since the last frame
    let deltaRealSeconds = (now - lastRealTime) / 1000;
    lastRealTime = now;

    if (isRunning) {
        // Add time to our custom world
        totalCustomSeconds += (deltaRealSeconds * speedMultiplier);
        updateDisplay();
    }
}

// --- CALCULATION & DISPLAY ---
function updateDisplay() {
    // 1. Calculate the structure of time based on our custom rules
    let secPerMin = 60;
    
    // Slicing the total seconds into smaller buckets using Math.floor and Modulo (%)
    let currentSec = Math.floor(totalCustomSeconds % secPerMin);
    
    let totalMinutes = Math.floor(totalCustomSeconds / secPerMin);
    let currentMin = Math.floor(totalMinutes % minPerHour);
    
    let totalHours = Math.floor(totalMinutes / minPerHour);
    let currentHour = Math.floor(totalHours % hoursPerDay);
    
    let totalDays = Math.floor(totalHours / hoursPerDay);
    let currentDay = Math.floor(totalDays % daysPerMonth) + 1; // +1 so days start at 1, not 0
    
    let totalMonths = Math.floor(totalDays / daysPerMonth);
    let currentMonth = Math.floor(totalMonths % monthsPerYear) + 1; // +1 so months start at 1
    
    let currentYear = Math.floor(totalMonths / monthsPerYear) + 1; // +1 so years start at 1

    // 2. Format with leading zeros for the clock
    let h = String(currentHour).padStart(2, '0');
    let m = String(currentMin).padStart(2, '0');
    let s = String(currentSec).padStart(2, '0');

    // 3. Update the HTML
    document.getElementById('time-display').innerText = `${h}:${m}:${s}`;
    document.getElementById('date-display').innerText = `Year ${currentYear}, Month ${currentMonth}, Day ${currentDay}`;
}

// --- CONTROLS ---
function toggleTime() {
    let btn = document.getElementById('play-btn');
    isRunning = !isRunning;
    
    if (isRunning) {
        lastRealTime = Date.now(); // Reset the real-world clock so it doesn't jump
        btn.innerText = "Pause Time";
        btn.className = "btn-stop";
    } else {
        btn.innerText = "Start Time";
        btn.className = "btn-start";
    }
}

function setSpeed(newSpeed) {
    speedMultiplier = newSpeed;
    document.getElementById('speed-label').innerText = newSpeed + "x";
}

function updateRules() {
    // Read the inputs from the HTML and update our custom world logic
    minPerHour = parseInt(document.getElementById('min-per-hour').value) || 60;
    hoursPerDay = parseInt(document.getElementById('hours-per-day').value) || 24;
    daysPerMonth = parseInt(document.getElementById('days-per-month').value) || 30;
    monthsPerYear = parseInt(document.getElementById('months-per-year').value) || 12;
    
    updateDisplay(); // Instantly update the screen to reflect the new laws of time
}

// Run the engine constantly
setInterval(tick, 50);
updateDisplay();
