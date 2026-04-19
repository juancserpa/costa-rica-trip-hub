#!/usr/bin/env node
/**
 * Extracts student portal from "Costa Rica Trip Hub.html" into "student.html"
 * Uses pattern-based extraction (not hardcoded line numbers) so it's resilient to edits.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'Costa Rica Trip Hub.html');
const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split('\n');

// Find line number (1-indexed) of first line matching pattern
function findLine(pattern, after) {
    const start = after ? after : 0;
    for (let i = start; i < lines.length; i++) {
        if (typeof pattern === 'string' ? lines[i].includes(pattern) : pattern.test(lines[i])) return i + 1;
    }
    throw new Error('Pattern not found: ' + pattern);
}

// Find closing brace of a function/block starting at line (1-indexed)
function findBlockEnd(startLine) {
    let depth = 0;
    let started = false;
    for (let i = startLine - 1; i < lines.length; i++) {
        for (const ch of lines[i]) {
            if (ch === '{') { depth++; started = true; }
            if (ch === '}') depth--;
        }
        if (started && depth === 0) return i + 1;
    }
    return startLine + 1;
}

// Extract lines (1-indexed, inclusive)
function extract(start, end) {
    return lines.slice(start - 1, end).join('\n');
}

// Extract a function by finding its start and closing brace
function extractFn(name) {
    const start = findLine(new RegExp('^(async )?function ' + name + '\\b'));
    return extract(start, findBlockEnd(start));
}

// Extract from a pattern to another pattern (exclusive of end pattern)
function extractRange(startPat, endPat) {
    const s = findLine(startPat);
    const e = endPat ? findLine(endPat, s) - 1 : lines.length;
    return extract(s, e);
}

// ── Parse DATA_JSON to extract only safe keys ──
const dataJsonMatch = src.match(/const DATA_JSON\s*=\s*(\{[\s\S]*?\});/);
let fullData;
try {
    fullData = JSON.parse(dataJsonMatch[1]);
} catch (e) {
    fullData = eval('(' + dataJsonMatch[1] + ')');
}

const SENSITIVE_FIELDS = [
    'Student ID', 'Phone Number', 'Phone', 'Passport #', 'Passport',
    'Emergency Contact', 'Emergency Phone', 'Health & Accessibility',
    'Medical Conditions', 'Deposit Payment', 'EEO financial aid',
    'Notes', 'Pre-departure registation/certificate/Travel Registry App',
    'Liability Waiver', 'Deposit', 'CGPA', 'Decision', 'Interview score',
    'Interview status', 'Summary', 'Responses', 'Interview Day', 'Interview Time',
    'Score', 'Status', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K',
    'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'AA', 'AB', 'AC', 'AD', 'AE'
];

const safeData = {};
if (fullData.accepted) {
    safeData.accepted = fullData.accepted.map(s => {
        const safe = {};
        for (const [k, v] of Object.entries(s)) {
            if (!SENSITIVE_FIELDS.includes(k)) safe[k] = v;
        }
        return safe;
    });
}
if (fullData.nextSteps) safeData.nextSteps = fullData.nextSteps;
if (fullData.faq) safeData.faq = fullData.faq;
if (fullData.logistics_overview) safeData.logistics_overview = fullData.logistics_overview;
if (fullData.slothy) safeData.slothy = fullData.slothy;
if (fullData.staff) {
    const staffPhotoMap = {
        'juan.serpa@mcgill.ca': 'photos/staff_juan.serpa.jpg',
        'ehsia.thanda@mcgill.ca': 'photos/staff_ehsia.thanda.jpg',
        'juan.rodrigueztorres@mcgill.ca': 'photos/staff_juan.rodrigueztorres.jpg',
        'noelle.ciravolo@mail.mcgill.ca': 'photos/staff_noelle.ciravolo.jpg'
    };
    safeData.staff = fullData.staff.map(s => ({
        'Full Name': s['Full Name'] || '', 'Role': s['Role'] || '',
        'Email': s['Email'] || '', 'Country': s['Country'] || '',
        'Photo': staffPhotoMap[(s['Email'] || '').toLowerCase()] || s['Photo'] || ''
    }));
}

// ���─ Extract logo base64 from login overlay ���─
const logoSrc = 'logo.png'; // file instead of 113KB base64

// ── Extract CSS sections ──
const toastCss = extractRange('.toast {', '.toast.info {');
const toastInfoEnd = findLine('.toast.info {');
const toastCssAll = extract(findLine('.toast {'), findBlockEnd(toastInfoEnd));

const studentCardCssStart = findLine('.student-card-overlay {');
const studentCardCssEnd = findLine('.student-card-footer .btn-secondary:hover');
const studentCardCss = extract(studentCardCssStart, findBlockEnd(studentCardCssEnd));

const studentCardDarkStart = findLine('body.dark .student-card-modal');
const studentCardDarkEnd = findLine('body.dark .student-card-footer');
const studentCardDarkCss = extract(studentCardDarkStart, findBlockEnd(studentCardDarkEnd));

const mainStudentCssStart = findLine('/* ===== STUDENT PORTAL STYLES ===== */');
const mainStudentCssEnd = findLine('.stu-faq-open .fa-chevron-down');
const mainStudentCss = extract(mainStudentCssStart, findBlockEnd(mainStudentCssEnd));

