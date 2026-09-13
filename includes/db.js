// db.js
// تهيئة اتصال Supabase - نستخدمه بدل mysqli getDB() القديمة

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js?v=1.0.0";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
