// src/api/api.js

const LOCAL_API = "http://localhost:5002/api";
const SERVER_API = "https://profeix.info/api";

export const BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? LOCAL_API
    : SERVER_API;

function getToken() {
  try {
    const u = JSON.parse(sessionStorage.getItem("currentUser") || "{}");
    if (u?.token) return u.token;

    return (
      sessionStorage.getItem("token") ||
      sessionStorage.getItem("authToken") ||
      sessionStorage.getItem("jwt") ||
      ""
    );
  } catch {
    return "";
  }
}

async function req(method, path, body = null, isFormData = false) {
  const token = getToken();
  const headers = {};

  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!isFormData && body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }

  return data;
}

export const authAPI = {
  login: (body) => req("POST", "/auth/login", body),
  register: (body) => req("POST", "/auth/register", body),
  sync: (body) => req("POST", "/auth/sync", body),
  getMe: () => req("GET", "/auth/me"),
  getUsers: () => req("GET", "/auth/users"),
  getAllUsers: () => req("GET", "/auth/all-users"),
  syncUsers: (users) => req("POST", "/auth/sync-users", { users }),
  updateUser: (id, body) => req("PATCH", `/auth/users/${id}`, body),
};

export const uploadAPI = {
  uploadExcel: async (file, clientName, tenantId) => {
    const form = new FormData();
    form.append("file", file);

    if (clientName) form.append("clientName", clientName);
    if (tenantId) form.append("tenantId", tenantId);

    return req("POST", "/upload", form, true);
  },

  getRecords: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(
          ([, v]) => v !== undefined && v !== null && v !== ""
        )
      )
    ).toString();

    return req("GET", `/upload/records${qs ? `?${qs}` : ""}`);
  },

  addRecord: (body) => req("POST", "/upload/records", body),
  updateRecord: (id, body) => req("PATCH", `/upload/records/${id}`, body),
  deleteRecord: (id) => req("DELETE", `/upload/records/${id}`),
  deleteBatch: (batchId) => req("DELETE", `/upload/batch/${batchId}`),
  getStats: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
      )
    ).toString();
    return req("GET", `/upload/stats${qs ? `?${qs}` : ""}`);
  },
  getNameLists: () => req("GET", "/upload/name-lists"),

  // Lightweight — {status + every possible completed-date field name} only,
  // no rawData/PII. Powers the Dashboard's Daily Closed Cases widget so it
  // doesn't have to download every field of every closed record just to
  // group them by date.
  getClosedCasesSummary: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
      )
    ).toString();
    return req("GET", `/upload/records/closed-summary${qs ? `?${qs}` : ""}`);
  },
  getReportStatus: (since) =>
    req("GET", `/upload/report-status${since ? `?since=${encodeURIComponent(since)}` : ""}`),

  getSentReports:  ()              => req("GET",  "/upload/sent-reports"),
  markReportSent:  (recordId, channel = "email") => req("POST", "/upload/mark-sent", { recordId, channel }),
  sendCaseMail:    (body)          => req("POST", "/upload/send-mail", body),
  sendValidationMail: (body)       => req("POST", "/upload/send-validation-mail", body),
  getMailConfigs:  ()              => req("GET",  "/upload/mail-configs"),

  uploadReportFile: async (file, recordId) => {
    const form = new FormData();
    form.append("file", file);
    form.append("recordId", recordId);

    return req("POST", "/upload/report-file", form, true);
  },

  // Resolves the actual openable URL for a record's report — S3 presigned
  // URL if migrated, legacy local path otherwise. Must be called fresh each
  // time (a presigned URL expires), never stored/reused.
  getReportViewUrl: (recordId) => req("GET", `/upload/report-file/${recordId}`),
};

// Stage 1 — read-only per-admin inbox. Mailbox scoping is resolved entirely
// server-side from the authenticated user; nothing here selects or sends a
// mailbox identity.
// Appends ?accountId=X (or &accountId=X if the url already has a query
// string) when accountId is truthy — used by every inboxAPI call below so
// Super Admin/Manager can pick which of their configured mail accounts a
// request applies to. Omitted entirely (server just uses its own default
// resolution) when accountId is falsy, so nothing changes for anyone who
// never switches — same original single-mailbox behavior.
function withAccountId(url, accountId) {
  if (!accountId) return url;
  return `${url}${url.includes("?") ? "&" : "?"}accountId=${encodeURIComponent(accountId)}`;
}