const loginOverlayCss = extract(findLine('#loginOverlay > div {'), findLine('#loginOverlay img {') + 2);

// ── Extract student dashboard HTML ──
const dashStart = findLine('<div id="studentDashboard"');
const dashEnd = findLine('</div>', findLine('<button class="stu-logout-btn"'));
const dashboardHtml = extract(dashStart, dashEnd);

// ── Extract student login form views (not the staff form) ──
const stuFormStart = findLine('<div id="stuViewSignIn">');
const stuFormEnd = findLine('</div>', findLine('<div id="stuViewForgot"') + 5);
const studentLoginViews = extract(stuFormStart, stuFormEnd);

// ── Extract STUDENT_BIOS ──
const biosStart = findLine('const STUDENT_BIOS = [');
const biosEnd = findLine('];', biosStart);
const studentBios = extract(biosStart, biosEnd);

// ── GROUP_LOGOS: use file paths instead of base64 (saves ~56KB) ──
const getGroupLogoFn = extractFn('getGroupLogo');
const normalizeGroupFn = extractFn('normalizeGroupName');
const groupLogos = `const GROUP_LOGOS = {
    'Compost': 'photos/logo_compost.png',
    'Microfarming': 'photos/logo_microfarming.png',
    'Animal Rescue': 'photos/logo_animal_rescue.png',
    'Monkey Bridges': 'photos/logo_monkey_bridges.png',
    'Wildlife': 'photos/logo_wildlife.png',
    'Ocean Microplastics': 'photos/logo_ocean_microplastics.png'
};
${normalizeGroupFn}
${getGroupLogoFn}`;

// ── Extract FIREBASE_CONFIG ──
const fbConfigStart = findLine('const FIREBASE_CONFIG = {');
const fbConfigEnd = findLine('};', fbConfigStart);
const firebaseConfig = extract(fbConfigStart, fbConfigEnd);

// ── Extract COUNTRIES_LIST ──
const countriesStart = findLine('const COUNTRIES_LIST = [');
const countriesEnd = findLine('];', countriesStart);
const countriesList = extract(countriesStart, countriesEnd);

// ── Extract JS functions by name ──
const utilFns = [
    extractFn('toggleDarkMode'),
    extractFn('escapeHtml'),
    extractFn('showToast'),
    extractFn('setupTextareaAutoResize'),
].join('\n\n');

const authFns = [
    extractFn('getSafeFieldValue'),
    extractFn('getStudentDocId'),
    'function switchLoginMode(mode) {}', // no-op: student portal has no staff form
    extractFn('showStudentError'),
    'function showStuError2(msg) { showStudentError(msg); }', // redirect to working error display
    extractFn('isAcceptedEmail'),
    extractFn('getAcceptedStudentByEmail'),
    extractFn('ensureFirebaseAuth'),
    extractFn('showStudentView'),
    extractFn('studentSignIn'),
    extractFn('studentRequestAccess'),
    extractFn('studentForgotPassword'),
].join('\n\n');

const dashFns = [
    extractFn('enterStudentDashboard'),
    extractFn('checkMustChangePassword'),
    extractFn('showChangePasswordModal'),
    extractFn('submitChangePassword'),
    extractFn('updateStudentProgress'),
    extractFn('loadStudentProfile'),
].join('\n\n');

