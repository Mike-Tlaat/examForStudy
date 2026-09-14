// js/exam.js - تسجيل الطالب -> الامتحان المباشر -> التصحيح والتسليم

import {
  getExamBySlug,
  getExamById,
  getAttempt,
  createAttempt,
  checkExistingAttempt,
  ensureExamStarted,
  getQuestionsByExam,
  submitExamAttempt,
  subscribeToExamBroadcast,
  getSiteBranding,
} from "../includes/functions.js?v=1.0.0";

// =======================================
// آلية التحديث التلقائي للنسخة (Cache Control)
// =======================================
const CURRENT_APP_VERSION = "4.0.0";
(function checkAppVersion() {
  const savedVersion = localStorage.getItem("app_sys_version");
  if (savedVersion !== CURRENT_APP_VERSION) {
    localStorage.setItem("app_sys_version", CURRENT_APP_VERSION);
    if (savedVersion) {
      window.location.reload(true);
    }
  }
})();

const qs = new URLSearchParams(location.search);
const rawParam = (
  qs.get("slug") ||
  qs.get("exam") ||
  qs.get("id") ||
  ""
).trim();

const screens = {
  loading: document.getElementById("loadingScreen"),
  registration: document.getElementById("registrationScreen"),
  exam: document.getElementById("examScreen"),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el?.classList.add("hidden"));
  screens[name]?.classList.remove("hidden");
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

const attemptStorageKey = (examId) => `attempt_id_${examId}`;

let currentExam = null;
let currentAttempt = null;
let isSubmittingLock = false;

/* =======================================
   شريط اسم وشعار الموقع (يظهر في كل شاشات الامتحان)
======================================= */
async function loadSiteBranding() {
  try {
    const { name, logo } = await getSiteBranding();
    const bar = document.getElementById("siteBrandBar");
    const nameEl = document.getElementById("siteBrandName");
    const logoEl = document.getElementById("siteBrandLogo");
    if (!bar) return;

    if (!name && !logo) {
      bar.classList.add("hidden");
      return;
    }
    if (name) {
      nameEl.textContent = name;
      nameEl.classList.remove("hidden");
    } else {
      nameEl.classList.add("hidden");
    }
    if (logo) {
      logoEl.src = logo;
      logoEl.classList.remove("hidden");
    } else {
      logoEl.classList.add("hidden");
    }
    bar.classList.remove("hidden");
  } catch (err) {
    console.error("Error loading site branding:", err);
  }
}

/* =======================================
   لايت بوكس لعرض صور السؤال بحجم كامل
======================================= */
function initImageLightbox() {
  const overlay = document.getElementById("imageLightbox");
  const img = document.getElementById("imageLightboxImg");
  const closeBtn = document.getElementById("imageLightboxCloseBtn");
  if (!overlay) return;

  function open(src) {
    img.src = src;
    overlay.classList.add("active");
  }
  function close() {
    overlay.classList.remove("active");
  }

  closeBtn?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });

  document.body.addEventListener("click", (e) => {
    const thumb = e.target.closest(".question-image-thumb");
    if (thumb) open(thumb.dataset.full || thumb.querySelector("img")?.src);
  });
}

