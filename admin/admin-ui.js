// admin-ui.js — v1.0.0
// نوافذ تنبيه/تأكيد منسّقة بديلة لـ alert() و confirm() الأصليتين (اللي شكلهم من غير أي
// تنسيق لأنهم نوافذ نظام المتصفح نفسه ومش ممكن تتصمم بـ CSS خالص). أي رسالة تحذير/تأكيد
// في لوحة الأدمن كلها لازم تعدي من هنا بدل alert()/confirm() العاديين.

let overlayEl = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;

  overlayEl = document.createElement("div");
  overlayEl.id = "adminModalOverlay";
  overlayEl.innerHTML = `
    <div class="admin-modal-box">
      <div class="admin-modal-icon"><i class="fa-solid fa-circle-info"></i></div>
      <h3 class="admin-modal-title"></h3>
      <p class="admin-modal-text"></p>
      <div class="admin-modal-actions"></div>
    </div>`;
  document.body.appendChild(overlayEl);
  return overlayEl;
}

const ICONS = {
  danger: { cls: "danger", icon: "fa-triangle-exclamation" },
  success: { cls: "success", icon: "fa-circle-check" },
  info: { cls: "info", icon: "fa-circle-info" },
  question: { cls: "question", icon: "fa-circle-question" },
};

function showAdminModal({ type = "info", title, text, buttons }) {
  const overlay = ensureOverlay();
  const iconWrap = overlay.querySelector(".admin-modal-icon");
  const titleEl = overlay.querySelector(".admin-modal-title");
  const textEl = overlay.querySelector(".admin-modal-text");
  const actionsEl = overlay.querySelector(".admin-modal-actions");

  const chosen = ICONS[type] || ICONS.info;
  iconWrap.className = `admin-modal-icon ${chosen.cls}`;
  iconWrap.innerHTML = `<i class="fa-solid ${chosen.icon}"></i>`;

  titleEl.textContent = title || "";
  titleEl.style.display = title ? "" : "none";
  textEl.textContent = text || "";

  actionsEl.innerHTML = "";
  buttons.forEach((b) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `admin-modal-btn ${b.variant || ""}`;
    btn.innerHTML = b.label;
    btn.onclick = () => {
      overlay.classList.remove("show");
      setTimeout(() => b.onClick && b.onClick(), 180);
    };
    actionsEl.appendChild(btn);
  });

  requestAnimationFrame(() => overlay.classList.add("show"));
}

// بديل alert() — نافذة واحدة بزرار "حسناً" فقط
export function adminAlert(text, { title = "تنبيه", type = "info" } = {}) {
  return new Promise((resolve) => {
    showAdminModal({
      type,
      title,
      text,
      buttons: [
        {
          label: '<i class="fa-solid fa-check"></i> حسناً',
          variant: "primary",
          onClick: resolve,
        },
      ],
    });
  });
}

// بديل confirm() — نافذة بزرارين (تأكيد/إلغاء)، بترجع true لو أكّد
export function adminConfirm(
  text,
  {
    title = "تأكيد",
    confirmText = "تأكيد",
    cancelText = "إلغاء",
    danger = false,
  } = {},
) {
  return new Promise((resolve) => {
    showAdminModal({
      type: danger ? "danger" : "question",
      title,
      text,
      buttons: [
        {
          label: `<i class="fa-solid fa-xmark"></i> ${cancelText}`,
          variant: "secondary",
          onClick: () => resolve(false),
        },
        {
          label: `<i class="fa-solid fa-check"></i> ${confirmText}`,
          variant: danger ? "danger" : "primary",
          onClick: () => resolve(true),
        },
      ],
    });
  });
}
