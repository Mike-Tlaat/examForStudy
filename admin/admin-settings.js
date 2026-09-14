// admin-settings.js — v1.0.0
// زر "الترس ⚙️" الموحّد في أعلى كل صفحات لوحة الأدمن: يفتح نافذة فيها
// (1) تغيير باسورد دخول لوحة التحكم، و (2) اسم وشعار الموقع اللي يظهر
// للطالب في كل شاشات الامتحان. هذا الملف يُستخدم في كل صفحات الأدمن
// (لوحة التحكم الرئيسية، تعديل الامتحان، الناجحون، غير الناجحين).

import {
  changeAdminPassword,
  getSetting,
  setSetting,
} from "../includes/functions.js?v=1.0.0";
import { adminAlert, adminConfirm } from "./admin-ui.js?v=1.0.1";
import { fileToResizedDataUrl } from "./img-utils.js?v=1.0.0";

let modalBuilt = false;
let pendingLogoDataUrl; // undefined = بدون تغيير، "" = إزالة الشعار، أو Data URL جديد

export function mountAdminSettingsButton(containerId = "topbarActions") {
  const container = document.getElementById(containerId);
  if (container && !document.getElementById("adminSettingsGearBtn")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "a-theme-btn";
    btn.id = "adminSettingsGearBtn";
    btn.title = "إعدادات لوحة التحكم";
    btn.innerHTML = `<i class="fa-solid fa-gear"></i>`;
    container.insertBefore(btn, container.firstChild || null);
    btn.addEventListener("click", openSettingsModal);
  }
  ensureModal();
}

