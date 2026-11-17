/**
 * tenantAuth.js — FIXED
 *
 * KEY FIX: generateTenantAccessCode() now returns fully UPPERCASE codes.
 * validateTenantAccessCode() already looked up with .toUpperCase() so
 * the stored key now always matches the lookup key — login works correctly.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  TIER 1 — YOUR SYSTEM (Tervies Internal)                        │
 * │  • Super Admin (you): superadmin@tervies.com                    │
 * │  • Your Staff:  role="team", tenantId=null, isInternal=true     │
 * │    → Register via "Join as Staff" tab (no code needed)          │
 * │    → You approve them in Manage Users                           │
 * │    → They see YOUR data only                                    │
 * │                                                                 │
 * │  TIER 2 — CLIENT COMPANIES (companies you sell the portal to)   │
 * │  • Client Admin: role="admin", tenantId=<their org>             │
 * │    → Register via "Company Register" tab                        │
 * │    → Must enter a Tenant Access Code (TAC) you generate         │
 * │    → You approve them in SuperAdmin panel                       │
 * │    → Gets isolated data workspace (subTenantId)                 │
 * │  • Client Team: role="team", tenantId=<their org>               │
 * │    → Register via "Join Company" tab                            │
 * │    → Must enter their admin's adminAccessCode                   │
 * │    → Their admin approves them in Manage Users                  │
 * └─────────────────────────────────────────────────────────────────┘
 */

export const SUPER_ADMIN_EMAIL = "superadmin@tervies.com";

/* ───────────────────────── SERVER SYNC HELPERS ─────────────────────────
   These keep the old localStorage logic working, but also mirror the data
   to MongoDB through backend routes, so Allocations / Manage Users / Tenants
   look the same on every laptop.
────────────────────────────────────────────────────────────────────────── */
const API_BASE = "/api";

function getAuthToken() {
  try {
    const u = JSON.parse(sessionStorage.getItem("currentUser") || "{}");
    return (
      u?.token ||
      sessionStorage.getItem("token") ||
      sessionStorage.getItem("authToken") ||
      sessionStorage.getItem("jwt") ||
      ""
    );
  } catch {
    return (
      sessionStorage.getItem("token") ||
      sessionStorage.getItem("authToken") ||
      sessionStorage.getItem("jwt") ||
      ""
    );
  }
}

async function syncReq(method, path, body) {
  const token = getAuthToken();
  if (!token) throw new Error("No token");

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

function fireAndForget(promise) {
  promise.catch(() => {});
}

async function pullState(key, storageKey, fallback) {
  try {
    const value = await syncReq("GET", `/auth/portal-state/${encodeURIComponent(key)}`);
    const finalValue = value === null || value === undefined ? fallback : value;
    localStorage.setItem(storageKey, JSON.stringify(finalValue));
    return finalValue;
  } catch {
    try { return JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(fallback)); }
    catch { return fallback; }
  }
}

async function pushState(key, value) {
  return syncReq("PUT", `/auth/portal-state/${encodeURIComponent(key)}`, { value });
}

export async function hydratePortalState() {
  try {
    const users = await syncReq("GET", "/auth/all-users");
    if (Array.isArray(users)) localStorage.setItem("users", JSON.stringify(users));
  } catch {}

  await pullState("tenants", "tenants", {});
  await pullState("tenantAccessCodes", "tenantAccessCodes", {});

  try {
    const allAllocations = await pullState("allocations", "clientAllocations_server_map", {});
    if (allAllocations && typeof allAllocations === "object") {
      Object.entries(allAllocations).forEach(([key, value]) => {
        try { localStorage.setItem(key, JSON.stringify(value || {})); } catch (_) {}
      });
    }
  } catch {}
}

