import {
  countAttemptsByPassFail,
  getAttemptsByPassFail,
  getAllExams,
  deleteAttempt,
  getAnswersForAttempt,
  adminUpdateAnswer,
} from "../includes/functions.js?v=1.0.0";
import { adminAlert, adminConfirm } from "./admin-ui.js?v=1.0.1";
import { mountAdminSettingsButton } from "./admin-settings.js?v=1.0.0";

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function scoreColor(percentage) {
  const p = Number(percentage) || 0;
  if (p >= 91) return "#22c55e";
  if (p >= 76) return "#3b82f6";
  if (p >= 61) return "#eab308";
  if (p >= 50) return "#f97316";
  return "#ef4444";
}

let answersGloballyVisible = false;

export async function renderAdminAttemptsPage(tab) {
  const app = document.getElementById("app");
  const perPage = 50;
  const qs = new URLSearchParams(location.search);
  let page = Math.max(1, Number(qs.get("page") || 1));

  const searchQuery = qs.get("search") || "";
  const filterExam = qs.get("exam") || "";

  const exams = await getAllExams();

  const passTotal = await countAttemptsByPassFail("pass", filterExam, searchQuery);
  const failTotal = await countAttemptsByPassFail("fail", filterExam, searchQuery);

  const totalCount = tab === "pass" ? passTotal : failTotal;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  if (page > totalPages) page = totalPages;
  const offset = (page - 1) * perPage;

  const attempts = await getAttemptsByPassFail(
    tab,
    filterExam,
    perPage,
    offset,
    searchQuery,
  );

  const isPassPage = tab === "pass";
  const pageTitle = isPassPage ? "الناجحون" : "غير الناجحين";

  const examOptionsHtml = exams
    .map(
      (exam) =>
        `<option value="${exam.id}" ${String(filterExam) === String(exam.id) ? "selected" : ""}>${escapeHtml(exam.name)}</option>`,
    )
    .join("");

  const hasActiveFilters = Boolean(searchQuery || filterExam);

  const activeNotes = [];
  if (searchQuery) activeNotes.push(`بحث: "${escapeHtml(searchQuery)}"`);
  if (filterExam) {
    const exObj = exams.find((e) => String(e.id) === String(filterExam));
    if (exObj) activeNotes.push(`الامتحان: ${escapeHtml(exObj.name)}`);
  }

  const tabParams = new URLSearchParams(qs);
  tabParams.delete("page");
  const tabQueryStr = tabParams.toString() ? `?${tabParams.toString()}` : "";

  const rowsHtml = attempts.length
    ? attempts
        .map((a) => {
          return `
          <tr class="a-row-toggle" data-id="${a.id}" data-exam="${a.exam_id}" style="cursor:pointer;">
            <td><b>${escapeHtml(a.user_name)}</b></td>
            <td><a href="tel:${escapeHtml(a.user_phone)}" onclick="event.stopPropagation();" style="color:inherit;text-decoration:none;">${escapeHtml(a.user_phone)}</a></td>
            <td>${escapeHtml(a.exam_name)}</td>
            <td class="pct-pill" style="color:${scoreColor(a.percentage)}; font-weight: bold;">${Number(a.percentage).toFixed(1)}%</td>
            <td>${escapeHtml(a.grade_text || "-")}</td>
            <td style="text-align:center;">
              <button type="button" class="a-delete-btn" title="حذف الطالب نهائياً" data-id="${a.id}" data-name="${escapeHtml(a.user_name)}">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </td>
            <td style="text-align:center;"><i class="fa-solid fa-chevron-down"></i></td>
          </tr>
          <tr class="a-detail-row" id="detail_${a.id}">
            <td colspan="7">
              <div class="a-detail-grid">
                <div class="a-detail-box"><div class="t">الدرجة</div><div class="v" id="score_disp_${a.id}">${a.total_score} / ${a.total_possible}</div></div>
                <div class="a-detail-box"><div class="t">حالة المحاولة</div><div class="v">${escapeHtml(a.status)}</div></div>
                <div class="a-detail-box"><div class="t">تاريخ التسجيل</div><div class="v" style="font-size:.8rem;">${escapeHtml(a.created_at)}</div></div>
              </div>

              <div class="a-pkg-section">
                <div class="a-pkg-section-head">
                  <span><i class="fa-solid fa-list-check"></i> إجابات الأسئلة</span>
                  <button type="button" class="a-mini-btn a-toggle-answers-btn" data-id="${a.id}"><i class="fa-solid fa-eye"></i> عرض الإجابات</button>
                </div>
                <div class="a-answers-block hidden" id="answersblock_${a.id}"></div>
              </div>
            </td>
          </tr>`;
        })
        .join("")
    : "";

  let paginationHtml = "";
  if (totalPages > 1) {
    const links = [];
    for (let p = 1; p <= totalPages; p++) {
      const params = new URLSearchParams(qs);
      params.set("page", p);
      links.push(
        `<a href="?${params.toString()}" class="${p === page ? "active" : ""}">${p}</a>`,
      );
    }
    paginationHtml = `<div class="a-pagination">${links.join("")}</div>`;
  }

  app.innerHTML = `
    <div class="a-topbar">
      <div>
        <h1><i class="fa-solid fa-graduation-cap"></i> ${pageTitle}</h1>
        <p>عرض قائمة الطلاب وإجاباتهم التفصيلية</p>
      </div>
      <div class="a-topbar-actions" id="topbarActions" style="display:flex; gap:.5rem; flex-wrap:wrap;">
        <button class="a-mini-btn" id="toggleAllAnswersBtn"><i class="fa-solid fa-eye"></i> إظهار كل الإجابات</button>
        <button class="a-theme-btn" id="themeToggle"><i class="fa-solid fa-circle-half-stroke"></i></button>
      </div>
    </div>

    <div class="a-stats-row">
      <div class="a-stat-card"><div class="num" style="color:var(--a-success);">${passTotal}</div><div class="lbl">إجمالي الناجحين</div></div>
      <div class="a-stat-card"><div class="num" style="color:var(--a-danger);">${failTotal}</div><div class="lbl">إجمالي غير الناجحين</div></div>
      <div class="a-stat-card"><div class="num">${totalCount}</div><div class="lbl">النتائج المعروضة الآن${hasActiveFilters ? " (بالفلتر)" : ""}</div></div>
    </div>

    <div class="a-tabs-row">
      <a href="passed.html${tabQueryStr}" class="a-tab-btn ${isPassPage ? "active pass" : ""}"><i class="fa-solid fa-circle-check"></i> الناجحون (${passTotal})</a>
      <a href="failed.html${tabQueryStr}" class="a-tab-btn ${!isPassPage ? "active fail" : ""}"><i class="fa-solid fa-circle-xmark"></i> غير الناجحين (${failTotal})</a>
      <a href="index.html" class="a-tab-btn" style="background:#7c3aed; color:#fff;"><i class="fa-solid fa-gauge"></i> لوحة التحكم الرئيسية</a>
    </div>

    <form class="a-filter-bar" method="GET">
      <div class="a-filter-item">
        <label style="font-size:.82rem;color:var(--a-text-soft);font-weight:700;"><i class="fa-solid fa-magnifying-glass"></i> بحث:</label>
        <input type="text" name="search" value="${escapeHtml(searchQuery)}" placeholder="بالاسم أو رقم الهاتف..." />
      </div>
      <div class="a-filter-item">
        <label style="font-size:.82rem;color:var(--a-text-soft);font-weight:700;"><i class="fa-solid fa-book-open"></i> الامتحان:</label>
        <select name="exam"><option value="">-- كل الامتحانات --</option>${examOptionsHtml}</select>
      </div>
      <button type="submit"><i class="fa-solid fa-magnifying-glass"></i> فلترة</button>
      ${hasActiveFilters ? `<span class="a-filter-active-note">يعرض: ${activeNotes.join(" | ")}</span><a class="clear-link" href="?">إلغاء الفلاتر</a>` : ""}
    </form>

    ${
      attempts.length
        ? `<div class="a-table-wrapper">
            <table class="a-table">
              <thead><tr><th>الاسم</th><th>الهاتف</th><th>الامتحان</th><th>النسبة</th><th>التقدير</th><th style="text-align:center;">حذف</th><th style="text-align:center;">تفاصيل</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          ${paginationHtml}`
        : `<div class="a-empty-state"><i class="fa-solid fa-inbox"></i>لا يوجد طلاب في هذا القسم حالياً${hasActiveFilters ? " بهذا الفلتر" : ""}.</div>`
    }
  `;

  mountAdminSettingsButton("topbarActions");

  document.querySelectorAll(".a-row-toggle").forEach((tr) => {
    tr.addEventListener("click", () => {
      const id = tr.dataset.id;
      document.getElementById(`detail_${id}`)?.classList.toggle("open");
    });
  });

  document.querySelectorAll(".a-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      const ok = await adminConfirm(
        `هل أنت متأكد من حذف الطالب (${name}) نهائياً من قاعدة البيانات؟`,
        {
          title: "حذف طالب",
          confirmText: "نعم، حذف نهائي",
          danger: true,
        },
      );
      if (!ok) return;
      try {
        await deleteAttempt(id);
        await adminAlert("تم حذف الطالب بنجاح", {
          type: "success",
          title: "تم الحذف",
        });
        window.location.reload();
      } catch (err) {
        console.error(err);
        await adminAlert(
          "حدث خطأ أثناء الحذف: " + (err.message || "خطأ غير معروف"),
          { type: "danger", title: "خطأ" },
        );
      }
    });
  });

  const themeToggle = document.getElementById("themeToggle");
  const htmlEl = document.documentElement;
  htmlEl.setAttribute(
    "data-theme",
    localStorage.getItem("admin_theme") || "dark",
  );
  themeToggle?.addEventListener("click", () => {
    const next =
      htmlEl.getAttribute("data-theme") === "dark" ? "light" : "dark";
    htmlEl.setAttribute("data-theme", next);
    localStorage.setItem("admin_theme", next);
  });

  /* ================= عرض/تعديل الإجابات ================= */
  const typeLabels = {
    true_false: "صواب أم خطأ",
    multiple_choice: "اختيار من متعدد",
    fill_in_the_blank: "إكمال الفراغ",
    essay: "سؤال مقالي",
  };

  async function renderAnswersBlock(attemptId) {
    const block = document.getElementById(`answersblock_${attemptId}`);
    if (!block) return;
    block.innerHTML = `<div class="a-loading-mini"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل الإجابات...</div>`;
    block.classList.remove("hidden");

    const answersRows = await getAnswersForAttempt(attemptId);
    if (!answersRows.length) {
      block.innerHTML = `<div class="a-pkg-tag none">لا توجد إجابات مسجلة</div>`;
      return;
    }

    block.innerHTML = answersRows
      .map((ans, i) => {
        let userAnsDisplay = ans.user_answer;
        try {
          const parsed = JSON.parse(ans.user_answer);
          if (Array.isArray(parsed)) userAnsDisplay = parsed.join(" / ");
        } catch {}

        let correctAnsDisplay = ans.correct_answer;
        try {
          const parsed = JSON.parse(ans.correct_answer);
          if (Array.isArray(parsed))
            correctAnsDisplay = parsed
              .map((v) => (Array.isArray(v) ? v.join(" أو ") : v))
              .join(" | ");
        } catch {}

        const isEssay = ans.question_type === "essay";

        return `
        <div class="a-answer-item ${ans.is_correct ? "correct" : "wrong"}" data-answer-id="${ans.id}">
          <div class="a-answer-head">
            <span class="a-answer-num">س${i + 1}</span>
            <span class="a-answer-type">${typeLabels[ans.question_type] || ans.question_type}</span>
            <span class="a-answer-status ${ans.is_correct ? "ok" : "no"}">${ans.is_correct ? "صحيحة" : "غير صحيحة"}</span>
            <span class="a-answer-score">الدرجة: <input type="number" min="0" max="${ans.max_score}" step="0.25" class="a-score-input" value="${ans.score}" data-id="${ans.id}" style="width:64px;"> / ${ans.max_score}</span>
          </div>
          <div class="a-answer-body">
            <div><b>إجابة الطالب:</b> ${escapeHtml(userAnsDisplay || "—")}</div>
            ${
              isEssay
                ? correctAnsDisplay
                  ? `<div><b>الإجابة النموذجية:</b> ${escapeHtml(correctAnsDisplay)}</div>`
                  : ""
                : `<div><b>الإجابة الصحيحة:</b> ${escapeHtml(correctAnsDisplay || "—")}</div>`
            }
          </div>
          <div class="a-answer-actions">
            <button type="button" class="a-mini-btn mark-correct-btn" data-id="${ans.id}"><i class="fa-solid fa-check"></i> صح</button>
            <button type="button" class="a-mini-btn mark-wrong-btn" data-id="${ans.id}"><i class="fa-solid fa-xmark"></i> غلط</button>
            <button type="button" class="a-mini-btn save-score-btn" data-id="${ans.id}"><i class="fa-solid fa-floppy-disk"></i> حفظ الدرجة</button>
          </div>
        </div>`;
      })
      .join("");

    block.querySelectorAll(".mark-correct-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const answerId = btn.dataset.id;
        const row = answersRows.find((r) => String(r.id) === String(answerId));
        const maxScore = row?.max_score ?? 1;
        await adminUpdateAnswer(answerId, { isCorrect: true, score: maxScore });
        await refreshScoreDisplay(attemptId);
        await renderAnswersBlock(attemptId);
      }),
    );
    block.querySelectorAll(".mark-wrong-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const answerId = btn.dataset.id;
        await adminUpdateAnswer(answerId, { isCorrect: false, score: 0 });
        await refreshScoreDisplay(attemptId);
        await renderAnswersBlock(attemptId);
      }),
    );
    block.querySelectorAll(".save-score-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const answerId = btn.dataset.id;
        const input = block.querySelector(
          `.a-score-input[data-id="${answerId}"]`,
        );
        const row = answersRows.find((r) => String(r.id) === String(answerId));
        let newScore = Number(input.value) || 0;

        if (newScore > row.max_score) {
          await adminAlert(
            `لا يمكن أن تتجاوز الدرجة الحد الأقصى لهذا السؤال (${row.max_score}). تم ضبطها تلقائياً على ${row.max_score}.`,
            { type: "danger", title: "تجاوز الحد الأقصى" },
          );
          newScore = row.max_score;
          input.value = row.max_score;
        }
        if (newScore < 0) {
          newScore = 0;
          input.value = 0;
        }

        const isCorrect =
          row.max_score > 0 ? newScore >= row.max_score : newScore > 0;
        await adminUpdateAnswer(answerId, { score: newScore, isCorrect });
        await refreshScoreDisplay(attemptId);
        await renderAnswersBlock(attemptId);
      }),
    );
  }

  async function refreshScoreDisplay(attemptId) {
    const rows = await getAnswersForAttempt(attemptId);
    const total = rows.reduce((s, r) => s + (Number(r.score) || 0), 0);
    const possible = rows.reduce((s, r) => s + (Number(r.max_score) || 0), 0);
    const el = document.getElementById(`score_disp_${attemptId}`);
    if (el) el.textContent = `${total} / ${possible}`;
  }

  document.querySelectorAll(".a-toggle-answers-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const block = document.getElementById(`answersblock_${id}`);
      const isHidden = block.classList.contains("hidden");
      if (isHidden) {
        await renderAnswersBlock(id);
        btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> إخفاء الإجابات`;
      } else {
        block.classList.add("hidden");
        btn.innerHTML = `<i class="fa-solid fa-eye"></i> عرض الإجابات`;
      }
    });
  });

  document
    .getElementById("toggleAllAnswersBtn")
    ?.addEventListener("click", async (e) => {
      e.stopPropagation();
      answersGloballyVisible = !answersGloballyVisible;
      const btn = e.currentTarget;
      btn.innerHTML = answersGloballyVisible
        ? `<i class="fa-solid fa-eye-slash"></i> إخفاء كل الإجابات`
        : `<i class="fa-solid fa-eye"></i> إظهار كل الإجابات`;

      for (const a of attempts) {
        document
          .getElementById(`detail_${a.id}`)
          ?.classList.toggle("open", answersGloballyVisible);
        const block = document.getElementById(`answersblock_${a.id}`);
        const toggleBtn = document.querySelector(
          `.a-toggle-answers-btn[data-id="${a.id}"]`,
        );
        if (answersGloballyVisible) {
          await renderAnswersBlock(a.id);
          if (toggleBtn)
            toggleBtn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> إخفاء الإجابات`;
        } else {
          block?.classList.add("hidden");
          if (toggleBtn)
            toggleBtn.innerHTML = `<i class="fa-solid fa-eye"></i> عرض الإجابات`;
        }
      }
    });
}