function ensureModal() {
  if (modalBuilt) return;
  modalBuilt = true;

  const overlay = document.createElement("div");
  overlay.id = "adminSettingsOverlay";
  overlay.className = "admin-settings-overlay";
  overlay.innerHTML = `
    <div class="admin-settings-box">
      <button type="button" class="admin-settings-close" id="adminSettingsCloseBtn" aria-label="إغلاق">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <h3><i class="fa-solid fa-gear"></i> إعدادات لوحة التحكم</h3>

      <div class="admin-settings-section">
        <h4><i class="fa-solid fa-key"></i> تغيير باسورد الدخول</h4>
        <form id="gearChangePasswordForm" class="a-exam-form">
          <div class="a-filter-item" style="flex:1 1 100%;">
            <label>الباسورد الجديد</label>
            <div class="a-pass-input-wrap">
              <input type="password" name="newPassword" id="gearNewPasswordInput" minlength="4" required placeholder="اكتب باسورد جديد">
              <button type="button" id="gearToggleNewPasswordEye" tabindex="-1" aria-label="إظهار/إخفاء كلمة المرور">
                <i class="fa-solid fa-eye"></i>
              </button>
            </div>
          </div>
          <button type="submit" class="a-mini-btn"><i class="fa-solid fa-floppy-disk"></i> حفظ الباسورد الجديد</button>
          <span id="gearPasswordSavedMsg" class="a-saved-msg hidden"><i class="fa-solid fa-circle-check"></i> تم تغيير الباسورد بنجاح</span>
        </form>
      </div>

      <div class="admin-settings-section">
        <h4><i class="fa-solid fa-shop"></i> اسم الموقع وشعاره</h4>
        <p class="a-hint-text">يظهران للطالب في كل شاشات الامتحان (التسجيل، الامتحان، النتيجة، والاستعلام).</p>
        <form id="siteBrandingForm" class="a-exam-form">
          <div class="a-filter-item" style="flex:1 1 100%;">
            <label>اسم الموقع</label>
            <input type="text" name="site_name" id="siteNameInput" placeholder="مثال: منصة امتحانات الكنيسة">
          </div>
          <div class="a-filter-item" style="flex:1 1 100%;">
            <label>شعار الموقع (لوجو)</label>
            <input type="file" accept="image/*" id="siteLogoInput">
            <div id="siteLogoPreviewWrap" class="a-logo-preview-wrap hidden">
              <img id="siteLogoPreview" alt="شعار الموقع">
              <button type="button" id="removeSiteLogoBtn" class="a-mini-btn danger"><i class="fa-solid fa-trash-can"></i> إزالة الشعار</button>
            </div>
          </div>
          <button type="submit" class="a-mini-btn"><i class="fa-solid fa-floppy-disk"></i> حفظ اسم وشعار الموقع</button>
          <span id="brandingSavedMsg" class="a-saved-msg hidden"><i class="fa-solid fa-circle-check"></i> تم الحفظ بنجاح</span>
        </form>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document
    .getElementById("adminSettingsCloseBtn")
    .addEventListener("click", closeSettingsModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSettingsModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("show"))
      closeSettingsModal();
  });

  document
    .getElementById("gearToggleNewPasswordEye")
    .addEventListener("click", (e) => {
      const input = document.getElementById("gearNewPasswordInput");
      const icon = e.currentTarget.querySelector("i");
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      icon.className = showing ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
    });

  document
    .getElementById("gearChangePasswordForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const newPassword = fd.get("newPassword")?.trim();
      if (!newPassword) return;
      const ok = await adminConfirm(
        "هل أنت متأكد من تغيير باسورد لوحة التحكم؟ لن تقدر ترجع الباسورد القديم إلا بمعرفته.",
        { title: "تغيير الباسورد", confirmText: "نعم، تغيير" },
      );
      if (!ok) return;
      try {
        await changeAdminPassword(newPassword);
        e.target.reset();
        flashSaved("gearPasswordSavedMsg");
      } catch (err) {
        await adminAlert("حدث خطأ: " + (err.message || err), {
          type: "danger",
          title: "خطأ",
        });
      }
    });

  document
    .getElementById("siteLogoInput")
    .addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        pendingLogoDataUrl = await fileToResizedDataUrl(file, 400);
        showLogoPreview(pendingLogoDataUrl);
      } catch (err) {
        await adminAlert("حدث خطأ في قراءة الصورة: " + (err.message || err), {
          type: "danger",
          title: "خطأ",
        });
      }
    });

  document.getElementById("removeSiteLogoBtn").addEventListener("click", () => {
    pendingLogoDataUrl = "";
    document.getElementById("siteLogoPreviewWrap").classList.add("hidden");
    document.getElementById("siteLogoInput").value = "";
  });

  document
    .getElementById("siteBrandingForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const siteName = fd.get("site_name")?.trim() || "";
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await setSetting("site_name", siteName);
        if (pendingLogoDataUrl !== undefined) {
          await setSetting("site_logo", pendingLogoDataUrl);
          pendingLogoDataUrl = undefined;
        }
        flashSaved("brandingSavedMsg");
      } catch (err) {
        await adminAlert("حدث خطأ: " + (err.message || err), {
          type: "danger",
          title: "خطأ",
        });
      } finally {
        submitBtn.disabled = false;
      }
    });

  loadCurrentBranding();
}

function flashSaved(id) {
  const msg = document.getElementById(id);
  msg.classList.remove("hidden");
  setTimeout(() => msg.classList.add("hidden"), 3000);
}

function showLogoPreview(dataUrl) {
  const wrap = document.getElementById("siteLogoPreviewWrap");
  const img = document.getElementById("siteLogoPreview");
  if (dataUrl) {
    img.src = dataUrl;
    wrap.classList.remove("hidden");
  } else {
    wrap.classList.add("hidden");
  }
}

async function loadCurrentBranding() {
  try {
    const [name, logo] = await Promise.all([
      getSetting("site_name"),
      getSetting("site_logo"),
    ]);
    document.getElementById("siteNameInput").value = name || "";
    if (logo) showLogoPreview(logo);
  } catch {
    /* تجاهل: تظل الحقول فاضية */
  }
}

function openSettingsModal() {
  document.getElementById("adminSettingsOverlay")?.classList.add("show");
}

function closeSettingsModal() {
  document.getElementById("adminSettingsOverlay")?.classList.remove("show");
}