const countryFns = [
    'let _selectedCountries = [];',
    extractFn('renderCountryTags'),
    extractFn('toggleCountryInput'),
    extractFn('showCountryDropdown'),
    extractFn('filterCountryDropdown'),
    extractFn('addCountry'),
    extractFn('removeCountry'),
    extractFn('loadCountriesFromValue'),
].join('\n\n');

const photoFns = [
    'let _stuPhotoRawBase64 = null;',
    extractFn('handleStudentPhotoUpload'),
    extractFn('showPhotoControls'),
    extractFn('cropAndSaveStudentPhoto'),
    extractFn('previewPhotoPosition'),
    extractFn('savePhotoPosition'),
    extractFn('handleStudentPhotoDelete'),
].join('\n\n');

const profileFns = [
    extractFn('saveStudentProfile'),
    extractFn('listenToStudentProfile'),
].join('\n\n');

// staffRoleStyle is defined inside DOMContentLoaded in source but used by renderBioCards
const staffRoleStyleFn = extractRange('function staffRoleStyle(', 'function renderStaff(');

const bioFns = [
    'let _activeBioProjectFilter = null;',
    'let _bioPhotosLoaded = false;',
    'let _firestoreStudentData = null;',
    staffRoleStyleFn.trim(),
    extractFn('initProjectFilterButtons'),
    extractFn('filterBioByProject'),
    extractFn('renderBioCards'),
].join('\n\n');

const navFns = extractFn('switchStudentSection');

const logisticsFns = [
    extractFn('getActivityTypeIcon'),
    extractFn('getAccommodationStyles'),
    extractFn('getAccomStyleFor'),
    extractFn('convertTo24Hour'),
    extractFn('_parseScheduleDate'),
    extractFn('renderStudentLogistics'),
    extractFn('switchStudentLogisticsDay'),
].join('\n\n');

const flightsFns = [
    extractFn('renderFlightsDashboard'),
    extractFn('clearFlightFields'),
    extractFn('formatFlightTime'),
].join('\n\n');

const slothyFns = extractFn('renderStudentSlothy');

const logoutFns = [
    extractFn('studentLogout'),
    extractFn('logoutStudent'),
].join('\n\n');

// Firebase init vars
const fbInitStart = findLine('let firebaseReady = false;');
const fbInitEnd = findBlockEnd(findLine('function initFirebase()'));
const firebaseInit = extract(fbInitStart, fbInitEnd);

// ── Shared name/email normalization helpers (used everywhere people are matched) ──
const normalizersStart = findLine('// ===== NAME / EMAIL NORMALIZATION (shared) =====');
const normalizersEnd = findBlockEnd(findLine('function auditDataIntegrity()'));
const normalizers = extract(normalizersStart, normalizersEnd);
// dedupePeople + mergeByEmail (defined later in source)
const dedupeStart = findLine('function dedupePeople(arr) {');
const dedupeEnd = findBlockEnd(findLine('function mergeByEmail('));
const dedupeFns = '// Dedupe helpers (lifted so the same logic runs in the student portal)\n'
    + extract(dedupeStart - 4, dedupeEnd);

// ── Scoped next steps + FAQ (inside DOMContentLoaded) ──
const nextStepsStart = findLine('// ============ STUDENT NEXT STEPS');
const scriptEnd = findLine('    </script>', nextStepsStart);
const scopedFns = extract(nextStepsStart, scriptEnd - 1);

// ── Build student.html ──
let output = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Costa Rica 2026 - Student Portal</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"><\/script>
    <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"><\/script>
    <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"><\/script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #f0f4f8; }
${toastCssAll}
${studentCardCss}
${studentCardDarkCss}
${loginOverlayCss}
${mainStudentCss}
    </style>
</head>
<body>
    <!-- Login Screen (student only) -->
    <div id="loginOverlay" style="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a4560 0%,#214e67 40%,#1a4560 100%);font-family:Inter,system-ui,sans-serif;">
        <div style="text-align:center;max-width:380px;padding:40px;">
            <img src="${logoSrc}" alt="Course Logo" style="width:120px;height:auto;margin:0 auto 20px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.25);">
            <h1 style="color:white;font-size:1.6rem;margin:0 0 6px;font-weight:700;">Costa Rica Study Trip</h1>
            <p style="color:rgba(255,255,255,0.7);font-size:.9rem;margin:0 0 24px;">Student Portal</p>
            <div id="studentLoginForm" autocomplete="off">
