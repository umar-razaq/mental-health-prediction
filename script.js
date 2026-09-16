"use strict";

/* ==========================================================================
   Config
   ========================================================================== */

const API_URL = "/predict";
// Editable score bands used only for the small label under the gauge.
// These are descriptive, not diagnostic — change freely.
const SCORE_BANDS = [
  { max: 40, label: "Room to recover", description: "The inputs you gave line up with lower scores in the training data — mostly driven by sleep, stress and usage balance. Small changes to any of those tend to move this number." },
  { max: 70, label: "Holding steady", description: "This sits in the middle of the range the model has seen. Nothing here is flagged as unusual — the exact factors depend on how each input weighed in." },
  { max: 101, label: "Trending strong", description: "Your answers land toward the higher end of the model's training range, typically associated with more balanced sleep, study and screen habits." },
];

const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 86; // matches r=86 in the SVG

/* ==========================================================================
   DOM handles
   ========================================================================== */

const form = document.getElementById("assessmentForm");
const submitBtn = document.getElementById("submitBtn");
const formStatus = document.getElementById("formStatus");
const resultCard = document.getElementById("resultCard");
const gaugeFill = document.getElementById("gaugeFill");
const scoreNumber = document.getElementById("scoreNumber");
const scoreLabel = document.getElementById("scoreLabel");
const scoreDescription = document.getElementById("scoreDescription");
const retakeBtn = document.getElementById("retakeBtn");
const startBtn = document.getElementById("startBtn");
const navCta = document.getElementById("navCta");

/* ==========================================================================
   Navigation helpers
   ========================================================================== */

function scrollToAssessment() {
  document.getElementById("assessment").scrollIntoView({ behavior: "smooth", block: "start" });
}

startBtn.addEventListener("click", scrollToAssessment);
navCta.addEventListener("click", scrollToAssessment);

/* ==========================================================================
   Validation
   ========================================================================== */

const NUMERIC_RULES = {
  age: { min: 10, max: 100, integer: true },
  avg_daily_usage_hours: { min: 0, max: 24 },
  daily_unlocks: { min: 0, max: null, integer: true },
  study_hours: { min: 0, max: 24 },
  physical_activity_hours: { min: 0, max: 24 },
  sleep_hours_per_night: { min: 0, max: 24 },
};

function setFieldError(fieldName, message) {
  const input = form.elements[fieldName];
  const errorEl = form.querySelector(`[data-error-for="${fieldName}"]`);
  if (input) input.classList.toggle("invalid", Boolean(message));
  if (errorEl) errorEl.textContent = message || "";
}

function validateField(fieldName, rawValue) {
  const value = (rawValue ?? "").toString().trim();

  if (value === "") {
    setFieldError(fieldName, "This field is required.");
    return false;
  }

  const rule = NUMERIC_RULES[fieldName];
  if (rule) {
    const num = Number(value);
    if (Number.isNaN(num)) {
      setFieldError(fieldName, "Enter a valid number.");
      return false;
    }
    if (rule.integer && !Number.isInteger(num)) {
      setFieldError(fieldName, "Whole numbers only.");
      return false;
    }
    if (num < rule.min || (rule.max !== null && rule.max !== undefined && num > rule.max)) {
      const range = rule.max !== null && rule.max !== undefined ? `${rule.min}–${rule.max}` : `${rule.min} or above`;
      setFieldError(fieldName, `Must be between ${range}.`);
      return false;
    }
  }

  setFieldError(fieldName, "");
  return true;
}

function validateForm(formData) {
  const fieldNames = [
    "age", "gender", "country", "academic_level",
    "most_used_platform", "purpose_of_use", "avg_daily_usage_hours", "daily_unlocks",
    "study_hours", "physical_activity_hours", "sleep_hours_per_night", "stress_level",
  ];

  let isValid = true;
  fieldNames.forEach((name) => {
    const fieldIsValid = validateField(name, formData.get(name));
    if (!fieldIsValid) isValid = false;
  });
  return isValid;
}

// Validate a field as soon as the user leaves it.
Array.from(form.elements).forEach((el) => {
  if (!el.name) return;
  el.addEventListener("blur", () => validateField(el.name, el.value));
});

/* ==========================================================================
   Payload building
   ========================================================================== */

function buildPayload(formData) {
  return {
    age: Number(formData.get("age")),
    gender: formData.get("gender"),
    country: formData.get("country").trim(),
    academic_level: formData.get("academic_level"),
    most_used_platform: formData.get("most_used_platform"),
    purpose_of_use: formData.get("purpose_of_use"),
    avg_daily_usage_hours: Number(formData.get("avg_daily_usage_hours")),
    daily_unlocks: Number(formData.get("daily_unlocks")),
    study_hours: Number(formData.get("study_hours")),
    physical_activity_hours: Number(formData.get("physical_activity_hours")),
    sleep_hours_per_night: Number(formData.get("sleep_hours_per_night")),
    stress_level: formData.get("stress_level"),
  };
}

/* ==========================================================================
   API call
   ========================================================================== */

async function requestPrediction(payload) {
  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    throw new Error("Unable to connect to the prediction server. Please make sure the FastAPI backend is running.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = errBody?.detail ? ` (${JSON.stringify(errBody.detail)})` : "";
    } catch (_) { /* body wasn't JSON — ignore */ }
    throw new Error(`The server rejected the request (status ${response.status}).${detail ? " Check your inputs and try again." : ""}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    throw new Error("The server sent back something unexpected. Please try again.");
  }

  if (typeof data.predicted_mental_health_score !== "number") {
    throw new Error("The server response didn't include a score. Please try again.");
  }

  return data.predicted_mental_health_score;
}

/* ==========================================================================
   Loading state
   ========================================================================== */

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle("is-loading", isLoading);
  submitBtn.querySelector(".btn-label").textContent = isLoading ? "Analyzing your responses…" : "Predict my score";
}

/* ==========================================================================
   Result rendering
   ========================================================================== */

function getBand(score) {
  return SCORE_BANDS.find((band) => score < band.max) || SCORE_BANDS[SCORE_BANDS.length - 1];
}

function renderResult(score) {
  const clamped = Math.max(0, Math.min(100, score));
  const band = getBand(clamped);

  scoreNumber.textContent = score.toFixed(2);
  scoreLabel.textContent = band.label;
  scoreDescription.textContent = band.description;

  const offset = GAUGE_CIRCUMFERENCE * (1 - clamped / 100);
  // Reset then animate on the next frame so the transition actually plays.
  gaugeFill.style.transition = "none";
  gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE);
  requestAnimationFrame(() => {
    gaugeFill.style.transition = "";
    gaugeFill.style.strokeDashoffset = String(offset);
  });

  resultCard.hidden = false;
  resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

retakeBtn.addEventListener("click", () => {
  resultCard.hidden = true;
  scrollToAssessment();
});

/* ==========================================================================
   Error handling / status messaging
   ========================================================================== */

function showStatus(message, isError) {
  formStatus.textContent = message;
  formStatus.classList.toggle("error", Boolean(isError));
}

/* ==========================================================================
   Form submit
   ========================================================================== */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showStatus("", false);

  const formData = new FormData(form);
  if (!validateForm(formData)) {
    showStatus("Please fix the highlighted fields before submitting.", true);
    return;
  }

  const payload = buildPayload(formData);

  setLoading(true);
  try {
    const score = await requestPrediction(payload);
    renderResult(score);
    showStatus("", false);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    setLoading(false);
  }
});
