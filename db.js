/**
 * NyayaVoice Database Layer
 * Uses IndexedDB — a real browser-native database.
 * Zero installation. Persistent. Structured. Fast.
 * 
 * Object Stores:
 *   - complaints    (primary data)
 *   - auditLogs     (tamper-proof chain)
 *   - notifications (user alerts)
 *   - settings      (app config)
 */

class NyayaDB {
  constructor() {
    this.dbName = 'NyayaVoiceDB';
    this.dbVersion = 1;
    this.db = null;
  }

  // ─── INIT ───────────────────────────────────────────
  open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Complaints store
        if (!db.objectStoreNames.contains('complaints')) {
          const store = db.createObjectStore('complaints', { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('hash', 'hash', { unique: true });
        }

        // Audit log store (append-only chain)
        if (!db.objectStoreNames.contains('auditLogs')) {
          const audit = db.createObjectStore('auditLogs', { keyPath: 'logId', autoIncrement: true });
          audit.createIndex('complaintId', 'complaintId', { unique: false });
          audit.createIndex('date', 'date', { unique: false });
        }

        // Notifications store
        if (!db.objectStoreNames.contains('notifications')) {
          const notif = db.createObjectStore('notifications', { keyPath: 'id', autoIncrement: true });
          notif.createIndex('read', 'read', { unique: false });
          notif.createIndex('date', 'date', { unique: false });
        }

        // Settings store (key-value)
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('DB Error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // ─── GENERIC HELPERS ────────────────────────────────
  _tx(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  _request(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ─── COMPLAINTS ─────────────────────────────────────
  async addComplaint(complaint) {
    const store = this._tx('complaints', 'readwrite');
    await this._request(store.add(complaint));

    // Auto-create first audit log entry
    await this.addAuditEntry(complaint.id, {
      action: 'Complaint Submitted',
      actor: 'User',
      icon: '📝',
      details: `Category: ${complaint.category}`
    });

    return complaint;
  }

  async getComplaint(id) {
    const store = this._tx('complaints');
    return this._request(store.get(id));
  }

  async getAllComplaints() {
    const store = this._tx('complaints');
    const all = await this._request(store.getAll());
    // Sort newest first
    return all.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async getComplaintsByStatus(status) {
    const store = this._tx('complaints');
    const index = store.index('status');
    return this._request(index.getAll(status));
  }

  async getComplaintsByCategory(category) {
    const store = this._tx('complaints');
    const index = store.index('category');
    return this._request(index.getAll(category));
  }

  async updateComplaint(id, updates) {
    const store = this._tx('complaints', 'readwrite');
    const existing = await this._request(store.get(id));
    if (!existing) throw new Error('Complaint not found: ' + id);

    const oldStatus = existing.status;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this._request(store.put(updated));

    // Auto-log status changes
    if (updates.status && updates.status !== oldStatus) {
      await this.addAuditEntry(id, {
        action: `Status: ${oldStatus} → ${updates.status}`,
        actor: 'Admin',
        icon: updates.status === 'Resolved' ? '🎉' : '🔄',
        details: updates.proof || ''
      });
    }

    return updated;
  }

  async voteComplaint(id, type) {
    const store = this._tx('complaints', 'readwrite');
    const c = await this._request(store.get(id));
    if (!c) throw new Error('Not found');
    if (type === 'up') c.upvotes = (c.upvotes || 0) + 1;
    else c.downvotes = (c.downvotes || 0) + 1;
    await this._request(store.put(c));
    return c;
  }

  async getStats() {
    const all = await this.getAllComplaints();
    return {
      total: all.length,
      pending: all.filter(c => c.status === 'Pending').length,
      inProgress: all.filter(c => c.status === 'In Progress').length,
      verified: all.filter(c => c.status === 'Verified').length,
      resolved: all.filter(c => c.status === 'Resolved').length
    };
  }

  // ─── AUDIT LOGS (Tamper-Proof Chain) ────────────────
  async addAuditEntry(complaintId, entry) {
    const store = this._tx('auditLogs', 'readwrite');

    // Get previous hash for chaining
    const allLogs = await this.getAuditLogs(complaintId);
    const prevHash = allLogs.length > 0 ? allLogs[allLogs.length - 1].hash : '0000000000';

    const logEntry = {
      complaintId,
      action: entry.action,
      actor: entry.actor || 'System',
      icon: entry.icon || '📋',
      details: entry.details || '',
      date: new Date().toISOString(),
      prevHash: prevHash,
      hash: await this._generateHash(prevHash + entry.action + complaintId + Date.now())
    };

    await this._request(store.add(logEntry));
    return logEntry;
  }

  async getAuditLogs(complaintId) {
    const store = this._tx('auditLogs');
    const index = store.index('complaintId');
    const logs = await this._request(index.getAll(complaintId));
    return logs.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  async verifyChain(complaintId) {
    const logs = await this.getAuditLogs(complaintId);
    if (logs.length === 0) return { valid: true, message: 'No logs' };
    
    for (let i = 1; i < logs.length; i++) {
      if (logs[i].prevHash !== logs[i - 1].hash) {
        return { valid: false, message: `Chain broken at entry ${i}`, brokenAt: i };
      }
    }
    return { valid: true, message: `Chain verified: ${logs.length} entries` };
  }

  // ─── NOTIFICATIONS ──────────────────────────────────
  async addNotification(message, complaintId = null) {
    const store = this._tx('notifications', 'readwrite');
    const notif = {
      message,
      complaintId,
      read: false,
      date: new Date().toISOString()
    };
    await this._request(store.add(notif));
    window.dispatchEvent(new Event('nyaya_notification'));
    return notif;
  }

  async getNotifications() {
    const store = this._tx('notifications');
    const all = await this._request(store.getAll());
    return all.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async getUnreadCount() {
    const all = await this.getNotifications();
    return all.filter(n => !n.read).length;
  }

  async markAllRead() {
    const store = this._tx('notifications', 'readwrite');
    const all = await this._request(store.getAll());
    for (const n of all) {
      if (!n.read) {
        n.read = true;
        store.put(n);
      }
    }
  }

  // ─── SETTINGS ───────────────────────────────────────
  async setSetting(key, value) {
    const store = this._tx('settings', 'readwrite');
    await this._request(store.put({ key, value }));
  }

  async getSetting(key, defaultValue = null) {
    const store = this._tx('settings');
    const result = await this._request(store.get(key));
    return result ? result.value : defaultValue;
  }

  // ─── SEED DATA ──────────────────────────────────────
  async seedIfEmpty() {
    const all = await this.getAllComplaints();
    if (all.length > 0) return;

    console.log('Seeding database with sample data...');

    const seedComplaints = [
      {
        id: 'NYV-1001',
        hash: await this._generateHash('NYV-1001-water-seed'),
        category: 'Water',
        text: 'Main village water pump broken for 3 weeks. 500+ families affected, walking 5km daily for water.',
        status: 'Resolved',
        upvotes: 145,
        downvotes: 3,
        date: new Date(Date.now() - 5 * 86400000).toISOString(),
        proof: 'Replaced the main valve and restored full water supply on April 28.',
        reporterType: 'self',
        location: null
      },
      {
        id: 'NYV-1002',
        hash: await this._generateHash('NYV-1002-safety-seed'),
        category: 'Safety',
        text: 'Streetlights broken on main school road for 2 weeks. Multiple accidents reported, children at risk.',
        status: 'In Progress',
        upvotes: 90,
        downvotes: 5,
        date: new Date(Date.now() - 2 * 86400000).toISOString(),
        proof: null,
        reporterType: 'proxy',
        location: null
      },
      {
        id: 'NYV-1003',
        hash: await this._generateHash('NYV-1003-sanitation-seed'),
        category: 'Sanitation',
        text: 'Open drain overflowing near market area. Severe health hazard, foul smell affecting 200+ shops.',
        status: 'Pending',
        upvotes: 30,
        downvotes: 2,
        date: new Date(Date.now() - 1 * 86400000).toISOString(),
        proof: null,
        reporterType: 'anonymous',
        location: null
      },
      {
        id: 'NYV-1004',
        hash: await this._generateHash('NYV-1004-corruption-seed'),
        category: 'Corruption',
        text: 'Ration shop owner demanding extra money for subsidized rice. Refusing to give receipts.',
        status: 'Verified',
        upvotes: 67,
        downvotes: 8,
        date: new Date(Date.now() - 3 * 86400000).toISOString(),
        proof: null,
        reporterType: 'anonymous',
        location: null
      }
    ];

    for (const c of seedComplaints) {
      const store = this._tx('complaints', 'readwrite');
      await this._request(store.add(c));
    }

    // Seed audit logs for each complaint
    const auditSeeds = [
      { cid: 'NYV-1001', entries: [
        { action: 'Complaint Submitted', actor: 'User', icon: '📝', daysAgo: 5 },
        { action: 'Status: Pending → Verified', actor: 'Admin', icon: '✅', daysAgo: 4 },
        { action: 'Status: Verified → In Progress', actor: 'Admin', icon: '🔄', daysAgo: 3 },
        { action: 'Status: In Progress → Resolved', actor: 'Admin', icon: '🎉', daysAgo: 1 },
        { action: 'Proof Added', actor: 'Admin', icon: '📸', daysAgo: 1 }
      ]},
      { cid: 'NYV-1002', entries: [
        { action: 'Complaint Submitted', actor: 'User', icon: '📝', daysAgo: 2 },
        { action: 'Status: Pending → In Progress', actor: 'Admin', icon: '🔄', daysAgo: 1 }
      ]},
      { cid: 'NYV-1003', entries: [
        { action: 'Complaint Submitted', actor: 'User', icon: '📝', daysAgo: 1 }
      ]},
      { cid: 'NYV-1004', entries: [
        { action: 'Complaint Submitted', actor: 'User', icon: '📝', daysAgo: 3 },
        { action: 'Status: Pending → Verified', actor: 'Admin', icon: '✅', daysAgo: 2 }
      ]}
    ];

    for (const seed of auditSeeds) {
      let prevHash = '0000000000';
      for (const entry of seed.entries) {
        const store = this._tx('auditLogs', 'readwrite');
        const date = new Date(Date.now() - entry.daysAgo * 86400000).toISOString();
        const hash = await this._generateHash(prevHash + entry.action + seed.cid + date);
        const logEntry = {
          complaintId: seed.cid,
          action: entry.action,
          actor: entry.actor,
          icon: entry.icon,
          details: '',
          date: date,
          prevHash: prevHash,
          hash: hash
        };
        await this._request(store.add(logEntry));
        prevHash = hash;
      }
    }

    console.log('Database seeded successfully.');
  }

  // ─── CRYPTO HASH ────────────────────────────────────
  async _generateHash(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 12);
  }

  // ─── EXPORT / IMPORT (for backup) ──────────────────
  async exportAll() {
    const complaints = await this.getAllComplaints();
    const notifications = await this.getNotifications();

    // Get all audit logs
    const store = this._tx('auditLogs');
    const allLogs = await this._request(store.getAll());

    return {
      exportDate: new Date().toISOString(),
      version: this.dbVersion,
      complaints,
      auditLogs: allLogs,
      notifications
    };
  }

  async importData(jsonData) {
    if (jsonData.complaints) {
      for (const c of jsonData.complaints) {
        const store = this._tx('complaints', 'readwrite');
        await this._request(store.put(c));
      }
    }
    if (jsonData.auditLogs) {
      for (const log of jsonData.auditLogs) {
        const store = this._tx('auditLogs', 'readwrite');
        await this._request(store.add(log));
      }
    }
  }

  // ─── CLEAR (dev use) ───────────────────────────────
  async clearAll() {
    const stores = ['complaints', 'auditLogs', 'notifications', 'settings'];
    for (const name of stores) {
      const store = this._tx(name, 'readwrite');
      await this._request(store.clear());
    }
  }
}

// Export single instance
const nyayaDB = new NyayaDB();
