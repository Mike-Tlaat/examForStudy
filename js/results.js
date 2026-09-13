// results.js - عرض نتيجة محاولة الامتحان
import {
  getAttempt,
  getExamById,
  getSiteBranding,
  getQuestionsByExam,
  getAnswersForAttempt,
  normalizeBlanksCorrectAnswer,
  isAnswerCorrect,
} from "../includes/functions.js?v=1.0.0";

const card = document.getElementById("resultCard");

const TYPE_LABELS = {
  true_false: "صواب أم خطأ",
  multiple_choice: "اختيار من متعدد",
  location_source: "تحديد الموقع",
  fill_in_the_blank: "إكمال الفراغ",
  answer: "إجابة قصيرة",
  essay: "سؤال مقالي",
};

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

// يبني نص السؤال مع فراغات إكمال معبأة بإجابة الطالب، وتلوين كل فراغ حسب صحته
function buildFillBlankUserHtml(question, userAnswerRaw) {
  let userBlanks = safeJsonParse(userAnswerRaw, []);
  if (!Array.isArray(userBlanks)) userBlanks = [userBlanks];

  if (!question) {
    return userBlanks
      .map(
        (v, i) =>
          `<div class="review-answer-row"><span class="review-answer-label">الفراغ ${i + 1}:</span><span class="review-answer-value">${escapeHtml(v || "لم تتم الإجابة")}</span></div>`,
      )
      .join("");
  }

  const segments = String(question.question).split(/\.{3,}/u);
  const blanksCount = Math.max(segments.length - 1, 1);
  const acceptedBlanks = normalizeBlanksCorrectAnswer(question.correct_answer);

  let html = "";
  for (let b = 0; b < blanksCount; b++) {
    html += escapeHtml(segments[b] || "").replace(/\n/g, "<br>");
    const val = userBlanks[b] ?? "";
    const isEmpty = String(val).trim() === "";
    const correct = !isEmpty && isAnswerCorrect(val, acceptedBlanks[b] || []);
    const cls = isEmpty ? "blank-empty" : correct ? "blank-correct" : "blank-wrong";
    html += `<span class="review-blank ${cls}">${escapeHtml(isEmpty ? "—" : val)}</span>`;
  }
  html += escapeHtml(segments[blanksCount] || "").replace(/\n/g, "<br>");
  return `<div class="question-text fill-blank-text review-fill-blank">${html}</div>`;
}

// يبني نص "الإجابة الصحيحة" لسؤال إكمال الفراغ (أول إجابة مقبولة لكل فراغ)
function buildFillBlankCorrectText(question, correctAnswerRaw) {
  let accepted;
  if (question) {
    accepted = normalizeBlanksCorrectAnswer(question.correct_answer);
  } else {
    accepted = normalizeBlanksCorrectAnswer(safeJsonParse(correctAnswerRaw, correctAnswerRaw));
  }
  return accepted
    .map((arr, i) => `الفراغ ${i + 1}: ${escapeHtml(arr[0] ?? "-")}`)
    .join(" &nbsp;•&nbsp; ");
}

function reviewImagesHtml(question) {
  const images = question && Array.isArray(question.images) ? question.images.filter(Boolean) : [];
  if (!images.length) return "";
  return `<div class="review-images-gallery">${images
    .map((src, i) => `<img src="${src}" alt="صورة السؤال ${i + 1}" loading="lazy">`)
    .join("")}</div>`;
}

function buildReviewCard(displayIndex, answer, question) {
  const type = answer.question_type;
  const typeLabel = TYPE_LABELS[type] || type;
  const questionText = question ? question.question : `السؤال رقم ${displayIndex + 1}`;
  const score = Number(answer.score || 0);
  const maxScore = Number(answer.max_score || 0);

  let statusClass = "wrong";
  let statusBadge = "";
  let bodyHtml = "";
  let correctAnswerRow = "";

  if (type === "essay") {
    if (answer.graded_by === "admin") {
      const ratio = maxScore > 0 ? score / maxScore : 0;
      statusClass = ratio >= 1 ? "correct" : ratio > 0 ? "partial" : "wrong";
      statusBadge = `<i class="fa-solid fa-check-double"></i> تم التصحيح: ${score} / ${maxScore}`;
    } else {
      statusClass = "pending";
      statusBadge = `<i class="fa-solid fa-hourglass-half"></i> قيد المراجعة اليدوية`;
    }
    bodyHtml = `<div class="review-answer-row"><span class="review-answer-label"><i class="fa-regular fa-pen-to-square"></i> إجابتك:</span><span class="review-answer-value">${escapeHtml(answer.user_answer || "لم تتم الإجابة").replace(/\n/g, "<br>")}</span></div>`;
  } else if (type === "fill_in_the_blank") {
    const ratio = maxScore > 0 ? score / maxScore : answer.is_correct ? 1 : 0;
    statusClass = ratio >= 1 ? "correct" : ratio > 0 ? "partial" : "wrong";
    statusBadge =
      statusClass === "correct"
        ? `<i class="fa-solid fa-check"></i> إجابة صحيحة`
        : statusClass === "partial"
          ? `<i class="fa-solid fa-circle-half-stroke"></i> إجابة صحيحة جزئياً`
          : `<i class="fa-solid fa-xmark"></i> إجابة خاطئة`;
    bodyHtml = buildFillBlankUserHtml(question, answer.user_answer);
    if (statusClass !== "correct") {
      correctAnswerRow = buildFillBlankCorrectText(question, answer.correct_answer);
    }
  } else {
    statusClass = answer.is_correct ? "correct" : "wrong";
    statusBadge = answer.is_correct
      ? `<i class="fa-solid fa-check"></i> إجابة صحيحة`
      : `<i class="fa-solid fa-xmark"></i> إجابة خاطئة`;
    bodyHtml = `<div class="review-answer-row"><span class="review-answer-label"><i class="fa-regular fa-pen-to-square"></i> إجابتك:</span><span class="review-answer-value">${escapeHtml(answer.user_answer || "لم تتم الإجابة")}</span></div>`;
    if (!answer.is_correct) {
      correctAnswerRow = escapeHtml(answer.correct_answer || "-");
    }
  }

  return `
    <div class="review-question-card ${statusClass}">
      <div class="question-card-header">
        <span class="question-number">${displayIndex + 1}</span>
        <span class="question-type-badge">${typeLabel}</span>
        <span class="review-status-badge ${statusClass}">${statusBadge}</span>
      </div>
      ${reviewImagesHtml(question)}
      <div class="question-text">${escapeHtml(questionText).replace(/\n/g, "<br>")}</div>
      ${bodyHtml}
      ${
        correctAnswerRow
          ? `<div class="review-answer-row review-correct-row"><span class="review-answer-label"><i class="fa-solid fa-circle-check"></i> الإجابة الصحيحة:</span><span class="review-answer-value">${correctAnswerRow}</span></div>`
          : ""
      }
    </div>`;
}

