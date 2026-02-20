const express = require('express');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const STORAGE_MODE = process.env.STORAGE_MODE === 'postgres' ? 'postgres' : 'json';
const DATABASE_URL = process.env.DATABASE_URL;
const APP_NAME = 'Narayan Enterprises';
const STARTED_AT = new Date();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ROLE_PERMISSIONS = {
  admin: ['*'],
  accountant: [
    'dashboard:view',
    'employees:view',
    'employees:create',
    'employees:update',
    'employees:delete',
    'attendance:view',
    'attendance:report',
    'salary:view',
    'salaryledger:view',
    'salaryledger:update',
    'advances:create',
    'trucks:view',
    'trucks:update',
    'trucks:delete',
    'expenses:view',
    'expenses:create',
    'expenses:update',
    'expenses:delete',
    'investments:view',
    'investments:create',
    'investments:update',
    'investments:delete',
    'chini:view',
    'chini:create',
    'chini:delete',
    'land:view',
    'land:create',
    'land:update',
    'land:delete',
    'vehicles:view',
    'vehicles:create',
    'vehicles:update',
    'vehicles:delete',
    'suppliers:view',
    'suppliers:create',
    'suppliers:update',
    'suppliers:delete',
    'billing:view',
    'billing:create',
    'billing:update',
    'billing:delete',
    'export:view',
    'salaryslip:view'
  ],
  manager: [
    'dashboard:view',
    'employees:view',
    'attendance:view',
    'attendance:create',
    'attendance:report',
    'salaryledger:view',
    'salaryledger:update',
    'trucks:view',
    'trucks:create',
    'trucks:update',
    'trucks:delete',
    'expenses:view',
    'expenses:create',
    'expenses:update',
    'expenses:delete',
    'investments:view',
    'investments:create',
    'investments:update',
    'investments:delete',
    'chini:view',
    'chini:create',
    'land:view',
    'land:create',
    'land:update',
    'vehicles:view',
    'vehicles:create',
    'vehicles:update',
    'vehicles:delete',
    'suppliers:view',
    'suppliers:create',
    'suppliers:update',
    'suppliers:delete',
    'billing:view',
    'billing:create',
    'billing:update',
    'billing:delete'
  ]
};

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function monthOf(dateStr) {
  return String(dateStr).slice(0, 7);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function daysInMonth(year, monthIndexZeroBased) {
  return new Date(Date.UTC(year, monthIndexZeroBased + 1, 0)).getUTCDate();
}

function parseISODate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeGstNo(gstNo) {
  return String(gstNo || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .trim();
}

function normalizePhoneNumber(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) {
    return `+${raw.slice(1).replace(/\D+/g, '')}`;
  }
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return digits;
}

function isValidGstNo(gstNo) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalizeGstNo(gstNo));
}

function cleanInvoiceItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const quantity = Number(item.quantity);
      const rate = Number(item.rate);
      const gstPercent = Number(item.gstPercent ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(rate) || rate < 0) return null;
      const taxableValue = quantity * rate;
      const gstAmount = (taxableValue * Math.max(gstPercent, 0)) / 100;
      return {
        description: String(item.description || '').trim(),
        hsnSac: String(item.hsnSac || '').trim(),
        unit: String(item.unit || '').trim(),
        quantity,
        rate,
        gstPercent: Math.max(gstPercent, 0),
        taxableValue,
        gstAmount,
        lineTotal: taxableValue + gstAmount
      };
    })
    .filter((row) => row && row.description);
}

function calcInvoiceTotals(items) {
  const subtotal = items.reduce((sum, i) => sum + Number(i.taxableValue || 0), 0);
  const totalGst = items.reduce((sum, i) => sum + Number(i.gstAmount || 0), 0);
  const grandTotal = subtotal + totalGst;
  return { subtotal, totalGst, grandTotal };
}

function normalizeBillCompany(data) {
  return {
    gstNo: normalizeGstNo(data.gstNo),
    companyName: String(data.companyName || '').trim(),
    address: String(data.address || '').trim(),
    state: String(data.state || '').trim(),
    stateCode: String(data.stateCode || '').trim(),
    contactPerson: String(data.contactPerson || '').trim(),
    phone: String(data.phone || '').trim(),
    email: String(data.email || '').trim()
  };
}

function toSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSupplier(data) {
  const openingBalance = toSafeNumber(data.openingBalance, 0);
  return {
    name: String(data.name || '').trim(),
    phone: normalizePhoneNumber(data.phone || data.contact || ''),
    alternatePhone: normalizePhoneNumber(data.alternatePhone || ''),
    email: String(data.email || '').trim(),
    gstNo: normalizeGstNo(data.gstNo || ''),
    address: String(data.address || '').trim(),
    materialType: String(data.materialType || '').trim(),
    paymentTerms: String(data.paymentTerms || '').trim(),
    openingBalance
  };
}

function normalizeSupplierTransaction(data, supplierId) {
  const type = String(data.type || '').trim().toLowerCase();
  const amount = toSafeNumber(data.amount, 0);
  const quantity = data.quantity == null || data.quantity === '' ? null : toSafeNumber(data.quantity, NaN);
  const rate = data.rate == null || data.rate === '' ? null : toSafeNumber(data.rate, NaN);
  const paidNow = data.paidNow == null || data.paidNow === '' ? 0 : toSafeNumber(data.paidNow, NaN);
  return {
    supplierId,
    date: String(data.date || '').trim(),
    type,
    amount,
    truckNumber: String(data.truckNumber || '').trim(),
    challanNo: String(data.challanNo || '').trim(),
    material: String(data.material || '').trim(),
    quantity: Number.isFinite(quantity) ? quantity : null,
    rate: Number.isFinite(rate) ? rate : null,
    paidNow: Number.isFinite(paidNow) ? paidNow : NaN,
    paymentMode: String(data.paymentMode || '').trim(),
    paymentRef: String(data.paymentRef || '').trim(),
    note: String(data.note || '').trim(),
    isAutoPayment: Boolean(data.isAutoPayment),
    linkedTransactionId: String(data.linkedTransactionId || '').trim()
  };
}

