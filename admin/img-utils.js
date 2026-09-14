// img-utils.js — v1.0.0
// أداة مشتركة: تحويل ملف صورة تم اختياره من المتصفح إلى Data URL بعد تصغيره،
// تُستخدم لصور الأسئلة وشعار الموقع، بدون أي حاجة لاستضافة/تخزين ملفات خارجي.

export function fileToResizedDataUrl(file, maxDimension = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      reject(new Error("الملف المختار ليس صورة"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const isPng = file.type === "image/png" && file.size < 400 * 1024;
        resolve(
          isPng
            ? canvas.toDataURL("image/png")
            : canvas.toDataURL("image/jpeg", quality),
        );
      };
      img.onerror = () => reject(new Error("تعذر قراءة الصورة"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("تعذر قراءة الملف"));
    reader.readAsDataURL(file);
  });
}
