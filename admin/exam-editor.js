import {
  getExamById,
  updateExam,
  getQuestionsByExam,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  sendExamBroadcast,
} from "../includes/functions.js?v=1.0.0";
import { adminAlert, adminConfirm } from "./admin-ui.js?v=1.0.0";
import { mountAdminSettingsButton } from "./admin-settings.js?v=1.0.0";
import { fileToResizedDataUrl } from "./img-utils.js?v=1.0.0";

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

let examId = null;
let exam = null;

const TYPE_LABELS = {
  true_false: "صواب أم خطأ",
  multiple_choice: "اختيار من متعدد",
  fill_in_the_blank: "إكمال الفراغ",
  essay: "سؤال مقالي",
};

export async function renderExamEditor() {
  const qs = new URLSearchParams(location.search);
  examId = Number(qs.get("id"));
  const app = document.getElementById("app");

  if (!examId) {
    app.innerHTML = `<div class="a-empty-state"><i class="fa-solid fa-triangle-exclamation"></i> لا يوجد امتحان محدد في الرابط.</div>`;
    return;
  }

  exam = await getExamById(examId);
  if (!exam) {
    app.innerHTML = `<div class="a-empty-state"><i class="fa-solid fa-triangle-exclamation"></i> الامتحان غير موجود.</div>`;
    return;
  }

  app.innerHTML = `
    <div class="a-topbar">
      <div>
        <h1><i class="fa-solid fa-pen-to-square"></i> ${esc(exam.name)}</h1>
        <p>تعديل بيانات الامتحان والأسئلة</p>
      </div>
      <div class="a-topbar-actions" id="topbarActions" style="display:flex; gap:.5rem;">
        <a class="a-mini-btn" href="index.html"><i class="fa-solid fa-arrow-right"></i> رجوع للوحة التحكم</a>
        <button class="a-theme-btn" id="themeToggle"><i class="fa-solid fa-circle-half-stroke"></i></button>
      </div>
    </div>

    <div class="a-tabs-row" id="editorTabs">
      <button class="a-tab-btn active" data-tab="details"><i class="fa-solid fa-sliders"></i> تفاصيل الامتحان</button>
      <button class="a-tab-btn" data-tab="questions"><i class="fa-solid fa-list-check"></i> الأسئلة</button>
    </div>

    <div id="tab_details" class="a-tab-panel"></div>
    <div id="tab_questions" class="a-tab-panel hidden"></div>
  `;

  mountAdminSettingsButton("topbarActions");

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

  const loaded = { details: false, questions: false };
  document.querySelectorAll("#editorTabs .a-tab-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document
        .querySelectorAll("#editorTabs .a-tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document
        .querySelectorAll(".a-tab-panel")
        .forEach((p) => p.classList.add("hidden"));
      const tab = btn.dataset.tab;
      document.getElementById(`tab_${tab}`).classList.remove("hidden");
      if (!loaded[tab]) {
        loaded[tab] = true;
        if (tab === "details") await renderDetailsTab();
        if (tab === "questions") await renderQuestionsTab();
      }
    });
  });

  loaded.details = true;
  await renderDetailsTab();
}