${studentLoginViews}
            </div>
            <div id="stuLoginError" style="color:#ff6b6b;margin-top:12px;font-size:.85rem;min-height:1.2em;"></div>
            <a href="/admin" style="color:rgba(255,255,255,0.4);font-size:.78rem;margin-top:16px;display:inline-block;text-decoration:none;transition:all .2s;" onmouseover="this.style.color='#a8e06c'" onmouseout="this.style.color='rgba(255,255,255,0.4)'">Staff? Log in here →</a>
        </div>
    </div>

${dashboardHtml}

    <script>
// ===== SAFE DATA =====
const DATA_JSON = ${JSON.stringify(safeData, null, 1)};
let DATA = JSON.parse(JSON.stringify(DATA_JSON));

// ===== GROUP LOGOS =====
${groupLogos}

// ===== STUDENT BIOS =====
${studentBios}

// ===== FIREBASE =====
${firebaseConfig}
${firebaseInit}

// ===== NAME / EMAIL NORMALIZATION =====
${normalizers}
${dedupeFns}

// ===== UTILITIES =====
${utilFns}

// ===== AUTH =====
${authFns}

// ===== DASHBOARD =====
${dashFns}

// ===== COUNTRIES =====
${countriesList}
${countryFns}

// ===== PHOTO =====
${photoFns}

// ===== PROFILE =====
${profileFns}

// ===== BIO CARDS =====
${bioFns}

// ===== NAVIGATION =====
${navFns}

// ===== LOGISTICS =====
${logisticsFns}

// ===== FLIGHTS =====
${flightsFns}

// ===== SLOTHY =====
${slothyFns}

// ===== LOGOUT =====
${logoutFns}

// ===== NEXT STEPS & FAQ (scoped) =====
(function() {
${scopedFns}
    window.toggleStepComplete = typeof toggleStepComplete !== 'undefined' ? toggleStepComplete : function(){};
    window.renderStudentNextSteps = renderStudentNextSteps;
    window.loadStudentCompletedSteps = loadStudentCompletedSteps;
    window.filterStudentFaq = filterStudentFaq;
    window.filterStudentFaqCategory = filterStudentFaqCategory;
    window.renderStudentFaq = renderStudentFaq;
    window.toggleStudentFaq = toggleStudentFaq;
})();

// ===== INIT =====
async function initStudentPortalData() {
    if (!db) return;
    // Load staff photos from Firestore backup
    try {
        const photosDoc = await db.collection('hub').doc('staff_photos').get();
        if (photosDoc.exists && DATA.staff) {
            const photoData = photosDoc.data();
            DATA.staff.forEach(s => {
                const emailKey = (s['Email'] || '').replace(/\\./g, '_');
                if (photoData[emailKey]) {
                    const pd = photoData[emailKey];
                    if (pd.Photo && !s.Photo) s.Photo = pd.Photo;
                    if (pd.PhotoRaw && !s.PhotoRaw) s.PhotoRaw = pd.PhotoRaw;
                    if (pd.PhotoPosY !== undefined && !s.PhotoPosY) s.PhotoPosY = pd.PhotoPosY;
                }
            });
        }
    } catch(e) {}

    // Load dynamic data from Firestore (fields stored as d_KEY = JSON string)
    try {
        const hubDoc = await db.collection('hub').doc('data').get();
        if (hubDoc.exists) {
            const hd = hubDoc.data();
            const parse = (key) => { try { return hd['d_' + key] ? JSON.parse(hd['d_' + key]) : null; } catch(e) { return null; } };
            const accepted = parse('accepted');
            if (accepted && accepted.length > 0) {
                // Use shared mergeByEmail — keeps static-only entries AND dedupes by person,
                // so duplicate Firestore rows ("Mia"/"Isabella", or one Léanne with email
                // and one without) collapse into a single record.
                DATA.accepted = mergeByEmail(accepted, DATA.accepted);
            }
            const slothy = parse('slothy');
            if (slothy) DATA.slothy = slothy;
            const faq = parse('faq');
            if (faq) DATA.faq = faq;
            const logistics = parse('logistics_overview');
            if (logistics) DATA.logistics_overview = logistics;
            const nextSteps = parse('nextSteps');
            if (nextSteps) DATA.nextSteps = nextSteps;
            const staff = parse('staff');
            if (staff) {
                // Preserve static photo file paths — don't replace with huge base64
                const photoMap = {};
                (DATA.staff || []).forEach(s => { if (s.Photo && !s.Photo.startsWith('data:')) photoMap[(s['Email']||'').toLowerCase()] = s.Photo; });
                staff.forEach(s => {
                    const email = (s['Email']||'').toLowerCase();
                    if (photoMap[email]) s.Photo = photoMap[email];
                });
                DATA.staff = staff;
            }
        }
    } catch(e) { console.error('Hub data load error:', e); }

    // Pre-fetch all student Firestore profiles (for bio cards, flights)
    try {
        const snapshot = await db.collection('students').get();
        _firestoreStudentData = {};
        snapshot.forEach(doc => { _firestoreStudentData[doc.id] = doc.data(); });
        _bioPhotosLoaded = true;
    } catch(e) {}
}

