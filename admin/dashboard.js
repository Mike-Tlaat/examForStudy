import {
  getAllExams,
  createExam,
  updateExamStatus,
  deleteExam,
} from "../includes/functions.js?v=1.0.0";
import { adminAlert, adminConfirm } from "./admin-ui.js?v=1.0.0";
import { mountAdminSettingsButton } from "./admin-settings.js?v=1.0.0";

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function fmtDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} دقيقة و ${s} ثانية` : `${m} دقيقة`;
}

export async function renderAdminDashboard() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="loading-screen" style="min-height:200px;"><div class="spinner"></div></div>`;

  const exams = await getAllExams();

  app.innerHTML = `
    <div class="a-topbar">
      <div>
        <h1><i class="fa-solid fa-gauge"></i> لوحة التحكم الرئيسية</h1>
        <p>إدارة الامتحانات والأسئلة بالكامل من هنا</p>
      </div>
      <div class="a-topbar-actions" id="topbarActions">
        <button class="a-theme-btn" id="themeToggle"><i class="fa-solid fa-circle-half-stroke"></i></button>
      </div>
    </div>

    <div class="a-tabs-row">
      <a href="index.html" class="a-tab-btn active" style="background:#7c3aed; color:#fff;"><i class="fa-solid fa-gauge"></i> إدارة الامتحانات</a>
      <a href="passed.html" class="a-tab-btn"><i class="fa-solid fa-circle-check"></i> الناجحون</a>
      <a href="failed.html" class="a-tab-btn"><i class="fa-solid fa-circle-xmark"></i> غير الناجحين</a>
    </div>

    <div class="a-bulk-delete-box" id="createExamBox">
      <div class="a-bulk-delete-title"><i class="fa-solid fa-plus-circle"></i> إضافة امتحان جديد</div>
      <form id="createExamForm" class="a-exam-form">
        <div class="a-filter-item">
          <label>اسم الامتحان</label>
          <input type="text" name="name" required placeholder="مثال: امتحان الدرس الأول - إعدادي">
        </div>
        <div class="a-filter-item">
          <label>الرابط المختصر (slug)</label>
          <input type="text" name="slug" required placeholder="basic-lesson-1">
        </div>
        <div class="a-filter-item">
          <label>المرحلة (اختياري)</label>
          <input type="text" name="stage" placeholder="مثال: إعدادي">
        </div>
        <div class="a-filter-item">
          <label>مدة الامتحان (دقائق)</label>
          <input type="number" name="duration_minutes" value="30" min="1" required>
        </div>
        <div class="a-filter-item">
          <label>نسبة النجاح %</label>
          <input type="number" name="pass_threshold" value="50" min="0" max="100" required>
        </div>
        <div class="a-filter-item" style="flex:1 1 100%;">
          <label>إعلان "الرقم غير مسجل" (يظهر في صفحة الاستعلام - اختياري)</label>
          <textarea name="not_found_announcement" rows="2" placeholder="مثال: مواعيد إعادة الامتحان يوم الجمعة الساعة 10 مساءً..."></textarea>
        </div>
        <button type="submit" class="a-bulk-del-action-btn" style="background:#16a34a;"><i class="fa-solid fa-plus"></i> إنشاء الامتحان</button>
      </form>
    </div>

    <div class="a-exams-grid" id="examsGrid"></div>
  `;

  mountAdminSettingsButton("topbarActions");

  const grid = document.getElementById("examsGrid");

  function renderGrid() {
    if (!exams.length) {
      grid.innerHTML = `<div class="a-empty-state"><i class="fa-solid fa-inbox"></i>لا يوجد امتحانات بعد. أنشئ أول امتحان من الفورم أعلاه.</div>`;
      return;
    }
    grid.innerHTML = exams
      .map(
        (exam) => `
      <div class="a-exam-card">
        <div class="a-exam-card-top">
          <h3>${escapeHtml(exam.name)}</h3>
          <span class="a-status-pill ${exam.is_open ? "open" : "closed"}">
            <i class="fa-solid ${exam.is_open ? "fa-lock-open" : "fa-lock"}"></i> ${exam.is_open ? "مفتوح" : "مقفول"}
          </span>
        </div>
        <div class="a-exam-card-meta">
          <span><i class="fa-solid fa-link"></i> ${escapeHtml(exam.slug)}</span>
          <span><i class="fa-regular fa-clock"></i> ${fmtDuration(exam.duration_seconds)}</span>
          <span><i class="fa-solid fa-percent"></i> نجاح من ${exam.pass_threshold}%</span>
          ${exam.stage ? `<span><i class="fa-solid fa-layer-group"></i> ${escapeHtml(exam.stage)}</span>` : ""}
        </div>
        <div class="a-exam-card-actions">
          <a class="a-mini-btn" href="exam-editor.html?id=${exam.id}"><i class="fa-solid fa-pen"></i> تعديل كامل</a>
          <a class="a-mini-btn" href="../exam.html?slug=${encodeURIComponent(exam.slug)}" target="_blank"><i class="fa-solid fa-eye"></i> عرض الامتحان</a>
          <button class="a-mini-btn toggle-open-btn" data-id="${exam.id}" data-open="${exam.is_open}">
            <i class="fa-solid ${exam.is_open ? "fa-lock" : "fa-lock-open"}"></i> ${exam.is_open ? "إغلاق" : "فتح"}
          </button>
          <button class="a-mini-btn copy-link-btn" data-slug="${escapeHtml(exam.slug)}"><i class="fa-solid fa-copy"></i> نسخ الرابط</button>
          <button class="a-mini-btn danger delete-exam-btn" data-id="${exam.id}" data-name="${escapeHtml(exam.name)}"><i class="fa-solid fa-trash-can"></i> حذف</button>
        </div>
      </div>`,
      )
      .join("");

    grid.querySelectorAll(".toggle-open-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const currentOpen = btn.dataset.open === "true";
        btn.disabled = true;
        try {
          await updateExamStatus(id, !currentOpen);
          const ex = exams.find((e) => e.id === id);
          if (ex) ex.is_open = !currentOpen;
          renderGrid();
        } catch (err) {
          await adminAlert("حدث خطأ: " + (err.message || err), {
            type: "danger",
            title: "خطأ",
          });
          btn.disabled = false;
        }
      });
    });

    grid.querySelectorAll(".copy-link-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const url = `${window.location.origin}${window.location.pathname.replace(/admin\/index\.html$/, "")}exam.html?slug=${encodeURIComponent(btn.dataset.slug)}`;
        try {
          await navigator.clipboard.writeText(url);
          btn.innerHTML = `<i class="fa-solid fa-check"></i> تم النسخ`;
          setTimeout(
            () =>
              (btn.innerHTML = `<i class="fa-solid fa-copy"></i> نسخ الرابط`),
            1500,
          );
        } catch {
          await adminAlert(url, { type: "info", title: "رابط الامتحان" });
        }
      });
    });

    grid.querySelectorAll(".delete-exam-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const name = btn.dataset.name;
        const ok = await adminConfirm(
          `هل أنت متأكد من حذف امتحان "${name}" نهائياً؟\nسيتم حذف كل الأسئلة والمحاولات المرتبطة به!`,
          {
            title: "حذف امتحان",
            confirmText: "نعم، حذف نهائي",
            danger: true,
          },
        );
        if (!ok) return;
        try {
          await deleteExam(id);
          const idx = exams.findIndex((e) => e.id === id);
          if (idx > -1) exams.splice(idx, 1);
          renderGrid();
        } catch (err) {
          await adminAlert("حدث خطأ أثناء الحذف: " + (err.message || err), {
            type: "danger",
            title: "خطأ",
          });
        }
      });
    });
  }

  renderGrid();

  const slugInput = document.querySelector('#createExamForm [name="slug"]');
  const nameInput = document.querySelector('#createExamForm [name="name"]');
  let slugManuallyEdited = false;
  slugInput.addEventListener("input", () => (slugManuallyEdited = true));
  nameInput.addEventListener("input", () => {
    if (!slugManuallyEdited) slugInput.value = slugify(nameInput.value);
  });

  document
    .getElementById("createExamForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      const fd = new FormData(form);
      try {
        const exam = await createExam({
          name: fd.get("name").trim(),
          slug: slugify(fd.get("slug")),
          stage: fd.get("stage")?.trim() || null,
          duration_seconds: Number(fd.get("duration_minutes")) * 60,
          pass_threshold: Number(fd.get("pass_threshold")),
          not_found_announcement:
            fd.get("not_found_announcement")?.trim() || null,
          is_open: true,
        });
        window.location.href = `exam-editor.html?id=${exam.id}`;
      } catch (err) {
        await adminAlert(
          "حدث خطأ أثناء إنشاء الامتحان: " + (err.message || err),
          { type: "danger", title: "خطأ" },
        );
        submitBtn.disabled = false;
      }
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
}