/* =====================================================================
   تبويب 1: تفاصيل الامتحان
===================================================================== */
async function renderDetailsTab() {
  const panel = document.getElementById("tab_details");
  const durationMinutes = Math.round((exam.duration_seconds || 1800) / 60);

  panel.innerHTML = `
    <div class="a-bulk-delete-box" id="liveBroadcastBox" style="margin-top:1rem; border-color: rgba(37,99,235,.35);">
      <div class="a-bulk-delete-title"><i class="fa-solid fa-bullhorn"></i> بث رسالة مباشرة الآن لكل من يفتح هذا الامتحان</div>
      <p class="a-hint-text">
        الرسالة تظهر فوراً (مع صوت تنبيه) لكل طالب فاتح صفحة هذا الامتحان الآن، بدون أي حاجة لعمل تحديث للصفحة.
        الرسالة لحظية فقط ومش بتُحفظ في قاعدة البيانات - لو حد فتح الصفحة بعد إرسالها مش هيشوفها.
      </p>
      <form id="liveBroadcastForm" class="a-exam-form">
        <div class="a-filter-item" style="flex:1 1 100%;">
          <label>نص الرسالة</label>
          <textarea name="liveMessage" rows="2" required placeholder="مثال: تبقى 5 دقائق فقط على انتهاء الامتحان، من فضلك أنهوا إجاباتكم."></textarea>
        </div>
        <button type="submit" class="a-bulk-del-action-btn" style="background:#2563eb;"><i class="fa-solid fa-paper-plane"></i> إرسال الآن</button>
        <span id="broadcastSentMsg" class="a-saved-msg hidden"><i class="fa-solid fa-circle-check"></i> تم إرسال الرسالة بنجاح</span>
      </form>
    </div>

    <p class="a-hint-text" style="margin-top:1.5rem;">
      ملحوظة: "حالة الامتحان" بتتحكم في قدرة الطالب على <b>دخول وأداء</b> الامتحان نفسه.
      "الظهور في صفحة الاستعلام" منفصلة تماماً وبتتحكم بس في ظهور الامتحان في قائمة
      الاختيار بصفحة الاستعلام عن النتيجة - تقدر تخفيه من الاستعلام وهو لسه مفتوح للأداء، أو العكس.
    </p>
    <form id="detailsForm" class="a-exam-form">
      <div class="a-filter-item">
        <label>اسم الامتحان</label>
        <input type="text" name="name" value="${esc(exam.name)}" required>
      </div>
      <div class="a-filter-item">
        <label>الرابط المختصر (slug)</label>
        <input type="text" name="slug" value="${esc(exam.slug)}" required>
      </div>
      <div class="a-filter-item">
        <label>المرحلة (اختياري)</label>
        <input type="text" name="stage" value="${esc(exam.stage || "")}">
      </div>
      <div class="a-filter-item">
        <label>مدة الامتحان (دقائق)</label>
        <input type="number" name="duration_minutes" value="${durationMinutes}" min="1" required>
      </div>
      <div class="a-filter-item">
        <label>نسبة النجاح %</label>
        <input type="number" name="pass_threshold" value="${exam.pass_threshold}" min="0" max="100" required>
      </div>
      <div class="a-filter-item">
        <label>حالة الامتحان</label>
        <select name="is_open" id="isOpenSelect">
          <option value="true" ${exam.is_open ? "selected" : ""}>مفتوح</option>
          <option value="false" ${!exam.is_open ? "selected" : ""}>مقفول</option>
        </select>
      </div>
      <div class="a-filter-item">
        <label>الظهور في صفحة الاستعلام عن النتيجة</label>
        <select name="lookup_hidden">
          <option value="false" ${!exam.lookup_hidden ? "selected" : ""}>ظاهر (الطالب يقدر يستعلم عنه)</option>
          <option value="true" ${exam.lookup_hidden ? "selected" : ""}>مخفي (متختفي من قائمة الاستعلام تماماً)</option>
        </select>
      </div>
      <div class="a-filter-item">
        <label>إظهار النتيجة</label>
        <select name="result_visibility">
          <option value="immediate" ${exam.result_visibility !== "lookup_only" ? "selected" : ""}>فور تسليم الامتحان مباشرة</option>
          <option value="lookup_only" ${exam.result_visibility === "lookup_only" ? "selected" : ""}>بالاستعلام عن النتيجة فقط</option>
        </select>
      </div>
      <div class="a-filter-item" id="closedMessageBox" style="flex:1 1 100%; ${exam.is_open ? "display:none;" : ""}">
        <label>رسالة الإقفال (تظهر للطالب لو دخل على رابط الامتحان وهو مقفول - اختياري، فيه نص افتراضي لو فاضي)</label>
        <textarea name="closed_message" rows="2" placeholder="مثال: الامتحان اتقفل لأن وقته خلص، تواصل مع خادمك لمعرفة موعد الإعادة.">${esc(exam.closed_message || "")}</textarea>
      </div>
      <div class="a-filter-item" style="flex:1 1 100%;">
        <label>إعلان "الرقم غير مسجل" في صفحة الاستعلام (اختياري - لو فاضي هيظهر نص عام)</label>
        <textarea name="not_found_announcement" rows="3">${esc(exam.not_found_announcement || "")}</textarea>
      </div>
      <button type="submit" class="a-bulk-del-action-btn" style="background:#16a34a;"><i class="fa-solid fa-floppy-disk"></i> حفظ التعديلات</button>
      <span id="detailsSavedMsg" class="a-saved-msg hidden"><i class="fa-solid fa-circle-check"></i> تم الحفظ بنجاح</span>
    </form>
  `;

  document.getElementById("isOpenSelect").addEventListener("change", (e) => {
    document.getElementById("closedMessageBox").style.display =
      e.target.value === "false" ? "" : "none";
  });

  document
    .getElementById("liveBroadcastForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const textarea = form.liveMessage;
      const text = textarea.value.trim();
      if (!text) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...`;

      try {
        await sendExamBroadcast(examId, text);
        textarea.value = "";
        const msg = document.getElementById("broadcastSentMsg");
        msg.classList.remove("hidden");
        setTimeout(() => msg.classList.add("hidden"), 3000);
      } catch (err) {
        await adminAlert("حدث خطأ أثناء الإرسال: " + (err.message || err), {
          type: "danger",
          title: "خطأ",
        });
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
      }
    });

  document
    .getElementById("detailsForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        exam = await updateExam(examId, {
          name: fd.get("name").trim(),
          slug: fd.get("slug").trim(),
          stage: fd.get("stage")?.trim() || null,
          duration_seconds: Number(fd.get("duration_minutes")) * 60,
          pass_threshold: Number(fd.get("pass_threshold")),
          is_open: fd.get("is_open") === "true",
          lookup_hidden: fd.get("lookup_hidden") === "true",
          result_visibility: fd.get("result_visibility"),
          closed_message: fd.get("closed_message")?.trim() || null,
          not_found_announcement:
            fd.get("not_found_announcement")?.trim() || null,
        });
        const msg = document.getElementById("detailsSavedMsg");
        msg.classList.remove("hidden");
        setTimeout(() => msg.classList.add("hidden"), 2500);
      } catch (err) {
        await adminAlert("حدث خطأ أثناء الحفظ: " + (err.message || err), {
          type: "danger",
          title: "خطأ",
        });
      }
    });
}

/* =====================================================================
   تبويب 2: الأسئلة
===================================================================== */
let editingQuestionId = null;
let currentImages = []; // مصفوفة Data URLs لصور السؤال الحالي في الفورم (بالترتيب 1..N)
// نوع السؤال اللي الأدمن مختاره آخر مرة، عشان الفورم يفضل عليه بعد الحفظ
// وبعد إعادة بناء التبويب، بدل ما يرجع دايماً لـ "صواب أم خطأ" الافتراضي.
let lastUsedQuestionType = "true_false";

async function renderQuestionsTab() {
  const panel = document.getElementById("tab_questions");
  panel.innerHTML = `<div class="a-loading-mini" style="margin-top:1rem;"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>`;
  // كل مرة يتم إعادة بناء التبويب بالكامل (بعد حفظ/حذف/إعادة ترتيب)، نرجع لحالة
  // "إضافة سؤال جديد" الافتراضية بدل ما نفضل في وضع تعديل سؤال قديم بالخطأ.
  editingQuestionId = null;
  currentImages = [];
  const questions = await getQuestionsByExam(examId);

  panel.innerHTML = `
    <div class="a-question-form-box">
      <h3 id="qFormTitle"><i class="fa-solid fa-plus"></i> إضافة سؤال جديد</h3>
      <form id="questionForm" class="a-exam-form">
        <div class="a-filter-item" style="flex:1 1 100%;">
          <label>نوع السؤال</label>
          <select name="type" id="qType">
            <option value="true_false">صواب أم خطأ</option>
            <option value="multiple_choice">اختيار من متعدد</option>
            <option value="fill_in_the_blank">إكمال الفراغ (استخدم ... لكل فراغ)</option>
            <option value="essay">سؤال مقالي (تصحيح يدوي)</option>
          </select>
        </div>
        <div class="a-filter-item" style="flex:1 1 100%;">
          <label>نص السؤال</label>
          <textarea name="question" id="qText" rows="3" required placeholder="اكتب نص السؤال هنا. لأسئلة إكمال الفراغ استخدم ... في مكان كل فراغ"></textarea>
        </div>

        <div id="qOptionsBox" class="a-filter-item" style="flex:1 1 100%;"></div>
        <div id="qBlanksBox" class="a-filter-item" style="flex:1 1 100%;"></div>

        <div class="a-filter-item" id="qScoreBox">
          <label>درجة السؤال</label>
          <input type="number" name="score" id="qScore" value="1" min="0" step="0.25" required>
        </div>

        <div class="a-filter-item" style="flex:1 1 100%;">
          <label><i class="fa-solid fa-images"></i> صور السؤال (اختياري - تقدر تضيف صورة أو أكتر أو تسيبها بدون صور)</label>
          <input type="file" accept="image/*" id="qImagesInput" multiple>
          <div id="qImagesPreview" class="a-question-images-editor"></div>
        </div>

        <div style="flex:1 1 100%; display:flex; gap:.6rem; flex-wrap:wrap;">
          <button type="submit" class="a-bulk-del-action-btn" style="background:#16a34a;"><i class="fa-solid fa-plus"></i> <span id="qSubmitLabel">إضافة السؤال</span></button>
          <button type="button" id="qCancelEditBtn" class="a-mini-btn hidden"><i class="fa-solid fa-xmark"></i> إلغاء التعديل</button>
        </div>
      </form>
    </div>

    <div id="questionsList" class="a-questions-list"></div>
  `;

  const typeSelect = document.getElementById("qType");
  const optionsBox = document.getElementById("qOptionsBox");
  const blanksBox = document.getElementById("qBlanksBox");
  const scoreBox = document.getElementById("qScoreBox");
  const qTextArea = document.getElementById("qText");
  const qImagesInput = document.getElementById("qImagesInput");

  /* ---------- صور السؤال: رفع/معاينة/حذف/ترقيم تلقائي ---------- */
  function renderImagesPreview() {
    const wrap = document.getElementById("qImagesPreview");
    if (!currentImages.length) {
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML = currentImages
      .map(
        (src, i) => `
      <div class="a-question-image-item" data-idx="${i}">
        <span class="a-question-image-num">${i + 1}</span>
        <img src="${src}" alt="صورة السؤال ${i + 1}">
        <div class="a-question-image-actions">
          <button type="button" class="a-mini-btn move-img-left-btn" title="تحريك لليمين" ${i === currentImages.length - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-right"></i></button>
          <button type="button" class="a-mini-btn move-img-right-btn" title="تحريك لليسار" ${i === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-left"></i></button>
          <button type="button" class="a-mini-btn danger remove-img-btn" title="حذف الصورة"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>`,
      )
      .join("");

    wrap.querySelectorAll(".remove-img-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.closest(".a-question-image-item").dataset.idx);
        currentImages.splice(idx, 1);
        renderImagesPreview();
      });
    });
    wrap.querySelectorAll(".move-img-right-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.closest(".a-question-image-item").dataset.idx);
        if (idx <= 0) return;
        [currentImages[idx - 1], currentImages[idx]] = [
          currentImages[idx],
          currentImages[idx - 1],
        ];
        renderImagesPreview();
      });
    });
    wrap.querySelectorAll(".move-img-left-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.closest(".a-question-image-item").dataset.idx);
        if (idx >= currentImages.length - 1) return;
        [currentImages[idx + 1], currentImages[idx]] = [
          currentImages[idx],
          currentImages[idx + 1],
        ];
        renderImagesPreview();
      });
    });
  }

  qImagesInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const file of files) {
      try {
        const dataUrl = await fileToResizedDataUrl(file, 1200);
        currentImages.push(dataUrl);
      } catch (err) {
        await adminAlert("تعذر إضافة صورة: " + (err.message || err), {
          type: "danger",
          title: "خطأ",
        });
      }
    }
    qImagesInput.value = "";
    renderImagesPreview();
  });

  function buildOptionsUI(existingOptions = ["", ""], correctValue = "") {
    optionsBox.innerHTML = `
      <label>الاختيارات المتاحة</label>
      <div id="optionsRows"></div>
      <button type="button" id="addOptionBtn" class="a-mini-btn"><i class="fa-solid fa-plus"></i> إضافة اختيار</button>
      <label style="margin-top:.6rem;display:block;">الإجابة الصحيحة</label>
      <select name="correct_answer_mc" id="correctAnswerSelect"></select>
    `;
    const rows = document.getElementById("optionsRows");
    const correctSelect = document.getElementById("correctAnswerSelect");

    function refreshCorrectOptions() {
      const values = Array.from(rows.querySelectorAll("input"))
        .map((i) => i.value.trim())
        .filter(Boolean);
      const prevVal = correctSelect.value;
      correctSelect.innerHTML = values
        .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`)
        .join("");
      if (values.includes(prevVal)) correctSelect.value = prevVal;
      else if (values.includes(correctValue))
        correctSelect.value = correctValue;
    }

    function addOptionRow(val = "") {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = ".4rem";
      row.style.marginBottom = ".4rem";
      row.innerHTML = `<input type="text" value="${esc(val)}" placeholder="نص الاختيار" style="flex:1;">
        <button type="button" class="a-mini-btn danger remove-option-btn"><i class="fa-solid fa-xmark"></i></button>`;
      rows.appendChild(row);
      row
        .querySelector("input")
        .addEventListener("input", refreshCorrectOptions);
      row.querySelector(".remove-option-btn").addEventListener("click", () => {
        row.remove();
        refreshCorrectOptions();
      });
    }

    existingOptions.forEach((v) => addOptionRow(v));
    refreshCorrectOptions();

    document
      .getElementById("addOptionBtn")
      .addEventListener("click", () => addOptionRow(""));
  }

  function buildTrueFalseUI(correctValue = "صح") {
    optionsBox.innerHTML = `
      <label>الإجابة الصحيحة</label>
      <select name="correct_answer_tf" id="tfSelect">
        <option value="صح" ${correctValue === "صح" ? "selected" : ""}>صح</option>
        <option value="غلط" ${correctValue === "غلط" ? "selected" : ""}>غلط</option>
      </select>`;
  }

  function countBlanks(text) {
    const matches = text.match(/\.{3,}/gu);
    return matches ? matches.length : 0;
  }

  function buildBlanksUI(existingAnswers = [], existingScores = []) {
    const n = Math.max(countBlanks(qTextArea.value), 1);
    let rowsHtml = "";
    for (let i = 0; i < n; i++) {
      const accepted = Array.isArray(existingAnswers[i])
        ? existingAnswers[i].join(", ")
        : existingAnswers[i] || "";
      const sc = existingScores[i] ?? 1;
      rowsHtml += `
        <div class="a-blank-row">
          <span class="a-blank-num">فراغ ${i + 1}</span>
          <input type="text" class="blank-accepted-input" data-blank="${i}" value="${esc(accepted)}" placeholder="الإجابات المقبولة، مفصولة بفاصلة">
          <input type="number" class="blank-score-input" data-blank="${i}" value="${sc}" min="0" step="0.25" style="width:80px;" title="درجة هذا الفراغ">
        </div>`;
    }
    blanksBox.innerHTML = `
      <label>فراغات السؤال (${n} فراغ تم اكتشافه من النص، ضع "..." في مكان كل فراغ بالنص أعلاه)</label>
      <div id="blankRows">${rowsHtml}</div>
      <p class="a-hint-text">اكتب كل الإجابات المقبولة للفراغ الواحد مفصولة بفاصلة (,) لو فيه أكثر من إجابة صحيحة مقبولة.</p>`;
  }

  function updateFormForType(type, data = {}) {
    optionsBox.innerHTML = "";
    blanksBox.innerHTML = "";
    scoreBox.classList.remove("hidden");

    if (type === "true_false") {
      buildTrueFalseUI(data.correct_answer || "صح");
    } else if (type === "multiple_choice") {
      buildOptionsUI(
        data.options && data.options.length ? data.options : ["", ""],
        data.correct_answer || "",
      );
    } else if (type === "fill_in_the_blank") {
      buildBlanksUI(data.correct_answer || [], data.blank_scores || []);
      scoreBox.classList.add("hidden"); // الدرجة بتتحدد لكل فراغ
    } else if (type === "essay") {
      // score box يفضل ظاهر (الحد الأقصى للتصحيح اليدوي)
    }
  }

  typeSelect.addEventListener("change", () =>
    updateFormForType(typeSelect.value),
  );
  qTextArea.addEventListener("input", () => {
    if (typeSelect.value === "fill_in_the_blank") buildBlanksUI();
  });

  typeSelect.value = lastUsedQuestionType;
  updateFormForType(lastUsedQuestionType);

  function resetForm() {
    editingQuestionId = null;
    currentImages = [];
    renderImagesPreview();
    document.getElementById("questionForm").reset();
    document.getElementById("qFormTitle").innerHTML =
      `<i class="fa-solid fa-plus"></i> إضافة سؤال جديد`;
    document.getElementById("qSubmitLabel").textContent = "إضافة السؤال";
    document.getElementById("qCancelEditBtn").classList.add("hidden");
    // نفضل على آخر نوع سؤال تم اختياره بدل الرجوع لـ "صواب أم خطأ" كل مرة
    typeSelect.value = lastUsedQuestionType;
    updateFormForType(lastUsedQuestionType);
  }

  document
    .getElementById("qCancelEditBtn")
    .addEventListener("click", resetForm);

  document
    .getElementById("questionForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const type = typeSelect.value;
      const questionText = qTextArea.value.trim();
      if (!questionText) return;

      let payload = { type, question: questionText, images: currentImages };

      if (type === "true_false") {
        payload.options = ["صح", "غلط"];
        payload.correct_answer = document.getElementById("tfSelect").value;
        payload.score = Number(document.getElementById("qScore").value) || 1;
        payload.blank_scores = null;
      } else if (type === "multiple_choice") {
        const optionInputs = Array.from(
          document.querySelectorAll("#optionsRows input"),
        );
        const options = optionInputs.map((i) => i.value.trim()).filter(Boolean);
        if (options.length < 2)
          return await adminAlert("لازم يكون فيه على الأقل اختيارين", {
            type: "danger",
            title: "بيانات ناقصة",
          });
        payload.options = options;
        payload.correct_answer = document.getElementById(
          "correctAnswerSelect",
        ).value;
        payload.score = Number(document.getElementById("qScore").value) || 1;
        payload.blank_scores = null;
      } else if (type === "fill_in_the_blank") {
        const acceptedInputs = Array.from(
          document.querySelectorAll(".blank-accepted-input"),
        );
        const scoreInputs = Array.from(
          document.querySelectorAll(".blank-score-input"),
        );
        const correctAnswer = acceptedInputs.map((i) =>
          i.value
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        );
        const blankScores = scoreInputs.map((i) => Number(i.value) || 0);
        payload.options = null;
        payload.correct_answer = correctAnswer;
        payload.blank_scores = blankScores;
        payload.score = blankScores.reduce((s, v) => s + v, 0);
      } else if (type === "essay") {
        payload.options = null;
        payload.correct_answer = null;
        payload.blank_scores = null;
        payload.score = Number(document.getElementById("qScore").value) || 1;
      }

      try {
        if (editingQuestionId) {
          await updateQuestion(editingQuestionId, payload);
        } else {
          await createQuestion(examId, payload);
        }
        lastUsedQuestionType = type;
        resetForm();
        await renderQuestionsTab();
      } catch (err) {
        await adminAlert("حدث خطأ: " + (err.message || err), {
          type: "danger",
          title: "خطأ",
        });
      }
    });

  /* ---------- عرض قائمة الأسئلة الحالية ---------- */
  const listEl = document.getElementById("questionsList");
  if (!questions.length) {
    listEl.innerHTML = `<div class="a-empty-state"><i class="fa-solid fa-inbox"></i>لا توجد أسئلة بعد. أضف أول سؤال من الفورم أعلاه.</div>`;
  } else {
    listEl.innerHTML = questions
      .map((q, idx) => {
        let answerDisplay = "";
        if (q.type === "fill_in_the_blank") {
          answerDisplay = (q.correct_answer || [])
            .map(
              (accepted, i) =>
                `فراغ ${i + 1}: ${Array.isArray(accepted) ? accepted.join(" / ") : accepted} (${q.blank_scores?.[i] ?? 0} د)`,
            )
            .join(" — ");
        } else if (q.type === "essay") {
          answerDisplay = "تصحيح يدوي";
        } else {
          answerDisplay = q.correct_answer;
        }

        const imagesCount = Array.isArray(q.images) ? q.images.length : 0;

        return `
        <div class="a-question-card" data-id="${q.id}">
          <div class="a-question-card-head">
            <span class="a-question-order">${idx + 1}</span>
            <span class="a-question-type-badge">${TYPE_LABELS[q.type] || q.type}</span>
            <span class="a-question-score-badge">${q.score} درجة</span>
            ${imagesCount ? `<span class="a-question-score-badge" style="background:#0284c7;"><i class="fa-solid fa-image"></i> ${imagesCount} صورة</span>` : ""}
            <div class="a-question-card-actions">
              <button type="button" class="a-mini-btn move-up-btn" title="تحريك لأعلى" ${idx === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
              <button type="button" class="a-mini-btn move-down-btn" title="تحريك لأسفل" ${idx === questions.length - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
              <button type="button" class="a-mini-btn edit-question-btn"><i class="fa-solid fa-pen"></i> تعديل</button>
              <button type="button" class="a-mini-btn danger delete-question-btn"><i class="fa-solid fa-trash-can"></i> حذف</button>
            </div>
          </div>
          <div class="a-question-card-body">
            <p>${esc(q.question)}</p>
            ${q.options ? `<div class="a-pkg-tags">${q.options.map((o) => `<span class="a-pkg-tag">${esc(o)}</span>`).join("")}</div>` : ""}
            ${
              imagesCount
                ? `<div class="a-question-images-thumbs">${q.images
                    .map(
                      (src, i) =>
                        `<div class="a-question-image-thumb"><span>${i + 1}</span><img src="${src}" alt="صورة ${i + 1}"></div>`,
                    )
                    .join("")}</div>`
                : ""
            }
            <div class="a-question-answer-line"><b>الإجابة الصحيحة:</b> ${esc(String(answerDisplay))}</div>
          </div>
        </div>`;
      })
      .join("");

    listEl.querySelectorAll(".delete-question-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".a-question-card");
        const id = Number(card.dataset.id);
        const ok = await adminConfirm("هل تريد حذف هذا السؤال نهائياً؟", {
          title: "حذف سؤال",
          confirmText: "نعم، حذف",
          danger: true,
        });
        if (!ok) return;
        await deleteQuestion(id);
        await renderQuestionsTab();
      });
    });

    listEl.querySelectorAll(".edit-question-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".a-question-card");
        const id = Number(card.dataset.id);
        const q = questions.find((x) => x.id === id);
        if (!q) return;

        editingQuestionId = id;
        currentImages = Array.isArray(q.images) ? [...q.images] : [];
        renderImagesPreview();
        document.getElementById("qFormTitle").innerHTML =
          `<i class="fa-solid fa-pen"></i> تعديل السؤال #${id}`;
        document.getElementById("qSubmitLabel").textContent = "حفظ التعديلات";
        document.getElementById("qCancelEditBtn").classList.remove("hidden");

        typeSelect.value = q.type;
        qTextArea.value = q.question;
        document.getElementById("qScore").value = q.score;
        updateFormForType(q.type, q);

        panel
          .querySelector(".a-question-form-box")
          .scrollIntoView({ behavior: "smooth" });
      });
    });

    listEl.querySelectorAll(".move-up-btn, .move-down-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".a-question-card");
        const id = Number(card.dataset.id);
        const idx = questions.findIndex((q) => q.id === id);
        const targetIdx = btn.classList.contains("move-up-btn")
          ? idx - 1
          : idx + 1;
        if (targetIdx < 0 || targetIdx >= questions.length) return;
        const newOrder = [...questions.map((q) => q.id)];
        [newOrder[idx], newOrder[targetIdx]] = [
          newOrder[targetIdx],
          newOrder[idx],
        ];
        await reorderQuestions(examId, newOrder);
        await renderQuestionsTab();
      });
    });
  }
}
