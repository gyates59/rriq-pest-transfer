
const ENDPOINT = "https://pboxaamvtrgwnhgfccbv.supabase.co/functions/v1/proposal-submit";
const TOKEN = "gsm-proposal-2026";
const PROGRAM = "rriq-pest";
const FEE = 750, CARD = 1.20;
const PAY_LINK = ""; // 2026-09-22 rule: no pay link on proposal pages; invoice goes from QuickBooks after the client chooses ACH or card. // Stripe payment link for the $750 fee; when set, the done screen shows a Pay Now button.
const STORE = "rriq_pest_transfer_v2";
const $ = id => document.getElementById(id);
const val = id => ($(id).value || "").trim();

function launchCards() { return $("o-launch").checked ? parseInt($("launchqty").value, 10) : 0; }
function isCard() { const c=document.querySelector("input[name=pay]:checked"); return !!c && c.value==="card"; }
function recalc() {
  const cards = launchCards();
  const fee = isCard() ? Math.round(FEE*1.03) : FEE;
  if ($("duenow")) { $("duenow").textContent = "$" + fee.toLocaleString(); $("duewhat").innerHTML = "&#183; transfer &amp; onboarding fee, " + (isCard() ? "by card incl. 3%" : "by bank transfer"); }
  if ($("c-ach")) { $("c-ach").style.borderColor = isCard() ? "var(--line)" : "var(--blue)"; $("c-card").style.borderColor = isCard() ? "var(--blue)" : "var(--line)"; }
  const amt = "$" + Math.round(parseInt($("launchqty").value, 10) * CARD).toLocaleString();
  $("launchprice").textContent = amt;
  $("launchamt").textContent = amt;
  $("launchrow").style.display = cards ? "flex" : "none";
  persist();
}

function showErr(m, el) { const e = $("err"); e.textContent = m; e.style.display = "block"; (el || e).scrollIntoView({ block: "center" }); if (el && el.focus) el.focus(); }
function saveState(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (_) {} }
function loadState() { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (_) { return null; } }

// ----- persistence (everything except signature + files) -----
function fields() { return Array.from(document.querySelectorAll("[data-k]")); }
function readIntake() {
  const o = {};
  fields().forEach(el => {
    const k = el.getAttribute("data-k");
    if (el.classList.contains("checks")) o[k] = Array.from(el.querySelectorAll("input:checked")).map(i => i.value);
    else o[k] = (el.value || "").trim();
  });
  return o;
}
function writeIntake(o) {
  fields().forEach(el => {
    const k = el.getAttribute("data-k"); if (!(k in o)) return;
    if (el.classList.contains("checks")) el.querySelectorAll("input").forEach(i => { i.checked = (o[k] || []).includes(i.value); });
    else if (o[k]) el.value = o[k];
  });
}
function persist() {
  const st = loadState() || {};
  st.intake = readIntake();
  st.launch = $("o-launch").checked; st.launchqty = $("launchqty").value;
  st.sname = val("sname"); st.stitle = val("stitle");
  saveState(st);
}
document.addEventListener("input", e => { if (e.target.closest("#form")) persist(); });
document.addEventListener("change", e => { if (e.target.closest("#form")) persist(); });

