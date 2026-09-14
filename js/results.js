// results.js - عرض نتيجة محاولة الامتحان
import {
  getAttempt,
  getExamById,
  getSiteBranding,
} from "../includes/functions.js?v=1.0.0";
import { buildReviewSectionHtml } from "../includes/answer-review.js?v=1.0.0";

const card = document.getElementById("resultCard");

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
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