/* =======================================
   تحديث عنوان الصفحة والمعاينة (Link Preview)
======================================= */
function updatePageTitle(exam) {
  if (!exam) return;
  const examName = exam.name || "";
  const titleText = examName.startsWith("امتحان")
    ? examName
    : `امتحان ${examName}`;

  document.title = titleText;

  const setMeta = (selector, attr, value, createAttrs) => {
    let el = document.querySelector(selector);
    if (!el) {
      el = document.createElement("meta");
      Object.entries(createAttrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  };

  setMeta('meta[property="og:title"]', "content", titleText, {
    property: "og:title",
  });
  setMeta('meta[name="twitter:title"]', "content", titleText, {
    name: "twitter:title",
  });
  setMeta(
    'meta[property="og:description"]',
    "content",
    "اضغط للدخول إلى الامتحان مباشرة",
    {
      property: "og:description",
    },
  );
  // ملحوظة: هذا التحديث يحدث بجافاسكريبت بعد تحميل الصفحة، فبيغيّر عنوان تبويب
  // المتصفح فوراً، لكن معاينة الروابط في واتساب/فيسبوك بتُقرأ بدون تشغيل جافاسكريبت
  // فممكن تفضل تعرض النص الافتراضي في أول لحظة قبل ما تُفتح الصفحة بالكامل.
  // لحل هذا نهائياً على مستوى المعاينة راجع ملاحظة "OG Preview" في README.
}

/* =======================================
   استقبال رسائل البث المباشر من الأدمن وقت الامتحان
======================================= */
function playNotificationBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [880, 1180].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const startAt = ctx.currentTime + i * 0.18;
      gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.28);
      osc.start(startAt);
      osc.stop(startAt + 0.3);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* المتصفح مانع تشغيل الصوت تلقائياً، مفيش مشكلة، البانر البصري هيفضل شغال */
  }
}

function showLiveMessageBanner(text) {
  if (!text || !text.trim()) return;

  let banner = document.getElementById("liveMsgBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "liveMsgBanner";
    document.body.appendChild(banner);
  }

  banner.innerHTML = `
    <i class="fa-solid fa-bullhorn"></i>
    <span class="live-msg-text">${escapeHtml(text)}</span>
    <button type="button" id="closeLiveMsgBtn" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button>
  `;
  banner.classList.remove("show");
  requestAnimationFrame(() => banner.classList.add("show"));

  document.getElementById("closeLiveMsgBtn").onclick = () =>
    banner.classList.remove("show");

  clearTimeout(banner._autoHideTimer);
  banner._autoHideTimer = setTimeout(
    () => banner.classList.remove("show"),
    12000,
  );
}

function initLiveBroadcastListener(examId) {
  try {
    subscribeToExamBroadcast(examId, (text) => {
      showLiveMessageBanner(text);
      playNotificationBeep();
    });
  } catch (err) {
    console.error("Live broadcast listener error:", err);
  }
}

/* =======================================
   المودال المشترك
======================================= */
const modalOverlay = document.getElementById("customModal");
const modalIcon = document.getElementById("modalIcon");
const modalTitle = document.getElementById("modalTitle");
const modalText = document.getElementById("modalText");
const modalSummary = document.getElementById("modalSummary");
const modalButtons = document.getElementById("modalButtons");

function showModal({
  type = "alert",
  title,
  text = "",
  summaryHtml = null,
  confirmText = "حسناً",
  cancelText = "إلغاء",
  onConfirm = null,
  onCancel = null,
}) {
  if (!modalOverlay) return;
  modalTitle.textContent = title;
  modalText.textContent = text;
  modalText.classList.toggle("hidden", !text);

  if (summaryHtml) {
    modalSummary.innerHTML = summaryHtml;
    modalSummary.classList.remove("hidden");
  } else {
    modalSummary.classList.add("hidden");
  }

  const iconClassMap = {
    alert: "warning-badge",
    success: "success-badge",
    confirm: "info-badge",
  };
  const iconGlyphMap = {
    alert: "fa-triangle-exclamation",
    success: "fa-circle-check",
    confirm: "fa-circle-question",
  };
  modalIcon.className =
    "modal-icon-wrapper " + (iconClassMap[type] || "info-badge");
  modalIcon.innerHTML = `<i class="fa-solid ${iconGlyphMap[type] || "fa-circle-question"}"></i>`;

  modalButtons.innerHTML = "";
  if (type === "confirm") {
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "modal-btn modal-btn-secondary";
    cancelBtn.textContent = cancelText;
    cancelBtn.onclick = () => {
      modalOverlay.classList.remove("active");
      if (onCancel) onCancel();
    };
    modalButtons.appendChild(cancelBtn);
  }
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "modal-btn modal-btn-primary";
  confirmBtn.textContent = confirmText;
  confirmBtn.onclick = () => {
    modalOverlay.classList.remove("active");
    if (onConfirm) onConfirm();
  };
  modalButtons.appendChild(confirmBtn);

  modalOverlay.classList.add("active");
}