function sortSupplierTransactionsChronological(rows) {
  return [...(rows || [])].sort((a, b) => {
    const aDate = String(a.date || '');
    const bDate = String(b.date || '');
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    const aTs = String(a.createdAt || '');
    const bTs = String(b.createdAt || '');
    if (aTs !== bTs) return aTs.localeCompare(bTs);
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function enrichSupplierTransactionsWithRunningBalance(supplier, rows) {
  const openingBalance = toSafeNumber(supplier?.openingBalance, 0);
  let runningBalance = openingBalance;
  const chronological = sortSupplierTransactionsChronological(rows);
  const withBalanceAsc = chronological.map((row) => {
    const amount = toSafeNumber(row.amount, 0);
    if (row.type === 'truck') runningBalance += amount;
    if (row.type === 'payment') runningBalance -= amount;
    return {
      ...row,
      balanceAfter: runningBalance
    };
  });
  return withBalanceAsc.sort((a, b) => {
    const aDate = String(a.date || '');
    const bDate = String(b.date || '');
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    const aTs = String(a.createdAt || '');
    const bTs = String(b.createdAt || '');
    if (aTs !== bTs) return bTs.localeCompare(aTs);
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

function moneyInr(value) {
  return `₹${toSafeNumber(value, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function sendSupplierSmsNotification({ supplier, message, meta }) {
  const phone = normalizePhoneNumber((supplier && supplier.phone) || '');
  if (!phone || !message) return { ok: false, skipped: true, reason: 'phone_or_message_missing' };

  const timeoutMs = Math.max(1000, toSafeNumber(process.env.SUPPLIER_SMS_TIMEOUT_MS, 7000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Twilio path
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_FROM_NUMBER;
    if (twilioSid && twilioToken && twilioFrom) {
      const body = new URLSearchParams();
      body.set('To', phone);
      body.set('From', twilioFrom);
      body.set('Body', message);
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioSid)}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString(),
        signal: controller.signal
      });
      if (response.ok) return { ok: true, provider: 'twilio' };
      const text = await response.text().catch(() => '');
      return { ok: false, provider: 'twilio', reason: text || `http_${response.status}` };
    }

    // Generic webhook path
    const webhookUrl = process.env.SUPPLIER_SMS_WEBHOOK_URL;
    if (!webhookUrl) return { ok: false, skipped: true, reason: 'provider_not_configured' };
    let headers = { 'Content-Type': 'application/json' };
    const customHeaders = process.env.SUPPLIER_SMS_WEBHOOK_HEADERS_JSON;
    if (customHeaders) {
      try {
        const parsed = JSON.parse(customHeaders);
        if (parsed && typeof parsed === 'object') headers = { ...headers, ...parsed };
      } catch (_err) {
        // Ignore malformed headers JSON.
      }
    }
    const response = await fetch(webhookUrl, {
      method: String(process.env.SUPPLIER_SMS_WEBHOOK_METHOD || 'POST').toUpperCase(),
      headers,
      body: JSON.stringify({
        to: phone,
        message,
        supplierId: supplier.id,
        supplierName: supplier.name,
        meta: meta || {}
      }),
      signal: controller.signal
    });
    if (response.ok) return { ok: true, provider: 'webhook' };
    const text = await response.text().catch(() => '');
    return { ok: false, provider: 'webhook', reason: text || `http_${response.status}` };
  } catch (err) {
    return { ok: false, reason: err?.message || 'sms_send_failed' };
  } finally {
    clearTimeout(timer);
  }
}

function extractExternalLookupPayload(responseJson) {
  if (!responseJson || typeof responseJson !== 'object') return null;
  const directCandidates = [
    responseJson.data,
    responseJson.result,
    responseJson.payload,
    responseJson.results,
    responseJson.taxpayer,
    responseJson
  ].filter(Boolean);
  for (const candidate of directCandidates) {
    if (candidate && typeof candidate === 'object') {
      return candidate;
    }
  }
  return null;
}

function buildAddressFromPayload(payload) {
  const addressObj =
    payload?.pradr?.addr ||
    payload?.principal_address ||
    payload?.principalAddress ||
    payload?.address ||
    payload?.addr ||
    null;

  if (typeof payload?.address === 'string' && payload.address.trim()) {
    return payload.address.trim();
  }
  if (!addressObj || typeof addressObj !== 'object') return '';

  const parts = [
    addressObj.bno,
    addressObj.flno,
    addressObj.bnm,
    addressObj.st,
    addressObj.loc,
    addressObj.city,
    addressObj.dst,
    addressObj.state,
    addressObj.pncd
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return parts.join(', ');
}

function mapExternalCompanyFromPayload(gstNo, payload) {
  if (!payload || typeof payload !== 'object') return null;
  const normalizedGst = normalizeGstNo(gstNo);
  const companyName = String(
    payload.companyName ||
      payload.legalName ||
      payload.legal_name ||
      payload.tradeNam ||
      payload.tradeName ||
      payload.lgnm ||
      payload.name ||
      ''
  ).trim();
  const address = String(buildAddressFromPayload(payload) || '').trim();
  const stateCode = String(
    payload.stateCode ||
      payload.state_code ||
      payload.pradr?.addr?.stcd ||
      payload.address?.stateCode ||
      normalizedGst.slice(0, 2) ||
      ''
  ).trim();
  const state = String(payload.state || payload.address?.state || '').trim();
  const contactPerson = String(payload.contactPerson || payload.contact_person || '').trim();
  const phone = String(payload.phone || payload.mobile || payload.mobileNo || '').trim();
  const email = String(payload.email || '').trim();

  if (!companyName || !address) return null;
  return normalizeBillCompany({
    gstNo: normalizedGst,
    companyName,
    address,
    state,
    stateCode,
    contactPerson,
    phone,
    email
  });
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch (_err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupGstOnline(gstNo) {
  const normalized = normalizeGstNo(gstNo);
  if (!isValidGstNo(normalized)) return null;

  const timeoutMs = Number(process.env.GST_LOOKUP_TIMEOUT_MS || 7000);

  // Generic provider support
  const templateUrl = process.env.GST_LOOKUP_URL_TEMPLATE;
  if (templateUrl) {
    const url = String(templateUrl)
      .replaceAll('{GSTIN}', encodeURIComponent(normalized))
      .replaceAll('${GSTIN}', encodeURIComponent(normalized));
    let headers = {};
    const headersJson = process.env.GST_LOOKUP_HEADERS_JSON;
    if (headersJson) {
      try {
        const parsed = JSON.parse(headersJson);
        if (parsed && typeof parsed === 'object') headers = parsed;
      } catch (_err) {
        // ignore malformed env header json
      }
    }
    const result = await fetchJsonWithTimeout(url, { headers }, timeoutMs);
    const mapped = mapExternalCompanyFromPayload(normalized, extractExternalLookupPayload(result));
    if (mapped) return mapped;
  }

  // ClearTax provider support (official docs based endpoint)
  const clearEntityId = process.env.CLEARTAX_TAXABLE_ENTITY_ID;
  const clearToken = process.env.CLEARTAX_AUTH_TOKEN;
  if (clearEntityId && clearToken) {
    const clearBase = (process.env.CLEARTAX_BASE_URL || 'https://api.clear.in').replace(/\/+$/, '');
    const url = `${clearBase}/gst/api/v0.2/taxable_entities/${encodeURIComponent(
      clearEntityId
    )}/gstin_verification?gstin=${encodeURIComponent(normalized)}`;
    const result = await fetchJsonWithTimeout(
      url,
      {
        headers: {
          'x-cleartax-auth-token': clearToken,
          Accept: 'application/json'
        }
      },
      timeoutMs
    );
    const mapped = mapExternalCompanyFromPayload(normalized, extractExternalLookupPayload(result));
    if (mapped) return mapped;
  }

  return null;
}

function userView(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    permissions: ROLE_PERMISSIONS[user.role] || []
  };
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function defaultUsers() {
  return [
    {
      id: 'user_admin',
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'admin'
    },
    {
      id: 'user_acc',
      username: 'accountant',
      passwordHash: bcrypt.hashSync('account123', 10),
      role: 'accountant'
    },
    {
      id: 'user_mgr',
      username: 'manager',
      passwordHash: bcrypt.hashSync('manager123', 10),
      role: 'manager'
    }
  ];
}

function ensureDbShape(db) {
  if (!Array.isArray(db.employees)) db.employees = [];
  if (!Array.isArray(db.attendance)) db.attendance = [];
  if (!Array.isArray(db.salaryAdvances)) db.salaryAdvances = [];
  if (!Array.isArray(db.salaryLedgers)) db.salaryLedgers = [];
  if (!Array.isArray(db.trucks)) db.trucks = [];
  if (!Array.isArray(db.expenses)) db.expenses = [];
  if (!Array.isArray(db.investments)) db.investments = [];
  if (!Array.isArray(db.chiniExpenses)) db.chiniExpenses = [];
  if (!Array.isArray(db.landRecords)) db.landRecords = [];
  if (!Array.isArray(db.vehicles)) db.vehicles = [];
  if (!Array.isArray(db.billingCompanies)) db.billingCompanies = [];
  if (!Array.isArray(db.bills)) db.bills = [];
  if (!Array.isArray(db.users) || db.users.length === 0) db.users = defaultUsers();
  if (!Array.isArray(db.sessions)) db.sessions = [];
  if (!Array.isArray(db.suppliers)) db.suppliers = [];
  if (!Array.isArray(db.supplierTransactions)) db.supplierTransactions = [];

  let changed = false;
  db.users = db.users.map((u) => {
    if (u.passwordHash) return u;
    if (u.password) {
      changed = true;
      return {
        id: u.id || uid('user'),
        username: u.username,
        passwordHash: bcrypt.hashSync(String(u.password), 10),
        role: u.role || 'manager'
      };
    }
    changed = true;
    return {
      id: u.id || uid('user'),
      username: u.username,
      passwordHash: bcrypt.hashSync('changeme123', 10),
      role: u.role || 'manager'
    };
  });

  return { db, changed };
}

function readJsonDb() {
  if (!fs.existsSync(DB_PATH)) {
    const ensured = ensureDbShape({});
    fs.writeFileSync(DB_PATH, JSON.stringify(ensured.db, null, 2));
    return ensured.db;
  }

  const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const ensured = ensureDbShape(raw);
  if (ensured.changed) {
    fs.writeFileSync(DB_PATH, JSON.stringify(ensured.db, null, 2));
  }
  return ensured.db;
}

function writeJsonDb(db) {
  const ensured = ensureDbShape(db);
  fs.writeFileSync(DB_PATH, JSON.stringify(ensured.db, null, 2));
}

function jsonStore() {
  return {
    mode: 'json',
    async init() {
      readJsonDb();
    },
    async healthCheck() {
      const db = readJsonDb();
      return {
        ok: true,
        details: {
          storage: 'json',
          employees: db.employees.length,
          sessions: db.sessions.length
        }
      };
    },
    async getUserByUsername(username) {
      const db = readJsonDb();
      return db.users.find((u) => u.username === username) || null;
    },
    async getUserById(id) {
      const db = readJsonDb();
      return db.users.find((u) => u.id === id) || null;
    },
    async updateUserPassword(userId, passwordHash) {
      const db = readJsonDb();
      const user = db.users.find((u) => u.id === userId);
      if (!user) return false;
      user.passwordHash = passwordHash;
      writeJsonDb(db);
      return true;
    },
    async createSession(token, userId, expiresAt) {
      const db = readJsonDb();
      db.sessions.push({ token, userId, createdAt: new Date().toISOString(), expiresAt });
      writeJsonDb(db);
    },
    async getSession(token) {
      const db = readJsonDb();
      return db.sessions.find((s) => s.token === token) || null;
    },
    async deleteSession(token) {
      const db = readJsonDb();
      db.sessions = db.sessions.filter((s) => s.token !== token);
      writeJsonDb(db);
    },
    async deleteExpiredSession(token) {
      await this.deleteSession(token);
    },
    async listEmployees() {
      return readJsonDb().employees.map((e) => ({
        ...e,
        joiningDate: e.joiningDate || String(e.createdAt || new Date().toISOString()).slice(0, 10)
      }));
    },
    async getEmployeeById(id) {
      const db = readJsonDb();
      const e = db.employees.find((x) => x.id === id);
      if (!e) return null;
      return {
        ...e,
        joiningDate: e.joiningDate || String(e.createdAt || new Date().toISOString()).slice(0, 10)
      };
    },
    async createEmployee(data) {
      const db = readJsonDb();
      const createdAt = new Date().toISOString();
      const employee = {
        id: uid('emp'),
        name: String(data.name).trim(),
        role: String(data.role).trim(),
        monthlySalary: Number(data.monthlySalary),
        joiningDate: data.joiningDate || createdAt.slice(0, 10),
        active: true,
        createdAt
      };
      db.employees.push(employee);
      writeJsonDb(db);
      return employee;
    },
    async updateEmployee(id, data) {
      const db = readJsonDb();
      const employee = db.employees.find((e) => e.id === id);
      if (!employee) return null;
      employee.name = String(data.name).trim();
      employee.role = String(data.role).trim();
      employee.monthlySalary = Number(data.monthlySalary);
      employee.joiningDate = data.joiningDate || employee.joiningDate || String(employee.createdAt).slice(0, 10);
      employee.updatedAt = new Date().toISOString();
      writeJsonDb(db);
      return employee;
    },
    async deleteEmployee(id) {
      const db = readJsonDb();
      const before = db.employees.length;
      db.employees = db.employees.filter((e) => e.id !== id);
      if (before === db.employees.length) return false;
      db.attendance = db.attendance.filter((a) => a.employeeId !== id);
      db.salaryAdvances = db.salaryAdvances.filter((a) => a.employeeId !== id);
      writeJsonDb(db);
      return true;
    },
    async upsertAttendance(employeeId, date, status) {
      const db = readJsonDb();
      const existing = db.attendance.find((a) => a.employeeId === employeeId && a.date === date);
      if (existing) {
        existing.status = status;
        existing.updatedAt = new Date().toISOString();
        writeJsonDb(db);
        return existing;
      }

      const row = {
        id: uid('att'),
        employeeId,
        date,
        status,
        createdAt: new Date().toISOString()
      };
      db.attendance.push(row);
      writeJsonDb(db);
      return row;
    },
    async listAttendance(date) {
      const db = readJsonDb();
      if (!date) return db.attendance;
      return db.attendance.filter((a) => a.date === date);
    },
    async attendanceReport(month) {
      const db = readJsonDb();
      const rows = db.employees.map((e) => {
        const monthly = db.attendance.filter((a) => a.employeeId === e.id && monthOf(a.date) === month);
        const present = monthly.filter((m) => m.status === 'present').length;
        const absent = monthly.filter((m) => m.status === 'absent').length;
        return {
          employeeId: e.id,
          name: e.name,
          role: e.role,
          presentDays: present,
          absentDays: absent,
          markedDays: monthly.length
        };
      });
      return rows;
    },
    async createAdvance(data) {
      const db = readJsonDb();
      const row = {
        id: uid('adv'),
        employeeId: data.employeeId,
        date: data.date,
        amount: Number(data.amount),
        note: data.note ? String(data.note).trim() : '',
        createdAt: new Date().toISOString()
      };
      db.salaryAdvances.push(row);
      writeJsonDb(db);
      return row;
    },
    async getEmployeeAdvances(employeeId, month) {
      const db = readJsonDb();
      return db.salaryAdvances.filter((a) => a.employeeId === employeeId && monthOf(a.date) === month);
    },
    async setAdvancesForMonth(employeeId, month, totalAdvances) {
      const db = readJsonDb();
      const currentSum = db.salaryAdvances
        .filter((a) => a.employeeId === employeeId && monthOf(a.date) === month)
        .reduce((sum, a) => sum + Number(a.amount), 0);
      const diff = Number(totalAdvances) - currentSum;
      if (diff === 0) return { ok: true };
      const adjDate = `${month}-15`;
      const row = {
        id: uid('adv'),
        employeeId,
        date: adjDate,
        amount: diff,
        note: 'Adjustment to match entered total',
        createdAt: new Date().toISOString()
      };
      db.salaryAdvances.push(row);
      writeJsonDb(db);
      return { ok: true };
    },
    async listSalaryLedgers() {
      const db = readJsonDb();
      return db.employees.map((e) => {
        const ledger = db.salaryLedgers.find((l) => l.employeeId === e.id);
        const totalSalary = Number(ledger?.totalSalary || 0);
        const amountGiven = Number(ledger?.amountGiven || 0);
        const remaining = Math.max(0, totalSalary - amountGiven);
        return {
          employeeId: e.id,
          name: e.name,
          role: e.role,
          totalSalary,
          amountGiven,
          totalPaid: amountGiven,
          totalToGive: totalSalary,
          remaining,
          note: ledger?.note || '',
          pending: remaining,
          updatedAt: ledger?.updatedAt || null
        };
      });
    },
    async upsertSalaryLedger(employeeId, totalSalary, amountGiven, note, totalToGive) {
      const db = readJsonDb();
      const paid = Number(amountGiven);
      const computedTotal =
        totalToGive != null && totalToGive !== '' ? Number(totalToGive) : Number(totalSalary);
      const existing = db.salaryLedgers.find((l) => l.employeeId === employeeId);
      if (existing) {
        existing.totalSalary = computedTotal;
        existing.amountGiven = paid;
        existing.note = String(note || '').trim();
        existing.updatedAt = new Date().toISOString();
        writeJsonDb(db);
        return existing;
      }
      const row = {
        id: uid('sld'),
        employeeId,
        totalSalary: computedTotal,
        amountGiven: paid,
        note: String(note || '').trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.salaryLedgers.push(row);
      writeJsonDb(db);
      return row;
    },
    async salaryRows(month) {
      const db = readJsonDb();
      return db.employees.map((employee) => {
        const advances = db.salaryAdvances
          .filter((a) => a.employeeId === employee.id && monthOf(a.date) === month)
          .reduce((sum, a) => sum + Number(a.amount), 0);

        const totalAdvancesAllTime = db.salaryAdvances
          .filter((a) => a.employeeId === employee.id)
          .reduce((sum, a) => sum + Number(a.amount), 0);

        const startMonth = String(employee.joiningDate || employee.createdAt || new Date().toISOString()).slice(0, 7);
        const [startY, startM] = startMonth.split('-').map(Number);
        const [endY, endM] = month.split('-').map(Number);
        const monthsWorked = Math.max(0, (endY - startY) * 12 + (endM - startM) + 1);
        const totalSalaryAllTime = Number(employee.monthlySalary) * monthsWorked;
        const totalRemainingAllTime = Math.max(0, totalSalaryAllTime - totalAdvancesAllTime);

        return {
          employeeId: employee.id,
          name: employee.name,
          role: employee.role,
          monthlySalary: Number(employee.monthlySalary),
          advances,
          remaining: Math.max(0, Number(employee.monthlySalary) - advances),
          monthsWorked,
          totalSalaryAllTime,
          totalAdvancesAllTime,
          totalRemainingAllTime
        };
      });
    },
    async createTruck(data) {
      const db = readJsonDb();
      const quantity = Number(data.quantity);
      const pricePerQuintal = data.pricePerQuintal != null && data.pricePerQuintal !== ''
        ? Number(data.pricePerQuintal)
        : null;
      const totalAmount = pricePerQuintal != null && !Number.isNaN(pricePerQuintal)
        ? pricePerQuintal * quantity
        : null;

      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : null;

      const row = {
        id: uid('trk'),
        date: data.date,
        truckNumber: String(data.truckNumber).trim(),
        driverName: data.driverName ? String(data.driverName).trim() : '',
        rawMaterial: String(data.rawMaterial).trim(),
        quantity,
        pricePerQuintal: pricePerQuintal ?? undefined,
        totalAmount: totalAmount ?? undefined,
        party: party || undefined,
        client: data.client ? String(data.client).trim() : '',
        origin: data.origin ? String(data.origin).trim() : '',
        destination: data.destination ? String(data.destination).trim() : '',
        notes: data.notes ? String(data.notes).trim() : '',
        createdAt: new Date().toISOString()
      };
      db.trucks.push(row);
      writeJsonDb(db);
      return row;
    },

    async updateTruck(id, data) {
      const db = readJsonDb();
      const truck = db.trucks.find((t) => t.id === id);
      if (!truck) return null;

      const quantity = Number(data.quantity);
      const pricePerQuintal = data.pricePerQuintal != null && data.pricePerQuintal !== ''
        ? Number(data.pricePerQuintal)
        : null;
      const totalAmount = pricePerQuintal != null && !Number.isNaN(pricePerQuintal)
        ? pricePerQuintal * quantity
        : null;
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : null;

      truck.date = data.date;
      truck.truckNumber = String(data.truckNumber).trim();
      truck.driverName = data.driverName ? String(data.driverName).trim() : '';
      truck.rawMaterial = String(data.rawMaterial).trim();
      truck.quantity = quantity;
      truck.pricePerQuintal = pricePerQuintal ?? undefined;
      truck.totalAmount = totalAmount ?? undefined;
      truck.party = party || undefined;
      truck.client = data.client ? String(data.client).trim() : '';
      truck.origin = data.origin ? String(data.origin).trim() : '';
      truck.destination = data.destination ? String(data.destination).trim() : '';
      truck.notes = data.notes ? String(data.notes).trim() : '';
      truck.updatedAt = new Date().toISOString();
      writeJsonDb(db);
      return truck;
    },
    async deleteTruck(id) {
      const db = readJsonDb();
      const before = db.trucks.length;
      db.trucks = db.trucks.filter((t) => t.id !== id);
      if (before === db.trucks.length) return false;
      writeJsonDb(db);
      return true;
    },
    async listTrucks(filter) {
      const db = readJsonDb();
      let rows = db.trucks;
      if (filter?.dateFrom) rows = rows.filter((t) => t.date >= filter.dateFrom);
      if (filter?.dateTo) rows = rows.filter((t) => t.date <= filter.dateTo);
      return rows;
    },
    async listExpenses(filter) {
      const db = readJsonDb();
      let rows = db.expenses;
      if (filter?.dateFrom) rows = rows.filter((e) => e.date >= filter.dateFrom);
      if (filter?.dateTo) rows = rows.filter((e) => e.date <= filter.dateTo);
      return rows
        .map((r) => ({ ...r, party: r.party || 'narayan' }))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
    },
    async createExpense(data) {
      const db = readJsonDb();
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : 'narayan';
      const row = {
        id: uid('exp'),
        date: data.date,
        party,
        description: String(data.description || '').trim() || 'Expense',
        amount: Number(data.amount),
        createdAt: new Date().toISOString()
      };
      db.expenses.push(row);
      writeJsonDb(db);
      return row;
    },
    async updateExpense(id, data) {
      const db = readJsonDb();
      const expense = db.expenses.find((e) => e.id === id);
      if (!expense) return null;
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : 'narayan';
      expense.date = data.date;
      expense.party = party;
      expense.description = String(data.description || '').trim() || 'Expense';
      expense.amount = Number(data.amount);
      expense.updatedAt = new Date().toISOString();
      writeJsonDb(db);
      return expense;
    },
    async deleteExpense(id) {
      const db = readJsonDb();
      const before = db.expenses.length;
      db.expenses = db.expenses.filter((e) => e.id !== id);
      if (before === db.expenses.length) return false;
      writeJsonDb(db);
      return true;
    },
    async listInvestments(filter) {
      const db = readJsonDb();
      let rows = db.investments;
      if (filter?.dateFrom) rows = rows.filter((i) => i.date >= filter.dateFrom);
      if (filter?.dateTo) rows = rows.filter((i) => i.date <= filter.dateTo);
      return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    },
    async createInvestment(data) {
      const db = readJsonDb();
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : null;
      const row = {
        id: uid('inv'),
        date: data.date,
        party: party || 'narayan',
        amount: Number(data.amount),
        note: String(data.note || '').trim(),
        createdAt: new Date().toISOString()
      };
      db.investments.push(row);
      writeJsonDb(db);
      return row;
    },
    async updateInvestment(id, data) {
      const db = readJsonDb();
      const investment = db.investments.find((i) => i.id === id);
      if (!investment) return null;
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : 'narayan';
      investment.date = data.date;
      investment.party = party;
      investment.amount = Number(data.amount);
      investment.note = String(data.note || '').trim();
      investment.updatedAt = new Date().toISOString();
      writeJsonDb(db);
      return investment;
    },
    async deleteInvestment(id) {
      const db = readJsonDb();
      const before = db.investments.length;
      db.investments = db.investments.filter((i) => i.id !== id);
      if (before === db.investments.length) return false;
      writeJsonDb(db);
      return true;
    },
    async listChiniExpenses(filter) {
      const db = readJsonDb();
      let rows = db.chiniExpenses;
      if (filter?.dateFrom) rows = rows.filter((e) => e.date >= filter.dateFrom);
      if (filter?.dateTo) rows = rows.filter((e) => e.date <= filter.dateTo);
      return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    },
    async createChiniExpense(data) {
      const db = readJsonDb();
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : null;
      const row = {
        id: uid('chi'),
        date: data.date,
        party: party || 'narayan',
        description: String(data.description || '').trim() || 'Chini Mill Expense',
        amount: Number(data.amount),
        createdAt: new Date().toISOString()
      };
      db.chiniExpenses.push(row);
      writeJsonDb(db);
      return row;
    },
    async updateChiniExpense(id, data) {
      const db = readJsonDb();
      const expense = db.chiniExpenses.find((e) => e.id === id);
      if (!expense) return null;
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : 'narayan';
      expense.date = data.date;
      expense.party = party;
      expense.description = String(data.description || '').trim() || 'Chini Mill Expense';
      expense.amount = Number(data.amount);
      expense.updatedAt = new Date().toISOString();
      writeJsonDb(db);
      return expense;
    },
    async deleteChiniExpense(id) {
      const db = readJsonDb();
      const before = db.chiniExpenses.length;
      db.chiniExpenses = db.chiniExpenses.filter((e) => e.id !== id);
      if (before === db.chiniExpenses.length) return false;
      writeJsonDb(db);
      return true;
    },
    async listLandRecords() {
      const db = readJsonDb();
      return db.landRecords.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async createLandRecord(data) {
      const db = readJsonDb();
      const row = {
        id: uid('land'),
        area: String(data.area || '').trim(),
        ownerName: String(data.ownerName || '').trim(),
        amountPaid: Number(data.amountPaid),
        amountToBeGiven: Number(data.amountToBeGiven),
        createdAt: new Date().toISOString()
      };
      db.landRecords.push(row);
      writeJsonDb(db);
      return row;
    },
    async updateLandRecord(id, data) {
      const db = readJsonDb();
      const record = db.landRecords.find((l) => l.id === id);
      if (!record) return null;
      record.area = String(data.area || '').trim();
      record.ownerName = String(data.ownerName || '').trim();
      record.amountPaid = Number(data.amountPaid);
      record.amountToBeGiven = Number(data.amountToBeGiven);
      record.updatedAt = new Date().toISOString();
      writeJsonDb(db);
      return record;
    },
    async listVehicles() {
      const db = readJsonDb();
      return db.vehicles.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async createVehicle(data) {
      const db = readJsonDb();
      const row = {
        id: uid('veh'),
        vehicleName: String(data.vehicleName || '').trim(),
        vehicleNumber: String(data.vehicleNumber || '').trim(),
        monthlyPrice: Number(data.monthlyPrice),
        serviceDueDate: data.serviceDueDate || '',
        lastServiceDate: data.lastServiceDate || '',
        paymentStatus: String(data.paymentStatus || 'pending').trim().toLowerCase(),
        amountPaid: Number(data.amountPaid || 0),
        note: String(data.note || '').trim(),
        createdAt: new Date().toISOString()
      };
      db.vehicles.push(row);
      writeJsonDb(db);
      return row;
    },
    async updateVehicle(id, data) {
      const db = readJsonDb();
      const vehicle = db.vehicles.find((v) => v.id === id);
      if (!vehicle) return null;
      vehicle.vehicleName = String(data.vehicleName || '').trim();
      vehicle.vehicleNumber = String(data.vehicleNumber || '').trim();
      vehicle.monthlyPrice = Number(data.monthlyPrice);
      vehicle.serviceDueDate = data.serviceDueDate || '';
      vehicle.lastServiceDate = data.lastServiceDate || '';
      vehicle.paymentStatus = String(data.paymentStatus || 'pending').trim().toLowerCase();
      vehicle.amountPaid = Number(data.amountPaid || 0);
      vehicle.note = String(data.note || '').trim();
      vehicle.updatedAt = new Date().toISOString();
      writeJsonDb(db);
      return vehicle;
    },
    async deleteVehicle(id) {
      const db = readJsonDb();
      const before = db.vehicles.length;
      db.vehicles = db.vehicles.filter((v) => v.id !== id);
      if (before === db.vehicles.length) return false;
      writeJsonDb(db);
      return true;
    },
    async deleteLandRecord(id) {
      const db = readJsonDb();
      const before = db.landRecords.length;
      db.landRecords = db.landRecords.filter((l) => l.id !== id);
      if (before === db.landRecords.length) return false;
      writeJsonDb(db);
      return true;
    },
    // Supplier Management
    async listSuppliers() {
      const db = readJsonDb();
      return (db.suppliers || [])
        .map((supplier) => {
          const txs = (db.supplierTransactions || []).filter((t) => t.supplierId === supplier.id);
          const openingBalance = toSafeNumber(supplier.openingBalance, 0);
          const totalTrucks = txs.filter((t) => t.type === 'truck').length;
          const totalMaterialAmount = txs
            .filter((t) => t.type === 'truck')
            .reduce((sum, t) => sum + toSafeNumber(t.amount, 0), 0);
          const totalMaterialQuantity = txs
            .filter((t) => t.type === 'truck')
            .reduce((sum, t) => sum + toSafeNumber(t.quantity, 0), 0);
          const totalPaid = txs
            .filter((t) => t.type === 'payment')
            .reduce((sum, t) => sum + toSafeNumber(t.amount, 0), 0);
          const balance = openingBalance + totalMaterialAmount - totalPaid;
          return {
            ...supplier,
            phone: String(supplier.phone || supplier.contact || '').trim(),
            contact: String(supplier.phone || supplier.contact || '').trim(),
            alternatePhone: String(supplier.alternatePhone || '').trim(),
            email: String(supplier.email || '').trim(),
            gstNo: normalizeGstNo(supplier.gstNo || ''),
            address: String(supplier.address || '').trim(),
            materialType: String(supplier.materialType || '').trim(),
            paymentTerms: String(supplier.paymentTerms || '').trim(),
            openingBalance,
            totalTrucks,
            totalMaterialAmount,
            totalMaterialQuantity,
            totalPaid,
            balance
          };
        })
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    },
    async getSupplierById(id) {
      const rows = await this.listSuppliers();
      return rows.find((row) => row.id === id) || null;
    },
    async createSupplier(data) {
      const db = readJsonDb();
      const supplier = normalizeSupplier(data || {});
      const now = new Date().toISOString();
      const row = {
        id: uid('sup'),
        ...supplier,
        contact: supplier.phone,
        createdAt: now,
        updatedAt: now
      };
      db.suppliers.push(row);
      writeJsonDb(db);
      return (await this.getSupplierById(row.id)) || row;
    },
    async updateSupplier(id, data) {
      const db = readJsonDb();
      const supplier = db.suppliers.find((s) => s.id === id);
      if (!supplier) return null;
      const normalized = normalizeSupplier(data || {});
      supplier.name = normalized.name;
      supplier.phone = normalized.phone;
      supplier.contact = normalized.phone;
      supplier.alternatePhone = normalized.alternatePhone;
      supplier.email = normalized.email;
      supplier.gstNo = normalized.gstNo;
      supplier.address = normalized.address;
      supplier.materialType = normalized.materialType;
      supplier.paymentTerms = normalized.paymentTerms;
      supplier.openingBalance = normalized.openingBalance;
      supplier.updatedAt = new Date().toISOString();
      writeJsonDb(db);
      return (await this.getSupplierById(id)) || supplier;
    },
    async deleteSupplier(id) {
      const db = readJsonDb();
      const before = db.suppliers.length;
      db.suppliers = db.suppliers.filter((s) => s.id !== id);
      if (before === db.suppliers.length) return false;
      db.supplierTransactions = (db.supplierTransactions || []).filter((t) => t.supplierId !== id);
      writeJsonDb(db);
      return true;
    },
    async listSupplierTransactions(supplierId) {
      const db = readJsonDb();
      return (db.supplierTransactions || [])
        .filter((t) => t.supplierId === supplierId)
        .map((t) => ({
          ...t,
          amount: toSafeNumber(t.amount, 0),
          quantity: t.quantity == null || t.quantity === '' ? null : toSafeNumber(t.quantity, 0),
          rate: t.rate == null || t.rate === '' ? null : toSafeNumber(t.rate, 0),
          paidNow: t.paidNow == null || t.paidNow === '' ? 0 : toSafeNumber(t.paidNow, 0),
          paymentMode: String(t.paymentMode || '').trim(),
          paymentRef: String(t.paymentRef || '').trim(),
          challanNo: String(t.challanNo || '').trim(),
          note: String(t.note || '').trim(),
          isAutoPayment: Boolean(t.isAutoPayment)
        }))
        .sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          const aTs = String(a.createdAt || '');
          const bTs = String(b.createdAt || '');
          if (aTs !== bTs) return bTs.localeCompare(aTs);
          return String(b.id || '').localeCompare(String(a.id || ''));
        });
    },
    async getSupplierTransactionById(id) {
      const db = readJsonDb();
      const tx = (db.supplierTransactions || []).find((row) => row.id === id);
      if (!tx) return null;
      return {
        ...tx,
        amount: toSafeNumber(tx.amount, 0),
        quantity: tx.quantity == null || tx.quantity === '' ? null : toSafeNumber(tx.quantity, 0),
        rate: tx.rate == null || tx.rate === '' ? null : toSafeNumber(tx.rate, 0),
        paidNow: tx.paidNow == null || tx.paidNow === '' ? 0 : toSafeNumber(tx.paidNow, 0),
        paymentMode: String(tx.paymentMode || '').trim(),
        paymentRef: String(tx.paymentRef || '').trim(),
        challanNo: String(tx.challanNo || '').trim(),
        note: String(tx.note || '').trim(),
        isAutoPayment: Boolean(tx.isAutoPayment)
      };
    },
    async createSupplierTransaction(data) {
      const db = readJsonDb();
      const tx = normalizeSupplierTransaction(data || {}, data.supplierId);
      const now = new Date().toISOString();
      const row = {
        id: uid('stx'),
        supplierId: tx.supplierId,
        date: tx.date,
        type: tx.type,
        amount: tx.amount,
        truckNumber: tx.truckNumber || '',
        challanNo: tx.challanNo || '',
        material: tx.material || '',
        quantity: tx.quantity,
        rate: tx.rate,
        paidNow: tx.paidNow > 0 ? tx.paidNow : 0,
        paymentMode: tx.paymentMode || '',
        paymentRef: tx.paymentRef || '',
        note: tx.note || '',
        isAutoPayment: Boolean(tx.isAutoPayment),
        linkedTransactionId: tx.linkedTransactionId || '',
        createdAt: now,
        updatedAt: now
      };
      db.supplierTransactions.push(row);
      writeJsonDb(db);
      return row;
    },
    async updateSupplierTransaction(id, data) {
      const db = readJsonDb();
      const tx = db.supplierTransactions.find((row) => row.id === id);
      if (!tx) return null;
      const normalized = normalizeSupplierTransaction(data || {}, tx.supplierId);
      tx.date = normalized.date;
      tx.type = normalized.type;
      tx.amount = normalized.amount;
      tx.truckNumber = normalized.truckNumber || '';
      tx.challanNo = normalized.challanNo || '';
      tx.material = normalized.material || '';
      tx.quantity = normalized.quantity;
      tx.rate = normalized.rate;
      tx.paidNow = normalized.paidNow > 0 ? normalized.paidNow : 0;
      tx.paymentMode = normalized.paymentMode || '';
      tx.paymentRef = normalized.paymentRef || '';
      tx.note = normalized.note || '';
      tx.isAutoPayment = Boolean(normalized.isAutoPayment);
      tx.linkedTransactionId = normalized.linkedTransactionId || '';
      tx.updatedAt = new Date().toISOString();
      writeJsonDb(db);
      return tx;
    },
    async deleteSupplierTransaction(id) {
      const db = readJsonDb();
      const before = db.supplierTransactions.length;
      db.supplierTransactions = db.supplierTransactions.filter((t) => t.id !== id);
      if (before === db.supplierTransactions.length) return false;
      writeJsonDb(db);
      return true;
    },
    async listBillingCompanies() {
      const db = readJsonDb();
      return (db.billingCompanies || [])
        .map((c) => ({
          ...c,
          gstNo: normalizeGstNo(c.gstNo)
        }))
        .sort((a, b) => String(a.companyName || '').localeCompare(String(b.companyName || '')));
    },
    async getBillingCompanyByGst(gstNo) {
      const db = readJsonDb();
      const normalized = normalizeGstNo(gstNo);
      if (!normalized) return null;
      return (db.billingCompanies || []).find((c) => normalizeGstNo(c.gstNo) === normalized) || null;
    },
    async upsertBillingCompany(data) {
      const db = readJsonDb();
      const company = normalizeBillCompany(data);
      const existing = (db.billingCompanies || []).find((c) => normalizeGstNo(c.gstNo) === company.gstNo);
      if (existing) {
        existing.companyName = company.companyName;
        existing.address = company.address;
        existing.state = company.state;
        existing.stateCode = company.stateCode;
        existing.contactPerson = company.contactPerson;
        existing.phone = company.phone;
        existing.email = company.email;
        existing.updatedAt = new Date().toISOString();
        writeJsonDb(db);
        return existing;
      }
      const row = {
        id: uid('bc'),
        ...company,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.billingCompanies.push(row);
      writeJsonDb(db);
      return row;
    },
    async listBills() {
      const db = readJsonDb();
      return (db.bills || []).sort((a, b) => (a.billDate < b.billDate ? 1 : -1));
    },
    async getBillById(id) {
      const db = readJsonDb();
      return (db.bills || []).find((b) => b.id === id) || null;
    },
    async createBill(data) {
      const db = readJsonDb();
      const company = normalizeBillCompany(data.company || {});
      const items = cleanInvoiceItems(data.items);
      const totals = calcInvoiceTotals(items);
      const row = {
        id: uid('bill'),
        invoiceNo: String(data.invoiceNo || '').trim(),
        billDate: String(data.billDate),
        dueDate: data.dueDate ? String(data.dueDate) : '',
        vehicleNo: String(data.vehicleNo || '').trim(),
        company,
        placeOfSupply: String(data.placeOfSupply || '').trim(),
        reverseCharge: Boolean(data.reverseCharge),
        items,
        subtotal: totals.subtotal,
        totalGst: totals.totalGst,
        grandTotal: totals.grandTotal,
        notes: String(data.notes || '').trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.bills.push(row);
      const existingCompany = (db.billingCompanies || []).find((c) => normalizeGstNo(c.gstNo) === company.gstNo);
      if (existingCompany) {
        existingCompany.companyName = company.companyName;
        existingCompany.address = company.address;
        existingCompany.state = company.state;
        existingCompany.stateCode = company.stateCode;
        existingCompany.contactPerson = company.contactPerson;
        existingCompany.phone = company.phone;
        existingCompany.email = company.email;
        existingCompany.updatedAt = new Date().toISOString();
      } else {
        db.billingCompanies.push({
          id: uid('bc'),
          ...company,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      writeJsonDb(db);
      return row;
    },
    async updateBill(id, data) {
      const db = readJsonDb();
      const existing = (db.bills || []).find((b) => b.id === id);
      if (!existing) return null;
      const company = normalizeBillCompany(data.company || {});
      const items = cleanInvoiceItems(data.items);
      const totals = calcInvoiceTotals(items);
      existing.invoiceNo = String(data.invoiceNo || '').trim();
      existing.billDate = String(data.billDate);
      existing.dueDate = data.dueDate ? String(data.dueDate) : '';
      existing.vehicleNo = String(data.vehicleNo || '').trim();
      existing.company = company;
      existing.placeOfSupply = String(data.placeOfSupply || '').trim();
      existing.reverseCharge = Boolean(data.reverseCharge);
      existing.items = items;
      existing.subtotal = totals.subtotal;
      existing.totalGst = totals.totalGst;
      existing.grandTotal = totals.grandTotal;
      existing.notes = String(data.notes || '').trim();
      existing.updatedAt = new Date().toISOString();

      const existingCompany = (db.billingCompanies || []).find((c) => normalizeGstNo(c.gstNo) === company.gstNo);
      if (existingCompany) {
        existingCompany.companyName = company.companyName;
        existingCompany.address = company.address;
        existingCompany.state = company.state;
        existingCompany.stateCode = company.stateCode;
        existingCompany.contactPerson = company.contactPerson;
        existingCompany.phone = company.phone;
        existingCompany.email = company.email;
        existingCompany.updatedAt = new Date().toISOString();
      } else {
        db.billingCompanies.push({
          id: uid('bc'),
          ...company,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      writeJsonDb(db);
      return existing;
    },
    async deleteBill(id) {
      const db = readJsonDb();
      const before = db.bills.length;
      db.bills = db.bills.filter((b) => b.id !== id);
      if (before === db.bills.length) return false;
      writeJsonDb(db);
      return true;
    },
    async dashboard(month, today) {
      const db = readJsonDb();
      const totalSalary = db.employees.reduce((sum, e) => sum + Number(e.monthlySalary), 0);
      const totalAdvances = db.salaryAdvances
        .filter((a) => monthOf(a.date) === month)
        .reduce((sum, a) => sum + Number(a.amount), 0);
      const attendanceToday = db.attendance.filter((a) => a.date === today);
      const presentToday = attendanceToday.filter((a) => a.status === 'present').length;
      const absentToday = attendanceToday.filter((a) => a.status === 'absent').length;
      const trucksThisMonth = db.trucks.filter((t) => monthOf(t.date) === month);

      return {
        month,
        today,
        totalEmployees: db.employees.length,
        totalSalary,
        totalAdvances,
        totalRemaining: Math.max(0, totalSalary - totalAdvances),
        presentToday,
        absentToday,
        truckCountThisMonth: trucksThisMonth.length,
        truckQuantityThisMonth: trucksThisMonth.reduce((sum, t) => sum + Number(t.quantity), 0)
      };
    }
  };
}

function postgresStore() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required when STORAGE_MODE=postgres');
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  return {
    mode: 'postgres',
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS employees (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          monthly_salary NUMERIC(12,2) NOT NULL,
          joining_date DATE,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ
        );
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS joining_date DATE;

        CREATE TABLE IF NOT EXISTS attendance (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          date DATE NOT NULL,
          status TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ,
          UNIQUE (employee_id, date)
        );

        CREATE TABLE IF NOT EXISTS salary_advances (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          date DATE NOT NULL,
          amount NUMERIC(12,2) NOT NULL,
          note TEXT,
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS salary_ledgers (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
          total_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
          amount_given NUMERIC(12,2) NOT NULL DEFAULT 0,
          note TEXT,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
        ALTER TABLE salary_ledgers ADD COLUMN IF NOT EXISTS note TEXT;

        CREATE TABLE IF NOT EXISTS trucks (
          id TEXT PRIMARY KEY,
          date DATE NOT NULL,
          truck_number TEXT NOT NULL,
          driver_name TEXT,
          raw_material TEXT NOT NULL,
          quantity NUMERIC(12,2) NOT NULL,
          price_per_quintal NUMERIC(12,2),
          total_amount NUMERIC(12,2),
          origin TEXT,
          destination TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL
        );
        ALTER TABLE trucks ADD COLUMN IF NOT EXISTS price_per_quintal NUMERIC(12,2);
        ALTER TABLE trucks ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2);
        ALTER TABLE trucks ADD COLUMN IF NOT EXISTS party TEXT;

        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY,
          date DATE NOT NULL,
          party TEXT,
          description TEXT NOT NULL,
          amount NUMERIC(12,2) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );
        ALTER TABLE expenses ADD COLUMN IF NOT EXISTS party TEXT;

        CREATE TABLE IF NOT EXISTS investments (
          id TEXT PRIMARY KEY,
          date DATE NOT NULL,
          party TEXT NOT NULL,
          amount NUMERIC(12,2) NOT NULL,
          note TEXT,
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chini_expenses (
          id TEXT PRIMARY KEY,
          date DATE NOT NULL,
          party TEXT NOT NULL,
          description TEXT NOT NULL,
          amount NUMERIC(12,2) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS land_records (
          id TEXT PRIMARY KEY,
          area TEXT NOT NULL,
          owner_name TEXT NOT NULL,
          amount_paid NUMERIC(12,2) NOT NULL,
          amount_to_be_given NUMERIC(12,2) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vehicles (
          id TEXT PRIMARY KEY,
          vehicle_name TEXT NOT NULL,
          vehicle_number TEXT NOT NULL,
          monthly_price NUMERIC(12,2) NOT NULL,
          service_due_date DATE,
          last_service_date DATE,
          payment_status TEXT NOT NULL,
          amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
          note TEXT,
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS suppliers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT,
          alternate_phone TEXT,
          email TEXT,
          gst_no TEXT,
          address TEXT,
          material_type TEXT,
          payment_terms TEXT,
          opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ
        );
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS alternate_phone TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS gst_no TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS material_type TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms TEXT;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        CREATE TABLE IF NOT EXISTS supplier_transactions (
          id TEXT PRIMARY KEY,
          supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
          date DATE NOT NULL,
          type TEXT NOT NULL,
          amount NUMERIC(14,2) NOT NULL,
          truck_number TEXT,
          challan_no TEXT,
          material TEXT,
          quantity NUMERIC(14,3),
          rate NUMERIC(14,2),
          paid_now NUMERIC(14,2),
          payment_mode TEXT,
          payment_ref TEXT,
          note TEXT,
          linked_transaction_id TEXT,
          is_auto_payment BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ
        );
        ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS challan_no TEXT;
        ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS paid_now NUMERIC(14,2);
        ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS payment_mode TEXT;
        ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS payment_ref TEXT;
        ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS linked_transaction_id TEXT;
        ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS is_auto_payment BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        CREATE TABLE IF NOT EXISTS billing_companies (
          id TEXT PRIMARY KEY,
          gst_no TEXT UNIQUE NOT NULL,
          company_name TEXT NOT NULL,
          address TEXT NOT NULL,
          state TEXT,
          state_code TEXT,
          contact_person TEXT,
          phone TEXT,
          email TEXT,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS bills (
          id TEXT PRIMARY KEY,
          invoice_no TEXT NOT NULL,
          bill_date DATE NOT NULL,
          due_date DATE,
          vehicle_no TEXT,
          company_gst_no TEXT NOT NULL,
          company_name TEXT NOT NULL,
          company_address TEXT NOT NULL,
          company_state TEXT,
          company_state_code TEXT,
          contact_person TEXT,
          company_phone TEXT,
          company_email TEXT,
          place_of_supply TEXT,
          reverse_charge BOOLEAN NOT NULL DEFAULT FALSE,
          items JSONB NOT NULL,
          subtotal NUMERIC(14,2) NOT NULL,
          total_gst NUMERIC(14,2) NOT NULL,
          grand_total NUMERIC(14,2) NOT NULL,
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
      `);

      const countRes = await pool.query('SELECT COUNT(*)::int AS c FROM users');
      if (countRes.rows[0].c === 0) {
        const users = defaultUsers();
        for (const u of users) {
          await pool.query(
            'INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, $3, $4)',
            [u.id, u.username, u.passwordHash, u.role]
          );
        }
      }
    },
    async healthCheck() {
      await pool.query('SELECT 1');
      return {
        ok: true,
        details: {
          storage: 'postgres'
        }
      };
    },
    async getUserByUsername(username) {
      const res = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      if (!res.rows[0]) return null;
      return {
        id: res.rows[0].id,
        username: res.rows[0].username,
        passwordHash: res.rows[0].password_hash,
        role: res.rows[0].role
      };
    },
    async getUserById(id) {
      const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      if (!res.rows[0]) return null;
      return {
        id: res.rows[0].id,
        username: res.rows[0].username,
        passwordHash: res.rows[0].password_hash,
        role: res.rows[0].role
      };
    },
    async updateUserPassword(userId, passwordHash) {
      const res = await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
      return res.rowCount > 0;
    },
    async createSession(token, userId, expiresAt) {
      await pool.query(
        'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
        [token, userId, new Date().toISOString(), expiresAt]
      );
    },
    async getSession(token) {
      const res = await pool.query('SELECT token, user_id, expires_at FROM sessions WHERE token = $1', [token]);
      if (!res.rows[0]) return null;
      return { token: res.rows[0].token, userId: res.rows[0].user_id, expiresAt: res.rows[0].expires_at };
    },
    async deleteSession(token) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    },
    async deleteExpiredSession(token) {
      await this.deleteSession(token);
    },
    async listEmployees() {
      const res = await pool.query('SELECT * FROM employees ORDER BY created_at DESC');
      return res.rows.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        monthlySalary: Number(r.monthly_salary),
        joiningDate: r.joining_date ? String(r.joining_date).slice(0, 10) : String(r.created_at).slice(0, 10),
        active: r.active,
        createdAt: r.created_at
      }));
    },
    async getEmployeeById(id) {
      const res = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        name: r.name,
        role: r.role,
        monthlySalary: Number(r.monthly_salary),
        joiningDate: r.joining_date ? String(r.joining_date).slice(0, 10) : String(r.created_at).slice(0, 10),
        active: r.active,
        createdAt: r.created_at
      };
    },
    async createEmployee(data) {
      const createdAt = new Date().toISOString();
      const row = {
        id: uid('emp'),
        name: String(data.name).trim(),
        role: String(data.role).trim(),
        monthlySalary: Number(data.monthlySalary),
        joiningDate: data.joiningDate || createdAt.slice(0, 10),
        active: true,
        createdAt
      };
      await pool.query(
        `INSERT INTO employees (id, name, role, monthly_salary, joining_date, active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.name, row.role, row.monthlySalary, row.joiningDate, row.active, row.createdAt]
      );
      return row;
    },
    async updateEmployee(id, data) {
      const res = await pool.query(
        `UPDATE employees
         SET name = $2, role = $3, monthly_salary = $4, joining_date = $5, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, String(data.name).trim(), String(data.role).trim(), Number(data.monthlySalary), data.joiningDate]
      );
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        name: r.name,
        role: r.role,
        monthlySalary: Number(r.monthly_salary),
        joiningDate: r.joining_date ? String(r.joining_date).slice(0, 10) : String(r.created_at).slice(0, 10),
        active: r.active,
        createdAt: r.created_at
      };
    },
    async deleteEmployee(id) {
      const res = await pool.query('DELETE FROM employees WHERE id = $1', [id]);
      return res.rowCount > 0;
    },
    async upsertAttendance(employeeId, date, status) {
      const existing = await pool.query('SELECT id FROM attendance WHERE employee_id = $1 AND date = $2', [
        employeeId,
        date
      ]);

      if (existing.rows[0]) {
        const id = existing.rows[0].id;
        await pool.query('UPDATE attendance SET status = $2, updated_at = NOW() WHERE id = $1', [id, status]);
        return { id, employeeId, date, status };
      }

      const row = {
        id: uid('att'),
        employeeId,
        date,
        status,
        createdAt: new Date().toISOString()
      };
      await pool.query(
        `INSERT INTO attendance (id, employee_id, date, status, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.id, row.employeeId, row.date, row.status, row.createdAt]
      );
      return row;
    },
    async listAttendance(date) {
      let res;
      if (!date) {
        res = await pool.query('SELECT * FROM attendance ORDER BY date DESC');
      } else {
        res = await pool.query('SELECT * FROM attendance WHERE date = $1 ORDER BY created_at DESC', [date]);
      }
      return res.rows.map((r) => ({
        id: r.id,
        employeeId: r.employee_id,
        date: String(r.date).slice(0, 10),
        status: r.status,
        createdAt: r.created_at
      }));
    },
    async attendanceReport(month) {
      const res = await pool.query(
        `SELECT e.id AS employee_id,
                e.name,
                e.role,
                COALESCE(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END), 0)::int AS present_days,
                COALESCE(SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END), 0)::int AS absent_days,
                COALESCE(COUNT(a.id), 0)::int AS marked_days
         FROM employees e
         LEFT JOIN attendance a
           ON a.employee_id = e.id
          AND TO_CHAR(a.date, 'YYYY-MM') = $1
         GROUP BY e.id, e.name, e.role
         ORDER BY e.name`,
        [month]
      );

      return res.rows.map((r) => ({
        employeeId: r.employee_id,
        name: r.name,
        role: r.role,
        presentDays: r.present_days,
        absentDays: r.absent_days,
        markedDays: r.marked_days
      }));
    },
    async createAdvance(data) {
      const row = {
        id: uid('adv'),
        employeeId: data.employeeId,
        date: data.date,
        amount: Number(data.amount),
        note: data.note ? String(data.note).trim() : '',
        createdAt: new Date().toISOString()
      };
      await pool.query(
        `INSERT INTO salary_advances (id, employee_id, date, amount, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.id, row.employeeId, row.date, row.amount, row.note, row.createdAt]
      );
      return row;
    },
    async getEmployeeAdvances(employeeId, month) {
      const res = await pool.query(
        `SELECT * FROM salary_advances
         WHERE employee_id = $1
           AND TO_CHAR(date, 'YYYY-MM') = $2
         ORDER BY date ASC`,
        [employeeId, month]
      );
      return res.rows.map((r) => ({
        id: r.id,
        employeeId: r.employee_id,
        date: String(r.date).slice(0, 10),
        amount: Number(r.amount),
        note: r.note || ''
      }));
    },
    async setAdvancesForMonth(employeeId, month, totalAdvances) {
      const sumRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM salary_advances
         WHERE employee_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2`,
        [employeeId, month]
      );
      const currentSum = Number(sumRes.rows[0].total);
      const diff = Number(totalAdvances) - currentSum;
      if (diff === 0) return { ok: true };
      const adjDate = `${month}-15`;
      const row = {
        id: uid('adv'),
        employeeId,
        date: adjDate,
        amount: diff,
        note: 'Adjustment to match entered total',
        createdAt: new Date().toISOString()
      };
      await pool.query(
        `INSERT INTO salary_advances (id, employee_id, date, amount, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.id, row.employeeId, row.date, row.amount, row.note, row.createdAt]
      );
      return { ok: true };
    },
    async listSalaryLedgers() {
      const res = await pool.query(
        `SELECT e.id AS employee_id,
                e.name,
                e.role,
                COALESCE(sl.total_salary, 0) AS total_salary,
                COALESCE(sl.amount_given, 0) AS amount_given,
                COALESCE(sl.note, '') AS note,
                sl.updated_at
         FROM employees e
         LEFT JOIN salary_ledgers sl ON sl.employee_id = e.id
         ORDER BY e.name`
      );
      return res.rows.map((r) => {
        const totalSalary = Number(r.total_salary || 0);
        const amountGiven = Number(r.amount_given || 0);
        const remaining = Math.max(0, totalSalary - amountGiven);
        return {
          employeeId: r.employee_id,
          name: r.name,
          role: r.role,
          totalSalary,
          amountGiven,
          totalPaid: amountGiven,
          totalToGive: totalSalary,
          remaining,
          note: r.note || '',
          pending: remaining,
          updatedAt: r.updated_at || null
        };
      });
    },
    async upsertSalaryLedger(employeeId, totalSalary, amountGiven, note, totalToGive) {
      const paid = Number(amountGiven);
      const computedTotal =
        totalToGive != null && totalToGive !== '' ? Number(totalToGive) : Number(totalSalary);
      const existing = await pool.query('SELECT id FROM salary_ledgers WHERE employee_id = $1', [employeeId]);
      if (existing.rows[0]) {
        const id = existing.rows[0].id;
        await pool.query(
          'UPDATE salary_ledgers SET total_salary = $2, amount_given = $3, note = $4, updated_at = NOW() WHERE id = $1',
          [id, computedTotal, paid, String(note || '').trim()]
        );
        return {
          id,
          employeeId,
          totalSalary: computedTotal,
          amountGiven: paid,
          note: String(note || '').trim()
        };
      }
      const row = {
        id: uid('sld'),
        employeeId,
        totalSalary: computedTotal,
        amountGiven: paid,
        note: String(note || '').trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await pool.query(
        `INSERT INTO salary_ledgers (id, employee_id, total_salary, amount_given, note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.employeeId, row.totalSalary, row.amountGiven, row.note, row.createdAt, row.updatedAt]
      );
      return row;
    },
    async salaryRows(month) {
      const res = await pool.query(
        `SELECT e.id AS employee_id,
                e.name,
                e.role,
                e.monthly_salary,
                e.joining_date,
                e.created_at,
                COALESCE(SUM(CASE WHEN TO_CHAR(a.date, 'YYYY-MM') = $1 THEN a.amount ELSE 0 END), 0) AS advances,
                COALESCE(SUM(a.amount), 0) AS total_advances_all_time
         FROM employees e
         LEFT JOIN salary_advances a ON a.employee_id = e.id
         GROUP BY e.id, e.name, e.role, e.monthly_salary, e.joining_date, e.created_at
         ORDER BY e.name`,
        [month]
      );

      return res.rows.map((r) => {
        const startMonth = String(r.joining_date || r.created_at).slice(0, 7);
        const [startY, startM] = startMonth.split('-').map(Number);
        const [endY, endM] = month.split('-').map(Number);
        const monthsWorked = Math.max(0, (endY - startY) * 12 + (endM - startM) + 1);
        const totalSalaryAllTime = Number(r.monthly_salary) * monthsWorked;
        const totalAdvancesAllTime = Number(r.total_advances_all_time);

        return {
          employeeId: r.employee_id,
          name: r.name,
          role: r.role,
          monthlySalary: Number(r.monthly_salary),
          joiningDate: r.joining_date ? String(r.joining_date).slice(0, 10) : String(r.created_at).slice(0, 10),
          advances: Number(r.advances),
          remaining: Math.max(0, Number(r.monthly_salary) - Number(r.advances)),
          monthsWorked,
          totalSalaryAllTime,
          totalAdvancesAllTime,
          totalRemainingAllTime: Math.max(0, totalSalaryAllTime - totalAdvancesAllTime)
        };
      });
    },
    async createTruck(data) {
      const quantity = Number(data.quantity);
      const pricePerQuintal =
        data.pricePerQuintal != null && data.pricePerQuintal !== ''
          ? Number(data.pricePerQuintal)
          : null;
      const totalAmount =
        pricePerQuintal != null && !Number.isNaN(pricePerQuintal) ? pricePerQuintal * quantity : null;

      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : null;

      const row = {
        id: uid('trk'),
        date: data.date,
        truckNumber: String(data.truckNumber).trim(),
        driverName: data.driverName ? String(data.driverName).trim() : '',
        rawMaterial: String(data.rawMaterial).trim(),
        quantity,
        pricePerQuintal: pricePerQuintal ?? undefined,
        totalAmount: totalAmount ?? undefined,
        party: party || undefined,
        origin: data.origin ? String(data.origin).trim() : '',
        destination: data.destination ? String(data.destination).trim() : '',
        notes: data.notes ? String(data.notes).trim() : '',
        createdAt: new Date().toISOString()
      };

      await pool.query(
        `INSERT INTO trucks (
          id, date, truck_number, driver_name, raw_material, quantity, price_per_quintal, total_amount, party, origin, destination, notes, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          row.id,
          row.date,
          row.truckNumber,
          row.driverName,
          row.rawMaterial,
          row.quantity,
          row.pricePerQuintal ?? null,
          row.totalAmount ?? null,
          row.party ?? null,
          row.origin,
          row.destination,
          row.notes,
          row.createdAt
        ]
      );

      return row;
    },
    async deleteTruck(id) {
      const res = await pool.query('DELETE FROM trucks WHERE id = $1', [id]);
      return res.rowCount > 0;
    },
    async listTrucks(filter) {
      const values = [];
      let where = 'WHERE 1=1';

      if (filter?.dateFrom) {
        values.push(filter.dateFrom);
        where += ` AND date >= $${values.length}`;
      }
      if (filter?.dateTo) {
        values.push(filter.dateTo);
        where += ` AND date <= $${values.length}`;
      }

      const res = await pool.query(`SELECT * FROM trucks ${where} ORDER BY date DESC`, values);
      return res.rows.map((r) => ({
        id: r.id,
        date: String(r.date).slice(0, 10),
        truckNumber: r.truck_number,
        driverName: r.driver_name || '',
        rawMaterial: r.raw_material,
        quantity: Number(r.quantity),
        pricePerQuintal: r.price_per_quintal != null ? Number(r.price_per_quintal) : null,
        totalAmount: r.total_amount != null ? Number(r.total_amount) : null,
        party: r.party || null,
        origin: r.origin || '',
        destination: r.destination || '',
        notes: r.notes || ''
      }));
    },
    async listExpenses(filter) {
      const values = [];
      let where = 'WHERE 1=1';
      if (filter?.dateFrom) {
        values.push(filter.dateFrom);
        where += ` AND date >= $${values.length}`;
      }
      if (filter?.dateTo) {
        values.push(filter.dateTo);
        where += ` AND date <= $${values.length}`;
      }
      const res = await pool.query(`SELECT * FROM expenses ${where} ORDER BY date DESC`, values);
      return res.rows.map((r) => ({
        id: r.id,
        date: String(r.date).slice(0, 10),
        party: r.party || 'narayan',
        description: r.description || '',
        amount: Number(r.amount),
        createdAt: r.created_at
      }));
    },
    async createExpense(data) {
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : 'narayan';
      const row = {
        id: uid('exp'),
        date: data.date,
        party,
        description: String(data.description || '').trim() || 'Expense',
        amount: Number(data.amount),
        createdAt: new Date().toISOString()
      };
      await pool.query(
        'INSERT INTO expenses (id, date, party, description, amount, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [row.id, row.date, row.party, row.description, row.amount, row.createdAt]
      );
      return row;
    },
    async updateExpense(id, data) {
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : 'narayan';
      const res = await pool.query(
        `UPDATE expenses
         SET date = $2, party = $3, description = $4, amount = $5
         WHERE id = $1
         RETURNING *`,
        [id, data.date, party, String(data.description || '').trim() || 'Expense', Number(data.amount)]
      );
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        date: String(r.date).slice(0, 10),
        party: r.party || 'narayan',
        description: r.description || '',
        amount: Number(r.amount),
        createdAt: r.created_at
      };
    },
    async deleteExpense(id) {
      const res = await pool.query('DELETE FROM expenses WHERE id = $1', [id]);
      return res.rowCount > 0;
    },
    async listInvestments(filter) {
      const values = [];
      let where = 'WHERE 1=1';
      if (filter?.dateFrom) {
        values.push(filter.dateFrom);
        where += ` AND date >= $${values.length}`;
      }
      if (filter?.dateTo) {
        values.push(filter.dateTo);
        where += ` AND date <= $${values.length}`;
      }
      const res = await pool.query(`SELECT * FROM investments ${where} ORDER BY date DESC`, values);
      return res.rows.map((r) => ({
        id: r.id,
        date: String(r.date).slice(0, 10),
        party: r.party || 'narayan',
        amount: Number(r.amount),
        note: r.note || '',
        createdAt: r.created_at
      }));
    },
    async createInvestment(data) {
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : 'narayan';
      const row = {
        id: uid('inv'),
        date: data.date,
        party,
        amount: Number(data.amount),
        note: String(data.note || '').trim(),
        createdAt: new Date().toISOString()
      };
      await pool.query(
        'INSERT INTO investments (id, date, party, amount, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [row.id, row.date, row.party, row.amount, row.note, row.createdAt]
      );
      return row;
    },
    async updateInvestment(id, data) {
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : 'narayan';
      const res = await pool.query(
        `UPDATE investments
         SET date = $2, party = $3, amount = $4, note = $5
         WHERE id = $1
         RETURNING *`,
        [id, data.date, party, Number(data.amount), String(data.note || '').trim()]
      );
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        date: String(r.date).slice(0, 10),
        party: r.party || 'narayan',
        amount: Number(r.amount),
        note: r.note || '',
        createdAt: r.created_at
      };
    },
    async deleteInvestment(id) {
      const res = await pool.query('DELETE FROM investments WHERE id = $1', [id]);
      return res.rowCount > 0;
    },
    async listChiniExpenses(filter) {
      const values = [];
      let where = 'WHERE 1=1';
      if (filter?.dateFrom) {
        values.push(filter.dateFrom);
        where += ` AND date >= $${values.length}`;
      }
      if (filter?.dateTo) {
        values.push(filter.dateTo);
        where += ` AND date <= $${values.length}`;
      }
      const res = await pool.query(`SELECT * FROM chini_expenses ${where} ORDER BY date DESC`, values);
      return res.rows.map((r) => ({
        id: r.id,
        date: String(r.date).slice(0, 10),
        party: r.party || 'narayan',
        description: r.description || '',
        amount: Number(r.amount),
        createdAt: r.created_at
      }));
    },
    async createChiniExpense(data) {
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : 'narayan';
      const row = {
        id: uid('chi'),
        date: data.date,
        party,
        description: String(data.description || '').trim() || 'Chini Mill Expense',
        amount: Number(data.amount),
        createdAt: new Date().toISOString()
      };
      await pool.query(
        'INSERT INTO chini_expenses (id, date, party, description, amount, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [row.id, row.date, row.party, row.description, row.amount, row.createdAt]
      );
      return row;
    },
    async updateChiniExpense(id, data) {
      const party = ['narayan', 'maa_vaishno'].includes(String(data.party || '').toLowerCase())
        ? String(data.party).toLowerCase()
        : 'narayan';
      const res = await pool.query(
        `UPDATE chini_expenses
         SET date = $2, party = $3, description = $4, amount = $5, updated_at = $6
         WHERE id = $1
         RETURNING *`,
        [id, data.date, party, String(data.description || '').trim() || 'Chini Mill Expense', Number(data.amount), new Date().toISOString()]
      );
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        date: String(r.date).slice(0, 10),
        party: r.party || 'narayan',
        description: r.description || '',
        amount: Number(r.amount),
        createdAt: r.created_at
      };
    },
    async deleteChiniExpense(id) {
      const res = await pool.query('DELETE FROM chini_expenses WHERE id = $1', [id]);
      return res.rowCount > 0;
    },
    async listLandRecords() {
      const res = await pool.query('SELECT * FROM land_records ORDER BY created_at DESC');
      return res.rows.map((r) => ({
        id: r.id,
        area: r.area,
        ownerName: r.owner_name,
        amountPaid: Number(r.amount_paid),
        amountToBeGiven: Number(r.amount_to_be_given),
        createdAt: r.created_at
      }));
    },
    async createLandRecord(data) {
      const row = {
        id: uid('land'),
        area: String(data.area || '').trim(),
        ownerName: String(data.ownerName || '').trim(),
        amountPaid: Number(data.amountPaid),
        amountToBeGiven: Number(data.amountToBeGiven),
        createdAt: new Date().toISOString()
      };
      await pool.query(
        'INSERT INTO land_records (id, area, owner_name, amount_paid, amount_to_be_given, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [row.id, row.area, row.ownerName, row.amountPaid, row.amountToBeGiven, row.createdAt]
      );
      return row;
    },
    async updateLandRecord(id, data) {
      const res = await pool.query(
        `UPDATE land_records
         SET area = $2, owner_name = $3, amount_paid = $4, amount_to_be_given = $5
         WHERE id = $1
         RETURNING *`,
        [id, String(data.area || '').trim(), String(data.ownerName || '').trim(), Number(data.amountPaid), Number(data.amountToBeGiven)]
      );
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        area: r.area,
        ownerName: r.owner_name,
        amountPaid: Number(r.amount_paid),
        amountToBeGiven: Number(r.amount_to_be_given),
        createdAt: r.created_at
      };
    },
    async listVehicles() {
      const res = await pool.query('SELECT * FROM vehicles ORDER BY created_at DESC');
      return res.rows.map((r) => ({
        id: r.id,
        vehicleName: r.vehicle_name,
        vehicleNumber: r.vehicle_number,
        monthlyPrice: Number(r.monthly_price),
        serviceDueDate: r.service_due_date ? String(r.service_due_date).slice(0, 10) : '',
        lastServiceDate: r.last_service_date ? String(r.last_service_date).slice(0, 10) : '',
        paymentStatus: r.payment_status,
        amountPaid: Number(r.amount_paid || 0),
        note: r.note || '',
        createdAt: r.created_at
      }));
    },
    async createVehicle(data) {
      const row = {
        id: uid('veh'),
        vehicleName: String(data.vehicleName || '').trim(),
        vehicleNumber: String(data.vehicleNumber || '').trim(),
        monthlyPrice: Number(data.monthlyPrice),
        serviceDueDate: data.serviceDueDate || null,
        lastServiceDate: data.lastServiceDate || null,
        paymentStatus: String(data.paymentStatus || 'pending').trim().toLowerCase(),
        amountPaid: Number(data.amountPaid || 0),
        note: String(data.note || '').trim(),
        createdAt: new Date().toISOString()
      };
      await pool.query(
        `INSERT INTO vehicles
         (id, vehicle_name, vehicle_number, monthly_price, service_due_date, last_service_date, payment_status, amount_paid, note, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          row.id,
          row.vehicleName,
          row.vehicleNumber,
          row.monthlyPrice,
          row.serviceDueDate,
          row.lastServiceDate,
          row.paymentStatus,
          row.amountPaid,
          row.note,
          row.createdAt
        ]
      );
      return row;
    },
    async updateVehicle(id, data) {
      const res = await pool.query(
        `UPDATE vehicles
         SET vehicle_name = $2,
             vehicle_number = $3,
             monthly_price = $4,
             service_due_date = $5,
             last_service_date = $6,
             payment_status = $7,
             amount_paid = $8,
             note = $9
         WHERE id = $1
         RETURNING *`,
        [
          id,
          String(data.vehicleName || '').trim(),
          String(data.vehicleNumber || '').trim(),
          Number(data.monthlyPrice),
          data.serviceDueDate || null,
          data.lastServiceDate || null,
          String(data.paymentStatus || 'pending').trim().toLowerCase(),
          Number(data.amountPaid || 0),
          String(data.note || '').trim()
        ]
      );
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        vehicleName: r.vehicle_name,
        vehicleNumber: r.vehicle_number,
        monthlyPrice: Number(r.monthly_price),
        serviceDueDate: r.service_due_date ? String(r.service_due_date).slice(0, 10) : '',
        lastServiceDate: r.last_service_date ? String(r.last_service_date).slice(0, 10) : '',
        paymentStatus: r.payment_status,
        amountPaid: Number(r.amount_paid || 0),
        note: r.note || '',
        createdAt: r.created_at
      };
    },
    async deleteVehicle(id) {
      const res = await pool.query('DELETE FROM vehicles WHERE id = $1', [id]);
      return res.rowCount > 0;
    },
    async deleteLandRecord(id) {
      const res = await pool.query('DELETE FROM land_records WHERE id = $1', [id]);
      return res.rowCount > 0;
    },
    async listSuppliers() {
      const res = await pool.query(
        `SELECT
           s.id,
           s.name,
           s.phone,
           s.alternate_phone,
           s.email,
           s.gst_no,
           s.address,
           s.material_type,
           s.payment_terms,
           s.opening_balance,
           s.created_at,
           s.updated_at,
           COALESCE(SUM(CASE WHEN t.type = 'truck' THEN t.amount ELSE 0 END), 0) AS total_material_amount,
           COALESCE(SUM(CASE WHEN t.type = 'truck' THEN t.quantity ELSE 0 END), 0) AS total_material_quantity,
           COALESCE(SUM(CASE WHEN t.type = 'truck' THEN 1 ELSE 0 END), 0)::int AS total_trucks,
           COALESCE(SUM(CASE WHEN t.type = 'payment' THEN t.amount ELSE 0 END), 0) AS total_paid
         FROM suppliers s
         LEFT JOIN supplier_transactions t ON t.supplier_id = s.id
         GROUP BY
           s.id, s.name, s.phone, s.alternate_phone, s.email, s.gst_no, s.address,
           s.material_type, s.payment_terms, s.opening_balance, s.created_at, s.updated_at
         ORDER BY s.name ASC`
      );
      return res.rows.map((r) => {
        const openingBalance = toSafeNumber(r.opening_balance, 0);
        const totalMaterialAmount = toSafeNumber(r.total_material_amount, 0);
        const totalPaid = toSafeNumber(r.total_paid, 0);
        return {
          id: r.id,
          name: r.name,
          phone: r.phone || '',
          contact: r.phone || '',
          alternatePhone: r.alternate_phone || '',
          email: r.email || '',
          gstNo: normalizeGstNo(r.gst_no || ''),
          address: r.address || '',
          materialType: r.material_type || '',
          paymentTerms: r.payment_terms || '',
          openingBalance,
          totalTrucks: Number(r.total_trucks || 0),
          totalMaterialAmount,
          totalMaterialQuantity: toSafeNumber(r.total_material_quantity, 0),
          totalPaid,
          balance: openingBalance + totalMaterialAmount - totalPaid,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : ''
        };
      });
    },
    async getSupplierById(id) {
      const res = await pool.query(
        `SELECT
           s.id,
           s.name,
           s.phone,
           s.alternate_phone,
           s.email,
           s.gst_no,
           s.address,
           s.material_type,
           s.payment_terms,
           s.opening_balance,
           s.created_at,
           s.updated_at,
           COALESCE(SUM(CASE WHEN t.type = 'truck' THEN t.amount ELSE 0 END), 0) AS total_material_amount,
           COALESCE(SUM(CASE WHEN t.type = 'truck' THEN t.quantity ELSE 0 END), 0) AS total_material_quantity,
           COALESCE(SUM(CASE WHEN t.type = 'truck' THEN 1 ELSE 0 END), 0)::int AS total_trucks,
           COALESCE(SUM(CASE WHEN t.type = 'payment' THEN t.amount ELSE 0 END), 0) AS total_paid
         FROM suppliers s
         LEFT JOIN supplier_transactions t ON t.supplier_id = s.id
         WHERE s.id = $1
         GROUP BY
           s.id, s.name, s.phone, s.alternate_phone, s.email, s.gst_no, s.address,
           s.material_type, s.payment_terms, s.opening_balance, s.created_at, s.updated_at`,
        [id]
      );
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      const openingBalance = toSafeNumber(r.opening_balance, 0);
      const totalMaterialAmount = toSafeNumber(r.total_material_amount, 0);
      const totalPaid = toSafeNumber(r.total_paid, 0);
      return {
        id: r.id,
        name: r.name,
        phone: r.phone || '',
        contact: r.phone || '',
        alternatePhone: r.alternate_phone || '',
        email: r.email || '',
        gstNo: normalizeGstNo(r.gst_no || ''),
        address: r.address || '',
        materialType: r.material_type || '',
        paymentTerms: r.payment_terms || '',
        openingBalance,
        totalTrucks: Number(r.total_trucks || 0),
        totalMaterialAmount,
        totalMaterialQuantity: toSafeNumber(r.total_material_quantity, 0),
        totalPaid,
        balance: openingBalance + totalMaterialAmount - totalPaid,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : ''
      };
    },
    async createSupplier(data) {
      const supplier = normalizeSupplier(data || {});
      const now = new Date().toISOString();
      const row = {
        id: uid('sup'),
        ...supplier,
        createdAt: now,
        updatedAt: now
      };
      await pool.query(
        `INSERT INTO suppliers
          (id, name, phone, alternate_phone, email, gst_no, address, material_type, payment_terms, opening_balance, created_at, updated_at)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          row.id,
          row.name,
          row.phone || null,
          row.alternatePhone || null,
          row.email || null,
          row.gstNo || null,
          row.address || null,
          row.materialType || null,
          row.paymentTerms || null,
          row.openingBalance,
          row.createdAt,
          row.updatedAt
        ]
      );
      return await this.getSupplierById(row.id);
    },
    async updateSupplier(id, data) {
      const supplier = normalizeSupplier(data || {});
      const res = await pool.query(
        `UPDATE suppliers
         SET name = $2,
             phone = $3,
             alternate_phone = $4,
             email = $5,
             gst_no = $6,
             address = $7,
             material_type = $8,
             payment_terms = $9,
             opening_balance = $10,
             updated_at = $11
         WHERE id = $1
         RETURNING id`,
        [
          id,
          supplier.name,
          supplier.phone || null,
          supplier.alternatePhone || null,
          supplier.email || null,
          supplier.gstNo || null,
          supplier.address || null,
          supplier.materialType || null,
          supplier.paymentTerms || null,
          supplier.openingBalance,
          new Date().toISOString()
        ]
      );
      if (!res.rows[0]) return null;
      return await this.getSupplierById(id);
    },
    async deleteSupplier(id) {
      const res = await pool.query('DELETE FROM suppliers WHERE id = $1', [id]);
      return res.rowCount > 0;
    },
    async listSupplierTransactions(supplierId) {
      const res = await pool.query(
        `SELECT *
         FROM supplier_transactions
         WHERE supplier_id = $1
         ORDER BY date DESC, created_at DESC, id DESC`,
        [supplierId]
      );
      return res.rows.map((r) => ({
        id: r.id,
        supplierId: r.supplier_id,
        date: String(r.date).slice(0, 10),
        type: r.type,
        amount: toSafeNumber(r.amount, 0),
        truckNumber: r.truck_number || '',
        challanNo: r.challan_no || '',
        material: r.material || '',
        quantity: r.quantity == null ? null : toSafeNumber(r.quantity, 0),
        rate: r.rate == null ? null : toSafeNumber(r.rate, 0),
        paidNow: r.paid_now == null ? 0 : toSafeNumber(r.paid_now, 0),
        paymentMode: r.payment_mode || '',
        paymentRef: r.payment_ref || '',
        note: r.note || '',
        linkedTransactionId: r.linked_transaction_id || '',
        isAutoPayment: Boolean(r.is_auto_payment),
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : ''
      }));
    },
    async getSupplierTransactionById(id) {
      const res = await pool.query('SELECT * FROM supplier_transactions WHERE id = $1', [id]);
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        supplierId: r.supplier_id,
        date: String(r.date).slice(0, 10),
        type: r.type,
        amount: toSafeNumber(r.amount, 0),
        truckNumber: r.truck_number || '',
        challanNo: r.challan_no || '',
        material: r.material || '',
        quantity: r.quantity == null ? null : toSafeNumber(r.quantity, 0),
        rate: r.rate == null ? null : toSafeNumber(r.rate, 0),
        paidNow: r.paid_now == null ? 0 : toSafeNumber(r.paid_now, 0),
        paymentMode: r.payment_mode || '',
        paymentRef: r.payment_ref || '',
        note: r.note || '',
        linkedTransactionId: r.linked_transaction_id || '',
        isAutoPayment: Boolean(r.is_auto_payment),
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : ''
      };
    },
    async createSupplierTransaction(data) {
      const tx = normalizeSupplierTransaction(data || {}, data.supplierId);
      const now = new Date().toISOString();
      const row = {
        id: uid('stx'),
        supplierId: tx.supplierId,
        date: tx.date,
        type: tx.type,
        amount: tx.amount,
        truckNumber: tx.truckNumber || '',
        challanNo: tx.challanNo || '',
        material: tx.material || '',
        quantity: tx.quantity,
        rate: tx.rate,
        paidNow: tx.paidNow > 0 ? tx.paidNow : 0,
        paymentMode: tx.paymentMode || '',
        paymentRef: tx.paymentRef || '',
        note: tx.note || '',
        linkedTransactionId: tx.linkedTransactionId || '',
        isAutoPayment: Boolean(tx.isAutoPayment),
        createdAt: now,
        updatedAt: now
      };
      await pool.query(
        `INSERT INTO supplier_transactions
          (id, supplier_id, date, type, amount, truck_number, challan_no, material, quantity, rate, paid_now, payment_mode, payment_ref, note, linked_transaction_id, is_auto_payment, created_at, updated_at)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          row.id,
          row.supplierId,
          row.date,
          row.type,
          row.amount,
          row.truckNumber || null,
          row.challanNo || null,
          row.material || null,
          row.quantity == null ? null : row.quantity,
          row.rate == null ? null : row.rate,
          row.paidNow || null,
          row.paymentMode || null,
          row.paymentRef || null,
          row.note || null,
          row.linkedTransactionId || null,
          row.isAutoPayment,
          row.createdAt,
          row.updatedAt
        ]
      );
      return row;
    },
    async updateSupplierTransaction(id, data) {
      const existing = await this.getSupplierTransactionById(id);
      if (!existing) return null;
      const tx = normalizeSupplierTransaction(data || {}, existing.supplierId);
      const updatedAt = new Date().toISOString();
      const res = await pool.query(
        `UPDATE supplier_transactions
         SET date = $2,
             type = $3,
             amount = $4,
             truck_number = $5,
             challan_no = $6,
             material = $7,
             quantity = $8,
             rate = $9,
             paid_now = $10,
             payment_mode = $11,
             payment_ref = $12,
             note = $13,
             linked_transaction_id = $14,
             is_auto_payment = $15,
             updated_at = $16
         WHERE id = $1
         RETURNING *`,
        [
          id,
          tx.date,
          tx.type,
          tx.amount,
          tx.truckNumber || null,
          tx.challanNo || null,
          tx.material || null,
          tx.quantity == null ? null : tx.quantity,
          tx.rate == null ? null : tx.rate,
          tx.paidNow > 0 ? tx.paidNow : null,
          tx.paymentMode || null,
          tx.paymentRef || null,
          tx.note || null,
          tx.linkedTransactionId || null,
          Boolean(tx.isAutoPayment),
          updatedAt
        ]
      );
      if (!res.rows[0]) return null;
      return await this.getSupplierTransactionById(id);
    },
    async deleteSupplierTransaction(id) {
      const res = await pool.query('DELETE FROM supplier_transactions WHERE id = $1', [id]);
      return res.rowCount > 0;
    },
    async listBillingCompanies() {
      const res = await pool.query('SELECT * FROM billing_companies ORDER BY company_name ASC');
      return res.rows.map((r) => ({
        id: r.id,
        gstNo: normalizeGstNo(r.gst_no),
        companyName: r.company_name,
        address: r.address,
        state: r.state || '',
        stateCode: r.state_code || '',
        contactPerson: r.contact_person || '',
        phone: r.phone || '',
        email: r.email || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));
    },
    async getBillingCompanyByGst(gstNo) {
      const normalized = normalizeGstNo(gstNo);
      if (!normalized) return null;
      const res = await pool.query('SELECT * FROM billing_companies WHERE gst_no = $1', [normalized]);
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        gstNo: normalizeGstNo(r.gst_no),
        companyName: r.company_name,
        address: r.address,
        state: r.state || '',
        stateCode: r.state_code || '',
        contactPerson: r.contact_person || '',
        phone: r.phone || '',
        email: r.email || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at
      };
    },
    async upsertBillingCompany(data) {
      const company = normalizeBillCompany(data);
      const res = await pool.query(
        `INSERT INTO billing_companies
          (id, gst_no, company_name, address, state, state_code, contact_person, phone, email, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (gst_no)
         DO UPDATE SET
           company_name = EXCLUDED.company_name,
           address = EXCLUDED.address,
           state = EXCLUDED.state,
           state_code = EXCLUDED.state_code,
           contact_person = EXCLUDED.contact_person,
           phone = EXCLUDED.phone,
           email = EXCLUDED.email,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [
          uid('bc'),
          company.gstNo,
          company.companyName,
          company.address,
          company.state,
          company.stateCode,
          company.contactPerson,
          company.phone,
          company.email,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
      const r = res.rows[0];
      return {
        id: r.id,
        gstNo: normalizeGstNo(r.gst_no),
        companyName: r.company_name,
        address: r.address,
        state: r.state || '',
        stateCode: r.state_code || '',
        contactPerson: r.contact_person || '',
        phone: r.phone || '',
        email: r.email || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at
      };
    },
    async listBills() {
      const res = await pool.query('SELECT * FROM bills ORDER BY bill_date DESC, created_at DESC');
      return res.rows.map((r) => ({
        id: r.id,
        invoiceNo: r.invoice_no,
        billDate: String(r.bill_date).slice(0, 10),
        dueDate: r.due_date ? String(r.due_date).slice(0, 10) : '',
        vehicleNo: r.vehicle_no || '',
        company: {
          gstNo: normalizeGstNo(r.company_gst_no),
          companyName: r.company_name,
          address: r.company_address,
          state: r.company_state || '',
          stateCode: r.company_state_code || '',
          contactPerson: r.contact_person || '',
          phone: r.company_phone || '',
          email: r.company_email || ''
        },
        placeOfSupply: r.place_of_supply || '',
        reverseCharge: Boolean(r.reverse_charge),
        items: Array.isArray(r.items) ? r.items : [],
        subtotal: Number(r.subtotal || 0),
        totalGst: Number(r.total_gst || 0),
        grandTotal: Number(r.grand_total || 0),
        notes: r.notes || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));
    },
    async getBillById(id) {
      const res = await pool.query('SELECT * FROM bills WHERE id = $1', [id]);
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        invoiceNo: r.invoice_no,
        billDate: String(r.bill_date).slice(0, 10),
        dueDate: r.due_date ? String(r.due_date).slice(0, 10) : '',
        vehicleNo: r.vehicle_no || '',
        company: {
          gstNo: normalizeGstNo(r.company_gst_no),
          companyName: r.company_name,
          address: r.company_address,
          state: r.company_state || '',
          stateCode: r.company_state_code || '',
          contactPerson: r.contact_person || '',
          phone: r.company_phone || '',
          email: r.company_email || ''
        },
        placeOfSupply: r.place_of_supply || '',
        reverseCharge: Boolean(r.reverse_charge),
        items: Array.isArray(r.items) ? r.items : [],
        subtotal: Number(r.subtotal || 0),
        totalGst: Number(r.total_gst || 0),
        grandTotal: Number(r.grand_total || 0),
        notes: r.notes || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at
      };
    },
    async createBill(data) {
      const company = normalizeBillCompany(data.company || {});
      const items = cleanInvoiceItems(data.items);
      const totals = calcInvoiceTotals(items);
      await this.upsertBillingCompany(company);
      const now = new Date().toISOString();
      const row = {
        id: uid('bill'),
        invoiceNo: String(data.invoiceNo || '').trim(),
        billDate: String(data.billDate),
        dueDate: data.dueDate ? String(data.dueDate) : null,
        vehicleNo: String(data.vehicleNo || '').trim(),
        company,
        placeOfSupply: String(data.placeOfSupply || '').trim(),
        reverseCharge: Boolean(data.reverseCharge),
        items,
        subtotal: totals.subtotal,
        totalGst: totals.totalGst,
        grandTotal: totals.grandTotal,
        notes: String(data.notes || '').trim(),
        createdAt: now,
        updatedAt: now
      };
      await pool.query(
        `INSERT INTO bills
          (id, invoice_no, bill_date, due_date, vehicle_no, company_gst_no, company_name, company_address, company_state, company_state_code,
           contact_person, company_phone, company_email, place_of_supply, reverse_charge, items, subtotal, total_gst, grand_total, notes, created_at, updated_at)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20,$21,$22)`,
        [
          row.id,
          row.invoiceNo,
          row.billDate,
          row.dueDate,
          row.vehicleNo || null,
          row.company.gstNo,
          row.company.companyName,
          row.company.address,
          row.company.state || null,
          row.company.stateCode || null,
          row.company.contactPerson || null,
          row.company.phone || null,
          row.company.email || null,
          row.placeOfSupply || null,
          row.reverseCharge,
          JSON.stringify(row.items),
          row.subtotal,
          row.totalGst,
          row.grandTotal,
          row.notes || null,
          row.createdAt,
          row.updatedAt
        ]
      );
      return row;
    },
    async updateBill(id, data) {
      const company = normalizeBillCompany(data.company || {});
      const items = cleanInvoiceItems(data.items);
      const totals = calcInvoiceTotals(items);
      await this.upsertBillingCompany(company);
      const updatedAt = new Date().toISOString();
      const res = await pool.query(
        `UPDATE bills
         SET invoice_no = $2,
             bill_date = $3,
             due_date = $4,
             vehicle_no = $5,
             company_gst_no = $6,
             company_name = $7,
             company_address = $8,
             company_state = $9,
             company_state_code = $10,
             contact_person = $11,
             company_phone = $12,
             company_email = $13,
             place_of_supply = $14,
             reverse_charge = $15,
             items = $16::jsonb,
             subtotal = $17,
             total_gst = $18,
             grand_total = $19,
             notes = $20,
             updated_at = $21
         WHERE id = $1
         RETURNING *`,
        [
          id,
          String(data.invoiceNo || '').trim(),
          String(data.billDate),
          data.dueDate ? String(data.dueDate) : null,
          String(data.vehicleNo || '').trim() || null,
          company.gstNo,
          company.companyName,
          company.address,
          company.state || null,
          company.stateCode || null,
          company.contactPerson || null,
          company.phone || null,
          company.email || null,
          String(data.placeOfSupply || '').trim() || null,
          Boolean(data.reverseCharge),
          JSON.stringify(items),
          totals.subtotal,
          totals.totalGst,
          totals.grandTotal,
          String(data.notes || '').trim() || null,
          updatedAt
        ]
      );
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        invoiceNo: r.invoice_no,
        billDate: String(r.bill_date).slice(0, 10),
        dueDate: r.due_date ? String(r.due_date).slice(0, 10) : '',
        vehicleNo: r.vehicle_no || '',
        company: {
          gstNo: normalizeGstNo(r.company_gst_no),
          companyName: r.company_name,
          address: r.company_address,
          state: r.company_state || '',
          stateCode: r.company_state_code || '',
          contactPerson: r.contact_person || '',
          phone: r.company_phone || '',
          email: r.company_email || ''
        },
        placeOfSupply: r.place_of_supply || '',
        reverseCharge: Boolean(r.reverse_charge),
        items: Array.isArray(r.items) ? r.items : [],
        subtotal: Number(r.subtotal || 0),
        totalGst: Number(r.total_gst || 0),
        grandTotal: Number(r.grand_total || 0),
        notes: r.notes || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at
      };
    },
    async deleteBill(id) {
      const res = await pool.query('DELETE FROM bills WHERE id = $1', [id]);
      return res.rowCount > 0;
    },
    async dashboard(month, today) {
      const employeesRes = await pool.query('SELECT COUNT(*)::int AS c, COALESCE(SUM(monthly_salary), 0) AS total FROM employees');
      const advancesRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM salary_advances
         WHERE TO_CHAR(date, 'YYYY-MM') = $1`,
        [month]
      );
      const attendanceRes = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END), 0)::int AS present,
           COALESCE(SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END), 0)::int AS absent
         FROM attendance
         WHERE date = $1`,
        [today]
      );
      const truckRes = await pool.query(
        `SELECT COUNT(*)::int AS c, COALESCE(SUM(quantity), 0) AS qty
         FROM trucks
         WHERE TO_CHAR(date, 'YYYY-MM') = $1`,
        [month]
      );

      const totalSalary = Number(employeesRes.rows[0].total || 0);
      const totalAdvances = Number(advancesRes.rows[0].total || 0);

      return {
        month,
        today,
        totalEmployees: employeesRes.rows[0].c,
        totalSalary,
        totalAdvances,
        totalRemaining: Math.max(0, totalSalary - totalAdvances),
        presentToday: attendanceRes.rows[0].present,
        absentToday: attendanceRes.rows[0].absent,
        truckCountThisMonth: truckRes.rows[0].c,
        truckQuantityThisMonth: Number(truckRes.rows[0].qty || 0)
      };
    }
  };
}