window.addEventListener('DOMContentLoaded', async () => {
    const isAuth = sessionStorage.getItem('crTrip_auth') === 'true';
    const role = sessionStorage.getItem('crTrip_role');
    if (isAuth && role === 'student') {
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('studentDashboard').style.display = '';
    } else {
        document.getElementById('studentDashboard').style.display = 'none';
    }
    if (localStorage.getItem('crTrip_darkMode') === 'true') document.body.classList.add('dark');

    initFirebase();
    if (!DATA.nextSteps && DATA_JSON.nextSteps) DATA.nextSteps = JSON.parse(JSON.stringify(DATA_JSON.nextSteps));
    if (!DATA.faq && DATA_JSON.faq) DATA.faq = JSON.parse(JSON.stringify(DATA_JSON.faq));
    if (!DATA.logistics_overview && DATA_JSON.logistics_overview) DATA.logistics_overview = JSON.parse(JSON.stringify(DATA_JSON.logistics_overview));
    if (!DATA.staff && DATA_JSON.staff) DATA.staff = JSON.parse(JSON.stringify(DATA_JSON.staff));
    if (!DATA.slothy && DATA_JSON.slothy) DATA.slothy = JSON.parse(JSON.stringify(DATA_JSON.slothy));

    // Render bio cards IMMEDIATELY from hardcoded data (no waiting)
    try { renderBioCards(''); } catch(e) { console.error('Initial renderBioCards error:', e); }

    // Then load Firestore data in background and re-render everything
    initStudentPortalData().then(() => {
        try { renderBioCards(''); } catch(e) { console.error('Post-fetch renderBioCards error:', e); }
        try { renderStudentLogistics(); } catch(e) {}
    }).catch(e => { console.error('initStudentPortalData error:', e); });

    if (isAuth && role === 'student') {
        ensureFirebaseAuth();
        firebaseAuth.onAuthStateChanged(user => {
            if (!db) return;
            if (user) {
                currentStudentUser = user;
                if (user.email) loadStudentProfile(user.email);
                renderBioCards('');
                listenToStudentProfile(user.email);
                loadStudentCompletedSteps();
                checkMustChangePassword(user.email);
            }
        });
    }

    document.addEventListener('click', (e) => {
        const dd = document.getElementById('stuCountryDropdown');
        const inp = document.getElementById('stuCountryInput');
        if (dd && inp && !dd.contains(e.target) && e.target !== inp) {
            dd.style.display = 'none';
            inp.style.display = 'none';
        }
    });
});
    <\/script>