export const inboxAPI = {
  // Lists the mail accounts the current user can switch between (empty
  // array for anyone who isn't Super Admin/Manager — no switcher to show).
  listAccounts: () => req("GET", "/inbox/accounts"),

  listMessages: (limit = 50, accountId = "") =>
    req("GET", withAccountId(`/inbox/messages?limit=${encodeURIComponent(limit)}`, accountId)),
  // peek: true fetches content without marking the message read — used for
  // background prefetching so silently pre-loading content ahead of a click
  // never marks unread mail as read on the user's behalf.
  getMessage: (uid, { peek = false, accountId = "" } = {}) =>
    req("GET", withAccountId(`/inbox/messages/${encodeURIComponent(uid)}${peek ? "?peek=true" : ""}`, accountId)),

  // Attachment endpoint needs the same Bearer auth as every other call, so a
  // plain <a href> won't work — fetch it as a blob instead and hand back an
  // object URL the caller can assign to a download link, then revoke.
  fetchAttachmentBlob: async (uid, index, accountId = "") => {
    const token = getToken();
    const res = await fetch(
      withAccountId(`${BASE}/inbox/messages/${encodeURIComponent(uid)}/attachments/${encodeURIComponent(index)}`, accountId),
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return res.blob();
  },

  // Stage 2 — sends from the same mailbox the reply-er is scoped to read.
  // Switches to multipart when attachments are present (File objects from
  // an <input type="file">); plain JSON otherwise — same pattern as
  // uploadReportFile above.
  sendReply: (uid, { to, cc, subject, text, inReplyTo, attachments = [], accountId = "" } = {}) => {
    const url = withAccountId(`/inbox/messages/${encodeURIComponent(uid)}/reply`, accountId);
    if (attachments.length > 0) {
      const form = new FormData();
      form.append("to", to || "");
      if (cc) form.append("cc", cc);
      form.append("subject", subject || "");
      form.append("text", text || "");
      form.append("inReplyTo", inReplyTo || "");
      attachments.forEach((file) => form.append("attachments", file));
      return req("POST", url, form, true);
    }
    return req("POST", url, { to, cc, subject, text, inReplyTo });
  },

  // Manual read/unread toggle, independent of the automatic mark-as-read
  // that happens when a message is opened.
  setReadState: (uid, read, accountId = "") =>
    req("POST", withAccountId(`/inbox/messages/${encodeURIComponent(uid)}/read`, accountId), { read }),

  // A fresh (non-reply) email — the backend enforces that `to` must already
  // appear as a sender somewhere in this mailbox, regardless of what the
  // frontend sends.
  compose: ({ to, cc, subject, text, attachments = [], accountId = "" } = {}) => {
    const url = withAccountId("/inbox/compose", accountId);
    if (attachments.length > 0) {
      const form = new FormData();
      form.append("to", to || "");
      if (cc) form.append("cc", cc);
      form.append("subject", subject || "");
      form.append("text", text || "");
      attachments.forEach((file) => form.append("attachments", file));
      return req("POST", url, form, true);
    }
    return req("POST", url, { to, cc, subject, text });
  },
};

export const clientAPI = {
  getAll: () => req("GET", "/clients"),
  create: (body) => req("POST", "/clients", body),
};

export const pricingAPI = {
  getAll: () => req("GET", "/pricing"),
  saveAll: (pricingRules) => req("PUT", "/pricing", { pricingRules }),
  saveScope: (scopeKey, rules) =>
    req("PATCH", `/pricing/${encodeURIComponent(scopeKey)}`, { rules }),
  deleteScope: (scopeKey) =>
    req("DELETE", `/pricing/${encodeURIComponent(scopeKey)}`),
  getRate: (body) => req("POST", "/pricing/get-rate", body),
  bulkImportContacts: async (file) => {
    const form = new FormData();
    form.append("file", file);
    return req("POST", "/pricing/bulk-import-contacts", form, true);
  },
};

export const dailyUploadsAPI = {
  save: (file, { totalRows, importedRows, tenantId, dailyUploadId = "" }) => {
    const form = new FormData();
    form.append("file", file);
    form.append("totalRows",      String(totalRows    || 0));
    form.append("importedRows",   String(importedRows || 0));
    form.append("tenantId",       tenantId || "");
    form.append("dailyUploadId",  dailyUploadId || "");
    return req("POST", "/daily-uploads", form, true);
  },

  list: () => req("GET", "/daily-uploads"),

  deleteDailyUpload: (id) => req("DELETE", `/daily-uploads/${id}`),

  download: async (id, filename) => {
    const token = getToken();
    const res = await fetch(`${BASE}/daily-uploads/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename || "daily-upload.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const exportAPI = {
  sendReport: (body) => req("POST", "/export/send", body),
};

export const auditAPI = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
      )
    ).toString();
    return req("GET", `/audit${qs ? `?${qs}` : ""}`);
  },
};

export const clientContactsAPI = {
  list:        ()       => req("GET",    "/client-contacts"),
  create:      (body)   => req("POST",   "/client-contacts", body),
  update:      (id, b)  => req("PUT",    `/client-contacts/${id}`, b),
  remove:      (id)     => req("DELETE", `/client-contacts/${id}`),
  lookup:      (clientName) => req("GET", `/client-contacts/lookup?clientName=${encodeURIComponent(clientName)}`),
  bulkImport: async (file) => {
    const form = new FormData();
    form.append("file", file);
    return req("POST", "/client-contacts/bulk-import", form, true);
  },
};

export const vendorContactsAPI = {
  list:        ()       => req("GET",    "/vendor-contacts"),
  create:      (body)   => req("POST",   "/vendor-contacts", body),
  update:      (id, b)  => req("PUT",    `/vendor-contacts/${id}`, b),
  remove:      (id)     => req("DELETE", `/vendor-contacts/${id}`),
  getSettings: ()       => req("GET",    "/vendor-contacts/settings"),
  saveSettings:(body)   => req("PUT",    "/vendor-contacts/settings", body),
  getSendLog:  ()       => req("GET",    "/vendor-contacts/send-log"),
  triggerSend: (cases)  => req("POST",   "/vendor-contacts/trigger-send", { cases }),
  bulkImport: async (file) => {
    const form = new FormData();
    form.append("file", file);
    return req("POST", "/vendor-contacts/bulk-import", form, true);
  },
};

export const tenantSyncAPI = {
  getUsers: () => req("GET", "/auth/all-users"),
  syncUsers: (users) => req("POST", "/auth/sync-users", { users }),

  getState: (key) =>
    req("GET", `/auth/portal-state/${encodeURIComponent(key)}`),

  saveState: (key, value) =>
    req("PUT", `/auth/portal-state/${encodeURIComponent(key)}`, { value }),

  getTenants: () => req("GET", "/auth/portal-state/tenants"),
  syncTenants: (tenants) =>
    req("PUT", "/auth/portal-state/tenants", { value: tenants }),

  getTenantAccessCodes: () =>
    req("GET", "/auth/portal-state/tenantAccessCodes"),

  syncTenantAccessCodes: (codes) =>
    req("PUT", "/auth/portal-state/tenantAccessCodes", { value: codes }),

  getAllocations: () => req("GET", "/auth/portal-state/allocations"),

  syncAllocations: (allocations) =>
    req("PUT", "/auth/portal-state/allocations", { value: allocations }),

  // Atomic, additive save — merges only the given keys server-side instead
  // of replacing the whole allocations document. Avoids the read-modify-write
  // race that syncAllocations (above) has: two saves racing could otherwise
  // silently drop a key (e.g. a checkAllocations_* entry) that landed a
  // moment earlier from a different action.
  patchAllocations: (patch) =>
    req("PATCH", "/auth/portal-state/allocations", { patch }),
};

// Daily Follow-Up — Super Admin's internal team only (Super Admin, Manager,
// TL, internal Team). Each person owns one fully free-form sheet (their own
// columns, their own rows). Super Admin/Manager can additionally browse and
// read-only view any team member's sheet; TL/Team only ever have their own,
// enforced server-side regardless of what's called here.
export const dailyFollowUpAPI = {
  getMySheet: () => req("GET", "/daily-followups/sheet"),
  saveMySheet: (columns, rows) => req("PUT", "/daily-followups/sheet", { columns, rows }),
  listSheets: () => req("GET", "/daily-followups/sheets"),
  getMemberSheet: (email) => req("GET", `/daily-followups/sheets/${encodeURIComponent(email)}`),
};

// Digital Address — now just another check type living in the main Records
// collection (Check Name = "Digital Address"), same as Court/CIBIL/Passport.
// The only dedicated API left is fetching a submitted report's presigned
// evidence URLs; case creation/listing/TAT all go through the normal
// records/upload APIs already used for every other check type. Super admin +
// their internal team only (enforced server-side too).
export const digitalAddressAPI = {
  getReport: (recordId) => req("GET", `/digital-address/report/${recordId}`),
};