const store = STORAGE_MODE === 'postgres' ? postgresStore() : jsonStore();

app.get('/healthz', async (_req, res) => {
  try {
    const health = await store.healthCheck();
    return res.json({
      status: 'ok',
      app: APP_NAME,
      storageMode: store.mode,
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT.getTime()) / 1000),
      ...health
    });
  } catch (err) {
    console.error(err);
    return res.status(503).json({
      status: 'degraded',
      app: APP_NAME,
      storageMode: store.mode,
      error: 'Health check failed'
    });
  }
});

function auth(req, res, next) {
  const tokenHeader = req.header('authorization') || '';
  const bearer = tokenHeader.startsWith('Bearer ') ? tokenHeader.slice(7) : '';
  const token = bearer || req.header('x-auth-token') || req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  store
    .getSession(token)
    .then(async (session) => {
      if (!session) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      if (new Date(session.expiresAt).getTime() < Date.now()) {
        await store.deleteExpiredSession(token);
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await store.getUserById(session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User missing' });
      }

      req.auth = { token, user };
      return next();
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Auth error' });
    });
}

function requirePermission(permission) {
  return (req, res, next) => {
    const perms = ROLE_PERMISSIONS[req.auth.user.role] || [];
    if (perms.includes('*') || perms.includes(permission)) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden' });
  };
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const user = await store.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = uid('token');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
    await store.createSession(token, user.id, expiresAt);

    return res.json({ token, user: userView(user), expiresAt, storageMode: store.mode });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/me', auth, (req, res) => {
  res.json({ ...userView(req.auth.user), storageMode: store.mode });
});

