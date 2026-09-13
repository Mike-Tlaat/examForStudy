// admin-auth.js — v1.0.0
// حماية موحّدة لكل صفحات لوحة الأدمن. الباسورد محفوظ في قاعدة البيانات
// (جدول settings، مفتاح admin_password) وليس في أي كود JS.
// ملاحظة أمان: هذا تحقق يتم من المتصفح مقابل قاعدة بيانات تسمح بالقراءة العامة
// (نفس فلسفة الموقع الأصلي)، وليس نظام تسجيل دخول حقيقي على السيرفر.

import { verifyAdminPassword } from "../includes/functions.js?v=1.0.0";

const AUTH_KEY = "admin_authenticated_v3";

export async function guardAdminPage() {
  if (sessionStorage.getItem(AUTH_KEY) === "true") return;

  document.documentElement.style.visibility = "hidden";

  const overlay = document.createElement("div");
  overlay.id = "adminAuthOverlay";
  overlay.innerHTML = `
    <div class="admin-auth-box">
      <div class="admin-auth-icon"><i class="fa-solid fa-shield-halved"></i></div>
      <h3>دخول لوحة التحكم</h3>
      <p>من فضلك أدخل كلمة المرور الخاصة بالأدمن للمتابعة.</p>
      <div class="admin-auth-input-wrap">
        <input type="password" id="adminAuthInput" placeholder="كلمة المرور" autocomplete="off">
        <button type="button" id="adminAuthToggleEye" tabindex="-1" aria-label="إظهار/إخفاء كلمة المرور">
          <i class="fa-solid fa-eye"></i>
        </button>
      </div>
      <button id="adminAuthBtn"><span>دخول</span> <i class="fa-solid fa-arrow-left"></i></button>
      <p id="adminAuthError"><i class="fa-solid fa-circle-exclamation"></i> كلمة المرور غير صحيحة!</p>
    </div>`;

  document.body.appendChild(overlay);
  document.documentElement.style.visibility = "visible";

  const input = document.getElementById("adminAuthInput");
  const btn = document.getElementById("adminAuthBtn");
  const errorMsg = document.getElementById("adminAuthError");
  const eyeBtn = document.getElementById("adminAuthToggleEye");
  const eyeIcon = eyeBtn.querySelector("i");

  eyeBtn.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    eyeIcon.className = showing ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
    input.focus();
  });

  async function verify() {
    btn.disabled = true;
    btn.classList.add("loading");
    const ok = await verifyAdminPassword(input.value);
    btn.disabled = false;
    btn.classList.remove("loading");

    if (ok) {
      sessionStorage.setItem(AUTH_KEY, "true");
      overlay.classList.add("closing");
      setTimeout(() => overlay.remove(), 250);
    } else {
      errorMsg.classList.add("shown");
      input.value = "";
      input.focus();
      input.classList.add("shake");
      setTimeout(() => input.classList.remove("shake"), 400);
    }
  }

  btn.addEventListener("click", verify);
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") verify();
  });
  input.focus();
}

export function adminLogout() {
  sessionStorage.removeItem(AUTH_KEY);
  window.location.reload();
}

await guardAdminPage();