// ----- files (resized client-side) -----
let FILES = [];
async function pickFiles(input) {
  const list = Array.from(input.files || []).slice(0, 8);
  FILES = [];
  $("filelist").textContent = "Preparing " + list.length + " file(s)…";
  for (const f of list) {
    try { FILES.push(await prep(f)); } catch (e) { console.error(e); }
  }
  $("filelist").innerHTML = FILES.length ? FILES.map(f => '<span class="pill">' + f.name + " (" + Math.round(f.data.length * 0.75 / 1024) + " KB)</span>").join("") : "No files yet.";
}
function prep(file) {
  return new Promise((resolve, reject) => {
    const isImg = /^image\//.test(file.type);
    if (!isImg || file.size < 700 * 1024) {
      const r = new FileReader();
      r.onload = () => resolve({ name: file.name, type: file.type, data: String(r.result).split(",")[1] });
      r.onerror = reject; r.readAsDataURL(file); return;
    }
    const img = new Image();
    img.onload = () => {
      const max = 1800, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const png = /png/.test(file.type) && /logo/i.test(file.name);
      const url = png ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.86);
      resolve({ name: file.name.replace(/\.[^.]+$/, "") + (png ? ".png" : ".jpg"), type: png ? "image/png" : "image/jpeg", data: url.split(",")[1] });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ----- one submission: agreement + onboarding together -----
const REQUIRED = [
  ["i_dba", "company name"], ["i_legal", "legal business name"], ["i_entity", "entity type"], ["i_state", "state of formation"],
  ["i_ein", "federal EIN"], ["i_addr", "business address"], ["i_region", "region you serve"],
  ["i_owner", "owner name"], ["i_ophone", "owner mobile"], ["i_oemail", "owner email"],
  ["i_forward", "number your marketing calls forward to"], ["i_answers", "who answers that line"], ["i_hours", "business hours"],
  ["i_lic", "pest control license number"], ["i_licname", "licensed operator name"], ["i_licstate", "state that issued the license"], ["i_opstates", "states you operate in"], ["i_a2p", "texting registration rep"],
  ["i_mix", "residential vs commercial mix"], ["i_commercial", "commercial accounts you want"], ["i_zips", "ZIP codes"], ["i_city", "primary city"],
  ["i_crm", "CRM or scheduling software"], ["i_gbp", "Google Business Profile answer"], ["i_trucks", "number of trucks"], ["i_techs", "number of technicians"],
  ["i_story", "your story"],
];
async function submitAll() {
  $("err").style.display = "none";
  for (const [id, lbl] of REQUIRED) if (!val(id)) return showErr("Please fill in the " + lbl + ".", $(id));
  const intake = readIntake();
  if (!intake["Services offered"].length) return showErr("Please check at least one service you offer.", $("i_services"));
  if (!FILES.length && !val("i_photolink")) return showErr("Please upload your logo and a few photos, or paste a folder link.", $("i_files"));
  if (!val("sname")) return showErr("Please enter your name in the signature block.", $("sname"));
  if (!val("sig")) return showErr("Please type your name as your signature.", $("sig"));
  if (!$("auth").checked) return showErr("Please check the authorization box.", $("auth"));

  const cards = launchCards(), cardAmt = Math.round(cards * CARD);
  const btn = $("go"); btn.disabled = true; btn.textContent = "Sending…";
  $("prog").textContent = FILES.length ? "Uploading " + FILES.length + " file(s)…" : "";
  try {
    const res = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: TOKEN, program: PROGRAM,
        territory_name: intake["Company name (DBA)"],
        plan: "transfer-remaining-term",
        plan_label: "Program transfer from Junk Majesty: remaining prepaid term through 2026-12-05 + $750 transfer/onboarding fee" +
          (cards ? " + launch drop " + cards + " cards $" + cardAmt + " (billed at proof)" : ""),
        setup_fee: FEE, due_now: isCard() ? Math.round(FEE*1.03) : FEE, monthly_total: 0, term_months: 0,
        payment_method: isCard() ? "card" : "ach",
        admin: { name: intake["Owner full name"], email: intake["Owner email"] },
        chairs: [],
        zips_text: "TRANSFER: Junk Majesty -> " + intake["Company name (DBA)"] + " (" + intake["Legal business name"] + ") | remaining prepaid term through 2026-12-05 transfers | $750 fee due now via payment link" +
          (cards ? " | LAUNCH DROP: " + cards + " cards at $1.20 = $" + cardAmt + " billed at proof approval" : " | launch drop: none") +
          " | services: " + intake["Services offered"].join(", ") + " | ZIPs: " + intake["Territory ZIPs"] +
          " | after 12/05: month-to-month $1,500 or 6-mo prepay $7,200 (original terms)",
        delivery_endpoint: intake["Owner mobile"], website: intake["Website"],
        intake, files: FILES,
        signer_name: val("sname"), signer_title: val("stitle"), signer_org: intake["Legal business name"],
        signer_email: intake["Owner email"], signature_typed: val("sig"), authorized: true
      })});
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || "submit failed");
    saveState({ sent: { id: j.id, at: new Date().toISOString() } });
    $("form").style.display = "none"; $("done").style.display = "block";
    if (PAY_LINK) $("paywrap").innerHTML = '<a class="paybtn" href="' + PAY_LINK + '" target="_blank" rel="noopener">Pay the $750 now</a>';
    window.scrollTo({ top: 0 });
  } catch (e) {
    btn.disabled = false; btn.textContent = "Execute Transfer & Send Onboarding"; $("prog").textContent = "";
    showErr("Something went wrong sending this. Please try again, or call 217-335-4060.");
  }
}

// ----- entry -----
(function init() {
  const st = loadState();
  if (st && st.sent) { $("form").style.display = "none"; $("done").style.display = "block"; if (PAY_LINK) $("paywrap").innerHTML = '<a class="paybtn" href="' + PAY_LINK + '" target="_blank" rel="noopener">Pay the $750 now</a>'; return; }
  if (st) {
    if (st.intake) writeIntake(st.intake);
    if (st.launch) $("o-launch").checked = true;
    if (st.launchqty) $("launchqty").value = st.launchqty;
    if (st.sname) $("sname").value = st.sname;
    if (st.stitle) $("stitle").value = st.stitle;
  }
  recalc();
})();