app.post('/api/logout', auth, async (req, res) => {
  try {
    await store.deleteSession(req.auth.token);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

app.post('/api/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }

  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
  }

  try {
    const valid = await bcrypt.compare(String(currentPassword), req.auth.user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(String(newPassword), 10);
    const updated = await store.updateUserPassword(req.auth.user.id, hash);
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to change password' });
  }
});

app.get('/api/employees', auth, requirePermission('employees:view'), async (_req, res) => {
  try {
    const employees = await store.listEmployees();
    return res.json(employees);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch employees' });
  }
});

app.post('/api/employees', auth, requirePermission('employees:create'), async (req, res) => {
  const { name, role, monthlySalary, joiningDate } = req.body;

  if (!name || !role || !monthlySalary) {
    return res.status(400).json({ error: 'name, role and monthlySalary are required' });
  }

  const numericSalary = Number(monthlySalary);
  if (Number.isNaN(numericSalary) || numericSalary <= 0) {
    return res.status(400).json({ error: 'monthlySalary must be a positive number' });
  }
  if (joiningDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(joiningDate))) {
    return res.status(400).json({ error: 'joiningDate must be in YYYY-MM-DD format' });
  }

  try {
    const employee = await store.createEmployee({
      name,
      role,
      monthlySalary: numericSalary,
      joiningDate: joiningDate || undefined
    });
    return res.status(201).json(employee);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create employee' });
  }
});

app.put('/api/employees/:id', auth, requirePermission('employees:update'), async (req, res) => {
  const { name, role, monthlySalary, joiningDate } = req.body;
  if (!name || !role || !monthlySalary) {
    return res.status(400).json({ error: 'name, role and monthlySalary are required' });
  }

  const numericSalary = Number(monthlySalary);
  if (Number.isNaN(numericSalary) || numericSalary <= 0) {
    return res.status(400).json({ error: 'monthlySalary must be a positive number' });
  }
  if (joiningDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(joiningDate))) {
    return res.status(400).json({ error: 'joiningDate must be in YYYY-MM-DD format' });
  }

  try {
    const updated = await store.updateEmployee(req.params.id, {
      name,
      role,
      monthlySalary: numericSalary,
      joiningDate: joiningDate || undefined
    });

    if (!updated) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update employee' });
  }
});

