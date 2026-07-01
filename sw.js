// ============================================================
// TO-DO LIST — Supabase Authentication + Database (JSONB)
// Barcha localStorage mantig'i olib tashlangan.
// Ma'lumotlar faqat public.app_data jadvalining (user_id, data) ustunlarida saqlanadi.
//
// MUHIM: bu fayldan oldin HTML ichida Supabase SDK ulangan bo'lishi kerak:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
//   <script src="script.js"></script>
// ============================================================
// 11 va 12-qatorlarni mana bunday to'ldiring:
const SUPABASE_URL = "https://bskvildvqcelsxbluboe.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_xWsjS4VmlqX138HebYAdPA_D32G5lq0";

// 17-qatorni aynan mana shunday qiling:
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

let currentUser = "11111111-1111-1111-1111-111111111111";
let S = { tasks: [] };   // ilovaning asosiy holati (state) — kerakli maydonlarni o'zingiz kengaytiring
let _saveTimer = null;
let _realtimeChannel = null;

// ============================================================
async function autoLogin() {
    // Login-parolsiz to'g'ridan-to'g'ri bazadan ma'lumotlarni yuklash
    await loadData();
}

// ============================================================
// 2) MA'LUMOTLARNI SUPABASEDAN YUKLASH
// ============================================================
async function loadData() {
  if (!currentUser) return;

  const { data, error } = await sbClient
    .from("app_data")
    .select("data")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Ma'lumot yuklashda xatolik:", error.message);
    return;
  }

  if (data && data.data) {
    // Serverdan kelgan holatni ilova holatiga joylaymiz
    S = Object.assign({ tasks: [] }, data.data);
  } else {
    // Bu foydalanuvchi uchun hali qator yo'q — birinchi marta bo'sh holatni yozamiz
    await saveData();
  }

  render();
}

// ============================================================
// 3) MA'LUMOTLARNI SUPABASEGA SAQLASH (UPSERT)
// ============================================================
async function saveData() {
  if (!currentUser) return;

  const { error } = await sbClient
    .from("app_data")
    .upsert(
      {
        user_id: currentUser.id,
        data: S,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

  if (error) console.error("Saqlashda xatolik:", error.message);
}

// Har bir kichik o'zgarishda darhol tarmoqqa yubormaslik uchun debounce
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveData, 400);
}

// ============================================================
// 4) VAZIFALAR BILAN ISHLASH (misol funksiyalar — o'z mantig'ingizga moslang)
// ============================================================
function addTask(name) {
  if (!name || !name.trim()) return;
  if (!S.tasks) S.tasks = [];
  S.tasks.push({ id: Date.now(), name: name.trim(), done: false });
  scheduleSave();
  render();
}

function toggleTask(id) {
  const t = (S.tasks || []).find(x => x.id === id);
  if (t) t.done = !t.done;
  scheduleSave();
  render();
}

function deleteTask(id) {
  S.tasks = (S.tasks || []).filter(x => x.id !== id);
  scheduleSave();
  render();
}

// ============================================================
// 5) UI CHIZISH (misol — o'z HTML strukturangizga moslashtiring)
//    HTML'da <ul id="task-list"></ul> bo'lishi kutiladi
// ============================================================
function render() {
  const list = document.getElementById("task-list");
  if (!list) return;

  list.innerHTML = "";
  (S.tasks || []).forEach(t => {
    const li = document.createElement("li");
    li.textContent = t.name;
    li.style.textDecoration = t.done ? "line-through" : "none";
    li.style.cursor = "pointer";
    li.onclick = () => toggleTask(t.id);

    const del = document.createElement("button");
    del.textContent = "✕";
    del.onclick = (e) => { e.stopPropagation(); deleteTask(t.id); };

    li.appendChild(del);
    list.appendChild(li);
  });
}

// ============================================================
// 6) REALTIME SINXRONIZATSIYA — boshqa qurilmadagi o'zgarishlarni jonli olish
// ============================================================
function startRealtimeSync() {
  if (!currentUser) return;
  if (_realtimeChannel) sbClient.removeChannel(_realtimeChannel);

  _realtimeChannel = sbClient
    .channel("app_data_changes_" + currentUser.id)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "app_data",
        filter: "user_id=eq." + currentUser.id
      },
      (payload) => {
        if (payload.new && payload.new.data) {
          S = Object.assign({ tasks: [] }, payload.new.data);
          render();
        }
      }
    )
    .subscribe();
}

// ============================================================
// 7) ILOVANI ISHGA TUSHIRISH
// ============================================================
(async function init() {
  // Avtomatik yuklashni boshlash
  await autoLogin();
  // Realtime sinxronizatsiyani yoqish
  startRealtimeSync();
})();