/* =======================================
   نقطة البداية
======================================= */
async function init() {
  loadSiteBranding();
  initImageLightbox();

  if (!rawParam) {
    showNotFoundMessage("لم يتم تحديد امتحان في رابط الصفحة!");
    return;
  }

  try {
    currentExam = await getExamBySlug(rawParam);
    if (!currentExam) {
      const numericId = Number(rawParam);
      if (!isNaN(numericId) && numericId > 0) {
        currentExam = await getExamById(numericId);
      }
    }
  } catch (err) {
    console.error("❌ خطأ أثناء الاتصال بقاعدة البيانات:", err);
  }

  if (!currentExam) {
    showNotFoundMessage(
      "لم نتمكن من العثور على امتحان بهذا الرابط. تأكد من الرابط أو تواصل مع الإدارة.",
    );
    return;
  }

  if (currentExam.is_open === false) {
    showClosedExamScreen(currentExam);
    return;
  }

  updatePageTitle(currentExam);
  initLiveBroadcastListener(currentExam.id);

  const savedId = localStorage.getItem(attemptStorageKey(currentExam.id));
  if (savedId) {
    const attempt = await getAttempt(Number(savedId));
    if (
      attempt &&
      attempt.exam_id === currentExam.id &&
      attempt.status === "pending"
    ) {
      currentAttempt = attempt;
    } else {
      localStorage.removeItem(attemptStorageKey(currentExam.id));
    }
  }

  if (!currentAttempt) {
    await showRegistration();
    return;
  }

  await ensureExamStarted(currentAttempt.id);
  currentAttempt = await getAttempt(currentAttempt.id);
  startExam();
}

// يحافظ على شريط اسم/شعار الموقع الظاهر فوق حتى لو استبدلنا محتوى الصفحة بالكامل
function renderStateScreen(innerHtml) {
  const brandBarHtml = document.getElementById("siteBrandBar")?.outerHTML || "";
  document.body.innerHTML = brandBarHtml + innerHtml;
}

function showNotFoundMessage(msg) {
  renderStateScreen(`
    <div class="state-screen">
      <div class="state-card">
        <div class="state-icon not-found"><i class="fa-solid fa-file-circle-question"></i></div>
        <h2>الامتحان غير موجود</h2>
        <p>${escapeHtml(msg)}</p>
        <button id="exitAppBtn" class="state-btn danger">
          <i class="fa-solid fa-right-from-bracket"></i> خروج
        </button>
      </div>
    </div>`);

  document.getElementById("exitAppBtn")?.addEventListener("click", () => {
    window.close();
    setTimeout(() => {
      window.location.href = "about:blank";
    }, 100);
  });
}

function showSubmittedThankYouScreen() {
  renderStateScreen(`
    <div class="state-screen">
      <div class="state-card">
        <div class="state-icon success"><i class="fa-solid fa-circle-check"></i></div>
        <h2>تم تسليم الامتحان بنجاح!</h2>
        <p>إجاباتك محفوظة بأمان. نتيجة هذا الامتحان تظهر عن طريق صفحة "الاستعلام عن النتيجة" لاحقاً وليس مباشرة.</p>
        <p>سيتم مراجعة اجاباتك وارسال رابط الاستعلام عن النتيجه لك قريبا</p>

      </div>
    </div>`);
}