async function buildReviewSectionHtml(examId, attemptId) {
  const [questions, answers] = await Promise.all([
    getQuestionsByExam(examId),
    getAnswersForAttempt(attemptId),
  ]);
  if (!answers.length) return "";

  const qMap = new Map(questions.map((q) => [q.id, q]));
  const cardsHtml = answers
    .map((a, i) => buildReviewCard(a.question_index ?? i, a, qMap.get(a.question_id) || null))
    .join("");

  return `
    <div class="answers-review fade-in-up d5">
      <div class="answers-review-header">
        <i class="fa-solid fa-list-check"></i>
        <h3>مراجعة الإجابات بالتفصيل</h3>
      </div>
      ${cardsHtml}
    </div>`;
}

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

async function render() {
  loadSiteBranding();
  const qs = new URLSearchParams(location.search);
  const attemptId = Number(qs.get("attempt") || 0);

  if (!attemptId) {
    card.innerHTML = `<p>رقم المحاولة غير صحيح</p>`;
    return;
  }

  const attempt = await getAttempt(attemptId);
  if (!attempt) {
    card.innerHTML = `<p>المحاولة غير موجودة</p>`;
    return;
  }

  const exam = await getExamById(attempt.exam_id);
  const notFinished = attempt.status === "pending";
  const isPass = attempt.pass_fail === "pass";
  const percentage = Number(attempt.percentage || 0).toFixed(1);
  const gradeText = attempt.grade_text || "-";
  const totalScore = Number(attempt.total_score || 0);
  const totalPossible = Number(attempt.total_possible || 0);

  if (notFinished) {
    card.innerHTML = `
      <div class="result-header">
        <div class="result-icon pending pop-in"><i class="fa-solid fa-hourglass-half"></i></div>
        <h2 class="student-title">لم يتم إنهاء الامتحان بعد</h2>
        <p class="result-desc">لا يمكن عرض النتيجة الآن لأن هذه المحاولة لم تُسلَّم بعد.</p>
      </div>
      <button class="state-btn" onclick="exitEntireSite()"><i class="fa-solid fa-right-from-bracket"></i> الخروج نهائياً</button>
    `;
  } else {
    card.classList.add("has-review");
    card.innerHTML = `
      <div class="result-header">
        <div class="result-icon ${isPass ? "pass" : "fail"} pop-in">
          <i class="fa-solid ${isPass ? "fa-circle-check" : "fa-circle-xmark"}"></i>
        </div>
        <h2 class="student-title fade-in-up d1">${escapeHtml(exam?.name || "")}</h2>
        <div class="result-student-name fade-in-up d1"><i class="fa-regular fa-user"></i> ${escapeHtml(attempt.user_name)}</div>
        <div class="status-pill ${isPass ? "pass" : "fail"} fade-in-up d2">
          <i class="fa-solid ${isPass ? "fa-trophy" : "fa-face-frown"}"></i>
          ${isPass ? "تم اجتياز الامتحان بنجاح" : "لم يتم اجتياز الامتحان"}
        </div>
      </div>

      <div class="stats-grid fade-in-up d3">
        <div class="stat-box"><div class="label"><i class="fa-solid fa-percent"></i> النسبة المئوية</div><div class="value">${percentage}%</div></div>
        <div class="stat-box"><div class="label"><i class="fa-solid fa-star"></i> التقدير</div><div class="value">${escapeHtml(gradeText)}</div></div>
        <div class="stat-box"><div class="label"><i class="fa-solid fa-check-double"></i> الدرجة</div><div class="value">${totalScore} / ${totalPossible}</div></div>
        <div class="stat-box"><div class="label"><i class="fa-solid fa-flag-checkered"></i> الحالة</div><div class="value" style="font-size:1.1rem;">${isPass ? "ناجح" : "راسب"}</div></div>
      </div>

      <div id="answersReviewSlot"></div>

      <button class="state-btn fade-in-up d4" onclick="exitEntireSite()"><i class="fa-solid fa-right-from-bracket"></i> الخروج نهائياً</button>
    `;

    try {
      const reviewHtml = await buildReviewSectionHtml(attempt.exam_id, attemptId);
      const slot = document.getElementById("answersReviewSlot");
      if (slot && reviewHtml) slot.innerHTML = reviewHtml;
    } catch (err) {
      console.error("Error loading answer review:", err);
    }
  }
}

window.exitEntireSite = function () {
  window.close();
  setTimeout(() => {
    window.location.href = "https://www.google.com";
  }, 100);
};

render();
