// وحدة مشتركة لبناء قسم "مراجعة الإجابات بالتفصيل" — مستخدمة في صفحة النتيجة
// المباشرة (results.html) وصفحة الاستعلام عن النتيجة (lookup.html) عشان الطالب
// يشوف نفس التفاصيل (صح/غلط لكل سؤال، والإجابة الصحيحة/النموذجية) في الاثنين.
import {
  getQuestionsByExam,
  getAnswersForAttempt,
  normalizeBlanksCorrectAnswer,
  isAnswerCorrect,
} from "./functions.js?v=1.0.0";

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
  let correctAnswerLabel = "الإجابة الصحيحة:";
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
    // السؤال المقالي مالوش صح/غلط ثابت، لكن لو الأدمن حط إجابة نموذجية بتتعرض دايماً كمرجع للطالب
    correctAnswerLabel = "الإجابة النموذجية:";
    if (answer.correct_answer && String(answer.correct_answer).trim()) {
      correctAnswerRow = escapeHtml(answer.correct_answer).replace(/\n/g, "<br>");
    }
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
          ? `<div class="review-answer-row review-correct-row"><span class="review-answer-label"><i class="fa-solid fa-circle-check"></i> ${correctAnswerLabel}</span><span class="review-answer-value">${correctAnswerRow}</span></div>`
          : ""
      }
    </div>`;
}

// الدالة الرئيسية: بتجيب أسئلة وإجابات المحاولة وترجع HTML جاهز لقسم المراجعة،
// أو نص فاضي "" لو مفيش إجابات (يبقى معروض للامتحان القديم أو محاولة لسه معلقة)
export async function buildReviewSectionHtml(examId, attemptId) {
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