function showClosedExamScreen(exam) {
  const customMsg = (exam.closed_message || "").trim();
  const defaultMsg =
    "هذا الامتحان مقفول حالياً من الإدارة، وده ممكن يكون لأن وقت الامتحان انتهى أو معاده لسه مفتحش. لو محتاج تدخل الامتحان، تواصل مع المسؤول عن الامتحان.";

  renderStateScreen(`
    <div class="state-screen">
      <div class="state-card">
        <div class="state-icon closed"><i class="fa-solid fa-lock"></i></div>
        <h2>${escapeHtml(exam.name || "الامتحان")}</h2>
        <span class="state-pill"><i class="fa-solid fa-ban"></i> مقفول حالياً</span>
        <p>${escapeHtml(customMsg || defaultMsg)}</p>
        <button id="exitAppBtn" class="state-btn">
          <i class="fa-solid fa-right-from-bracket"></i> خروج
        </button>
      </div>
    </div>`);

  document.getElementById("exitAppBtn")?.addEventListener("click", () => {
    window.close();
    setTimeout(() => {
      window.location.href = "about:blank";
    }, 100);
  });
}

/* =======================================
   المرحلة 1: التسجيل
======================================= */
async function showRegistration() {
  showScreen("registration");
  const form = document.getElementById("registrationForm");
  const errorBox = document.getElementById("registrationError");
  const errorText = document.getElementById("registrationErrorText");

  if (!form || form.dataset.bound) return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");

    const name = form.user_name.value.trim();
    const phone = form.user_phone.value.trim();

    if (!name || !phone) {
      errorText.textContent = "الرجاء ملء جميع الحقول المطلوبة بشكل صحيح.";
      errorBox.classList.remove("hidden");
      return;
    }
    if (!/^[0-9]{11}$/.test(phone)) {
      errorText.textContent = "⚠️ يرجى إدخال رقم هاتف صحيح مكون من 11 رقم.";
      errorBox.classList.remove("hidden");
      return;
    }

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;

    try {
      const used = await checkExistingAttempt(currentExam.id, phone);
      if (used) {
        errorText.textContent =
          "⚠️ عذراً، هذا الحساب أو رقم الهاتف تم استخدامه لأداء الامتحان مسبقاً.";
        errorBox.classList.remove("hidden");
        submitBtn.disabled = false;
        return;
      }

      const attempt = await createAttempt(currentExam.id, name, phone);
      localStorage.setItem(
        attemptStorageKey(currentExam.id),
        String(attempt.id),
      );
      currentAttempt = attempt;
      await ensureExamStarted(currentAttempt.id);
      currentAttempt = await getAttempt(currentAttempt.id);
      startExam();
    } catch (err) {
      errorText.textContent = "حدث خطأ في الاتصال بقاعدة البيانات.";
      errorBox.classList.remove("hidden");
      submitBtn.disabled = false;
    }
  });
}

/* =======================================
   المرحلة 2: الامتحان المباشر
======================================= */
let questions = [];
let answers = {};
let attemptId = null;
let timerInterval = null;
let examStartedAtMs = null;

const answersStorageKey = () => `exam_ans_${attemptId}`;

async function startExam() {
  showScreen("exam");
  attemptId = currentAttempt.id;

  questions = (await getQuestionsByExam(currentExam.id)) || [];

  document.getElementById("examTitle").textContent = currentExam.name;

  const stageEl = document.getElementById("examStage");
  if (stageEl) {
    const stageVal = currentExam.stage || currentExam.category || "";
    stageEl.textContent = stageVal ? `(${stageVal})` : "";
  }

  document.getElementById("userNameTag").textContent = currentAttempt.user_name;
  document.getElementById("userPhoneTag").textContent =
    currentAttempt.user_phone;

  try {
    answers = JSON.parse(localStorage.getItem(answersStorageKey())) || {};
  } catch {
    answers = {};
  }

  renderQuestions();
  evaluateProgress();
  startTimer();

  const submitBtn = document.getElementById("submitExamBtn");
  if (submitBtn) {
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
    newSubmitBtn.addEventListener("click", () => validateAndSubmit(false));
  }
}

