const API_BASE_URL = "";
const REQUEST_TIMEOUT_MS = 2500;
const STATUS_POLL_INTERVAL_MS = 3000;

const connectionBadge = document.getElementById("connection-badge");
const connectionText = document.getElementById("connection-text");
const mockBanner = document.getElementById("mock-banner");
const mockModeToggle = document.getElementById("mock-mode-toggle");
const motorStateEl = document.getElementById("motor-state");
const speedValueEl = document.getElementById("speed-value");
const speedSlider = document.getElementById("speed-slider");
const btnForward = document.getElementById("btn-forward");
const btnStop = document.getElementById("btn-stop");
const statusMessageEl = document.getElementById("status-message");

const state = {
  connected: false,
  mockMode: false,
  motor: "stopped", // "forward" | "stopped"
  speed: 0,
  isDraggingSlider: false,
  isCheckingStatus: false
};

// Simulated ESP32-C3 state used when Mock Mode is enabled
const mockDevice = {
  connected: true,
  motor: "stopped",
  speed: 0
};

function updateConnectionUI(isConnected) {
  state.connected = isConnected;
  connectionBadge.classList.remove("connected", "disconnected", "mock");

  if (state.mockMode) {
    connectionBadge.classList.add("mock");
    connectionText.textContent = "Mock Mode";
    return;
  }

  if (isConnected) {
    connectionBadge.classList.add("connected");
    connectionText.textContent = "Connected";
  } else {
    connectionBadge.classList.add("disconnected");
    connectionText.textContent = "Disconnected";
  }
}

function updateMotorUI(motorState) {
  const normalizedState = motorState === "forward" ? "forward" : "stopped";
  state.motor = normalizedState;

  motorStateEl.textContent = normalizedState === "forward" ? "Forward" : "Stopped";
  btnForward.classList.toggle("active", normalizedState === "forward");
}

function updateSliderVisual(speed) {
  const percent = (speed / 255) * 100;
  speedSlider.style.setProperty("--progress", `${percent}%`);
}

function updateSpeedDisplay(speed) {
  const safeSpeed = Math.max(0, Math.min(255, Number(speed) || 0));
  state.speed = safeSpeed;
  speedSlider.value = safeSpeed;
  speedValueEl.textContent = safeSpeed;
  updateSliderVisual(safeSpeed);
}

function showMessage(message, type = "") {
  statusMessageEl.textContent = message;
  statusMessageEl.classList.remove("error", "success");
  if (type) {
    statusMessageEl.classList.add(type);
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timerId);
  }
}

async function sendMotorCommand(command, speed) {
  const payload = {
    command: command,
    speed: command === "stop" ? 0 : Number(speed)
  };

  // --- MOCK MODE SIMULATION ---
  if (state.mockMode) {
    mockDevice.motor = command === "stop" ? "stopped" : "forward";
    mockDevice.speed = payload.speed;

    updateConnectionUI(false);
    updateMotorUI(mockDevice.motor);

    if (command === "stop") {
      updateSpeedDisplay(0);
      showMessage("[MOCK] STOP command simulated.", "success");
    } else {
      updateSpeedDisplay(payload.speed);
      showMessage(`[MOCK] FORWARD command simulated (Speed: ${payload.speed}).`, "success");
    }

    console.log("[MOCK] POST /api/motor ->", JSON.stringify(payload));
    return;
  }

  // --- REAL ESP32-C3 REQUEST ---
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/motor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    updateConnectionUI(true);
    const nextMotorState = command === "stop" ? "stopped" : "forward";
    updateMotorUI(nextMotorState);

    if (command === "stop") {
      updateSpeedDisplay(0);
      showMessage("STOP command sent to ESP32-C3.", "success");
    } else {
      showMessage(`FORWARD command sent (Speed: ${payload.speed}).`, "success");
    }
  } catch (error) {
    updateConnectionUI(false);
    updateMotorUI("stopped");
    showMessage("Failed to send command: Lost connection to ESP32-C3.", "error");
    console.error("POST /api/motor error:", error);
  }
}

async function checkStatus() {
  if (state.mockMode) {
    updateConnectionUI(false);
    updateMotorUI(mockDevice.motor);

    if (!state.isDraggingSlider) {
      updateSpeedDisplay(mockDevice.speed);
    }
    return;
  }

  if (state.isCheckingStatus) return;
  state.isCheckingStatus = true;

  const wasConnected = state.connected;

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/status`, {
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data && data.connected === true) {
      updateConnectionUI(true);
      updateMotorUI(data.motor || "stopped");

      if (!state.isDraggingSlider && typeof data.speed === "number") {
        updateSpeedDisplay(data.speed);
      }

      if (!wasConnected) {
        showMessage("Connected to ESP32-C3.", "success");
      }
    } else {
      updateConnectionUI(false);
      updateMotorUI("stopped");
      showMessage("ESP32-C3 is not ready.", "error");
    }
  } catch (error) {
    updateConnectionUI(false);
    updateMotorUI("stopped");
    showMessage("Unable to connect to ESP32-C3. Check Wi-Fi connection.", "error");
  } finally {
    state.isCheckingStatus = false;
  }
}

function setMockMode(enabled) {
  state.mockMode = enabled;
  mockBanner.hidden = !enabled;

  if (enabled) {
    mockDevice.motor = "stopped";
    mockDevice.speed = Number(speedSlider.value);

    updateConnectionUI(false);
    updateMotorUI("stopped");
    showMessage("Mock Mode enabled. Simulating ESP32-C3 responses.", "success");
    console.log("[MOCK] Mock Mode enabled.");
  } else {
    updateConnectionUI(false);
    updateMotorUI("stopped");
    showMessage("Mock Mode disabled. Reconnecting to ESP32-C3...");
    console.log("[MOCK] Mock Mode disabled.");
    checkStatus();
  }
}

// --- EVENT LISTENERS ---

mockModeToggle.addEventListener("change", () => {
  setMockMode(mockModeToggle.checked);
});

speedSlider.addEventListener("pointerdown", () => {
  state.isDraggingSlider = true;
});

speedSlider.addEventListener("pointerup", () => {
  state.isDraggingSlider = false;
});

speedSlider.addEventListener("pointercancel", () => {
  state.isDraggingSlider = false;
});

speedSlider.addEventListener("input", () => {
  const currentSpeed = Number(speedSlider.value);
  speedValueEl.textContent = currentSpeed;
  state.speed = currentSpeed;
  updateSliderVisual(currentSpeed);
});

speedSlider.addEventListener("change", () => {
  state.isDraggingSlider = false;
  const newSpeed = Number(speedSlider.value);

  if ((state.connected || state.mockMode) && state.motor === "forward") {
    sendMotorCommand("forward", newSpeed);
  }
});

btnForward.addEventListener("click", () => {
  sendMotorCommand("forward", Number(speedSlider.value));
});

btnStop.addEventListener("click", () => {
  updateSpeedDisplay(0);
  sendMotorCommand("stop", 0);
});

// --- INITIALIZE ---
updateSliderVisual(0);
checkStatus();
setInterval(checkStatus, STATUS_POLL_INTERVAL_MS);