app.delete('/api/employees/:id', auth, requirePermission('employees:delete'), async (req, res) => {
  try {
    const deleted = await store.deleteEmployee(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete employee' });
  }
});

app.post('/api/attendance', auth, requirePermission('attendance:create'), async (req, res) => {
  const { employeeId, date, status } = req.body;

  if (!employeeId || !date || !status) {
    return res.status(400).json({ error: 'employeeId, date, status are required' });
  }

  if (!['present', 'absent'].includes(status)) {
    return res.status(400).json({ error: 'status must be present or absent' });
  }

  try {
    const employee = await store.getEmployeeById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const attendance = await store.upsertAttendance(employeeId, date, status);
    return res.status(201).json(attendance);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to save attendance' });
  }
});

app.get('/api/attendance', auth, requirePermission('attendance:view'), async (req, res) => {
  try {
    const rows = await store.listAttendance(req.query.date);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch attendance' });
  }
});

app.get('/api/attendance-report', auth, requirePermission('attendance:report'), async (req, res) => {
  const month = req.query.month || currentMonth();
  try {
    const rows = await store.attendanceReport(month);
    return res.json({ month, rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch attendance report' });
  }
});

app.put('/api/advances/set', auth, requirePermission('advances:create'), async (req, res) => {
  const { employeeId, month, totalAdvances } = req.body;
  if (!employeeId || !month) {
    return res.status(400).json({ error: 'employeeId and month are required' });
  }
  const total = Number(totalAdvances);
  if (Number.isNaN(total) || total < 0) {
    return res.status(400).json({ error: 'totalAdvances must be a non-negative number' });
  }
  try {
    const employee = await store.getEmployeeById(employeeId);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    await store.setAdvancesForMonth(employeeId, month, total);
    const rows = await store.salaryRows(month);
    const row = rows.find((r) => r.employeeId === employeeId);
    return res.json({ ok: true, row: row || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to set advances' });
  }
});

app.post('/api/advances', auth, requirePermission('advances:create'), async (req, res) => {
  const { employeeId, date, amount, note } = req.body;

  if (!employeeId || !date || !amount) {
    return res.status(400).json({ error: 'employeeId, date, amount are required' });
  }

  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  try {
    const employee = await store.getEmployeeById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const advance = await store.createAdvance({ employeeId, date, amount: numericAmount, note });
    return res.status(201).json(advance);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create advance' });
  }
});

app.get('/api/salary-summary', auth, requirePermission('salary:view'), async (req, res) => {
  const month = req.query.month || currentMonth();
  try {
    const rows = await store.salaryRows(month);
    return res.json({ month, rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch salary summary' });
  }
});

app.get('/api/salary-ledgers', auth, requirePermission('salaryledger:view'), async (_req, res) => {
  try {
    const rows = await store.listSalaryLedgers();
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch salary ledgers' });
  }
});

app.put('/api/salary-ledgers/:employeeId', auth, requirePermission('salaryledger:update'), async (req, res) => {
  const { totalSalary, amountGiven, totalPaid, totalToGive, note } = req.body;
  const paidRaw = totalPaid != null ? totalPaid : amountGiven;
  const toGiveRaw = totalToGive;
  const totalRaw = totalSalary;

  if (paidRaw == null || (toGiveRaw == null && totalRaw == null)) {
    return res.status(400).json({ error: 'totalPaid and totalToGive are required' });
  }
  const given = Number(paidRaw || 0);
  const toGive = Number(toGiveRaw != null ? toGiveRaw : totalRaw);
  const total = Number(totalRaw != null ? totalRaw : toGive);
  if (Number.isNaN(total) || total < 0 || Number.isNaN(given) || given < 0 || Number.isNaN(toGive) || toGive < 0) {
    return res.status(400).json({ error: 'totalPaid, totalToGive and totalSalary must be valid non-negative numbers' });
  }
  if (given > toGive) {
    return res.status(400).json({ error: 'totalPaid cannot be greater than totalToGive' });
  }
  try {
    const employee = await store.getEmployeeById(req.params.employeeId);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    const row = await store.upsertSalaryLedger(req.params.employeeId, toGive, given, note, toGive);
    return res.json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update salary ledger' });
  }
});

app.get('/api/salary-slip/:employeeId.pdf', auth, requirePermission('salaryslip:view'), async (req, res) => {
  const month = req.query.month || currentMonth();

  try {
    const employee = await store.getEmployeeById(req.params.employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const advances = await store.getEmployeeAdvances(employee.id, month);
    const totalAdvance = advances.reduce((sum, a) => sum + Number(a.amount), 0);
    const [year, monthNum] = month.split('-').map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'month must be in YYYY-MM format' });
    }

    const monthStart = `${month}-01`;
    const monthDays = daysInMonth(year, monthNum - 1);
    const monthEnd = `${month}-${String(monthDays).padStart(2, '0')}`;

    const requestedUpto = req.query.uptoDate ? String(req.query.uptoDate) : null;
    if (requestedUpto && !/^\d{4}-\d{2}-\d{2}$/.test(requestedUpto)) {
      return res.status(400).json({ error: 'uptoDate must be in YYYY-MM-DD format' });
    }

    const today = new Date();
    const todayIso = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(
      today.getUTCDate()
    ).padStart(2, '0')}`;

    // Default behavior:
    // - Current month: count from 1st to today
    // - Past/future month: count full month unless uptoDate is provided
    let periodEnd = monthEnd;
    if (requestedUpto) {
      periodEnd = requestedUpto;
    } else if (month === currentMonth()) {
      periodEnd = todayIso;
    }

    if (periodEnd < monthStart) periodEnd = monthStart;
    if (periodEnd > monthEnd) periodEnd = monthEnd;

    const startDate = parseISODate(monthStart);
    const endDate = parseISODate(periodEnd);
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Invalid period dates' });
    }

    const daysCounted = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const monthlySalary = Number(employee.monthlySalary);
    const perDaySalary = monthlySalary / monthDays;
    const proratedSalary = perDaySalary * daysCounted;
    const remaining = Math.max(0, proratedSalary - totalAdvance);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="salary-slip-${employee.name}-${month}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageMargin = 40;
    const contentWidth = pageWidth - pageMargin * 2;
    const centerX = pageWidth / 2;
    const colors = {
      brand: '#0F3C8A',
      brandLight: '#EAF2FF',
      text: '#1A2538',
      muted: '#5D6A7E',
      success: '#0F9D58',
      border: '#D6DEEB'
    };

    const moneyText = (n) => `₹${Number(n).toFixed(2)}`;
    const generatedAt = new Date().toISOString();

    // Header band
    doc
      .save()
      .roundedRect(pageMargin, 30, contentWidth, 82, 12)
      .fill(colors.brandLight)
      .restore();

    // Center logo emblem
    const logoY = 46;
    doc
      .save()
      .circle(centerX, logoY + 20, 20)
      .fill(colors.brand)
      .restore();
    doc
      .fillColor('#FFFFFF')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('NE', centerX - 12, logoY + 13, { width: 24, align: 'center' });

    doc
      .fillColor(colors.brand)
      .font('Helvetica-Bold')
      .fontSize(17)
      .text(APP_NAME, pageMargin, 78, { width: contentWidth, align: 'center' });
    doc
      .fillColor(colors.text)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Salary Slip', pageMargin, 99, { width: contentWidth, align: 'center' });

    // Employee and period block
    let y = 130;
    doc
      .save()
      .roundedRect(pageMargin, y, contentWidth, 92, 10)
      .fill('#FFFFFF')
      .restore();
    doc
      .save()
      .roundedRect(pageMargin, y, contentWidth, 92, 10)
      .strokeColor(colors.border)
      .lineWidth(1)
      .stroke()
      .restore();

    doc.fillColor(colors.muted).fontSize(10).font('Helvetica-Bold');
    doc.text('Month', pageMargin + 14, y + 12);
    doc.text('Salary Period', pageMargin + 14, y + 38);
    doc.text('Generated', pageMargin + 14, y + 64);

    doc.text('Employee', pageMargin + contentWidth / 2, y + 12);
    doc.text('Role', pageMargin + contentWidth / 2, y + 38);
    doc.text('Days Counted', pageMargin + contentWidth / 2, y + 64);

    doc.fillColor(colors.text).font('Helvetica').fontSize(11);
    doc.text(month, pageMargin + 90, y + 12);
    doc.text(`${monthStart} to ${periodEnd}`, pageMargin + 90, y + 38);
    doc.text(generatedAt, pageMargin + 90, y + 64);

    doc.text(employee.name, pageMargin + contentWidth / 2 + 76, y + 12);
    doc.text(employee.role, pageMargin + contentWidth / 2 + 76, y + 38);
    doc.text(`${daysCounted} / ${monthDays}`, pageMargin + contentWidth / 2 + 76, y + 64);

    // Compensation summary cards
    y += 112;
    const gap = 10;
    const cardW = (contentWidth - gap) / 2;
    const cardH = 98;

    doc.save().roundedRect(pageMargin, y, cardW, cardH, 10).fill('#FFFFFF').restore();
    doc.save().roundedRect(pageMargin, y, cardW, cardH, 10).strokeColor(colors.border).stroke().restore();
    doc.save().roundedRect(pageMargin + cardW + gap, y, cardW, cardH, 10).fill('#FFFFFF').restore();
    doc
      .save()
      .roundedRect(pageMargin + cardW + gap, y, cardW, cardH, 10)
      .strokeColor(colors.border)
      .stroke()
      .restore();

    doc.fillColor(colors.brand).font('Helvetica-Bold').fontSize(11);
    doc.text('Salary Calculation', pageMargin + 12, y + 10);
    doc.fillColor(colors.text).font('Helvetica').fontSize(10.5);
    doc.text(`Monthly Salary: ${moneyText(monthlySalary)}`, pageMargin + 12, y + 32);
    doc.text(`Per Day Salary: ${moneyText(perDaySalary)}`, pageMargin + 12, y + 50);
    doc.text(`Prorated Salary: ${moneyText(proratedSalary)}`, pageMargin + 12, y + 68);

    doc.fillColor(colors.brand).font('Helvetica-Bold').fontSize(11);
    doc.text('Payment Status', pageMargin + cardW + gap + 12, y + 10);
    doc.fillColor(colors.text).font('Helvetica').fontSize(10.5);
    doc.text(`Total Advance: ${moneyText(totalAdvance)}`, pageMargin + cardW + gap + 12, y + 32);
    doc.text(`Remaining Payable: ${moneyText(remaining)}`, pageMargin + cardW + gap + 12, y + 50);
    doc.fillColor(colors.success).font('Helvetica-Bold').fontSize(12);
    doc.text(`Pending: ${moneyText(remaining)}`, pageMargin + cardW + gap + 12, y + 70);

    // Advance details section
    y += 120;
    doc.fillColor(colors.brand).font('Helvetica-Bold').fontSize(12);
    doc.text('Advance Details', pageMargin, y);
    y += 18;

    doc
      .save()
      .roundedRect(pageMargin, y, contentWidth, 24, 6)
      .fill(colors.brandLight)
      .restore();
    doc.fillColor(colors.brand).font('Helvetica-Bold').fontSize(10);
    doc.text('No.', pageMargin + 10, y + 7);
    doc.text('Date', pageMargin + 48, y + 7);
    doc.text('Amount', pageMargin + 160, y + 7);
    doc.text('Note', pageMargin + 280, y + 7);
    y += 30;

    if (advances.length === 0) {
      doc.fillColor(colors.muted).font('Helvetica').fontSize(10.5);
      doc.text('No advance transactions for this period.', pageMargin + 4, y + 2);
    } else {
      advances.forEach((a, idx) => {
        doc
          .save()
          .roundedRect(pageMargin, y - 2, contentWidth, 22, 4)
          .fill(idx % 2 === 0 ? '#FFFFFF' : '#F9FBFF')
          .restore();
        doc.fillColor(colors.text).font('Helvetica').fontSize(10);
        doc.text(String(idx + 1), pageMargin + 10, y + 4);
        doc.text(a.date, pageMargin + 48, y + 4);
        doc.text(moneyText(a.amount), pageMargin + 160, y + 4);
        doc.text(a.note || '-', pageMargin + 280, y + 4, { width: contentWidth - 290, ellipsis: true });
        y += 24;
      });
    }

    // Footer
    const footerY = doc.page.height - 46;
    doc
      .save()
      .moveTo(pageMargin, footerY - 8)
      .lineTo(pageMargin + contentWidth, footerY - 8)
      .strokeColor(colors.border)
      .stroke()
      .restore();
    doc.fillColor(colors.muted).font('Helvetica').fontSize(9);
    doc.text(`${APP_NAME} • Generated salary statement`, pageMargin, footerY, {
      width: contentWidth,
      align: 'center'
    });

    doc.end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to generate salary slip' });
  }
});

app.post('/api/trucks', auth, requirePermission('trucks:create'), async (req, res) => {
  const {
    date,
    truckNumber,
    driverName,
    rawMaterial,
    quantity,
    pricePerQuintal,
    party,
    origin,
    destination,
    notes
  } = req.body;

  if (!date || !truckNumber || !rawMaterial || !quantity) {
    return res.status(400).json({ error: 'date, truckNumber, rawMaterial, quantity are required' });
  }

  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'quantity must be a positive number' });
  }

  try {
    const truckEntry = await store.createTruck({
      date,
      truckNumber,
      driverName,
      rawMaterial,
      quantity: qty,
      pricePerQuintal: pricePerQuintal != null && pricePerQuintal !== '' ? pricePerQuintal : undefined,
      party,
      origin,
      destination,
      notes
    });

    return res.status(201).json(truckEntry);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create truck entry' });
  }
});

app.get('/api/trucks', auth, requirePermission('trucks:view'), async (req, res) => {
  try {
    const rows = await store.listTrucks({ dateFrom: req.query.dateFrom, dateTo: req.query.dateTo });
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch trucks' });
  }
});

app.put('/api/trucks/:id', auth, requirePermission('trucks:update'), async (req, res) => {
  const {
    date,
    truckNumber,
    driverName,
    rawMaterial,
    quantity,
    pricePerQuintal,
    party,
    origin,
    destination,
    notes
  } = req.body;

  if (!date || !truckNumber || !rawMaterial || !quantity) {
    return res.status(400).json({ error: 'date, truckNumber, rawMaterial, quantity are required' });
  }

  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'quantity must be a positive number' });
  }

  try {
    const row = await store.updateTruck(req.params.id, {
      date,
      truckNumber,
      driverName,
      rawMaterial,
      quantity: qty,
      pricePerQuintal: pricePerQuintal != null && pricePerQuintal !== '' ? pricePerQuintal : undefined,
      party,
      origin,
      destination,
      notes
    });
    if (!row) return res.status(404).json({ error: 'Truck entry not found' });
    return res.json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update truck entry' });
  }
});

app.delete('/api/trucks/:id', auth, requirePermission('trucks:delete'), async (req, res) => {
  try {
    const deleted = await store.deleteTruck(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Truck entry not found' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete truck entry' });
  }
});

app.get('/api/expenses', auth, requirePermission('expenses:view'), async (req, res) => {
  try {
    const rows = await store.listExpenses({ dateFrom: req.query.dateFrom, dateTo: req.query.dateTo });
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch expenses' });
  }
});

app.post('/api/expenses', auth, requirePermission('expenses:create'), async (req, res) => {
  const { date, party, description, amount } = req.body;
  if (!date || !party || amount == null) {
    return res.status(400).json({ error: 'date, party and amount are required' });
  }
  const numAmount = Number(amount);
  if (Number.isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!['narayan', 'maa_vaishno'].includes(String(party).toLowerCase())) {
    return res.status(400).json({ error: 'party must be narayan or maa_vaishno' });
  }
  try {
    const row = await store.createExpense({ date, party, description, amount: numAmount });
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create expense' });
  }
});

app.put('/api/expenses/:id', auth, requirePermission('expenses:update'), async (req, res) => {
  const { date, party, description, amount } = req.body;
  if (!date || !party || amount == null) {
    return res.status(400).json({ error: 'date, party and amount are required' });
  }
  const numAmount = Number(amount);
  if (Number.isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!['narayan', 'maa_vaishno'].includes(String(party).toLowerCase())) {
    return res.status(400).json({ error: 'party must be narayan or maa_vaishno' });
  }
  try {
    const row = await store.updateExpense(req.params.id, { date, party, description, amount: numAmount });
    if (!row) return res.status(404).json({ error: 'Expense not found' });
    return res.json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update expense' });
  }
});

app.delete('/api/expenses/:id', auth, requirePermission('expenses:delete'), async (req, res) => {
  try {
    const deleted = await store.deleteExpense(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Expense not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete expense' });
  }
});

app.get('/api/investments', auth, requirePermission('investments:view'), async (req, res) => {
  try {
    const rows = await store.listInvestments({ dateFrom: req.query.dateFrom, dateTo: req.query.dateTo });
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch investments' });
  }
});

app.post('/api/investments', auth, requirePermission('investments:create'), async (req, res) => {
  const { date, party, amount, note } = req.body;
  if (!date || !party || amount == null) {
    return res.status(400).json({ error: 'date, party and amount are required' });
  }
  const numAmount = Number(amount);
  if (Number.isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!['narayan', 'maa_vaishno'].includes(String(party).toLowerCase())) {
    return res.status(400).json({ error: 'party must be narayan or maa_vaishno' });
  }
  try {
    const row = await store.createInvestment({ date, party, amount: numAmount, note });
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create investment' });
  }
});

app.put('/api/investments/:id', auth, requirePermission('investments:update'), async (req, res) => {
  const { date, party, amount, note } = req.body;
  if (!date || !party || amount == null) {
    return res.status(400).json({ error: 'date, party and amount are required' });
  }
  const numAmount = Number(amount);
  if (Number.isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!['narayan', 'maa_vaishno'].includes(String(party).toLowerCase())) {
    return res.status(400).json({ error: 'party must be narayan or maa_vaishno' });
  }
  try {
    const row = await store.updateInvestment(req.params.id, { date, party, amount: numAmount, note });
    if (!row) return res.status(404).json({ error: 'Investment not found' });
    return res.json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update investment' });
  }
});

app.delete('/api/investments/:id', auth, requirePermission('investments:delete'), async (req, res) => {
  try {
    const deleted = await store.deleteInvestment(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Investment not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete investment' });
  }
});

app.get('/api/chini-expenses', auth, requirePermission('chini:view'), async (req, res) => {
  try {
    const rows = await store.listChiniExpenses({ dateFrom: req.query.dateFrom, dateTo: req.query.dateTo });
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch chini expenses' });
  }
});

app.post('/api/chini-expenses', auth, requirePermission('chini:create'), async (req, res) => {
  const { date, party, description, amount } = req.body;
  if (!date || !party || amount == null) {
    return res.status(400).json({ error: 'date, party and amount are required' });
  }
  const numAmount = Number(amount);
  if (Number.isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!['narayan', 'maa_vaishno'].includes(String(party).toLowerCase())) {
    return res.status(400).json({ error: 'party must be narayan or maa_vaishno' });
  }
  try {
    const row = await store.createChiniExpense({ date, party, description, amount: numAmount });
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create chini expense' });
  }
});

app.put('/api/chini-expenses/:id', auth, requirePermission('chini:update'), async (req, res) => {
  const { date, party, description, amount } = req.body;
  if (!date || !party || amount == null) {
    return res.status(400).json({ error: 'date, party and amount are required' });
  }
  const numAmount = Number(amount);
  if (Number.isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!['narayan', 'maa_vaishno'].includes(String(party).toLowerCase())) {
    return res.status(400).json({ error: 'party must be narayan or maa_vaishno' });
  }
  try {
    const row = await store.updateChiniExpense(req.params.id, { date, party, description, amount: numAmount });
    if (!row) return res.status(404).json({ error: 'Chini expense not found' });
    return res.json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update chini expense' });
  }
});

app.delete('/api/chini-expenses/:id', auth, requirePermission('chini:delete'), async (req, res) => {
  try {
    const deleted = await store.deleteChiniExpense(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Chini expense not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete chini expense' });
  }
});

app.get('/api/lands', auth, requirePermission('land:view'), async (_req, res) => {
  try {
    const rows = await store.listLandRecords();
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch land records' });
  }
});

app.post('/api/lands', auth, requirePermission('land:create'), async (req, res) => {
  const { area, ownerName, amountPaid, amountToBeGiven } = req.body;
  if (!area || !ownerName || amountPaid == null || amountToBeGiven == null) {
    return res.status(400).json({ error: 'area, ownerName, amountPaid and amountToBeGiven are required' });
  }
  const paid = Number(amountPaid);
  const due = Number(amountToBeGiven);
  if (Number.isNaN(paid) || paid < 0 || Number.isNaN(due) || due < 0) {
    return res.status(400).json({ error: 'amountPaid and amountToBeGiven must be valid numbers' });
  }
  try {
    const row = await store.createLandRecord({ area, ownerName, amountPaid: paid, amountToBeGiven: due });
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create land record' });
  }
});

app.put('/api/lands/:id', auth, requirePermission('land:update'), async (req, res) => {
  const { area, ownerName, amountPaid, amountToBeGiven } = req.body;
  if (!area || !ownerName || amountPaid == null || amountToBeGiven == null) {
    return res.status(400).json({ error: 'area, ownerName, amountPaid and amountToBeGiven are required' });
  }
  const paid = Number(amountPaid);
  const due = Number(amountToBeGiven);
  if (Number.isNaN(paid) || paid < 0 || Number.isNaN(due) || due < 0) {
    return res.status(400).json({ error: 'amountPaid and amountToBeGiven must be valid numbers' });
  }
  try {
    const row = await store.updateLandRecord(req.params.id, { area, ownerName, amountPaid: paid, amountToBeGiven: due });
    if (!row) return res.status(404).json({ error: 'Land record not found' });
    return res.json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update land record' });
  }
});

app.get('/api/vehicles', auth, requirePermission('vehicles:view'), async (_req, res) => {
  try {
    const rows = await store.listVehicles();
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch vehicles' });
  }
});

app.post('/api/vehicles', auth, requirePermission('vehicles:create'), async (req, res) => {
  const { vehicleName, vehicleNumber, monthlyPrice, serviceDueDate, lastServiceDate, paymentStatus, amountPaid, note } =
    req.body;
  if (!vehicleName || !vehicleNumber || monthlyPrice == null) {
    return res.status(400).json({ error: 'vehicleName, vehicleNumber and monthlyPrice are required' });
  }
  const monthly = Number(monthlyPrice);
  const paid = Number(amountPaid || 0);
  if (Number.isNaN(monthly) || monthly < 0 || Number.isNaN(paid) || paid < 0) {
    return res.status(400).json({ error: 'monthlyPrice and amountPaid must be valid non-negative numbers' });
  }
  try {
    const row = await store.createVehicle({
      vehicleName,
      vehicleNumber,
      monthlyPrice: monthly,
      serviceDueDate,
      lastServiceDate,
      paymentStatus,
      amountPaid: paid,
      note
    });
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create vehicle' });
  }
});

app.put('/api/vehicles/:id', auth, requirePermission('vehicles:update'), async (req, res) => {
  const { vehicleName, vehicleNumber, monthlyPrice, serviceDueDate, lastServiceDate, paymentStatus, amountPaid, note } =
    req.body;
  if (!vehicleName || !vehicleNumber || monthlyPrice == null) {
    return res.status(400).json({ error: 'vehicleName, vehicleNumber and monthlyPrice are required' });
  }
  const monthly = Number(monthlyPrice);
  const paid = Number(amountPaid || 0);
  if (Number.isNaN(monthly) || monthly < 0 || Number.isNaN(paid) || paid < 0) {
    return res.status(400).json({ error: 'monthlyPrice and amountPaid must be valid non-negative numbers' });
  }
  try {
    const row = await store.updateVehicle(req.params.id, {
      vehicleName,
      vehicleNumber,
      monthlyPrice: monthly,
      serviceDueDate,
      lastServiceDate,
      paymentStatus,
      amountPaid: paid,
      note
    });
    if (!row) return res.status(404).json({ error: 'Vehicle not found' });
    return res.json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update vehicle' });
  }
});

app.delete('/api/vehicles/:id', auth, requirePermission('vehicles:delete'), async (req, res) => {
  try {
    const deleted = await store.deleteVehicle(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Vehicle not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete vehicle' });
  }
});

app.delete('/api/lands/:id', auth, requirePermission('land:delete'), async (req, res) => {
  try {
    const deleted = await store.deleteLandRecord(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Land record not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete land record' });
  }
});

app.get('/api/suppliers', auth, requirePermission('suppliers:view'), async (_req, res) => {
  try {
    const rows = await store.listSuppliers();
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch suppliers' });
  }
});

app.post('/api/suppliers', auth, requirePermission('suppliers:create'), async (req, res) => {
  const supplier = normalizeSupplier(req.body || {});
  if (!supplier.name) {
    return res.status(400).json({ error: 'Supplier name is required' });
  }
  if (!Number.isFinite(supplier.openingBalance)) {
    return res.status(400).json({ error: 'openingBalance must be a valid number' });
  }
  try {
    const row = await store.createSupplier(supplier);
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create supplier' });
  }
});

app.put('/api/suppliers/:id', auth, requirePermission('suppliers:update'), async (req, res) => {
  const supplier = normalizeSupplier(req.body || {});
  if (!supplier.name) {
    return res.status(400).json({ error: 'Supplier name is required' });
  }
  if (!Number.isFinite(supplier.openingBalance)) {
    return res.status(400).json({ error: 'openingBalance must be a valid number' });
  }
  try {
    const row = await store.updateSupplier(req.params.id, supplier);
    if (!row) return res.status(404).json({ error: 'Supplier not found' });
    return res.json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update supplier' });
  }
});

app.delete('/api/suppliers/:id', auth, requirePermission('suppliers:delete'), async (req, res) => {
  try {
    const deleted = await store.deleteSupplier(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Supplier not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete supplier' });
  }
});

app.get('/api/suppliers/:id/transactions', auth, requirePermission('suppliers:view'), async (req, res) => {
  try {
    const supplier = await store.getSupplierById(req.params.id);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    const rows = await store.listSupplierTransactions(req.params.id);
    return res.json(enrichSupplierTransactionsWithRunningBalance(supplier, rows));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch supplier transactions' });
  }
});

app.post('/api/suppliers/:id/transactions', auth, requirePermission('suppliers:create'), async (req, res) => {
  const supplierId = req.params.id;
  let supplier;
  try {
    supplier = await store.getSupplierById(supplierId);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load supplier' });
  }
  if (!supplier) {
    return res.status(404).json({ error: 'Supplier not found' });
  }

  const tx = normalizeSupplierTransaction(req.body || {}, supplierId);
  if (!tx.date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  if (!['truck', 'payment'].includes(tx.type)) {
    return res.status(400).json({ error: 'type must be truck or payment' });
  }

  let amount = tx.amount;
  if ((!Number.isFinite(amount) || amount <= 0) && tx.type === 'truck' && Number.isFinite(tx.quantity) && tx.quantity > 0 && Number.isFinite(tx.rate) && tx.rate >= 0) {
    amount = Number((tx.quantity * tx.rate).toFixed(2));
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (tx.type === 'truck') {
    if (!tx.material) return res.status(400).json({ error: 'material is required for truck entry' });
    if (!Number.isFinite(tx.quantity) || tx.quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive number for truck entry' });
    }
    if (tx.rate != null && (!Number.isFinite(tx.rate) || tx.rate < 0)) {
      return res.status(400).json({ error: 'rate must be zero or positive' });
    }
  }
  if (!Number.isFinite(tx.paidNow) || tx.paidNow < 0) {
    return res.status(400).json({ error: 'paidNow must be zero or positive' });
  }
  if (tx.type === 'truck' && tx.paidNow > amount) {
    return res.status(400).json({ error: 'paidNow cannot be greater than material amount' });
  }

  try {
    const primaryTx = await store.createSupplierTransaction({
      ...tx,
      amount,
      paidNow: tx.type === 'truck' ? tx.paidNow : 0,
      isAutoPayment: false
    });

    let autoPaymentTx = null;
    if (tx.type === 'truck' && tx.paidNow > 0) {
      autoPaymentTx = await store.createSupplierTransaction({
        supplierId,
        date: tx.date,
        type: 'payment',
        amount: tx.paidNow,
        paymentMode: tx.paymentMode,
        paymentRef: tx.paymentRef,
        note: tx.note
          ? `Partial payment against truck (${tx.note})`
          : 'Partial payment against truck material entry',
        linkedTransactionId: primaryTx.id,
        isAutoPayment: true
      });
    }

    const updatedSupplier = await store.getSupplierById(supplierId);
    const rows = await store.listSupplierTransactions(supplierId);
    const enriched = enrichSupplierTransactionsWithRunningBalance(updatedSupplier, rows);
    const primaryWithBalance = enriched.find((row) => row.id === primaryTx.id) || primaryTx;
    const autoPaymentWithBalance =
      autoPaymentTx && (enriched.find((row) => row.id === autoPaymentTx.id) || autoPaymentTx);

    const smsRequested = !(req.body && (req.body.sendSms === false || req.body.sendSms === 'false'));
    let sms = { ok: false, skipped: true, reason: 'not_requested' };
    if (smsRequested && updatedSupplier?.phone) {
      const balanceNow = autoPaymentWithBalance
        ? toSafeNumber(autoPaymentWithBalance.balanceAfter, updatedSupplier.balance)
        : toSafeNumber(primaryWithBalance.balanceAfter, updatedSupplier.balance);
      const amountText = moneyInr(amount);
      const paidNowText = moneyInr(tx.paidNow);
      const balanceText = moneyInr(balanceNow);
      const message =
        tx.type === 'truck'
          ? `${APP_NAME}: Delivery logged for ${updatedSupplier.name}. Material ${amountText}, paid ${paidNowText}, balance ${balanceText}.`
          : `${APP_NAME}: Payment received from ${updatedSupplier.name} of ${amountText}. Balance ${balanceText}.`;
      sms = await sendSupplierSmsNotification({
        supplier: updatedSupplier,
        message,
        meta: {
          supplierId: updatedSupplier.id,
          transactionId: primaryTx.id,
          autoPaymentTransactionId: autoPaymentTx ? autoPaymentTx.id : ''
        }
      });
    }

    return res.status(201).json({
      transaction: primaryWithBalance,
      autoPaymentTransaction: autoPaymentWithBalance || null,
      supplierBalance: updatedSupplier?.balance ?? null,
      sms
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create supplier transaction' });
  }
});

app.put('/api/supplier-transactions/:id', auth, requirePermission('suppliers:update'), async (req, res) => {
  let existing;
  try {
    existing = await store.getSupplierTransactionById(req.params.id);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load transaction' });
  }
  if (!existing) return res.status(404).json({ error: 'Transaction not found' });

  const tx = normalizeSupplierTransaction(req.body || {}, existing.supplierId);
  if (!tx.date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }
  if (!['truck', 'payment'].includes(tx.type)) {
    return res.status(400).json({ error: 'type must be truck or payment' });
  }
  let amount = tx.amount;
  if ((!Number.isFinite(amount) || amount <= 0) && tx.type === 'truck' && Number.isFinite(tx.quantity) && tx.quantity > 0 && Number.isFinite(tx.rate) && tx.rate >= 0) {
    amount = Number((tx.quantity * tx.rate).toFixed(2));
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (tx.type === 'truck') {
    if (!tx.material) return res.status(400).json({ error: 'material is required for truck entry' });
    if (!Number.isFinite(tx.quantity) || tx.quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive number for truck entry' });
    }
    if (tx.rate != null && (!Number.isFinite(tx.rate) || tx.rate < 0)) {
      return res.status(400).json({ error: 'rate must be zero or positive' });
    }
  }
  if (!Number.isFinite(tx.paidNow) || tx.paidNow < 0) {
    return res.status(400).json({ error: 'paidNow must be zero or positive' });
  }
  if (tx.type === 'truck' && tx.paidNow > amount) {
    return res.status(400).json({ error: 'paidNow cannot be greater than material amount' });
  }

  try {
    const updated = await store.updateSupplierTransaction(req.params.id, {
      ...tx,
      amount,
      paidNow: tx.type === 'truck' ? tx.paidNow : 0,
      supplierId: existing.supplierId
    });
    if (!updated) return res.status(404).json({ error: 'Transaction not found' });

    const supplier = await store.getSupplierById(existing.supplierId);
    const rows = await store.listSupplierTransactions(existing.supplierId);
    const enriched = enrichSupplierTransactionsWithRunningBalance(supplier, rows);
    return res.json(enriched.find((row) => row.id === req.params.id) || updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update supplier transaction' });
  }
});

app.delete('/api/supplier-transactions/:id', auth, requirePermission('suppliers:delete'), async (req, res) => {
  try {
    const deleted = await store.deleteSupplierTransaction(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Transaction not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete supplier transaction' });
  }
});

app.get('/api/supplier-transactions/:id/receipt.pdf', auth, requirePermission('suppliers:view'), async (req, res) => {
  try {
    const tx = await store.getSupplierTransactionById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    const supplier = await store.getSupplierById(tx.supplierId);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    const allRows = await store.listSupplierTransactions(tx.supplierId);
    const enrichedRows = enrichSupplierTransactionsWithRunningBalance(supplier, allRows);
    const enrichedTx = enrichedRows.find((row) => row.id === tx.id) || tx;

    const openingBalance = toSafeNumber(supplier.openingBalance, 0);
    const totalQuantity = toSafeNumber(supplier.totalMaterialQuantity, 0);
    const totalMaterialAmount = toSafeNumber(supplier.totalMaterialAmount, 0);
    const totalPaid = toSafeNumber(supplier.totalPaid, 0);
    const totalToGive = openingBalance + totalMaterialAmount;
    const remaining = totalToGive - totalPaid;
    const thisEntryAmount = toSafeNumber(tx.amount, 0);
    const thisEntryPaid = tx.type === 'payment' ? thisEntryAmount : toSafeNumber(tx.paidNow, 0);
    const thisEntryRemaining = tx.type === 'truck' ? Math.max(0, thisEntryAmount - thisEntryPaid) : 0;

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const safeSupplierName = String(supplier.name || 'supplier').replace(/[^a-z0-9_-]/gi, '-');
    const safeReceiptId = String(tx.id || 'receipt').replace(/[^a-z0-9_-]/gi, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="supplier-receipt-${safeSupplierName}-${safeReceiptId}.pdf"`);
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const left = 40;
    const width = pageWidth - 80;
    const colors = {
      border: '#CFD8E6',
      heading: '#0C2E66',
      text: '#1A2738',
      muted: '#5E6A7A',
      panel: '#F6F9FF'
    };
    let y = 40;

    doc.save().roundedRect(left, y, width, 84, 8).fill(colors.panel).restore();
    doc.save().roundedRect(left, y, width, 84, 8).lineWidth(1).strokeColor(colors.border).stroke().restore();
    doc.fillColor(colors.heading).font('Helvetica-Bold').fontSize(17).text('SUPPLIER RECEIPT', left + 12, y + 14);
    doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(12).text(APP_NAME, left + 12, y + 42);
    doc.font('Helvetica').fontSize(9).fillColor(colors.muted).text('Printable copy for supplier acknowledgement', left + 12, y + 60);
    doc.font('Helvetica').fontSize(9).fillColor(colors.muted);
    doc.text(`Receipt ID: ${tx.id}`, left + width - 260, y + 14, { width: 248, align: 'right' });
    doc.text(`Date: ${tx.date}`, left + width - 260, y + 30, { width: 248, align: 'right' });
    doc.text(`Type: ${tx.type === 'truck' ? 'Material Delivery' : 'Payment'}`, left + width - 260, y + 46, {
      width: 248,
      align: 'right'
    });
    doc.text(`Supplier: ${supplier.name || '-'}`, left + width - 260, y + 62, { width: 248, align: 'right' });
    y += 98;

    const topBoxHeight = 138;
    doc.save().roundedRect(left, y, width, topBoxHeight, 8).lineWidth(1).strokeColor(colors.border).stroke().restore();
    doc.fillColor(colors.heading).font('Helvetica-Bold').fontSize(10).text('Supplier Details', left + 10, y + 10);
    doc.fillColor(colors.text).font('Helvetica').fontSize(10);
    doc.text(`Name: ${supplier.name || '-'}`, left + 10, y + 28);
    doc.text(`Phone: ${supplier.phone || '-'}`, left + 10, y + 44);
    doc.text(`Email: ${supplier.email || '-'}`, left + 10, y + 60);
    doc.text(`GST No: ${supplier.gstNo || '-'}`, left + 10, y + 76);
    doc.text(`Address: ${supplier.address || '-'}`, left + 10, y + 92, { width: width - 20 });
    doc.fillColor(colors.heading).font('Helvetica-Bold').fontSize(10).text('Transaction Details', left + width / 2 + 8, y + 10);
    doc.fillColor(colors.text).font('Helvetica').fontSize(10);
    doc.text(`Entry Amount: ${moneyInr(thisEntryAmount)}`, left + width / 2 + 8, y + 28);
    doc.text(`Entry Paid: ${moneyInr(thisEntryPaid)}`, left + width / 2 + 8, y + 44);
    doc.text(`Entry Remaining: ${moneyInr(thisEntryRemaining)}`, left + width / 2 + 8, y + 60);
    doc.text(`Balance After Entry: ${moneyInr(enrichedTx.balanceAfter)}`, left + width / 2 + 8, y + 76);
    if (tx.type === 'truck') {
      doc.text(`Truck No: ${tx.truckNumber || '-'}`, left + width / 2 + 8, y + 92);
      doc.text(`Challan No: ${tx.challanNo || '-'}`, left + width / 2 + 8, y + 108);
      doc.text(`Material: ${tx.material || '-'}`, left + width / 2 + 8, y + 124);
      doc.text(
        `Quantity: ${tx.quantity == null ? '-' : tx.quantity} | Rate: ${tx.rate == null ? '-' : moneyInr(tx.rate)}`,
        left + width / 2 + 8,
        y + 140,
        { width: width / 2 - 16 }
      );
    } else {
      doc.text(`Payment Mode: ${tx.paymentMode || '-'}`, left + width / 2 + 8, y + 92);
      doc.text(`Reference: ${tx.paymentRef || '-'}`, left + width / 2 + 8, y + 108);
    }
    y += topBoxHeight + 12;

    const summaryHeight = 138;
    doc.save().roundedRect(left, y, width, summaryHeight, 8).lineWidth(1).strokeColor(colors.border).stroke().restore();
    doc.fillColor(colors.heading).font('Helvetica-Bold').fontSize(10).text('Supplier Financial Summary', left + 10, y + 10);

    const summaryRows = [
      ['Total Quantity', `${totalQuantity}`],
      ['Total Material Value', moneyInr(totalMaterialAmount)],
      ['Total Paid', moneyInr(totalPaid)],
      ['Total To Give', moneyInr(totalToGive)],
      ['Remaining Balance', moneyInr(remaining)]
    ];
    let sy = y + 30;
    summaryRows.forEach(([label, value], index) => {
      if (index % 2 === 0) {
        doc.save().rect(left + 8, sy - 3, width - 16, 20).fill('#F8FBFF').restore();
      }
      doc.fillColor(colors.text).font('Helvetica').fontSize(10);
      doc.text(label, left + 14, sy);
      doc.font('Helvetica-Bold').text(value, left + 14, sy, { width: width - 28, align: 'right' });
      sy += 22;
    });
    y += summaryHeight + 14;

    doc.save().roundedRect(left, y, width, 56, 8).lineWidth(1).strokeColor(colors.border).stroke().restore();
    doc.fillColor(colors.text).font('Helvetica').fontSize(9.5);
    doc.text(`Note: ${tx.note || '-'}`, left + 10, y + 10, { width: width - 20 });
    doc.text('This receipt can be printed and signed by supplier and company representative.', left + 10, y + 32, {
      width: width - 20
    });

    const footerY = doc.page.height - 74;
    doc.save().moveTo(left, footerY).lineTo(left + width, footerY).lineWidth(1).strokeColor(colors.border).stroke().restore();
    doc.fillColor(colors.muted).font('Helvetica').fontSize(9);
    doc.text(`Generated by ${APP_NAME}`, left, footerY + 8, { width, align: 'left' });
    doc.text(`Company Signature`, left, footerY + 8, { width, align: 'right' });
    doc.text('Supplier Signature', left, footerY + 42, { width, align: 'left' });
    doc.text('Date', left, footerY + 42, { width, align: 'right' });
    doc.end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to generate supplier receipt' });
  }
});

app.get('/api/billing/companies', auth, requirePermission('billing:view'), async (req, res) => {
  try {
    const gstNo = normalizeGstNo(req.query.gstNo);
    if (gstNo) {
      const localCompany = await store.getBillingCompanyByGst(gstNo);
      if (localCompany) return res.json({ company: localCompany, source: 'local' });

      const onlineCompany = await lookupGstOnline(gstNo);
      if (onlineCompany) {
        const saved = await store.upsertBillingCompany(onlineCompany);
        return res.json({ company: saved, source: 'online' });
      }

      return res.json({ company: null, source: 'none' });
    }
    const rows = await store.listBillingCompanies();
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch billing companies' });
  }
});

app.post('/api/billing/companies', auth, requirePermission('billing:create'), async (req, res) => {
  const company = normalizeBillCompany(req.body || {});
  if (!company.gstNo || !company.companyName || !company.address) {
    return res.status(400).json({ error: 'gstNo, companyName and address are required' });
  }
  if (!isValidGstNo(company.gstNo)) {
    return res.status(400).json({ error: 'Enter a valid 15-character GST number' });
  }
  try {
    const row = await store.upsertBillingCompany(company);
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to save billing company' });
  }
});

app.get('/api/bills', auth, requirePermission('billing:view'), async (_req, res) => {
  try {
    const rows = await store.listBills();
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch bills' });
  }
});

app.post('/api/bills', auth, requirePermission('billing:create'), async (req, res) => {
  const { invoiceNo, billDate, dueDate, vehicleNo, placeOfSupply, reverseCharge, notes } = req.body || {};
  const company = normalizeBillCompany((req.body && req.body.company) || {});
  const items = cleanInvoiceItems((req.body && req.body.items) || []);

  if (!invoiceNo || !billDate) {
    return res.status(400).json({ error: 'invoiceNo and billDate are required' });
  }
  if (!company.gstNo || !company.companyName || !company.address) {
    return res.status(400).json({ error: 'Company GST, name and address are required' });
  }
  if (!isValidGstNo(company.gstNo)) {
    return res.status(400).json({ error: 'Enter a valid 15-character GST number' });
  }
  if (!items.length) {
    return res.status(400).json({ error: 'Add at least one valid bill item' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(billDate))) {
    return res.status(400).json({ error: 'billDate must be in YYYY-MM-DD format' });
  }
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate))) {
    return res.status(400).json({ error: 'dueDate must be in YYYY-MM-DD format' });
  }

  try {
    const row = await store.createBill({
      invoiceNo,
      billDate,
      dueDate,
      vehicleNo,
      company,
      placeOfSupply,
      reverseCharge: Boolean(reverseCharge),
      items,
      notes
    });
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create bill' });
  }
});

app.put('/api/bills/:id', auth, requirePermission('billing:update'), async (req, res) => {
  const { invoiceNo, billDate, dueDate, vehicleNo, placeOfSupply, reverseCharge, notes } = req.body || {};
  const company = normalizeBillCompany((req.body && req.body.company) || {});
  const items = cleanInvoiceItems((req.body && req.body.items) || []);

  if (!invoiceNo || !billDate) {
    return res.status(400).json({ error: 'invoiceNo and billDate are required' });
  }
  if (!company.gstNo || !company.companyName || !company.address) {
    return res.status(400).json({ error: 'Company GST, name and address are required' });
  }
  if (!isValidGstNo(company.gstNo)) {
    return res.status(400).json({ error: 'Enter a valid 15-character GST number' });
  }
  if (!items.length) {
    return res.status(400).json({ error: 'Add at least one valid bill item' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(billDate))) {
    return res.status(400).json({ error: 'billDate must be in YYYY-MM-DD format' });
  }
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate))) {
    return res.status(400).json({ error: 'dueDate must be in YYYY-MM-DD format' });
  }

  try {
    const row = await store.updateBill(req.params.id, {
      invoiceNo,
      billDate,
      dueDate,
      vehicleNo,
      company,
      placeOfSupply,
      reverseCharge: Boolean(reverseCharge),
      items,
      notes
    });
    if (!row) return res.status(404).json({ error: 'Bill not found' });
    return res.json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update bill' });
  }
});