function questionImagesHtml(q) {
  const images = Array.isArray(q.images) ? q.images.filter(Boolean) : [];
  if (!images.length) return "";
  return `
    <div class="question-images-gallery" data-count="${images.length}">
      ${images
        .map(
          (src, i) => `
        <button type="button" class="question-image-thumb" data-full="${escapeHtml(src)}">
          <span class="question-image-badge">${i + 1}</span>
          <img src="${src}" alt="صورة السؤال ${i + 1}" loading="lazy">
        </button>`,
        )
        .join("")}
    </div>`;
}

function renderQuestions() {
  const container = document.getElementById("questionsContainer");
  const typeLabels = {
    true_false: "صواب أم خطأ",
    multiple_choice: "اختيار من متعدد",
    location_source: "تحديد الموقع",
    fill_in_the_blank: "إكمال الفراغ",
    answer: "إجابة قصيرة",
    essay: "سؤال مقالي",
  };

  container.innerHTML = questions
    .map((q, index) => {
      const type = q.type;
      const savedAnswer = answers[index];
      let bodyHtml = "";

      if (type === "fill_in_the_blank") {
        const segments = String(q.question).split(/\.{3,}/u);
        const blanksCount = Math.max(segments.length - 1, 1);
        while (segments.length < blanksCount + 1) segments.push("");
        const userBlanks = Array.isArray(savedAnswer) ? savedAnswer : [];

        let text = "";
        for (let b = 0; b < blanksCount; b++) {
          text += escapeHtml(segments[b] || "").replace(/\n/g, "<br>");
          text += `<input type="text" class="blank-input" data-index="${index}" data-blank="${b}" value="${escapeHtml(userBlanks[b] || "")}" placeholder="الفراغ ${b + 1}">`;
        }
        text += escapeHtml(segments[blanksCount] || "").replace(/\n/g, "<br>");
        bodyHtml = `<div class="question-text fill-blank-text">${text}</div>`;
      } else {
        const questionText = escapeHtml(q.question).replace(/\n/g, "<br>");
        bodyHtml = `<div class="question-text">${questionText}</div>`;

        if (
          ["true_false", "multiple_choice", "location_source"].includes(type)
        ) {
          bodyHtml += `<div class="options-list">${(q.options || [])
            .map((opt) => {
              const selected = savedAnswer === opt ? "selected-active" : "";
              const checked = savedAnswer === opt ? "checked" : "";
              return `<label class="option-item ${selected}">
                <input type="radio" data-index="${index}" name="q_${index}" value="${escapeHtml(opt)}" ${checked}>
                <span>${escapeHtml(opt)}</span>
              </label>`;
            })
            .join("")}</div>`;
        } else if (type === "essay" || type === "answer") {
          bodyHtml += `<textarea class="text-answer-input" data-index="${index}" placeholder="اكتب إجابتك بالتفصيل هنا...">${escapeHtml(typeof savedAnswer === "string" ? savedAnswer : "")}</textarea>`;
        }
      }

      const imagesHtml = questionImagesHtml(q);

      return `
        <div class="question-card" id="q_card_${index}" data-index="${index}" data-type="${type}">
          <div class="question-card-header">
            <span class="question-number">${index + 1}</span>
            <span class="question-type-badge">${typeLabels[type] || type}</span>
          </div>
          ${imagesHtml}
          ${bodyHtml}
        </div>`;
    })
    .join("");

  container.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.addEventListener("change", () => {
      const index = input.dataset.index;
      answers[index] = input.value;
      const card = input.closest(".question-card");
      card
        .querySelectorAll(".option-item")
        .forEach((it) => it.classList.remove("selected-active"));
      input.closest(".option-item").classList.add("selected-active");
      persistAndEvaluate();
    });
  });

  container.querySelectorAll(".blank-input").forEach((input) => {
    input.addEventListener("input", () => {
      const index = input.dataset.index;
      const blank = Number(input.dataset.blank);
      const arr = Array.isArray(answers[index]) ? [...answers[index]] : [];
      arr[blank] = input.value;
      answers[index] = arr;
      persistAndEvaluate();
    });
  });

  container.querySelectorAll(".text-answer-input").forEach((input) => {
    input.addEventListener("input", () => {
      answers[input.dataset.index] = input.value;
      persistAndEvaluate();
    });
  });
}