export async function syncLocalPortalState() {
  try {
    const users = JSON.parse(localStorage.getItem("users") || "[]");
    await syncReq("POST", "/auth/sync-users", { users });
  } catch {}

  try { await pushState("tenants", JSON.parse(localStorage.getItem("tenants") || "{}")); } catch {}
  try { await pushState("tenantAccessCodes", JSON.parse(localStorage.getItem("tenantAccessCodes") || "{}")); } catch {}

  try {
    const allocationMap = JSON.parse(localStorage.getItem("clientAllocations_server_map") || "{}");
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("clientAllocations_")) {
        try { allocationMap[key] = JSON.parse(localStorage.getItem(key) || "{}"); } catch (_) {}
      }
    });
    localStorage.setItem("clientAllocations_server_map", JSON.stringify(allocationMap));
    await pushState("allocations", allocationMap);
  } catch {}
}

/* ══════════════════════════════════════════════════════════════════
   ROLE CHECKS
══════════════════════════════════════════════════════════════════ */
export function isSuperAdmin(user) {
  return user?.email === SUPER_ADMIN_EMAIL || user?.role === "superadmin";
}

export function isTenantAdmin(user) {
  return user?.role === "admin" && !isSuperAdmin(user);
}

export function isTeamMember(user) {
  return user?.role === "team";
}

/** Your internal staff — no tenantId, isInternal=true */
export function isInternalUser(user) {
  if (isSuperAdmin(user)) return true;
  return !user?.tenantId || user?.isInternal === true;
}

/** A user that belongs to a client company */
export function isClientUser(user) {
  return !!user?.tenantId && !isSuperAdmin(user);
}

/* ══════════════════════════════════════════════════════════════════
   TENANT & SUB-TENANT IDs
══════════════════════════════════════════════════════════════════ */
export function getTenantId(user) {
  if (isSuperAdmin(user)) return null;
  return user?.tenantId || null;
}

/**
 * getSubTenantId — used for all MongoDB API queries.
 * - SuperAdmin / Internal staff → null (no data scoping, sees everything)
 * - Client admin                → their subTenantId
 * - Client team member          → their admin's subTenantId
 */
export function getSubTenantId(user) {
  if (!user)              return null;
  if (isSuperAdmin(user)) return null;
  if (isInternalUser(user)) return null;

  /* Client team member */
  if (user?.role === "team" && user?.tenantId) {
    if (user?.subTenantId) return user.subTenantId;
    const ownerEmail = user?.ownerAdminEmail;
    if (ownerEmail) {
      const all   = getAllUsers();
      const admin = all.find(
        u => String(u.email).trim().toLowerCase() ===
             String(ownerEmail).trim().toLowerCase()
      );
      if (admin?.subTenantId) return admin.subTenantId;
    }
    return user?.tenantId || null;
  }

  /* Client admin */
  return user?.subTenantId || user?.tenantId || null;
}

/* ══════════════════════════════════════════════════════════════════
   LOCALSTORAGE HELPERS
══════════════════════════════════════════════════════════════════ */
export function tenantKey(key, tenantId) {
  if (!tenantId) return key;
  return `${key}__${tenantId}`;
}