app.delete('/api/bills/:id', auth, requirePermission('billing:delete'), async (req, res) => {
  try {
    const deleted = await store.deleteBill(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Bill not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete bill' });
  }
});

app.get('/api/bills/:id.pdf', auth, requirePermission('billing:view'), async (req, res) => {
  try {
    const bill = await store.getBillById(req.params.id);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    const seller = {
      name: APP_NAME,
      address: process.env.COMPANY_ADDRESS || 'Address not configured',
      gstNo: normalizeGstNo(process.env.COMPANY_GST_NO || '') || 'NA',
      state: process.env.COMPANY_STATE || 'NA',
      stateCode: process.env.COMPANY_STATE_CODE || 'NA',
      phone: process.env.COMPANY_PHONE || '',
      email: process.env.COMPANY_EMAIL || ''
    };

    const moneyValue = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const filename = `invoice-${String(bill.invoiceNo || bill.id).replace(/[^a-z0-9_-]/gi, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const usableWidth = pageWidth - 72;
    const left = 36;
    let y = 34;
    const colors = {
      border: '#CFD8E6',
      heading: '#0C2E66',
      text: '#1A2738',
      muted: '#5E6A7A',
      panel: '#F6F9FF'
    };

    // Header
    doc.save().roundedRect(left, y, usableWidth, 70, 8).fill(colors.panel).restore();
    doc.save().roundedRect(left, y, usableWidth, 70, 8).lineWidth(1).strokeColor(colors.border).stroke().restore();
    doc.fillColor(colors.heading).font('Helvetica-Bold').fontSize(19).text('TAX INVOICE', left + 12, y + 10);
    doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(13).text(seller.name, left + 12, y + 35, { width: usableWidth - 24 });
    doc.font('Helvetica').fontSize(9).fillColor(colors.muted);
    doc.text(`Invoice No: ${bill.invoiceNo}`, left + usableWidth - 220, y + 12, { width: 205, align: 'right' });
    doc.text(`Invoice Date: ${bill.billDate}`, left + usableWidth - 220, y + 28, { width: 205, align: 'right' });
    doc.text(`Due Date: ${bill.dueDate || '-'}`, left + usableWidth - 220, y + 44, { width: 205, align: 'right' });
    y += 82;

    // Seller / buyer blocks
    const boxW = (usableWidth - 12) / 2;
    const boxH = 118;
    doc.save().roundedRect(left, y, boxW, boxH, 8).lineWidth(1).strokeColor(colors.border).stroke().restore();
    doc.save().roundedRect(left + boxW + 12, y, boxW, boxH, 8).lineWidth(1).strokeColor(colors.border).stroke().restore();

    doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.heading).text('Supplier Details', left + 10, y + 10);
    doc.font('Helvetica').fontSize(9.2).fillColor(colors.text);
    doc.text(seller.name, left + 10, y + 28);
    doc.text(seller.address, left + 10, y + 42, { width: boxW - 20 });
    doc.text(`GSTIN: ${seller.gstNo}`, left + 10, y + 72);
    doc.text(`State: ${seller.state} (${seller.stateCode})`, left + 10, y + 86);
    if (seller.phone) doc.text(`Phone: ${seller.phone}`, left + 10, y + 100);
    if (seller.email) doc.text(`Email: ${seller.email}`, left + 10, y + 112);

    doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.heading).text('Bill To (Buyer)', left + boxW + 22, y + 10);
    doc.font('Helvetica').fontSize(9.2).fillColor(colors.text);
    doc.text(bill.company.companyName, left + boxW + 22, y + 28);
    doc.text(bill.company.address, left + boxW + 22, y + 42, { width: boxW - 20 });
    doc.text(`GSTIN: ${bill.company.gstNo}`, left + boxW + 22, y + 72);
    doc.text(`State: ${bill.company.state || '-'} (${bill.company.stateCode || '-'})`, left + boxW + 22, y + 86);
    if (bill.company.phone) doc.text(`Phone: ${bill.company.phone}`, left + boxW + 22, y + 100);
    if (bill.company.email) doc.text(`Email: ${bill.company.email}`, left + boxW + 22, y + 112);
    y += boxH + 12;

    // Extra bill meta
    doc.font('Helvetica').fontSize(9.4).fillColor(colors.text);
    doc.text(`Place of Supply: ${bill.placeOfSupply || '-'}`, left, y);
    doc.text(`Reverse Charge: ${bill.reverseCharge ? 'Yes' : 'No'}`, left + 220, y);
    doc.text(`Vehicle No: ${bill.vehicleNo || '-'}`, left + 390, y);
    y += 14;

    // Items table header
    const col = {
      idx: left,
      desc: left + 34,
      hsn: left + 246,
      qty: left + 306,
      rate: left + 360,
      tax: left + 430,
      total: left + 482
    };
    const rowH = 22;
    doc.save().roundedRect(left, y, usableWidth, rowH, 4).fill(colors.panel).restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.heading);
    doc.text('#', col.idx + 6, y + 7);
    doc.text('Description', col.desc, y + 7, { width: 200 });
    doc.text('HSN/SAC', col.hsn, y + 7, { width: 58 });
    doc.text('Qty', col.qty, y + 7, { width: 40, align: 'right' });
    doc.text('Rate', col.rate, y + 7, { width: 65, align: 'right' });
    doc.text('GST %', col.tax, y + 7, { width: 45, align: 'right' });
    doc.text('Amount', col.total, y + 7, { width: 78, align: 'right' });
    y += rowH;

    bill.items.forEach((item, index) => {
      const taxableValue = Number(item.taxableValue || 0);
      const rowTotal = Number(item.lineTotal || taxableValue + Number(item.gstAmount || 0));
      doc.save().rect(left, y, usableWidth, rowH).strokeColor(colors.border).lineWidth(0.5).stroke().restore();
      doc.font('Helvetica').fontSize(8.8).fillColor(colors.text);
      doc.text(String(index + 1), col.idx + 6, y + 6);
      doc.text(item.description || '-', col.desc, y + 6, { width: 194, ellipsis: true });
      doc.text(item.hsnSac || '-', col.hsn, y + 6, { width: 56, ellipsis: true });
      doc.text(String(item.quantity || 0), col.qty, y + 6, { width: 40, align: 'right' });
      doc.text(moneyValue(item.rate || 0), col.rate, y + 6, { width: 65, align: 'right' });
      doc.text(`${Number(item.gstPercent || 0).toFixed(2)}`, col.tax, y + 6, { width: 45, align: 'right' });
      doc.text(moneyValue(rowTotal), col.total, y + 6, { width: 78, align: 'right' });
      y += rowH;
      if (y > doc.page.height - 160) {
        doc.addPage();
        y = 44;
      }
    });

    // Totals
    y += 8;
    const totalsX = left + usableWidth - 220;
    doc.save().roundedRect(totalsX, y, 220, 84, 6).lineWidth(1).strokeColor(colors.border).stroke().restore();
    doc.font('Helvetica').fontSize(9.5).fillColor(colors.text);
    doc.text('Taxable Value', totalsX + 10, y + 12);
    doc.text(moneyValue(bill.subtotal), totalsX + 10, y + 12, { width: 200, align: 'right' });
    doc.text('Total GST', totalsX + 10, y + 32);
    doc.text(moneyValue(bill.totalGst), totalsX + 10, y + 32, { width: 200, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.heading);
    doc.text('Grand Total', totalsX + 10, y + 54);
    doc.text(moneyValue(bill.grandTotal), totalsX + 10, y + 54, { width: 200, align: 'right' });

    if (bill.notes) {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(colors.heading).text('Notes:', left, y + 8, { width: usableWidth - 240 });
      doc.font('Helvetica').fontSize(9).fillColor(colors.text).text(bill.notes, left, y + 24, { width: usableWidth - 240 });
    }

    // Footer signature
    const footerY = doc.page.height - 78;
    doc.save().moveTo(left, footerY).lineTo(left + usableWidth, footerY).strokeColor(colors.border).stroke().restore();
    doc.font('Helvetica').fontSize(9).fillColor(colors.muted);
    doc.text('This is a computer-generated invoice.', left, footerY + 8, { width: usableWidth });
    doc.text(`For ${seller.name}`, left + usableWidth - 180, footerY + 8, { width: 180, align: 'right' });
    doc.text('Authorised Signatory', left + usableWidth - 180, footerY + 42, { width: 180, align: 'right' });

    doc.end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to generate bill PDF' });
  }
});

app.get('/api/export/salary.csv', auth, requirePermission('export:view'), async (req, res) => {
  const month = req.query.month || currentMonth();

  try {
    const rows = await store.salaryRows(month);
    const header = [
      'Month',
      'Employee',
      'Role',
      'MonthlySalary',
      'Advances',
      'Remaining',
      'MonthsWorked',
      'TotalEarnedAllTime',
      'TotalAdvancesAllTime',
      'TotalRemainingAllTime'
    ];
    const lines = [header.join(',')].concat(
      rows.map((r) =>
        [
          month,
          r.name,
          r.role,
          r.monthlySalary,
          r.advances,
          r.remaining,
          r.monthsWorked ?? '',
          r.totalSalaryAllTime ?? '',
          r.totalAdvancesAllTime ?? '',
          r.totalRemainingAllTime ?? ''
        ]
          .map(csvEscape)
          .join(',')
      )
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="salary-summary-${month}.csv"`);
    return res.send(lines.join('\n'));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to export salary CSV' });
  }
});