function persistAndEvaluate() {
  localStorage.setItem(answersStorageKey(), JSON.stringify(answers));
  evaluateProgress();
}

function isQuestionAnswered(questionObj, value) {
  if (!questionObj) return false;
  const type = questionObj.type;

  if (type === "fill_in_the_blank") {
    const segments = String(questionObj.question).split(/\.{3,}/u);
    const expectedBlanks = Math.max(segments.length - 1, 1);

    if (!Array.isArray(value) || value.length < expectedBlanks) return false;

    for (let i = 0; i < expectedBlanks; i++) {
      if (String(value[i] ?? "").trim() === "") return false;
    }
    return true;
  }

  return (
    value !== undefined &&
    !Array.isArray(value) &&
    String(value ?? "").trim() !== ""
  );
}

function evaluateProgress() {
  let answeredCount = 0;
  questions.forEach((q, index) => {
    if (isQuestionAnswered(q, answers[index])) answeredCount++;
  });
  const total = questions.length;
  const pct = total > 0 ? (answeredCount / total) * 100 : 0;
  const bar = document.getElementById("progressBar");
  const text = document.getElementById("progressText");
  if (bar) bar.style.width = pct + "%";
  if (text) text.textContent = `تم حل ${answeredCount} من أصل ${total} أسئلة`;
}

function safeParseDate(dateStr) {
  if (!dateStr) return null;
  if (typeof dateStr === "number") return dateStr;

  let s = String(dateStr).trim().replace(" ", "T");
  if (!s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s)) {
    s += "Z";
  }
  const time = new Date(s).getTime();
  return isNaN(time) ? null : time;
}

function startTimer() {
  const durationSec = Number(currentExam?.duration_seconds) || 1800;
  const localTimerKey = `timer_start_ms_${attemptId}`;

  let savedLocalMs = localStorage.getItem(localTimerKey);
  savedLocalMs = savedLocalMs ? Number(savedLocalMs) : null;

  const dbStartMs = safeParseDate(
    currentAttempt?.exam_started_at || currentAttempt?.start_time,
  );
  const nowMs = Date.now();

  if (
    savedLocalMs &&
    !isNaN(savedLocalMs) &&
    savedLocalMs > 0 &&
    nowMs - savedLocalMs < durationSec * 1000
  ) {
    examStartedAtMs = savedLocalMs;
  } else if (
    dbStartMs &&
    nowMs - dbStartMs < durationSec * 1000 &&
    nowMs - dbStartMs >= 0
  ) {
    examStartedAtMs = dbStartMs;
    localStorage.setItem(localTimerKey, String(dbStartMs));
  } else {
    examStartedAtMs = nowMs;
    localStorage.setItem(localTimerKey, String(nowMs));
  }

  const timerEl = document.getElementById("timer");
  const timerContainer = document.getElementById("timerContainer");

  function tick() {
    const now = Date.now();
    const elapsed = Math.max(0, Math.floor((now - examStartedAtMs) / 1000));
    const remaining = Math.max(0, durationSec - elapsed);

    if (remaining <= 0) {
      if (timerEl) timerEl.textContent = "00:00";
      if (timerInterval) clearInterval(timerInterval);
      submitExam(true);
      return;
    }

    if (remaining <= 120 && timerContainer)
      timerContainer.classList.add("critical");

    const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
    const secs = String(remaining % 60).padStart(2, "0");
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
  }

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
  tick();
}