export function getTenantData(key, tenantId, fallback = null) {
  try {
    const raw = localStorage.getItem(tenantKey(key, tenantId));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function setTenantData(key, tenantId, value) {
  localStorage.setItem(tenantKey(key, tenantId), JSON.stringify(value));
}

/* ══════════════════════════════════════════════════════════════════
   USERS
══════════════════════════════════════════════════════════════════ */
export function getAllUsers() {
  fireAndForget(
    syncReq("GET", "/auth/all-users").then((users) => {
      if (Array.isArray(users)) localStorage.setItem("users", JSON.stringify(users));
    })
  );
  try {
    return JSON.parse(localStorage.getItem("users") || "[]");
  } catch {
    return [];
  }
}

export function saveAllUsers(users) {
  localStorage.setItem("users", JSON.stringify(users));
  fireAndForget(syncReq("POST", "/auth/sync-users", { users }));
}

/** Returns users visible to `viewer` based on their role */
export function getVisibleUsers(viewer) {
  const all = getAllUsers();
  if (isSuperAdmin(viewer)) return all;

  /* Client admin: only their own company */
  if (viewer?.tenantId) {
    return all.filter(u => u.tenantId === viewer.tenantId);
  }

  /* Internal (your team): internal users only */
  return all.filter(u => !u.tenantId && !isSuperAdmin(u));
}

/* ══════════════════════════════════════════════════════════════════
   TENANTS (client companies)
══════════════════════════════════════════════════════════════════ */
export function getAllTenants() {
  fireAndForget(pullState("tenants", "tenants", {}));
  try {
    return JSON.parse(localStorage.getItem("tenants") || "{}");
  } catch {
    return {};
  }
}

export function saveTenant(tenantId, tenantData) {
  const tenants = getAllTenants();
  tenants[tenantId] = tenantData;
  localStorage.setItem("tenants", JSON.stringify(tenants));
  fireAndForget(pushState("tenants", tenants));
}

export function deleteTenant(tenantId) {
  const tenants = getAllTenants();
  delete tenants[tenantId];
  localStorage.setItem("tenants", JSON.stringify(tenants));
  fireAndForget(pushState("tenants", tenants));
}

export function generateTenantId(orgName) {
  return (
    String(orgName || "org")
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20) +
    "_" +
    Date.now().toString(36)
  );
}

/* ══════════════════════════════════════════════════════════════════
   TENANT ACCESS CODES (TAC)
   You generate these in SuperAdmin panel.
   You send the code to the client company.
   They use it on the "Company Register" tab to create their account.

   KEY FIX: generateTenantAccessCode() now returns UPPERCASE so the
   key saved in localStorage matches validateTenantAccessCode()'s
   .toUpperCase() lookup — they were mismatching before causing
   "invalid or expired" errors even for brand new codes.
══════════════════════════════════════════════════════════════════ */
export function generateTenantAccessCode(label) {
  const slug = String(label || "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 8) || "client";
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  /*
   * FIX: Return the entire code in UPPERCASE.
   * Previously returned "TAC-client-AB12CD" (mixed case).
   * validateTenantAccessCode does codes[code.toUpperCase()] to look up,
   * so the stored key MUST be uppercase to match.
   */
  return `TAC-${slug}-${rand}`.toUpperCase();
}

export function getAllTenantAccessCodes() {
  try {
    return JSON.parse(localStorage.getItem("tenantAccessCodes") || "{}");
  } catch {
    return {};
  }
}

export function saveTenantAccessCode(code, data) {
  const codes = getAllTenantAccessCodes();
  /*
   * FIX: Always store under the UPPERCASE key so lookup always matches.
   * Also normalise the `code` field inside the data object.
   */
  const upperCode = String(code || "").toUpperCase();
  codes[upperCode] = { ...data, code: upperCode };
  localStorage.setItem("tenantAccessCodes", JSON.stringify(codes));
  fireAndForget(pushState("tenantAccessCodes", codes));
}

export function deleteTenantAccessCode(code) {
  const codes = getAllTenantAccessCodes();
  /* Delete by uppercase key to be safe */
  const upperCode = String(code || "").toUpperCase();
  delete codes[upperCode];
  /* Also delete the original-case key in case it was stored that way (legacy) */
  delete codes[code];
  localStorage.setItem("tenantAccessCodes", JSON.stringify(codes));
  fireAndForget(pushState("tenantAccessCodes", codes));
}

/**
 * Returns the code entry if valid and unused, null otherwise.
 * Looks up by UPPERCASE key — now matches how codes are stored.
 */
export function validateTenantAccessCode(code) {
  const codes     = getAllTenantAccessCodes();
  const upperCode = String(code || "").trim().toUpperCase();

  /*
   * Primary lookup: uppercase key (new, correct storage)
   * Fallback lookup: try mixed-case keys in case of legacy data
   */
  let entry = codes[upperCode];

  if (!entry) {
    /* Legacy fallback: scan all keys case-insensitively */
    const legacyKey = Object.keys(codes).find(
      k => k.toUpperCase() === upperCode
    );
    if (legacyKey) entry = codes[legacyKey];
  }

  if (!entry)                                              return null;
  if (entry.used)                                          return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt)    return null;
  return entry;
}

/**
 * Migrate any old mixed-case TAC codes in localStorage to uppercase keys.
 * Call this once on app startup or from the SuperAdmin panel.
 * Returns the number of codes migrated.
 */
export function migrateTenantAccessCodesToUppercase() {
  try {
    const codes    = getAllTenantAccessCodes();
    const migrated = {};
    let   count    = 0;

    Object.entries(codes).forEach(([key, val]) => {
      const upperKey = key.toUpperCase();
      migrated[upperKey] = { ...val, code: upperKey };
      if (upperKey !== key) count++;
    });

    localStorage.setItem("tenantAccessCodes", JSON.stringify(migrated));
    fireAndForget(pushState("tenantAccessCodes", migrated));
    return count;
  } catch (e) {
    console.warn("migrateTenantAccessCodesToUppercase:", e);
    return 0;
  }
}

/* ══════════════════════════════════════════════════════════════════
   ADMIN ACCESS CODES
   Client admins share these with their team members.
══════════════════════════════════════════════════════════════════ */
export function generateAdminAccessCode(adminName, adminEmail, tenantId) {
  const n = String(adminName  || "admin").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 6) || "admin";
  const m = String(adminEmail || "").toLowerCase().split("@")[0].replace(/[^a-z0-9]+/g, "").slice(0, 6) || "user";
  const t = String(tenantId   || "org").replace(/[^a-zA-Z0-9]+/g, "").slice(0, 6) || "org";
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${t}-${n}-${m}-${r}`;
}

export function findAdminByAccessCode(code, users) {
  const clean = String(code || "").trim();
  return users.find(u => u.role === "admin" && u.adminAccessCode === clean) || null;
}

/* ══════════════════════════════════════════════════════════════════
   REGISTRATION FUNCTIONS
══════════════════════════════════════════════════════════════════ */

/**
 * Register YOUR internal staff.
 * No code needed. You approve from Manage Users.
 */
export function registerInternalStaff({ name, email, password }) {
  const users     = getAllUsers();
  const normEmail = String(email || "").trim().toLowerCase();

  if (!name || !normEmail || !password)
    return { error: "All fields are required." };
  if (password.length < 6)
    return { error: "Password must be at least 6 characters." };
  if (users.find(u => String(u.email).trim().toLowerCase() === normEmail))
    return { error: "Email already registered." };

  const user = {
    name,
    email:       normEmail,
    password,
    role:        "team",
    status:      "pending",
    tenantId:    null,
    subTenantId: null,
    isInternal:  true,
    ownerAdminEmail:     null,
    createdByAdminEmail: null,
    registeredAt: new Date().toLocaleString("en-IN"),
  };

  saveAllUsers([...users, user]);
  return { success: true, user };
}

/**
 * Register a CLIENT COMPANY ADMIN.
 * Requires a Tenant Access Code (TAC) that you generated.
 * Account is pending until you approve in SuperAdmin panel.
 */
export function registerClientAdmin({ name, email, password, orgName, tenantAccessCode }) {
  const users     = getAllUsers();
  const normEmail = String(email || "").trim().toLowerCase();
  const normCode  = String(tenantAccessCode || "").trim().toUpperCase();

  if (!name || !normEmail || !password || !orgName || !normCode)
    return { error: "All fields are required." };
  if (password.length < 6)
    return { error: "Password must be at least 6 characters." };
  if (users.find(u => String(u.email).trim().toLowerCase() === normEmail))
    return { error: "Email already registered." };

  const codeEntry = validateTenantAccessCode(normCode);
  if (!codeEntry)
    return { error: "Invalid or expired access code. Contact Tervies support." };

  const tenantId        = generateTenantId(orgName);
  const subTenantId     = tenantId;
  const adminAccessCode = generateAdminAccessCode(name, normEmail, tenantId);

  /* Mark code as used — store under uppercase key */
  const codes = getAllTenantAccessCodes();
  const storedKey = Object.keys(codes).find(k => k.toUpperCase() === normCode) || normCode;
  codes[storedKey] = {
    ...codes[storedKey],
    used:   true,
    usedBy: normEmail,
    usedAt: Date.now(),
  };
  localStorage.setItem("tenantAccessCodes", JSON.stringify(codes));
  fireAndForget(pushState("tenantAccessCodes", codes));

  /* Create tenant record */
  saveTenant(tenantId, {
    name:        orgName,
    adminEmail:  normEmail,
    tenantId,
    subTenantId,
    active:      false,
    createdAt:   new Date().toLocaleString("en-IN"),
    adminAccessCode,
    accessCodeUsed: normCode,
  });

  /* Create user */
  const user = {
    name,
    email:       normEmail,
    password,
    role:        "admin",
    status:      "pending",
    tenantId,
    subTenantId,
    isInternal:  false,
    orgName,
    adminAccessCode,
    ownerAdminEmail:     normEmail,
    createdByAdminEmail: normEmail,
    registeredAt: new Date().toLocaleString("en-IN"),
  };

  saveAllUsers([...users, user]);
  return { success: true, user, tenantId, adminAccessCode };
}

/**
 * Register a CLIENT TEAM MEMBER.
 * Requires the adminAccessCode from their company admin.
 * The company admin approves them.
 */
export function registerClientTeam({ name, email, password, adminAccessCode }) {
  const users     = getAllUsers();
  const normEmail = String(email || "").trim().toLowerCase();

  if (!name || !normEmail || !password)
    return { error: "All fields are required." };
  if (password.length < 6)
    return { error: "Password must be at least 6 characters." };
  if (users.find(u => String(u.email).trim().toLowerCase() === normEmail))
    return { error: "Email already registered." };
  if (!adminAccessCode || !adminAccessCode.trim())
    return { error: "Please enter the access code your admin gave you." };

  const linkedAdmin = findAdminByAccessCode(adminAccessCode.trim(), users);
  if (!linkedAdmin)
    return { error: "Invalid access code. Please check with your admin." };
  if (linkedAdmin.status !== "approved")
    return { error: "Your admin account is not yet active. Please wait for Tervies to approve it." };

  const user = {
    name,
    email:       normEmail,
    password,
    role:        "team",
    status:      "pending",
    tenantId:    linkedAdmin.tenantId    || null,
    subTenantId: linkedAdmin.subTenantId || null,
    isInternal:  false,
    orgName:     linkedAdmin.orgName     || "",
    ownerAdminEmail:     String(linkedAdmin.email).trim().toLowerCase(),
    createdByAdminEmail: String(linkedAdmin.email).trim().toLowerCase(),
    joinedViaAdminCode:  adminAccessCode.trim(),
    registeredAt: new Date().toLocaleString("en-IN"),
  };

  saveAllUsers([...users, user]);
  return { success: true, user };
}

/* ══════════════════════════════════════════════════════════════════
   APPROVAL / REVOKE / REJECT
══════════════════════════════════════════════════════════════════ */

/** Approve a client admin → activates their tenant */
export function approveClientAdmin(email) {
  const users   = getAllUsers();
  const tenants = getAllTenants();
  saveAllUsers(users.map(u => {
    if (String(u.email).trim().toLowerCase() !== String(email).trim().toLowerCase()) return u;
    if (u.tenantId && tenants[u.tenantId]) {
      tenants[u.tenantId].active = true;
      localStorage.setItem("tenants", JSON.stringify(tenants));
      fireAndForget(pushState("tenants", tenants));
    }
    return { ...u, status: "approved", subTenantId: u.subTenantId || u.tenantId };
  }));
}

/** Approve your internal staff */
export function approveInternalStaff(email) {
  saveAllUsers(
    getAllUsers().map(u =>
      String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase()
        ? { ...u, status: "approved" }
        : u
    )
  );
}

/** Approve a client team member → copies subTenantId from their admin */
export function approveClientTeam(email) {
  const users  = getAllUsers();
  const target = users.find(
    u => String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase()
  );
  if (!target) return;

  let sub = target.subTenantId;
  if (!sub && target.ownerAdminEmail) {
    const admin = users.find(
      u => String(u.email).trim().toLowerCase() ===
           String(target.ownerAdminEmail).trim().toLowerCase()
    );
    sub = admin?.subTenantId || admin?.tenantId || target.tenantId;
  }

  saveAllUsers(
    users.map(u =>
      String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase()
        ? { ...u, status: "approved", subTenantId: sub }
        : u
    )
  );
}

export function revokeUser(email) {
  saveAllUsers(
    getAllUsers().map(u =>
      String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase()
        ? { ...u, status: "pending" }
        : u
    )
  );
}

export function rejectUser(email) {
  saveAllUsers(
    getAllUsers().map(u =>
      String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase()
        ? { ...u, status: "rejected" }
        : u
    )
  );
}

/* ══════════════════════════════════════════════════════════════════
   ALLOCATIONS
══════════════════════════════════════════════════════════════════ */
export function getAllocationsForAdmin(adminEmail) {
  if (!adminEmail) return {};
  try {
    return JSON.parse(
      localStorage.getItem(`clientAllocations_${String(adminEmail).trim().toLowerCase()}`) || "{}"
    );
  } catch { return {}; }
}

export function getAdminEmailForTenant(tenantId) {
  if (!tenantId) return null;
  try { return getAllTenants()[tenantId]?.adminEmail || null; }
  catch { return null; }
}

/* ══════════════════════════════════════════════════════════════════
   MIGRATION — for old accounts missing subTenantId / adminAccessCode
══════════════════════════════════════════════════════════════════ */
export function patchMissingSubTenantId(email) {
  try {
    const users = getAllUsers();
    const user  = users.find(
      u => String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase()
    );
    if (!user || user.subTenantId || user.role !== "admin") return;

    const tenants     = getAllTenants();
    const isMain      =
      String(tenants[user.tenantId]?.adminEmail || "").trim().toLowerCase() ===
      String(email).trim().toLowerCase();
    const subTenantId = isMain
      ? user.tenantId
      : generateTenantId((user.name || "sub").replace(/\s+/g, "_") + "_sub");

    saveAllUsers(
      users.map(u =>
        String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase()
          ? { ...u, subTenantId }
          : u
      )
    );
    return subTenantId;
  } catch (e) {
    console.warn("patchMissingSubTenantId:", e);
  }
}

export function patchMissingAccessCode(email, tenantId) {
  try {
    const users   = getAllUsers();
    const tenants = getAllTenants();
    const user    = users.find(
      u => String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase()
    );
    if (!user || !tenantId || user.adminAccessCode) return user?.adminAccessCode;

    const code = generateAdminAccessCode(user.name || "", email, tenantId);
    saveAllUsers(
      users.map(u =>
        String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase()
          ? { ...u, adminAccessCode: code }
          : u
      )
    );
    if (tenants[tenantId] && !tenants[tenantId].adminAccessCode) {
      tenants[tenantId].adminAccessCode = code;
      localStorage.setItem("tenants", JSON.stringify(tenants));
    }
    return code;
  } catch (e) {
    console.warn("patchMissingAccessCode:", e);
  }
}
