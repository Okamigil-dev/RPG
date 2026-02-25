// --- STATE VARIABLES ---
let defaultTimeMs = 5 * 60 * 1000; // 5 minutes in milliseconds
let remainingMs = defaultTimeMs;
let speedMultiplier = 1;
let isRunning = false;
let lastTickTime = 0;
let timerInterval = null;

// --- CORE LOGIC ---
function tick() {
    if (!isRunning) return;

    // 1. Calculate how much real time passed since the last tick
    const now = Date.now();
    const deltaTime = now - lastTickTime;
    lastTickTime = now;

    // 2. Multiply that time by our speed and subtract it from the remaining time
    remainingMs -= (deltaTime * speedMultiplier);

    // 3. Check if we hit zero
    if (remainingMs <= 0) {
        remainingMs = 0;
        isRunning = false;
        clearInterval(timerInterval);
        updateDisplay();
        alert("Timer Finished!");
        return;
    }

    updateDisplay();
}

// --- CONTROLS ---
function startTimer() {
    if (isRunning) return; // Prevent multiple intervals from starting
    isRunning = true;
    lastTickTime = Date.now();
    
    // Run the tick function every 50ms for smooth visual updates
    timerInterval = setInterval(tick, 50);
}

function stopTimer() {
    isRunning = false;
    clearInterval(timerInterval);
}

function resetTimer() {
    stopTimer();
    remainingMs = defaultTimeMs;
    speedMultiplier = 1;
    document.getElementById('speed-label').innerText = "1x";
    updateDisplay();
}

function setSpeed(newSpeed) {
    // If the timer is actively running, force a final tick at the old speed 
    // before applying the new speed so the math stays accurate.
    if (isRunning) tick(); 
    
    speedMultiplier = newSpeed;
    document.getElementById('speed-label').innerText = newSpeed + "x";
}

// --- UI UPDATER ---
function updateDisplay() {
    // Convert remaining milliseconds to Minutes, Seconds, and Tenths of a second
    const m = Math.floor(remainingMs / (1000 * 60));
    const s = Math.floor((remainingMs % (1000 * 60)) / 1000);
    const ms = Math.floor((remainingMs % 1000) / 100); // Just getting the first decimal

    document.getElementById('clock-display').innerText = 
        `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}

// Initialize the display when the page loads
updateDisplay();