function validateAndSubmit(isTimeOut) {
  if (isSubmittingLock) return;

  if (isTimeOut) {
    submitExam(true);
    return;
  }

  let firstUnanswered = null;
  questions.forEach((q, index) => {
    if (firstUnanswered === null && !isQuestionAnswered(q, answers[index])) {
      firstUnanswered = index;
    }
  });

  if (firstUnanswered !== null) {
    document
      .querySelectorAll(".question-card")
      .forEach((c) => c.classList.remove("highlight-error"));
    const card = document.getElementById(`q_card_${firstUnanswered}`);
    card?.classList.add("highlight-error");
    card?.scrollIntoView({ behavior: "smooth", block: "center" });

    showModal({
      type: "alert",
      title: "⚠️ أسئلة غير مكتملة",
      text: "لا يمكنك تسليم الامتحان قبل الإجابة على جميع الأسئلة المطروحة بشكل كامل. يرجى مراجعة السؤال المحدد.",
      confirmText: "حسناً، سأكمل الحل",
    });
    return;
  }

  showModal({
    type: "confirm",
    title: "📝 إنهاء وتسليم الإجابة",
    text: "هل أنت متأكد من رغبتك في إرسال ورقة الإجابة الحالية وإنهاء الامتحان؟ لن تتمكن من التعديل مجدداً.",
    confirmText: "نعم، قم بالتسليم فوراً",
    cancelText: "تراجع، مراجعة الإجابات",
    onConfirm: () => submitExam(false),
  });
}

async function submitExam(isTimeOut) {
  if (isSubmittingLock) return;
  isSubmittingLock = true;

  if (timerInterval) clearInterval(timerInterval);

  const submitBtn = document.getElementById("submitExamBtn");
  const errorBox = document.getElementById("submitErrorBox");

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "جاري حجز دورك في طابور التسليم...";
  }
  if (errorBox) errorBox.classList.add("hidden");

  const baseSlot = (Number(attemptId) % 60) * 150;
  const randomJitter = Math.floor(Math.random() * 250);
  const calculatedQueueDelay = isTimeOut
    ? baseSlot + randomJitter
    : randomJitter;

  if (calculatedQueueDelay > 0) {
    await new Promise((res) => setTimeout(res, calculatedQueueDelay));
  }

  if (submitBtn) {
    submitBtn.textContent = "جاري إرسال إجاباتك ولحفظ النتائج...";
  }

  const maxRetries = 5;
  let retryCount = 0;
  let success = false;

  while (retryCount < maxRetries && !success) {
    try {
      await submitExamAttempt(attemptId, questions, answers);
      success = true;
    } catch (err) {
      retryCount++;
      console.warn(
        `⚠️ السيرفر مشغول، إعادة المحاولة (${retryCount}/${maxRetries})...`,
        err,
      );

      if (retryCount < maxRetries) {
        if (submitBtn) {
          submitBtn.textContent = `السيرفر مكتظ، جاري إرسال إجاباتك تلقائياً (محاولة ${retryCount}/${maxRetries})...`;
        }
        const retryDelay =
          Math.pow(2, retryCount) * 800 + Math.floor(Math.random() * 400);
        await new Promise((res) => setTimeout(res, retryDelay));
      }
    }
  }

  if (success) {
    localStorage.removeItem(answersStorageKey());
    localStorage.removeItem(attemptStorageKey(currentExam.id));
    localStorage.removeItem(`timer_start_ms_${attemptId}`);

    if (currentExam.result_visibility === "lookup_only") {
      showSubmittedThankYouScreen();
    } else {
      window.location.href = `results.html?attempt=${attemptId}`;
    }
  } else {
    isSubmittingLock = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "🔄 إعادة محاولة التسليم الآن";
    }

    if (errorBox) {
      errorBox.textContent =
        "⚠️ يوجد ضغط شديد جداً على الشبكة، ولكن إجاباتك محفوظة بأمان على جهازك! انقر على زر 'إعادة محاولة التسليم' بالأسفل.";
      errorBox.classList.remove("hidden");
    }

    showModal({
      type: "alert",
      title: "⚠️ تم حفظ إجاباتك محلياً",
      text: "إجاباتك محفوظة تماماً على هاتفك/جهازك ولن تضيع. يرجى الضغط على زر إعادة محاولة التسليم لإكمال الحفظ.",
      confirmText: "حسناً، فهمت",
    });
  }
}

init();
