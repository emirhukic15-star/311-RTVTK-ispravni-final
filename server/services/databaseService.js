// Database service - handles database initialization and table creation
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

// Initialize Database
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

/**
 * Create all database tables if they don't exist
 */
const createTables = () => {
  // Check if users table exists and if it needs migration for JOURNALIST role
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  
  if (tableInfo && tableInfo.sql) {
    // Table exists, check if constraint includes JOURNALIST
    const sql = tableInfo.sql;
    if (!sql.includes("'JOURNALIST'")) {
      // Need to migrate - constraint doesn't include JOURNALIST
      console.log('Migrating users table to support JOURNALIST role...');
      
      try {
        // Disable foreign keys temporarily
        db.pragma('foreign_keys = OFF');
        
        // Drop backup table if it exists from previous failed migration
        try {
          db.exec(`DROP TABLE IF EXISTS users_backup;`);
        } catch (e) {
          // Ignore if table doesn't exist
        }
        
        // Create backup of existing users
        db.exec(`CREATE TABLE users_backup AS SELECT * FROM users;`);
        
        // Drop old table
        db.exec(`DROP TABLE users;`);
        
        // Create new table with updated constraint
        db.exec(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password TEXT,
            role TEXT NOT NULL CHECK (role IN ('ADMIN', 'PRODUCER', 'EDITOR', 'DESK_EDITOR', 'CAMERMAN_EDITOR', 'CHIEF_CAMERA', 'CONTROL_ROOM', 'VIEWER', 'CAMERA', 'JOURNALIST')),
            newsroom_id INTEGER,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (newsroom_id) REFERENCES newsrooms(id)
          )
        `);
        
        // Copy data back
        db.exec(`INSERT INTO users SELECT * FROM users_backup;`);
        
        // Drop backup table
        db.exec(`DROP TABLE users_backup;`);
        
        // Re-enable foreign keys
        db.pragma('foreign_keys = ON');
        
        console.log('Users table migrated successfully');
      } catch (error) {
        console.error('Migration error:', error);
        // Re-enable foreign keys even if migration fails
        db.pragma('foreign_keys = ON');
        throw error;
      }
    } else {
      // Table exists and already supports JOURNALIST, create normally
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          password TEXT,
          role TEXT NOT NULL CHECK (role IN ('ADMIN', 'PRODUCER', 'EDITOR', 'DESK_EDITOR', 'CAMERMAN_EDITOR', 'CHIEF_CAMERA', 'CONTROL_ROOM', 'VIEWER', 'CAMERA', 'JOURNALIST')),
          newsroom_id INTEGER,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (newsroom_id) REFERENCES newsrooms(id)
        )
      `);
    }
  } else {
    // Table doesn't exist, create it normally
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password TEXT,
        role TEXT NOT NULL CHECK (role IN ('ADMIN', 'PRODUCER', 'EDITOR', 'DESK_EDITOR', 'CAMERMAN_EDITOR', 'CHIEF_CAMERA', 'CONTROL_ROOM', 'VIEWER', 'CAMERA', 'JOURNALIST')),
        newsroom_id INTEGER,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (newsroom_id) REFERENCES newsrooms(id)
      )
    `);
  }

  // Newsrooms table
  db.exec(`
    CREATE TABLE IF NOT EXISTS newsrooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // People table (for journalists, cameramen, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('JOURNALIST', 'CAMERAMAN', 'EDITOR', 'PRODUCER')),
      phone TEXT,
      email TEXT,
      newsroom_id INTEGER,
      position TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (newsroom_id) REFERENCES newsrooms(id)
    )
  `);

  // Tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time_start TEXT,
      time_end TEXT,
      title TEXT NOT NULL,
      slugline TEXT,
      location TEXT,
      description TEXT,
      newsroom_id INTEGER NOT NULL,
      coverage_type TEXT CHECK (coverage_type IN ('ENG', 'IFP', 'EFP', 'SNG', 'LIVE', 'STUDIO', 'OB', 'IP Live')),
      status TEXT NOT NULL DEFAULT 'PLANIRANO' CHECK (status IN ('DRAFT', 'PLANIRANO', 'DODIJELJENO', 'U_TOKU', 'SNIMLJENO', 'OTKAZANO', 'ARHIVIRANO', 'URADJENO')),
      flags TEXT DEFAULT '[]',
      journalist_ids TEXT DEFAULT '[]',
      cameraman_ids TEXT DEFAULT '[]',
      cameraman_id INTEGER,
      vehicle_id INTEGER,
      created_by INTEGER,
      confirmed_by_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (newsroom_id) REFERENCES newsrooms(id),
      FOREIGN KEY (cameraman_id) REFERENCES people(id),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Add missing columns to tasks table if they don't exist
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN confirmed_by_name TEXT DEFAULT NULL`);
  } catch (e) {
    // Column already exists, ignore error
  }

  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN attachment_type TEXT CHECK (attachment_type IN ('PACKAGE', 'VO', 'VO/SOT', 'SOT', 'FEATURE', 'NATPKG'))`);
  } catch (e) {
    // Column already exists, ignore error
  }

  try {
    db.exec(`ALTER TABLE task_presets ADD COLUMN attachment_type TEXT CHECK (attachment_type IN ('PACKAGE', 'VO', 'VO/SOT', 'SOT', 'FEATURE', 'NATPKG'))`);
  } catch (e) {
    // Column already exists, ignore error
  }

  // Vehicles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT,
      plate_number TEXT UNIQUE,
      is_available BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add missing columns to existing vehicles table if they don't exist
  try {
    db.exec(`ALTER TABLE vehicles ADD COLUMN is_active BOOLEAN DEFAULT 1`);
  } catch (e) {
    // Column already exists, ignore error
  }
  
  try {
    db.exec(`ALTER TABLE vehicles ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
  } catch (e) {
    // Column already exists, ignore error
  }

  // Schedules table (for cameraman weekly schedules)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cameraman_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
      time_start TEXT NOT NULL,
      time_end TEXT NOT NULL,
      is_available BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cameraman_id) REFERENCES people(id)
    )
  `);

  // Employee schedules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      shift_start TEXT,
      shift_end TEXT,
      shift_type TEXT,
      custom_shift_name TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (person_id) REFERENCES people(id)
    )
  `);

  // Audit log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      table_name TEXT,
      record_id INTEGER,
      old_data TEXT,
      new_data TEXT,
      description TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Notifications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      is_read BOOLEAN DEFAULT 0,
      related_task_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (related_task_id) REFERENCES tasks(id)
    )
  `);

  // Push subscriptions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, endpoint)
    )
  `);

  // Task presets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      location TEXT,
      coverage_type TEXT DEFAULT 'LIVE',
      time_from TEXT,
      time_to TEXT,
      flags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Leave requests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      type TEXT CHECK (type IN ('GODIŠNJI', 'BOLOVANJE', 'ODMOR', 'DRUGO')),
      status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (person_id) REFERENCES people(id)
    )
  `);

  // Schedule notes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Shift types table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shift_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      newsroom_id INTEGER,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (newsroom_id) REFERENCES newsrooms(id)
    )
  `);

  // System settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Roles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Permissions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Role permissions junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
      UNIQUE(role_id, permission_id)
    )
  `);

  // Initialize default roles if they don't exist
  const defaultRoles = [
    { name: 'ADMIN', description: 'Administrator - puna kontrola sistema' },
    { name: 'PRODUCER', description: 'Producent - upravljanje sadržajem' },
    { name: 'EDITOR', description: 'Urednik - kreiranje i uređivanje zadataka' },
    { name: 'DESK_EDITOR', description: 'Desk urednik - zadaci za svoju redakciju, pregled rasporeda' },
    { name: 'CAMERMAN_EDITOR', description: 'Kamerman urednik - zadaci za kamermane, pregled rasporeda' },
    { name: 'CHIEF_CAMERA', description: 'Šef kamere - upravljanje rasporedom kamermana' },
    { name: 'CONTROL_ROOM', description: 'Kontrolna soba - upravljanje režijom' },
    { name: 'VIEWER', description: 'Pregledač - samo pregled zadataka' },
    { name: 'CAMERA', description: 'Kamerman - dodjeljivanje zadataka' },
    { name: 'JOURNALIST', description: 'Novinar - pregled rasporeda i svojih zadataka' }
  ];

  const insertRole = db.prepare('INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)');
  defaultRoles.forEach(role => {
    insertRole.run(role.name, role.description);
  });

  console.log('Database tables created/verified');
};

module.exports = {
  db,
  createTables
};