app.get('/api/export/trucks.csv', auth, requirePermission('export:view'), async (req, res) => {
  try {
    const rows = await store.listTrucks({ dateFrom: req.query.dateFrom, dateTo: req.query.dateTo });

    const header = [
      'Date',
      'TruckNumber',
      'DriverName',
      'RawMaterial',
      'Quantity',
      'PricePerQuintal',
      'TotalAmount',
      'Party',
      'Origin',
      'Destination',
      'Notes'
    ];

    const lines = [header.join(',')].concat(
      rows.map((t) =>
        [
          t.date,
          t.truckNumber,
          t.driverName,
          t.rawMaterial,
          t.quantity,
          t.pricePerQuintal ?? '',
          t.totalAmount ?? '',
          t.party ?? '',
          t.origin,
          t.destination,
          t.notes
        ]
          .map(csvEscape)
          .join(',')
      )
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="truck-report.csv"');
    return res.send(lines.join('\n'));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to export truck CSV' });
  }
});

app.get('/api/export/attendance.csv', auth, requirePermission('export:view'), async (req, res) => {
  const month = req.query.month || currentMonth();

  try {
    const rows = await store.attendanceReport(month);
    const header = ['Month', 'Employee', 'Role', 'PresentDays', 'AbsentDays', 'MarkedDays'];
    const lines = [header.join(',')].concat(
      rows.map((r) => [month, r.name, r.role, r.presentDays, r.absentDays, r.markedDays].map(csvEscape).join(','))
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${month}.csv"`);
    return res.send(lines.join('\n'));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to export attendance CSV' });
  }
});

// Offer Letter Generation
app.get('/api/employees/:id/offer-letter', auth, async (req, res) => {
  try {
    const employee = await store.getEmployeeById(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="offer-letter-${employee.name.replace(/\s+/g, '-')}.pdf"`);

    doc.pipe(res);

    const colors = {
      brand: '#1D4ED8',
      brandDark: '#102A43',
      brandSoft: '#EAF2FF',
      text: '#132A4A',
      muted: '#5D6A7E',
      border: '#D8E2F0',
      ok: '#0E9F6E'
    };
    const pageW = doc.page.width;
    const margin = 40;
    const contentW = pageW - margin * 2;
    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const annualCtc = Number(employee.monthlySalary || 0) * 12;
    const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

    // Header band
    doc.save().roundedRect(margin, 24, contentW, 104, 14).fill(colors.brandSoft).restore();
    doc.save().roundedRect(margin, 24, contentW, 104, 14).lineWidth(1).strokeColor(colors.border).stroke().restore();

    // Center emblem (logo-style mark)
    const cx = pageW / 2;
    doc.save().circle(cx, 56, 20).fill(colors.brand).restore();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(14).text('NE', cx - 11, 50, { width: 22, align: 'center' });

    doc.fillColor(colors.brandDark).font('Helvetica-Bold').fontSize(20).text(APP_NAME, margin, 78, {
      width: contentW,
      align: 'center'
    });
    doc.fillColor(colors.brand).font('Helvetica-Bold').fontSize(11).text('OFFICIAL EMPLOYMENT OFFER LETTER', margin, 102, {
      width: contentW,
      align: 'center'
    });

    // Meta box
    let y = 144;
    doc.save().roundedRect(margin, y, contentW, 82, 10).fill('#FFFFFF').restore();
    doc.save().roundedRect(margin, y, contentW, 82, 10).lineWidth(1).strokeColor(colors.border).stroke().restore();
    doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(10);
    doc.text('Date', margin + 12, y + 14);
    doc.text('Candidate', margin + 12, y + 38);
    doc.text('Position', margin + contentW / 2, y + 14);
    doc.text('Monthly Compensation', margin + contentW / 2, y + 38);
    doc.fillColor(colors.text).font('Helvetica').fontSize(11);
    doc.text(today, margin + 110, y + 14);
    doc.text(employee.name, margin + 110, y + 38, { width: contentW / 2 - 130 });
    doc.text(employee.role || 'Employee', margin + contentW / 2 + 132, y + 14, { width: contentW / 2 - 144 });
    doc.text(money(employee.monthlySalary), margin + contentW / 2 + 132, y + 38, { width: contentW / 2 - 144 });

    y += 102;
    doc.fillColor(colors.text).font('Helvetica').fontSize(11);
    doc.text(`Dear ${employee.name},`, margin, y);
    y += 22;
    doc.text(
      `We are pleased to welcome you to ${APP_NAME}. This letter confirms our offer and outlines your key employment terms.`,
      margin,
      y,
      { width: contentW, lineGap: 3 }
    );

    y += 54;
    const sections = [
      ['Role & Responsibilities', `You will join as ${employee.role || 'Employee'} and will be responsible for role-specific tasks assigned by management.`],
      [
        'Compensation',
        `Your monthly salary will be ${money(employee.monthlySalary)} (Rupees ${numberToWords(Number(employee.monthlySalary || 0))} only). The annual reference CTC is ${money(annualCtc)}.`
      ],
      ['Probation', 'Your probation period will be 3 months from joining date. During probation, either party may terminate with 7 days notice.'],
      ['Work Schedule', 'Working hours and weekly offs will follow company operations and shift requirements as communicated by your reporting manager.'],
      ['Confidentiality', 'All business, financial, customer, and operational information must be treated as confidential during and after your employment.'],
      ['Separation', 'Post probation, either party may separate with 30 days notice or salary in lieu, subject to company policy.']
    ];

    sections.forEach(([title, body], idx) => {
      if (y > doc.page.height - 170) {
        doc.addPage();
        y = 54;
      }
      doc.save().roundedRect(margin, y, contentW, 68, 8).fill(idx % 2 === 0 ? '#FFFFFF' : '#F8FBFF').restore();
      doc.save().roundedRect(margin, y, contentW, 68, 8).lineWidth(1).strokeColor(colors.border).stroke().restore();
      doc.fillColor(colors.brand).font('Helvetica-Bold').fontSize(11).text(title, margin + 12, y + 10);
      doc.fillColor(colors.text).font('Helvetica').fontSize(10.3).text(body, margin + 12, y + 28, {
        width: contentW - 24,
        lineGap: 2
      });
      y += 78;
    });

    y += 6;
    doc.fillColor(colors.text).font('Helvetica').fontSize(11);
    doc.text('Please sign below to indicate your acceptance of the above terms.', margin, y);

    y += 44;
    const lineY = y + 24;
    doc.save().moveTo(margin, lineY).lineTo(margin + 200, lineY).strokeColor(colors.border).stroke().restore();
    doc.save().moveTo(pageW - margin - 200, lineY).lineTo(pageW - margin, lineY).strokeColor(colors.border).stroke().restore();
    doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(10);
    doc.text('Authorized Signatory', margin, lineY + 6, { width: 200, align: 'center' });
    doc.text('Employee Signature', pageW - margin - 200, lineY + 6, { width: 200, align: 'center' });
    doc.fillColor(colors.text).font('Helvetica').fontSize(10);
    doc.text(APP_NAME, margin, lineY + 22, { width: 200, align: 'center' });
    doc.text(employee.name, pageW - margin - 200, lineY + 22, { width: 200, align: 'center' });

    // Footer strip
    const fy = doc.page.height - 36;
    doc.save().moveTo(margin, fy - 6).lineTo(margin + contentW, fy - 6).strokeColor(colors.border).stroke().restore();
    doc.fillColor(colors.muted).font('Helvetica').fontSize(9);
    doc.text(`${APP_NAME} • Professional Offer Documentation`, margin, fy, { width: contentW, align: 'center' });

    doc.end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to generate offer letter' });
  }
});

// Helper function to convert number to words (simplified for Indian numbering)
function numberToWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  if (num === 0) return 'Zero';
  if (num < 10) return ones[num];
  if (num < 20) return teens[num - 10];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
  if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + numberToWords(num % 100) : '');
  if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
  return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
}

app.get('/api/dashboard', auth, requirePermission('dashboard:view'), async (req, res) => {
  const month = req.query.month || currentMonth();
  const today = req.query.today || new Date().toISOString().slice(0, 10);

  try {
    const dashboard = await store.dashboard(month, today);
    return res.json(dashboard);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to fetch dashboard' });
  }
});

store
  .init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT} (storage: ${store.mode})`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize storage', err);
    process.exit(1);
  });