</body>
</html>`;

// ── Post-process: strip staff-only code ──
// Remove STAFF_CREDENTIALS and staff password
output = output.replace(/const _ph = .*?;\n/g, '');
// Strip the staff allowlist + (now password-less) credential shim from student.html.
// The student portal has no admin functionality so it shouldn't leak the staff list.
output = output.replace(/const STAFF_EMAILS = \[[\s\S]*?\];\n/g, 'const STAFF_EMAILS = [];\n');
output = output.replace(/const STAFF_CREDENTIALS = STAFF_EMAILS\.map\([^)]+\);\n/g, 'const STAFF_CREDENTIALS = [];\n');
output = output.replace(/const STAFF_CREDENTIALS = \[[\s\S]*?\];\n/g, 'const STAFF_CREDENTIALS = [];\n');
output = output.replace(/\s*\{ email: '[^']*', pw: '[^']*' \},?\n/g, '\n');
output = output.replace(/\/\/ \(variables declared earlier.*?\n/g, '');
// Replace entire STAFF_CREDENTIALS.some(...) expression including nested parens
output = output.replace(/STAFF_CREDENTIALS\.some\(c\s*=>\s*c\.email\.toLowerCase\(\)\s*===\s*email\.toLowerCase\(\)\)/g, 'false');
output = output.replace(/STAFF_CREDENTIALS\.some\([^)]*\([^)]*\)[^)]*\)/g, 'false');
output = output.replace(/const isStaffEmail = false;\s*\n\s*if \(!isAcceptedEmail\(email\) && !isStaffEmail\)/g, 'if (!isAcceptedEmail(email))');

// Remove references to elements that don't exist in student portal
output = output.replace(/document\.getElementById\('sidebar'\)\.style\.display[^;]*;/g, '');
output = output.replace(/document\.getElementById\('mobileMenuBtn'\)\.style\.display[^;]*;/g, '');
output = output.replace(/document\.querySelector\('\.main-content'\)\.style\.display[^;]*;/g, '');
output = output.replace(/try \{ const hLogo.*?sidebar-logo.*?\} catch\(e\) \{\}/g, '');

// Remove orphaned staff CSS
output = output.replace(/\s*#staffLoginForm\s*\{[^}]*\}/g, '');
output = output.replace(/\s*\.staff-portal-link\s*\{[^}]*\}/g, '');
output = output.replace(/\s*\.staff-portal-link:hover\s*\{[^}]*\}/g, '');
output = output.replace(/\s*\.back-to-student\s*\{[^}]*\}/g, '');

// Remove switchLoginMode references to staff elements
output = output.replace(/document\.getElementById\('staffLoginForm'\)\.style\.display[^;]*;/g, '');
output = output.replace(/document\.getElementById\('staffEmail'\)[^;]*;/g, '');
output = output.replace(/document\.getElementById\('loginPassword'\)[^;]*;/g, '');
output = output.replace(/const staffLink = document\.querySelector\('\.staff-portal-link'\);/g, '');
output = output.replace(/if \(staffLink\)[^}]*}/g, '');

fs.writeFileSync(path.join(__dirname, 'student.html'), output, 'utf8');
console.log('student.html: ' + (output.length / 1024).toFixed(1) + ' KB, ' + output.split('\n').length + ' lines');

// ── Security check ──
const checks = [
    // Allowlist with no passwords is fine to expose; only flag if a password reappears.
    [/Ymx1ZWNhdDI0/, 'Staff password leaked'],
    [/dGhhbmRhMjQ/, 'Staff password 2 leaked'],
    [/cm9kcmlndWV6MjQ/, 'Staff password 3 leaked'],
    [/Y2lyYXZvbG8yNA/, 'Staff password 4 leaked'],
    [/STAFF_EMAILS\s*=\s*\[\s*['"]/, 'Staff email allowlist not stripped'],
    [/"interviews"\s*:/, 'interviews data'],
    [/"budget"\s*:/, 'budget data'],
    [/"payments"\s*:/, 'payments data'],
    [/"detailed_budget"\s*:/, 'detailed_budget data'],
    [/"waivers"\s*:/, 'waivers data'],
    [/"rooms"\s*:/, 'rooms data'],
    [/SHEETS_CONFIG/, 'SHEETS_CONFIG'],
    [/makeEditable\(/, 'staff makeEditable'],
];
let leaks = 0;
for (const [pat, label] of checks) {
    if (pat.test(output)) { console.error('LEAK: ' + label); leaks++; }
}

// JS syntax check
// Extract just our main script block (between last <script> and </script>)
const lastScriptIdx = output.lastIndexOf('<script>');
const lastScriptEndIdx = output.lastIndexOf('</script>');
if (lastScriptIdx > 0 && lastScriptEndIdx > lastScriptIdx) {
    const jsCode = output.substring(lastScriptIdx + 8, lastScriptEndIdx);
    try { new Function(jsCode); console.log('JS syntax: OK'); }
    catch(e) { console.error('JS SYNTAX ERROR: ' + e.message); leaks++; }
}

console.log(leaks === 0 ? 'Security: PASSED' : 'Security: FAILED (' + leaks + ' issues)');
