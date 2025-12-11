const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const rateLimit = require('express-rate-limit');
const webpush = require('web-push');
const config = require('./config');

// Import modules
const { authenticateToken, JWT_SECRET } = require('./middleware/auth');
const { logAudit } = require('./services/auditService');
const { db, createTables } = require('./services/databaseService');
const {
  normalizeDateForQuery,
  generateEmailFromName,
  formatPhoneNumber,
  getCurrentDateInBH,
  getCurrentDateTimeInBH,
  parseTaskJsonFields,
  EU_TIMEZONE
} = require('./utils/helpers');

const app = express();
const PORT = config.server.port;

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    success: false,
    message: 'Previše zahtjeva sa ove IP adrese, pokušajte ponovo kasnije.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for localhost in development
  skip: (req) => {
    if (config.server.env === 'development') {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    }
    return false;
  }
});

// Middleware
app.use(limiter);
app.use(cors({
  origin: config.cors.origin,
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Increase payload limit for large requests
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database path for logging
const dbPath = path.join(__dirname, 'database.sqlite');

// Initialize database tables
createTables();

// Create indexes for better performance
const createIndexes = () => {
  try {
    // Tasks table indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_newsroom_id ON tasks(newsroom_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_coverage_type ON tasks(coverage_type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by)');
    
    // People table indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_people_newsroom_id ON people(newsroom_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_people_role ON people(role)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_people_name ON people(name)');
    
    // Users table indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_newsroom_id ON users(newsroom_id)');
    
    // Audit log indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON audit_log(table_name)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)');
    
    // Employee schedules indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_employee_schedules_person_id ON employee_schedules(person_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_employee_schedules_date ON employee_schedules(date)');
    
    console.log('✅ Database indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
  }
};

// Create indexes
createIndexes();

// Initialize Web Push with VAPID keys
// Generate VAPID keys with: npx web-push generate-vapid-keys
// Store them in environment variables or config
const DEFAULT_VAPID_PUBLIC_KEY = 'BJ46jiT7n7mbQ2QxC7w1_TuNJns51d5446-5Es6t2GVeWODCEq_fRitoDsco-dXu5_gdWSgAgcQJAgqjOCCzp8A';
const DEFAULT_VAPID_PRIVATE_KEY = 'us1iHuOzCFczyGr_NcgW_0bfG1-gUgPd_S9sc-k796g';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY;

// Warn if using default VAPID keys in production
if (config.server.env === 'production' && 
    (VAPID_PUBLIC_KEY === DEFAULT_VAPID_PUBLIC_KEY || VAPID_PRIVATE_KEY === DEFAULT_VAPID_PRIVATE_KEY)) {
  console.warn('⚠️  WARNING: Using default VAPID keys in production! Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.');
}

// Set VAPID details for web-push
webpush.setVapidDetails(
  'mailto:rtvtk@example.com', // Contact email
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Insert default data
const insertDefaultData = () => {
  // Check if admin user exists
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  
  if (!adminExists) {
    // Create admin user
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    const insertUser = db.prepare(`
      INSERT INTO users (username, name, password, role, newsroom_id) 
      VALUES (?, ?, ?, ?, ?)
    `);
    
    insertUser.run('admin', 'Administrator', hashedPassword, 'ADMIN', null);
    console.log('Default admin user created (username: admin, password: admin123)');
    
    // Create test newsroom users
    const newsroomUsers = [
      { username: 'ipp', name: 'IPP Redakcija', password: 'ipp123', role: 'EDITOR', newsroom_id: 1 },
      { username: 'dop', name: 'DOP Redakcija', password: 'dop123', role: 'EDITOR', newsroom_id: 2 },
      { username: 'djecja', name: 'Dječija Redakcija', password: 'dje123', role: 'EDITOR', newsroom_id: 3 },
      { username: 'kzp', name: 'KZP Redakcija', password: 'kzp123', role: 'EDITOR', newsroom_id: 4 },
      { username: 'muzicka', name: 'Muzička Redakcija', password: 'muz123', role: 'EDITOR', newsroom_id: 5 }
    ];
    
    newsroomUsers.forEach(user => {
      const hashedPwd = bcrypt.hashSync(user.password, 10);
      insertUser.run(user.username, user.name, hashedPwd, user.role, user.newsroom_id);
    });
  }

  // Check if newsrooms exist
  const newsroomsExist = db.prepare('SELECT COUNT(*) as count FROM newsrooms').get();
  
  if (newsroomsExist.count === 0) {
    const newsrooms = [
      { name: 'IPP', pin: 'IPP123' },
      { name: 'DOP', pin: 'DOP123' },
      { name: 'DJEČIJA', pin: 'DJE123' },
      { name: 'KZP', pin: 'KZP123' },
      { name: 'MUZIČKA', pin: 'MUZ123' }
    ];
    
    const insertNewsroom = db.prepare('INSERT INTO newsrooms (name, pin) VALUES (?, ?)');
    newsrooms.forEach(newsroom => {
      insertNewsroom.run(newsroom.name, newsroom.pin);
    });
    
    console.log('Default newsrooms created');
  }

  // Check if people exist
  const peopleExist = db.prepare('SELECT COUNT(*) as count FROM people').get();
  
  if (peopleExist.count === 0) {
    const people = [
      { name: 'Mirsad Jusić', role: 'CAMERAMAN', phone: '+387 61 234 567', email: 'mirsad@rtvtk.ba', newsroom_id: 1, position: 'Glavni kamerman' },
      { name: 'Nijaz Bašić', role: 'CAMERAMAN', phone: '+387 61 234 568', email: 'nijaz@rtvtk.ba', newsroom_id: 1, position: 'Kamerman' },
      { name: 'Muhamed Kahrimanović', role: 'CAMERAMAN', phone: '+387 61 234 569', email: 'muhamed@rtvtk.ba', newsroom_id: 2, position: 'Kamerman' },
      { name: 'Alma Softić', role: 'JOURNALIST', phone: '+387 61 234 570', email: 'alma@rtvtk.ba', newsroom_id: 1, position: 'Novinar' },
      { name: 'Dženana Džafić', role: 'JOURNALIST', phone: '+387 61 234 571', email: 'dzenana@rtvtk.ba', newsroom_id: 2, position: 'Novinar' }
    ];
    
    const insertPerson = db.prepare(`
      INSERT INTO people (name, role, phone, email, newsroom_id, position) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    people.forEach(person => {
      insertPerson.run(person.name, person.role, person.phone, person.email, person.newsroom_id, person.position);
    });
    
    console.log('Default people created');
  }
};

// Insert default data
insertDefaultData();

// API Routes

// Health check removed

// Authentication routes
// Import validation middleware
const { validateLogin } = require('./middleware/validation');

app.post('/api/auth/login', validateLogin, async (req, res) => {
  try {
    const { pin, newsroom_id } = req.body;

    if (!pin) {
      return res.status(400).json({ success: false, message: 'PIN je obavezan' });
    }

    // Find newsroom by PIN
    const newsroom = db.prepare('SELECT * FROM newsrooms WHERE pin = ?').get(pin);
    
    if (!newsroom) {
      return res.status(401).json({ success: false, message: 'Neispravan PIN' });
    }

    // Check if newsroom_id matches (if provided)
    if (newsroom_id && newsroom.id !== newsroom_id) {
      return res.status(401).json({ success: false, message: 'Neispravan PIN za ovu redakciju' });
    }

    // Create JWT token
    const token = jwt.sign(
      { 
      id: newsroom.id,
        username: newsroom.name, 
        role: 'NEWSROOM',
      newsroom_id: newsroom.id
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
        token,
      user: {
        id: newsroom.id,
        username: newsroom.name,
        name: newsroom.name,
        role: 'NEWSROOM',
        newsroom_id: newsroom.id
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom prijave' });
  }
});

app.post('/api/auth/admin-login', validateLogin, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`🔐 Login attempt for username: ${username}`);
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Korisničko ime i lozinka su obavezni' });
    }

    // Find user by username (check both active and inactive first for debugging)
    const userAll = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (userAll) {
      console.log(`🔍 User lookup result: id=${userAll.id}, username=${userAll.username}, name=${userAll.name}, is_active=${userAll.is_active}, role=${userAll.role}`);
    } else {
      console.log(`🔍 User lookup result: NOT FOUND`);
    }
    
    // Find user by username (only active)
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
    
    if (!user) {
      if (userAll && userAll.is_active === 0) {
        console.log(`⚠️ User ${username} exists but is DEACTIVATED`);
        return res.status(401).json({ success: false, message: 'Korisnički nalog je deaktiviran. Kontaktirajte administratora.' });
      }
      console.log(`❌ User ${username} not found or inactive`);
      return res.status(401).json({ success: false, message: 'Pogrešno korisničko ime ili lozinka' });
    }

    // Check password
    const isValidPassword = bcrypt.compareSync(password, user.password);
    console.log(`🔑 Password check for user ${username}: ${isValidPassword ? 'VALID' : 'INVALID'}`);
    
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Pogrešno korisničko ime ili lozinka' });
    }
    
    console.log(`✅ Login successful for user ${username} (${user.name})`);

    // Create JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        newsroom_id: user.newsroom_id 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Get newsroom info if user belongs to one
    let newsroom = null;
    if (user.newsroom_id) {
      newsroom = db.prepare('SELECT * FROM newsrooms WHERE id = ?').get(user.newsroom_id);
    }

    // Log to audit log
    try {
      logAudit(
        db,
        user.id,
        'LOGIN: User login',
        'users',
        user.id,
        null,
        { login_time: new Date().toISOString() },
        `Prijava korisnika: ${user.name} (${user.username}) - ${user.role}`,
        req.ip,
        req.get('user-agent')
      );
    } catch (auditError) {
      // Don't fail login if audit logging fails
      console.error('Audit log error during login:', auditError);
    }

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        newsroom_id: user.newsroom_id,
        newsroom: newsroom
      }
    });
  } catch (error) {
    console.error('❌ Admin login error:', error);
    console.error('   Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Greška prilikom prijave',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    console.log(`🔍 /api/auth/me called for user ID: ${user?.id}, username: ${user?.username}`);
    
    // Get additional user info from database
    const userInfo = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    
    if (!userInfo) {
      console.log(`❌ User not found in database for ID: ${user.id}`);
      return res.status(404).json({ success: false, message: 'Korisnik nije pronađen' });
    }

    // Get newsroom info if user belongs to one
    let newsroom = null;
    if (userInfo.newsroom_id) {
      newsroom = db.prepare('SELECT * FROM newsrooms WHERE id = ?').get(userInfo.newsroom_id);
    }

    console.log(`✅ Returning user info for: ${userInfo.username} (${userInfo.name})`);
    res.json({
      success: true,
      data: {
        id: userInfo.id,
        username: userInfo.username,
        name: userInfo.name,
        role: userInfo.role,
        newsroom_id: userInfo.newsroom_id,
        newsroom: newsroom
      }
    });
  } catch (error) {
    console.error('❌ Get user error:', error);
    console.error('   Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Greška prilikom dohvatanja korisnika',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Tasks routes
app.get('/api/tasks/:id', authenticateToken, (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const user = req.user;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('=== GET SINGLE TASK (NEW VERSION) ===');
      console.log('Task ID:', taskId);
      console.log('User:', { id: user.id, role: user.role, newsroom_id: user.newsroom_id });
      console.log('User role check:', user.role === 'CAMERA' ? 'IS CAMERA' : 'NOT CAMERA');
    }
    
    let query = 'SELECT * FROM tasks WHERE id = ?';
    let params = [taskId];
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Initial query:', query, 'params:', params);
    }
    
    // Apply role-based filtering
    // VIEWER can see all tasks from their newsroom (or all tasks if no newsroom assigned)
    // JOURNALIST can see only tasks where they are assigned as journalist
    if (user.role !== 'ADMIN' && user.role !== 'PRODUCER' && user.role !== 'CHIEF_CAMERA' && user.role !== 'VIEWER' && user.role !== 'JOURNALIST') {
      // CAMERA users can access tasks they are assigned to, regardless of newsroom
      if (user.role === 'CAMERA') {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 CAMERA user - skipping newsroom filter, will check cameraman assignment later');
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 User role requires newsroom filtering:', user.role);
        }
        if (user.newsroom_id) {
          query += ' AND newsroom_id = ?';
          params.push(user.newsroom_id);
          if (process.env.NODE_ENV === 'development') {
            console.log('🔍 Added newsroom filter. Query:', query, 'params:', params);
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log('🔍 No newsroom_id for user:', user);
          }
        }
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 User role does not require newsroom filtering:', user.role);
      }
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Final query:', query, 'params:', params);
    }
    const task = db.prepare(query).get(...params);
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Query result:', task ? 'FOUND' : 'NOT FOUND');
    }
    
    if (!task) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Task not found, returning 404');
      }
      return res.status(404).json({ success: false, message: 'Zadatak nije pronađen' });
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Task found, checking user role:', user.role);
    }
    
    // Special handling for JOURNALIST role: allow access to tasks where they are assigned as journalist
    if (user.role === 'JOURNALIST') {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 User is JOURNALIST, entering JOURNALIST logic...');
      }
      // Get the person record for this user using email-based mapping
      let person = null;
      
      // Strategy 1: Find person by email containing username (primary - devleta.brkic)
      if (user.username) {
        person = db.prepare('SELECT id, name, email FROM people WHERE email LIKE ?').get(`%${user.username}%`);
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 Email-based search for username "${user.username}":`, person);
        }
      }
      
      // Strategy 2: Exact name match (fallback)
      if (!person && user.name) {
        person = db.prepare('SELECT id, name, email FROM people WHERE name = ?').get(user.name);
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 Name mapping: ${user.name} ->`, person);
        }
      }
      
      // Strategy 3: Username-based matching (convert username to name format)
      if (!person && user.username) {
        const nameFromUsername = user.username.replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        person = db.prepare('SELECT id, name, email FROM people WHERE name = ?').get(nameFromUsername);
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 Username to name conversion: ${user.username} -> ${nameFromUsername} ->`, person);
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Final person lookup result for JOURNALIST user ${user.username}:`, person);
      }
      
      if (person) {
        // Parse journalist_ids from task
        let journalistIds = [];
        try {
          journalistIds = JSON.parse(task.journalist_ids || '[]');
        } catch (e) {
          journalistIds = [];
        }
        
        // If user is not assigned as journalist to this task, deny access
        if (!journalistIds.includes(person.id)) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`JOURNALIST user ${user.name} (person.id: ${person.id}) not assigned to task ${taskId}. Journalist IDs: ${JSON.stringify(journalistIds)}`);
          }
          return res.status(403).json({ success: false, message: 'Niste dodijeljeni ovom zadatku' });
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ JOURNALIST user ${user.name} (person.id: ${person.id}) granted access to task ${taskId}`);
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log(`❌ Could not find person record for JOURNALIST user ${user.name} (username: ${user.username})`);
        }
        return res.status(403).json({ success: false, message: 'Niste dodijeljeni ovom zadatku' });
      }
    }
    // Special handling for CAMERA role: allow access to tasks where they are assigned as cameraman
    else if (user.role === 'CAMERA') {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 User is CAMERA, entering CAMERA logic...');
        console.log('🔍 Starting CAMERA user mapping...');
      }
      // Get the person record for this user using email-based mapping (same as notification system)
      let person = null;
      
      // Strategy 1: Find person by username (extract from email format)
      if (user.username) {
        // First try to find person with email that matches username
        person = db.prepare('SELECT id, name, email FROM people WHERE email LIKE ?').get(`%${user.username}%`);
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 Email-based search for username "${user.username}":`, person);
        }
      }
      
      // Strategy 2: Exact name match (fallback)
      if (!person && user.name) {
        person = db.prepare('SELECT id, name, email FROM people WHERE name = ?').get(user.name);
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 Name mapping: ${user.name} ->`, person);
        }
      }
      
      // Strategy 3: Username-based matching (convert username to name format)
      if (!person && user.username) {
        const nameFromUsername = user.username.replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        person = db.prepare('SELECT id, name, email FROM people WHERE name = ?').get(nameFromUsername);
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 Username to name conversion: ${user.username} -> ${nameFromUsername} ->`, person);
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Final person lookup result for CAMERA user ${user.username}:`, person);
      }
      
      if (person) {
        // Parse cameraman_ids from task
        let cameramanIds = [];
        try {
          cameramanIds = JSON.parse(task.cameraman_ids || '[]');
        } catch (e) {
          cameramanIds = [];
        }
        
        // If user is not assigned as cameraman to this task, deny access
        if (!cameramanIds.includes(person.id)) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`CAMERA user ${user.name} (person.id: ${person.id}) not assigned to task ${taskId}. Cameraman IDs: ${JSON.stringify(cameramanIds)}`);
          }
          return res.status(403).json({ success: false, message: 'Niste dodijeljeni ovom zadatku' });
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ CAMERA user ${user.name} (person.id: ${person.id}) granted access to task ${taskId}`);
          console.log(`✅ CAMERA user can access task ${taskId} - continuing with task data...`);
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log(`❌ Could not find person record for CAMERA user ${user.name} (username: ${user.username})`);
        }
        return res.status(403).json({ success: false, message: 'Niste dodijeljeni ovom zadatku' });
      }
    }
    
    // Parse JSON fields
    task.journalist_ids = JSON.parse(task.journalist_ids || '[]');
    task.cameraman_ids = JSON.parse(task.cameraman_ids || '[]');
    task.flags = JSON.parse(task.flags || '[]');
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Found task:', { id: task.id, title: task.title, date: task.date });
      console.log('=== SENDING TASK RESPONSE ===');
      console.log('Task data being sent:', { id: task.id, title: task.title, cameraman_ids: task.cameraman_ids });
    }
    
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('Get single task error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja zadatka' });
  }
});

app.get('/api/tasks', authenticateToken, (req, res) => {
  try {
    const { date, newsroom_id, status, coverage_type } = req.query;
    const user = req.user;
    
    // Optimized query with JOINs to get related data in one query
    let query = `
      SELECT 
        t.*,
        n.name as newsroom_name,
        n.pin as newsroom_pin,
        v.name as vehicle_name,
        v.plate_number as vehicle_plate,
        v.type as vehicle_type,
        c.name as cameraman_name,
        c.phone as cameraman_phone
      FROM tasks t
      LEFT JOIN newsrooms n ON t.newsroom_id = n.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN people c ON t.cameraman_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      query += ' AND t.date = ?';
      params.push(normalizeDateForQuery(date));
    }

    // Special filtering for JOURNALIST role - show only tasks where they are assigned as journalist
    if (user.role === 'JOURNALIST') {
      // Get person_id for this user - try multiple matching strategies (email-based)
      let person = null;
      
      // Strategy 1: Email contains username (primary - devleta.brkic -> email contains devleta.brkic)
      if (user.username) {
        person = db.prepare('SELECT id FROM people WHERE email LIKE ?').get(`%${user.username}%`);
      }
      
      // Strategy 2: Direct name match (fallback)
      if (!person && user.name) {
        person = db.prepare('SELECT id FROM people WHERE name = ?').get(user.name);
      }
      
      // Strategy 3: Name contains username (for cases like "devleta.brkic" -> "Devleta Brkic")
      if (!person && user.username) {
        const usernameParts = user.username.split('.');
        const firstName = usernameParts[0] ? usernameParts[0].charAt(0).toUpperCase() + usernameParts[0].slice(1) : '';
        const lastName = usernameParts[1] ? usernameParts[1].charAt(0).toUpperCase() + usernameParts[1].slice(1) : '';
        const searchPattern = `%${firstName}%${lastName}%`;
        person = db.prepare('SELECT id FROM people WHERE name LIKE ?').get(searchPattern);
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('GET /api/tasks JOURNALIST filter - Person:', person);
        console.log(`User: ${user.username} (${user.name})`);
      }
      
      if (person) {
        // Filter tasks where this person is in journalist_ids array
        query += ` AND t.journalist_ids LIKE ?`;
        params.push(`%${person.id}%`);
        if (process.env.NODE_ENV === 'development') {
          console.log('GET /api/tasks JOURNALIST filter - Using:', `%${person.id}%`);
        }
      } else {
        // If person not found, show no tasks
        query += ' AND 1=0';
        if (process.env.NODE_ENV === 'development') {
          console.log(`No person found for JOURNALIST user ${user.username}, showing no tasks`);
        }
      }
    }
    // Special filtering for CAMERA role - show only tasks where they are assigned as cameraman
    else if (user.role === 'CAMERA') {
      // Get person_id for this user - try multiple matching strategies
      let person = null;
      
      // Strategy 1: Direct name match
      person = db.prepare('SELECT id FROM people WHERE name = ?').get(user.name);
      
      // Strategy 2: Email contains username
      if (!person) {
        person = db.prepare('SELECT id FROM people WHERE email LIKE ?').get(`%${user.username}%`);
      }
      
      // Strategy 3: Name contains username (for cases like "edin.suljendic" -> "Edin Suljendić")
      if (!person) {
        const usernameParts = user.username.split('.');
        const firstName = usernameParts[0] ? usernameParts[0].charAt(0).toUpperCase() + usernameParts[0].slice(1) : '';
        const lastName = usernameParts[1] ? usernameParts[1].charAt(0).toUpperCase() + usernameParts[1].slice(1) : '';
        const searchPattern = `%${firstName}%${lastName}%`;
        person = db.prepare('SELECT id FROM people WHERE name LIKE ?').get(searchPattern);
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('GET /api/tasks CAMERA filter - Person:', person);
        console.log(`User: ${user.username} (${user.name})`);
      }
      
      if (person) {
        // Filter tasks where this person is in cameraman_ids array
        query += ` AND t.cameraman_ids LIKE ?`;
        params.push(`%${person.id}%`);
        if (process.env.NODE_ENV === 'development') {
          console.log('GET /api/tasks CAMERA filter - Using:', `%${person.id}%`);
        }
      } else {
        // If person not found, show no tasks
        query += ' AND 1=0';
        if (process.env.NODE_ENV === 'development') {
          console.log(`No person found for user ${user.username}, showing no tasks`);
        }
      }
    }
    // ADMIN, PRODUCER, CHIEF_CAMERA, and CAMERMAN_EDITOR can see all tasks
    // VIEWER can see all tasks from their newsroom (or all tasks if no newsroom assigned)
    // Other roles can only see tasks from their newsroom
    else if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'CAMERMAN_EDITOR'].includes(user.role)) {
      if (user.newsroom_id) {
        query += ' AND t.newsroom_id = ?';
        params.push(user.newsroom_id);
      } else {
        return res.status(403).json({ success: false, message: 'Nemate pristup zadacima. Kontaktirajte administratora da vam dodijeli redakciju.' });
      }
    } else if (newsroom_id) {
      // ADMIN, PRODUCER, CHIEF_CAMERA, or CAMERMAN_EDITOR can filter by specific newsroom
      query += ' AND t.newsroom_id = ?';
      params.push(newsroom_id);
    }

    // Add status filter
    if (status && status !== '') {
      query += ' AND t.status = ?';
      params.push(status);
    }

    // Add coverage_type filter
    if (coverage_type && coverage_type !== '') {
      query += ' AND t.coverage_type = ?';
      params.push(coverage_type);
    }

    query += ' ORDER BY t.time_start ASC, t.title ASC';
    
    const tasks = db.prepare(query).all(...params);
    
    // Debug: Log first task's attachment_type before parsing
    if (tasks.length > 0) {
      console.log('=== SERVER: Before parseTaskJsonFields ===');
      console.log('First task attachment_type from DB:', tasks[0].attachment_type, 'type:', typeof tasks[0].attachment_type);
      console.log('First task ID:', tasks[0].id);
    }
    
    // Parse JSON fields for all tasks
    const parsedTasks = tasks.map(parseTaskJsonFields);
    
    // Debug: Log first task's attachment_type after parsing
    if (parsedTasks.length > 0) {
      console.log('=== SERVER: After parseTaskJsonFields ===');
      console.log('First task attachment_type after parse:', parsedTasks[0].attachment_type, 'type:', typeof parsedTasks[0].attachment_type);
      console.log('First task ID:', parsedTasks[0].id);
    }

    res.json({ success: true, data: parsedTasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja zadataka' });
  }
});

app.post('/api/tasks', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const taskData = req.body;
    
    // VIEWER and CAMERA roles cannot create tasks
    if (user.role === 'VIEWER' || user.role === 'CAMERA' || user.role === 'CONTROL_ROOM') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za kreiranje zadataka' });
    }
    
    // Validate required fields (time is optional)
    if (!taskData.date || !taskData.title || !taskData.newsroom_id) {
      return res.status(400).json({ success: false, message: 'Datum, naslov i redakcija su obavezni' });
    }
    
    // If user is not admin or producer, they can only create tasks for their newsroom
    if (user.role !== 'ADMIN' && user.role !== 'PRODUCER' && user.newsroom_id !== taskData.newsroom_id) {
      return res.status(403).json({ success: false, message: 'Možete kreirati zadatke samo za svoju redakciju' });
    }

    const insertTask = db.prepare(`
      INSERT INTO tasks (
        date, time_start, time_end, title, slugline, location, description,
        newsroom_id, coverage_type, attachment_type, status, flags, journalist_ids, cameraman_ids,
        vehicle_id, equipment_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Explicitly check attachment_type - handle all cases
    let attachmentTypeValue = null;
    if (taskData.attachment_type) {
      const atType = String(taskData.attachment_type).trim();
      if (atType !== '' && atType !== 'undefined' && atType !== 'null' && atType.toLowerCase() !== 'null') {
        // Validate it's one of the allowed values
        const allowedValues = ['PACKAGE', 'VO', 'VO/SOT', 'SOT', 'FEATURE', 'NATPKG'];
        if (allowedValues.includes(atType.toUpperCase())) {
          attachmentTypeValue = atType.toUpperCase();
        } else {
          console.warn('Invalid attachment_type value:', atType);
        }
      }
    }
    
    const result = insertTask.run(
      normalizeDateForQuery(taskData.date),
      taskData.time_start || null,
      taskData.time_end || null,
      taskData.title,
      taskData.slugline || '',
      taskData.location || '',
      taskData.description || '',
      taskData.newsroom_id,
      taskData.coverage_type || 'ENG',
      attachmentTypeValue,
      taskData.status || 'PLANIRANO',
      taskData.flags ? JSON.stringify(taskData.flags) : '[]',
      taskData.journalist_ids ? JSON.stringify(taskData.journalist_ids) : '[]',
      taskData.cameraman_ids ? JSON.stringify(taskData.cameraman_ids) : '[]',
      taskData.vehicle_id || null,
      taskData.equipment_id || null,
      user.id
    );

    // Debug logging after insert (only in development)
    if (process.env.NODE_ENV === 'development') {
      const insertedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
      console.log('Inserted task - attachment_type:', insertedTask.attachment_type, 'type:', typeof insertedTask.attachment_type);
    }

    const taskId = result.lastInsertRowid;

    // Send notification to CHIEF_CAMERA and CAMERMAN_EDITOR when task is created
    try {
      if (process.env.NODE_ENV === 'development') {
        console.log(`=== NEW TASK NOTIFICATION ===`);
        console.log(`Task ID: ${taskId}, Title: ${taskData.title}, Newsroom ID: ${taskData.newsroom_id}`);
        console.log(`Created by: ${user.id} (${user.role})`);
        console.log(`Timestamp: ${new Date().toISOString()}`);
      }
      
      // Check if task has HITNO flag
      let notificationMessage = `📋 Novi zadatak: "${taskData.title}"`;
      if (taskData.flags && taskData.flags.includes('HITNO')) {
        notificationMessage = `🚨 HITNO: Novi zadatak: "${taskData.title}"`;
      }
      
      // Check if task has RAZMJENA flag
      let hasRazmjenaFlag = false;
      if (taskData.flags && taskData.flags.includes('RAZMJENA')) {
        hasRazmjenaFlag = true;
      }
      
      // Get CHIEF_CAMERA and CAMERMAN_EDITOR from ALL newsrooms (they manage all cameras)
      const cameraManagers = db.prepare(`
        SELECT id, name, role 
        FROM users 
        WHERE role IN ('CHIEF_CAMERA', 'CAMERMAN_EDITOR')
      `).all();

      if (process.env.NODE_ENV === 'development') {
        console.log(`Found ${cameraManagers.length} camera managers:`, cameraManagers.map(cm => ({ id: cm.id, name: cm.name, role: cm.role })));
      }

      // Create notifications for each camera manager
      cameraManagers.forEach(manager => {
        try {
          // Check if notification already exists for this task and user
          const existingNotification = db.prepare(`
            SELECT id FROM notifications 
            WHERE user_id = ? AND task_id = ? AND type = 'task_created'
          `).get(manager.id, taskId);
          
          if (!existingNotification) {
            db.prepare(`
              INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              manager.id,
              'Novi zadatak kreiran',
              notificationMessage,
              'task_created',
              taskId,
              new Date().toISOString(),
              0
            );
            if (process.env.NODE_ENV === 'development') {
              console.log(`✅ Created notification for camera manager ${manager.id} (${manager.name}, ${manager.role})`);
            }
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.log(`⚠️ Notification already exists for camera manager ${manager.id} (${manager.name}, ${manager.role})`);
            }
          }
        } catch (insertError) {
          console.error(`Error inserting notification for user ${manager.id}:`, insertError);
        }
      });

      // If task has RAZMJENA flag, send notification to PRODUCER
      if (hasRazmjenaFlag) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`=== RAZMJENA FLAG NOTIFICATION ===`);
          console.log(`Task ID: ${taskId}, Title: ${taskData.title}`);
          console.log(`RAZMJENA flag detected - notifying PRODUCER`);
        }
        
        // Get all PRODUCER users
        const producers = db.prepare(`
          SELECT id, name, role 
          FROM users 
          WHERE role = 'PRODUCER'
        `).all();

        if (process.env.NODE_ENV === 'development') {
          console.log(`Found ${producers.length} producers for RAZMJENA notification`);
        }

        // Create notifications for each producer
        producers.forEach(producer => {
          try {
            // Check if notification already exists for this task and user
            const existingNotification = db.prepare(`
              SELECT id FROM notifications 
              WHERE user_id = ? AND task_id = ? AND type = 'razmjena_flag'
            `).get(producer.id, taskId);
            
            if (!existingNotification) {
              db.prepare(`
                INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(
                producer.id,
                'RAZMJENA - Potrebno pronaći materijal',
                `🔄 RAZMJENA: "${taskData.title}" - Potrebno pronaći materijal za razmjenu`,
                'razmjena_flag',
                taskId,
                new Date().toISOString(),
                0
              );
              if (process.env.NODE_ENV === 'development') {
                console.log(`✅ Created RAZMJENA notification for producer ${producer.id} (${producer.name})`);
              }
            } else {
              if (process.env.NODE_ENV === 'development') {
                console.log(`⚠️ RAZMJENA notification already exists for producer ${producer.id} (${producer.name})`);
              }
            }
          } catch (insertError) {
            console.error(`Error inserting RAZMJENA notification for user ${producer.id}:`, insertError);
          }
        });
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`📢 Sent ${cameraManagers.length} notifications for new task ${taskId}`);
      }
          } catch (notificationError) {
      console.error('Error creating task notifications:', notificationError);
      // Don't fail the task creation if notifications fail
    }

    // Log to audit log with journalist details
    let auditDescription = `Kreiran novi zadatak: "${taskData.title}" (${taskData.date}, ${taskData.time_start || 'bez vremena'})`;
    
    // Add journalist information if assigned
    if (taskData.journalist_ids && Array.isArray(taskData.journalist_ids) && taskData.journalist_ids.length > 0) {
      const journalistNames = taskData.journalist_ids.map(jId => {
        const journalist = db.prepare('SELECT name FROM people WHERE id = ?').get(jId);
        return journalist ? journalist.name : `ID ${jId}`;
      }).join(', ');
      auditDescription += ` - Novinari: ${journalistNames}`;
    }
    
    logAudit(
      db,
      user.id,
      'CREATE: Task created',
      'tasks',
      taskId,
      null,
      taskData,
      auditDescription,
      req.ip,
      req.get('user-agent')
    );

    // Send push notifications to relevant users
    try {
      // Get all users who should receive notifications about new tasks
      const notificationRecipients = db.prepare(`
        SELECT DISTINCT id FROM users 
        WHERE role IN ('CHIEF_CAMERA', 'CAMERMAN_EDITOR', 'PRODUCER', 'ADMIN')
      `).all();

      const notificationTitle = taskData.flags && taskData.flags.includes('HITNO') 
        ? '🚨 HITNO: Novi zadatak' 
        : '📋 Novi zadatak';
      
      const notificationBody = taskData.flags && taskData.flags.includes('HITNO')
        ? `🚨 HITNO: "${taskData.title}"`
        : `"${taskData.title}"`;

      // Send push notification to each recipient
      notificationRecipients.forEach(recipient => {
        sendPushNotification(
          recipient.id,
          notificationTitle,
          notificationBody,
          { 
            url: `/dispozicija?task=${taskId}`,
            taskId: taskId,
            type: 'task_created'
          }
        );
      });
    } catch (pushError) {
      console.error('Error sending push notifications:', pushError);
      // Don't fail task creation if push notifications fail
    }

    res.json({ 
      success: true, 
      message: 'Zadatak je uspješno kreiran',
      data: { id: taskId }
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja zadatka' });
  }
});

app.put('/api/tasks/:id', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const taskId = req.params.id;
    const taskData = req.body;

    // VIEWER role cannot edit tasks (CAMERA can update status only)
    if (user.role === 'VIEWER') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za uređivanje zadataka' });
    }

    // CAMERA role can only update task status
    if (user.role === 'CAMERA') {
      // Check if task exists
      const existingTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      
      if (!existingTask) {
        return res.status(404).json({ success: false, message: 'Zadatak nije pronađen' });
      }

      // Check if CAMERA user is assigned to this task
      const person = db.prepare('SELECT id FROM people WHERE name = ? OR email LIKE ?').get(user.name, `%${user.username}%`);
      if (!person) {
        return res.status(403).json({ success: false, message: 'Niste dodijeljeni ovom zadatku' });
      }

      let cameramanIds = [];
      try {
        cameramanIds = existingTask.cameraman_ids ? JSON.parse(existingTask.cameraman_ids) : [];
      } catch (e) {
        cameramanIds = [];
      }

      if (!cameramanIds.includes(person.id)) {
        return res.status(403).json({ success: false, message: 'Niste dodijeljeni ovom zadatku' });
      }

      // Only allow status update for CAMERA role
      const allowedFields = ['status'];
      const updateFields = {};
      
      for (const field of allowedFields) {
        if (taskData[field] !== undefined) {
          updateFields[field] = taskData[field];
        }
      }

      if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({ success: false, message: 'Nema dozvoljenih polja za ažuriranje' });
      }

      // Update only allowed fields
      const updateQuery = `UPDATE tasks SET ${Object.keys(updateFields).map(field => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const updateValues = [...Object.values(updateFields), taskId];
      
      db.prepare(updateQuery).run(...updateValues);
      
      // Log the action
      logAudit(
        db,
        user.id,
        'UPDATE: Task status updated',
        'tasks',
        taskId,
        null,
        taskData,
        `Task ${taskId} status updated to ${taskData.status}`,
        req.ip,
        req.get('user-agent')
      );
      
      res.json({ success: true, message: 'Status zadatka je uspješno ažuriran' });
      return;
    }

    // Check if task exists
    const existingTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    
    if (!existingTask) {
      return res.status(404).json({ success: false, message: 'Zadatak nije pronađen' });
    }
    
    // If user is not admin, PRODUCER, CHIEF_CAMERA, or CAMERMAN_EDITOR, they can only edit tasks from their newsroom
    if (user.role !== 'ADMIN' && user.role !== 'PRODUCER' && user.role !== 'CHIEF_CAMERA' && user.role !== 'CAMERMAN_EDITOR' && user.newsroom_id !== existingTask.newsroom_id) {
      return res.status(403).json({ success: false, message: 'Možete uređivati zadatke samo za svoju redakciju' });
    }
    
    // CAMERMAN_EDITOR restrictions: can only modify tasks they created or where they assigned cameramen
    if (user.role === 'CAMERMAN_EDITOR') {
      // If cameramen were already assigned by someone else (not this CAMERMAN_EDITOR)
      if (existingTask.cameraman_assigned_by && existingTask.cameraman_assigned_by !== user.id) {
        // CAMERMAN_EDITOR can only add new cameramen, not modify anything else
        if (taskData.cameraman_ids !== undefined) {
          // Parse existing cameraman_ids
          let existingCameramanIds = [];
          try {
            existingCameramanIds = existingTask.cameraman_ids ? 
              JSON.parse(existingTask.cameraman_ids) : [];
          } catch (e) {
            existingCameramanIds = [];
          }
          
          // Parse new cameraman_ids
          let newCameramanIds = [];
          try {
            newCameramanIds = taskData.cameraman_ids ? 
              JSON.parse(taskData.cameraman_ids) : [];
          } catch (e) {
            newCameramanIds = [];
          }
          
          // Check if any existing cameramen are being removed or changed
          const removedCameramen = existingCameramanIds.filter(id => !newCameramanIds.includes(id));
          if (removedCameramen.length > 0) {
            return res.status(403).json({ 
              success: false, 
              message: 'Ne možete uklanjati kamermane koje je dodijelio neko drugi. Možete samo dodavati nove kamermane.' 
            });
          }
          
          // Only allow adding new cameramen, not modifying existing ones
          const addedCameramen = newCameramanIds.filter(id => !existingCameramanIds.includes(id));
          if (addedCameramen.length > 0) {
            // Allow adding new cameramen, but keep existing ones
            const combinedCameramen = [...existingCameramanIds, ...addedCameramen];
            taskData.cameraman_ids = JSON.stringify(combinedCameramen);
            // Don't update cameraman_assigned_by - keep the original assigner
  } else {
            // No changes allowed if no new cameramen are being added
            return res.status(403).json({ 
              success: false, 
              message: 'Ne možete mijenjati postojeće kamermane. Možete samo dodavati nove kamermane.' 
            });
          }
        } else {
          // If trying to modify anything other than cameraman_ids, block it
          return res.status(403).json({ 
            success: false, 
            message: 'Ne možete mijenjati zadatke gdje su kamermane dodijelili drugi korisnici. Možete samo dodavati nove kamermane.' 
          });
        }
      }
    }
    
    // Build dynamic update query based on provided fields
    const updateFields = [];
    const updateValues = [];
    
    if (taskData.date !== undefined) {
      updateFields.push('date = ?');
      updateValues.push(normalizeDateForQuery(taskData.date));
    }
    if (taskData.time_start !== undefined) {
      updateFields.push('time_start = ?');
      updateValues.push(taskData.time_start);
    }
    if (taskData.time_end !== undefined) {
      updateFields.push('time_end = ?');
      updateValues.push(taskData.time_end);
    }
    if (taskData.title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(taskData.title);
    }
    if (taskData.slugline !== undefined) {
      updateFields.push('slugline = ?');
      updateValues.push(taskData.slugline || '');
    }
    if (taskData.location !== undefined) {
      updateFields.push('location = ?');
      updateValues.push(taskData.location || '');
    }
    if (taskData.description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(taskData.description || '');
    }
    if (taskData.newsroom_id !== undefined) {
      updateFields.push('newsroom_id = ?');
      updateValues.push(taskData.newsroom_id);
    }
    if (taskData.coverage_type !== undefined) {
      updateFields.push('coverage_type = ?');
      updateValues.push(taskData.coverage_type || 'ENG');
    }
    if (taskData.attachment_type !== undefined) {
      updateFields.push('attachment_type = ?');
      updateValues.push(taskData.attachment_type || null);
    }
    if (taskData.status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(taskData.status || 'DRAFT');
    }
    if (taskData.flags !== undefined) {
      updateFields.push('flags = ?');
      updateValues.push(taskData.flags ? JSON.stringify(taskData.flags) : '[]');
    }
    if (taskData.journalist_ids !== undefined) {
      updateFields.push('journalist_ids = ?');
      updateValues.push(taskData.journalist_ids ? JSON.stringify(taskData.journalist_ids) : '[]');
      
      // Track journalist changes for audit log
      const oldJournalistIds = existingTask.journalist_ids ? JSON.parse(existingTask.journalist_ids) : [];
      const newJournalistIds = taskData.journalist_ids || [];
      
      // Check for changes
      const addedJournalists = newJournalistIds.filter(id => !oldJournalistIds.includes(id));
      const removedJournalists = oldJournalistIds.filter(id => !newJournalistIds.includes(id));
      
      if (addedJournalists.length > 0 || removedJournalists.length > 0) {
        // Store for later audit logging
        req.journalistChanges = { addedJournalists, removedJournalists };
      }
    }
    if (taskData.cameraman_ids !== undefined) {
      updateFields.push('cameraman_ids = ?');
      updateValues.push(taskData.cameraman_ids ? JSON.stringify(taskData.cameraman_ids) : '[]');
      
      // If CHIEF_CAMERA is updating cameraman_ids, track who assigned them
      if (user.role === 'CHIEF_CAMERA') {
        updateFields.push('cameraman_assigned_by = ?');
        updateValues.push(user.id);
      }
      // For CAMERMAN_EDITOR, only update cameraman_assigned_by if they're the first to assign
      else if (user.role === 'CAMERMAN_EDITOR' && !existingTask.cameraman_assigned_by) {
        updateFields.push('cameraman_assigned_by = ?');
        updateValues.push(user.id);
      }
    }
    if (taskData.vehicle_id !== undefined) {
      updateFields.push('vehicle_id = ?');
      updateValues.push(taskData.vehicle_id || null);
    }
    if (taskData.equipment_id !== undefined) {
      updateFields.push('equipment_id = ?');
      updateValues.push(taskData.equipment_id || null);
    }
    
    // Always update the updated_at timestamp
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    
    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'Nema podataka za ažuriranje' });
    }
    
    const updateQuery = `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`;
    updateValues.push(taskId);
    
    const updateTask = db.prepare(updateQuery);
    updateTask.run(...updateValues);
    
    // Send notifications based on changes
    try {
      // 1. Check if "SLUŽBENI PUT" flag was added
      if (taskData.flags !== undefined) {
        let oldFlags = [];
        let newFlags = [];
        try {
          oldFlags = existingTask.flags ? JSON.parse(existingTask.flags) : [];
          newFlags = taskData.flags ? JSON.parse(taskData.flags) : [];
        } catch (e) {
          console.error('Error parsing flags:', e);
        }
        
        // Check for RAZMJENA flag changes
        if (!oldFlags.includes('RAZMJENA') && newFlags.includes('RAZMJENA')) {
          console.log(`=== RAZMJENA FLAG ADDED NOTIFICATION ===`);
          console.log(`Task ID: ${taskId}, Title: ${existingTask.title}`);
          console.log(`RAZMJENA flag added by: ${user.id} (${user.role})`);
          
          // Send notification to PRODUCER
          const producers = db.prepare(`
            SELECT id, name, role 
            FROM users 
            WHERE role = 'PRODUCER'
          `).all();

          console.log(`Found ${producers.length} producers for RAZMJENA notification`);

          // Create notifications for each producer
          producers.forEach(producer => {
            try {
              // Check if notification already exists for this task and user
              const existingNotification = db.prepare(`
                SELECT id FROM notifications 
                WHERE user_id = ? AND task_id = ? AND type = 'razmjena_flag'
              `).get(producer.id, taskId);
              
              if (!existingNotification) {
                db.prepare(`
                  INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                  producer.id,
                  'RAZMJENA - Potrebno pronaći materijal',
                  `🔄 RAZMJENA: "${existingTask.title}" - Potrebno pronaći materijal za razmjenu`,
                  'razmjena_flag',
                  taskId,
                  new Date().toISOString(),
                  0
                );
                console.log(`✅ Created RAZMJENA notification for producer ${producer.id} (${producer.name})`);
              } else {
                console.log(`⚠️ RAZMJENA notification already exists for producer ${producer.id} (${producer.name})`);
              }
            } catch (insertError) {
              console.error(`Error inserting RAZMJENA notification for user ${producer.id}:`, insertError);
            }
          });
        }
        
        // If "SLUŽBENI PUT" was just added (not in old flags, but in new flags)
        if (!oldFlags.includes('SLUŽBENI PUT') && newFlags.includes('SLUŽBENI PUT')) {
          console.log(`=== SLUŽBENI PUT NOTIFICATION ===`);
          console.log(`Task ID: ${taskId}, Title: ${existingTask.title}`);
          console.log(`Službeni put requested by: ${user.id} (${user.role})`);
          
          // Send notification to CHIEF_CAMERA and CAMERMAN_EDITOR
          const cameraManagers = db.prepare(`
            SELECT id, name, role 
            FROM users 
            WHERE role IN ('CHIEF_CAMERA', 'CAMERMAN_EDITOR')
          `).all();
          
          console.log(`Found ${cameraManagers.length} camera managers for službeni put notification`);
          
          cameraManagers.forEach(manager => {
            try {
              db.prepare(`
                INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(
                manager.id,
                '🚗 Službeni put zahtjev',
                `Zadatak "${existingTask.title}" zahtijeva službeni put`,
                'travel_request',
                taskId,
                new Date().toISOString(),
                0
              );
              console.log(`✅ Created travel notification for ${manager.name}`);
            } catch (insertError) {
              console.error(`Error inserting travel notification for user ${manager.id}:`, insertError);
            }
          });
          
          console.log(`📢 Sent ${cameraManagers.length} travel notifications for task ${taskId}`);
        }
      }
      
      // 2. Check if cameraman was assigned (cameraman_ids changed)
      if (taskData.cameraman_ids !== undefined) {
        let oldCameramanIds = [];
        let newCameramanIds = [];
        try {
          oldCameramanIds = existingTask.cameraman_ids ? JSON.parse(existingTask.cameraman_ids) : [];
          
          // Handle both string and array formats for taskData.cameraman_ids
          if (typeof taskData.cameraman_ids === 'string') {
            newCameramanIds = taskData.cameraman_ids ? JSON.parse(taskData.cameraman_ids) : [];
          } else if (Array.isArray(taskData.cameraman_ids)) {
            newCameramanIds = taskData.cameraman_ids;
          } else {
            newCameramanIds = [];
          }
        } catch (e) {
          console.error('Error parsing cameraman_ids:', e);
          console.error('taskData.cameraman_ids:', taskData.cameraman_ids);
          console.error('Type:', typeof taskData.cameraman_ids);
        }
        
        // If cameramen were just assigned (old list was empty or new cameramen were added)
        const addedCameramen = newCameramanIds.filter(id => !oldCameramanIds.includes(id));
        if (addedCameramen.length > 0) {
          console.log(`=== CAMERAMAN ASSIGNED NOTIFICATION ===`);
          console.log(`Task ID: ${taskId}, Title: ${existingTask.title}`);
          console.log(`Cameramen assigned by: ${user.id} (${user.role})`);
          console.log(`Added cameramen IDs: ${addedCameramen}`);
          
          // Send notification to PRODUCER
          const producers = db.prepare(`
            SELECT id, name, role 
            FROM users 
            WHERE role = 'PRODUCER'
          `).all();
          
          console.log(`Found ${producers.length} producers for cameraman assignment notification`);
          
          producers.forEach(producer => {
            try {
              db.prepare(`
                INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(
                producer.id,
                '🚗 Službeni put potreban',
                `Zadatak "${existingTask.title}" - potreban službeni nalog`,
                'cameraman_assigned',
                taskId,
                new Date().toISOString(),
                0
              );
              console.log(`✅ Created cameraman assignment notification for ${producer.name}`);
            } catch (insertError) {
              console.error(`Error inserting cameraman notification for user ${producer.id}:`, insertError);
            }
          });
          
          console.log(`📢 Sent ${producers.length} cameraman assignment notifications for task ${taskId}`);
          
          // Check if task is urgent (HITNO flag) and send special notification to camera managers
          let taskFlags = [];
          try {
            taskFlags = existingTask.flags ? JSON.parse(existingTask.flags) : [];
          } catch (e) {
            console.error('Error parsing task flags for urgent notification:', e);
          }
          
          if (taskFlags.includes('HITNO')) {
            console.log('=== URGENT TASK CAMERAMAN ASSIGNMENT NOTIFICATION ===');
            console.log(`Task ID: ${taskId}, Title: ${existingTask.title}, Added cameramen: ${addedCameramen.join(', ')}`);
            console.log(`Assigned by: ${user.id} (${user.role})`);
            console.log(`Timestamp: ${new Date().toISOString()}`);
            
            // Get task newsroom info
            const newsroom = db.prepare('SELECT name FROM newsrooms WHERE id = ?').get(existingTask.newsroom_id);
            const newsroomName = newsroom ? newsroom.name : `Redakcija ID: ${existingTask.newsroom_id}`;
            
            // Create notification for CHIEF_CAMERA and CAMERMAN_EDITOR
            const cameraManagers = db.prepare(`
              SELECT id, name, role 
              FROM users 
              WHERE role IN ('CHIEF_CAMERA', 'CAMERMAN_EDITOR')
            `).all();
            
            const cameramanNames = addedCameramen.map(camId => {
              const person = db.prepare('SELECT name FROM people WHERE id = ?').get(camId);
              return person ? person.name : `ID: ${camId}`;
            }).join(', ');
            
            const notificationMessage = `🚨 HITNO: KAMERMAN ${cameramanNames} je dodijeljen na zadatak "${existingTask.title}" (${newsroomName})`;
            
            cameraManagers.forEach(manager => {
              try {
                // Check if notification already exists for this task and user
                const existingNotification = db.prepare(`
                  SELECT id FROM notifications 
                  WHERE user_id = ? AND task_id = ? AND type = 'urgent_camera_assigned'
                `).get(manager.id, taskId);
                
                if (!existingNotification) {
                  db.prepare(`
                    INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                  `).run(
                    manager.id,
                    '🚨 Hitni zadatak - KAMERMAN dodijeljen',
                    notificationMessage,
                    'urgent_camera_assigned',
                    taskId,
                    new Date().toISOString(),
                    0
                  );
                  
                  console.log(`Notification created for ${manager.name} (${manager.role})`);
                } else {
                  console.log(`Notification already exists for ${manager.name}`);
                }
              } catch (notificationError) {
                console.error(`Error creating notification for ${manager.name}:`, notificationError);
              }
            });
            
            console.log('=== END URGENT TASK NOTIFICATION ===');
          }
          
          // Send notifications to the cameramen themselves
          try {
            addedCameramen.forEach(cameramanId => {
              // Find the user account for this cameraman
              const person = db.prepare('SELECT name, email FROM people WHERE id = ?').get(cameramanId);
              if (person) {
                // Try to find user account for this cameraman using email-based mapping
                let cameramanUser = null;
                
                // Strategy 1: Use email from people table to find username
                if (person.email) {
                  // Extract username from email (e.g., "edin.suljendic@rtvtk.ba" -> "edin.suljendic")
                  const usernameFromEmail = person.email.split('@')[0];
                  cameramanUser = db.prepare(`
                    SELECT id, username, name FROM users 
                    WHERE role = 'CAMERA' AND username = ?
                  `).get(usernameFromEmail);
                  console.log(`🔍 Email mapping: ${person.email} -> ${usernameFromEmail}`);
                }
                
                // Strategy 2: Exact name match (fallback)
                if (!cameramanUser) {
                  cameramanUser = db.prepare(`
                    SELECT id, username, name FROM users 
                    WHERE role = 'CAMERA' AND name = ?
                  `).get(person.name);
                  console.log(`🔍 Name mapping: ${person.name}`);
                }
                
                // Strategy 3: Username-based matching (convert name to username format)
                if (!cameramanUser) {
                  const usernameFromName = person.name.toLowerCase().replace(/\s+/g, '.');
                  cameramanUser = db.prepare(`
                    SELECT id, username, name FROM users 
                    WHERE role = 'CAMERA' AND username = ?
                  `).get(usernameFromName);
                  console.log(`🔍 Username conversion: ${person.name} -> ${usernameFromName}`);
                }
                
                console.log(`🔍 Looking for user account for cameraman: ${person.name} (ID: ${cameramanId})`);
                console.log(`🔍 Found user account:`, cameramanUser ? `${cameramanUser.name} (${cameramanUser.username})` : 'None');
                
                if (cameramanUser) {
                  db.prepare(`
                    INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                  `).run(
                    cameramanUser.id,
                    '📹 Novi zadatak dodijeljen',
                    `Dodijeljeni ste na zadatak "${existingTask.title}" (${existingTask.date}, ${existingTask.time_start || 'N/A'})`,
                    'cameraman_assigned',
                    taskId,
                    new Date().toISOString(),
                    0
                  );
                  console.log(`✅ Created notification for cameraman ${cameramanUser.name} (${cameramanUser.username})`);
                }
              }
            });
          } catch (cameramanNotificationError) {
            console.error('Error sending notifications to cameramen:', cameramanNotificationError);
          }
          
          // Send notification to EDITOR and DESK_EDITOR who created the task
          try {
            // Get the user who created the task
            const taskCreator = db.prepare('SELECT * FROM users WHERE id = ?').get(existingTask.created_by);
            
            if (taskCreator && ['EDITOR', 'DESK_EDITOR'].includes(taskCreator.role)) {
              const cameramanNames = addedCameramen.map(camId => {
                const person = db.prepare('SELECT name FROM people WHERE id = ?').get(camId);
                return person ? person.name : `ID ${camId}`;
              }).join(', ');
              
              db.prepare(`
                INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(
                taskCreator.id,
                '📹 KAMERMAN dodijeljen',
                `KAMERMAN ${cameramanNames} je dodijeljen zadatku "${existingTask.title}"`,
                'cameraman_assigned',
                taskId,
                new Date().toISOString(),
                0
              );
              console.log(`✅ Created cameraman assignment notification for task creator ${taskCreator.name} (${taskCreator.role})`);
            }
            
            // Also send to DESK_EDITOR of the newsroom if different from creator
            if (existingTask.newsroom_id) {
              const deskEditor = db.prepare(`
                SELECT * FROM users 
                WHERE newsroom_id = ? AND role = 'DESK_EDITOR' AND id != ?
              `).get(existingTask.newsroom_id, existingTask.created_by);
              
              if (deskEditor) {
                const cameramanNames = addedCameramen.map(camId => {
                  const person = db.prepare('SELECT name FROM people WHERE id = ?').get(camId);
                  return person ? person.name : `ID ${camId}`;
                }).join(', ');
                
                db.prepare(`
                  INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                  deskEditor.id,
                  '📹 KAMERMAN dodijeljen',
                  `KAMERMAN ${cameramanNames} je dodijeljen zadatku "${existingTask.title}"`,
                  'cameraman_assigned',
                  taskId,
                  new Date().toISOString(),
                  0
                );
                console.log(`✅ Created cameraman assignment notification for DESK_EDITOR ${deskEditor.name}`);
              }
            }
          } catch (notificationError) {
            console.error('Error sending cameraman assignment notifications to editors:', notificationError);
          }
          
          // Log to audit log
          const cameramanNames = addedCameramen.map(camId => {
            const person = db.prepare('SELECT name FROM people WHERE id = ?').get(camId);
            return person ? person.name : `ID ${camId}`;
          }).join(', ');
          
          logAudit(
            db, 
            user.id, 
            'UPDATE: Cameraman assigned', 
            'tasks', 
            taskId, 
            { cameraman_ids: oldCameramanIds },
            { cameraman_ids: newCameramanIds },
            `Dodani kamermani: ${cameramanNames} za zadatak "${existingTask.title}"`,
            req.ip,
            req.get('user-agent')
          );
        }
      }
    } catch (notificationError) {
      console.error('Error creating update notifications:', notificationError);
      // Don't fail the task update if notifications fail
    }
    
    // Log journalist changes to audit log
    if (req.journalistChanges) {
      const { addedJournalists, removedJournalists } = req.journalistChanges;
      
      if (addedJournalists.length > 0) {
        const addedNames = addedJournalists.map(jId => {
          const journalist = db.prepare('SELECT name FROM people WHERE id = ?').get(jId);
          return journalist ? journalist.name : `ID ${jId}`;
        }).join(', ');
        
        logAudit(
          db,
          user.id,
          'UPDATE: Journalist added',
          'tasks',
          taskId,
          null,
          null,
          `Dodani novinari: ${addedNames} za zadatak "${existingTask.title}"`,
          req.ip,
          req.get('user-agent')
        );
      }
      
      if (removedJournalists.length > 0) {
        const removedNames = removedJournalists.map(jId => {
          const journalist = db.prepare('SELECT name FROM people WHERE id = ?').get(jId);
          return journalist ? journalist.name : `ID ${jId}`;
        }).join(', ');
        
        logAudit(
          db,
          user.id,
          'UPDATE: Journalist removed',
          'tasks',
          taskId,
          null,
          null,
          `Uklonjeni novinari: ${removedNames} sa zadatka "${existingTask.title}"`,
          req.ip,
          req.get('user-agent')
        );
      }
    }
    
    res.json({ success: true, message: 'Zadatak je uspješno ažuriran' });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja zadatka' });
  }
});

app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const taskId = req.params.id;
    
    // VIEWER, CAMERA, and CONTROL_ROOM roles cannot delete tasks
    if (user.role === 'VIEWER' || user.role === 'CAMERA' || user.role === 'CONTROL_ROOM') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za brisanje zadataka' });
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`=== DELETE TASK DEBUG ===`);
      console.log(`User: ${user.id} (${user.role})`);
      console.log(`User newsroom_id: ${user.newsroom_id}`);
      console.log(`Task ID: ${taskId}`);
    }
    
    // Get full user info from database
    const fullUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    if (process.env.NODE_ENV === 'development') {
      console.log(`Full user info:`, fullUser);
    }
    
    // Check if task exists
    const existingTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    
    if (!existingTask) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Task ${taskId} not found`);
      }
      return res.status(404).json({ success: false, message: 'Zadatak nije pronađen' });
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`Task found: ${existingTask.title}, Newsroom ID: ${existingTask.newsroom_id}, Created by: ${existingTask.created_by}`);
    }
    
    // Check if user has permission to delete tasks
    if (!['ADMIN', 'PRODUCER', 'EDITOR', 'DESK_EDITOR'].includes(user.role)) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Permission denied: User role ${user.role} not allowed to delete tasks`);
      }
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za brisanje zadataka' });
    }
    
    // If user is not admin or producer, they can only delete tasks from their newsroom
    if (!['ADMIN', 'PRODUCER'].includes(user.role) && user.newsroom_id !== existingTask.newsroom_id) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Permission denied: User newsroom (${user.newsroom_id}) != Task newsroom (${existingTask.newsroom_id})`);
      }
      return res.status(403).json({ success: false, message: 'Možete brisati zadatke samo za svoju redakciju' });
    }
    
    // DESK_EDITOR and CAMERAMAN_EDITOR can only delete tasks they created
    if (['DESK_EDITOR', 'CAMERAMAN_EDITOR'].includes(user.role) && existingTask.created_by !== user.id) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Permission denied: User (${user.id}) cannot delete task created by (${existingTask.created_by})`);
      }
      return res.status(403).json({ success: false, message: 'Možete brisati samo zadatke koje ste sami kreirali' });
    }
    
    // If task has no created_by, only ADMIN and PRODUCER can delete it
    if (!existingTask.created_by && !['ADMIN', 'PRODUCER'].includes(user.role)) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Permission denied: Task has no creator, only ADMIN/PRODUCER can delete`);
      }
      return res.status(403).json({ success: false, message: 'Možete brisati samo zadatke koje ste sami kreirali' });
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`Permission granted for deletion`);
    }
    
    // First, delete related notifications
    try {
      const deleteNotifications = db.prepare('DELETE FROM notifications WHERE task_id = ?');
      const notificationResult = deleteNotifications.run(taskId);
      if (process.env.NODE_ENV === 'development') {
        console.log(`Deleted ${notificationResult.changes} notifications for task ${taskId}`);
      }
    } catch (notificationError) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`No notifications to delete for task ${taskId}:`, notificationError.message);
      }
    }
    
    // Check if task has related employee schedules
    try {
      const relatedSchedules = db.prepare('SELECT COUNT(*) as count FROM employee_schedules WHERE task_id = ?').get(taskId);
      if (process.env.NODE_ENV === 'development') {
        console.log(`Task ${taskId} has ${relatedSchedules.count} related employee schedules`);
        
        if (relatedSchedules.count > 0) {
          console.log(`Warning: Task has related employee schedules, but proceeding with deletion`);
        }
      }
    } catch (scheduleError) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Error checking employee schedules for task ${taskId}:`, scheduleError.message);
      }
    }
    
    // Check if task has related task presets
    try {
      const relatedPresets = db.prepare('SELECT COUNT(*) as count FROM task_presets WHERE task_id = ?').get(taskId);
      if (process.env.NODE_ENV === 'development') {
        console.log(`Task ${taskId} has ${relatedPresets.count} related task presets`);
        
        if (relatedPresets.count > 0) {
          console.log(`Warning: Task has related task presets, but proceeding with deletion`);
        }
      }
    } catch (presetError) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Error checking task presets for task ${taskId}:`, presetError.message);
      }
    }
    
    // Check if task has related audit log entries
    try {
      const relatedAuditLogs = db.prepare('SELECT COUNT(*) as count FROM audit_log WHERE record_id = ? AND table_name = ?').get(taskId, 'tasks');
      if (process.env.NODE_ENV === 'development') {
        console.log(`Task ${taskId} has ${relatedAuditLogs.count} related audit log entries`);
        
        if (relatedAuditLogs.count > 0) {
          console.log(`Warning: Task has related audit log entries, but proceeding with deletion`);
        }
      }
    } catch (auditError) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Error checking audit log for task ${taskId}:`, auditError.message);
      }
    }
    
    // Then delete the task
    const deleteTask = db.prepare('DELETE FROM tasks WHERE id = ?');
    const result = deleteTask.run(taskId);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`Task deleted successfully: ${result.changes} rows affected`);
    }
    
    // Log to audit log
    logAudit(
      db,
      user.id,
      'DELETE: Task deleted',
      'tasks',
      taskId,
      existingTask,
      null,
      `Obrisan zadatak: "${existingTask.title}" (${existingTask.date}, ${existingTask.time_start || 'bez vremena'})`,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({ success: true, message: 'Zadatak je uspješno obrisan' });
  } catch (error) {
    console.error('=== DELETE TASK ERROR ===');
    console.error('Error details:', error);
    console.error('User:', user);
    console.error('Task ID:', taskId);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja zadatka' });
  }
});

// Mark task as done (PRODUCER marks that travel order is completed)
app.post('/api/tasks/:id/mark-done', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const taskId = req.params.id;

    // Only ADMIN and PRODUCER can mark tasks as done
    if (user.role !== 'ADMIN' && user.role !== 'PRODUCER') {
      return res.status(403).json({ success: false, message: 'Samo ADMIN i PRODUCER mogu označiti zadatak kao urađen' });
    }

    // Check if task exists
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    
    if (!task) {
      return res.status(404).json({ success: false, message: 'Zadatak nije pronađen' });
    }

    // Parse task data
    const parsedTask = parseTaskJsonFields(task);

    if (process.env.NODE_ENV === 'development') {
      console.log(`=== TASK MARKED AS DONE ===`);
      console.log(`Task ID: ${taskId}, Title: ${task.title}, Newsroom ID: ${task.newsroom_id}`);
      console.log(`Marked as done by: ${user.id} (${user.role})`);
    }

    // Add confirmation flag to task instead of changing status
    const currentFlags = parsedTask.flags || [];
    if (!currentFlags.includes('POTVRĐENO')) {
      const updatedFlags = [...currentFlags, 'POTVRĐENO'];
      db.prepare(`
        UPDATE tasks 
        SET flags = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(updatedFlags), new Date().toISOString(), taskId);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Task ${taskId} marked as POTVRĐENO`);
      }
    }

    // Send notifications to EDITOR, DESK_EDITOR, and cameramen of the task's newsroom
    try {
      // 1. Get EDITOR and DESK_EDITOR from the task's newsroom
      const editors = db.prepare(`
        SELECT id, name, role 
        FROM users 
        WHERE role IN ('EDITOR', 'DESK_EDITOR') AND newsroom_id = ?
      `).all(task.newsroom_id);

      if (process.env.NODE_ENV === 'development') {
        console.log(`Found ${editors.length} editors for task done notification:`, editors.map(e => ({ id: e.id, name: e.name, role: e.role })));
      }

      // 2. Get CHIEF_CAMERA and CAMERMAN_EDITOR (camera managers)
      const cameraManagers = db.prepare(`
        SELECT id, username as name, role 
        FROM users 
        WHERE role IN ('CHIEF_CAMERA', 'CAMERMAN_EDITOR')
      `).all();

      if (process.env.NODE_ENV === 'development') {
        console.log(`Found ${cameraManagers.length} camera managers for task done notification:`, cameraManagers.map(c => ({ id: c.id, name: c.name, role: c.role })));
      }

      // Combine all recipients (editors + camera managers)
      const recipients = [...editors, ...cameraManagers];

      if (process.env.NODE_ENV === 'development') {
        console.log(`Total recipients: ${recipients.length}`);
      }

      // Create notifications for each recipient
      recipients.forEach(recipient => {
        try {
          db.prepare(`
            INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            recipient.id,
            '✅ Službeni nalog urađen',
            `Službeni nalog za zadatak "${task.title}" je urađen`,
            'task_done',
            taskId,
            new Date().toISOString(),
            0
          );
          if (process.env.NODE_ENV === 'development') {
            console.log(`✅ Created task done notification for ${recipient.name} (${recipient.role})`);
          }
        } catch (insertError) {
          console.error(`Error inserting task done notification for user ${recipient.id}:`, insertError);
        }
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(`📢 Sent ${recipients.length} task done notifications for task ${taskId}`);
      }
    } catch (notificationError) {
      console.error('Error creating task done notifications:', notificationError);
      // Don't fail the request if notifications fail
    }

    res.json({ success: true, message: 'Zadatak je označen kao urađen. Notifikacije su poslate.' });
  } catch (error) {
    console.error('Mark task as done error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom označavanja zadatka kao urađenog' });
  }
});

// Newsrooms routes
app.get('/api/newsrooms', authenticateToken, (req, res) => {
  try {
    const newsrooms = db.prepare('SELECT * FROM newsrooms ORDER BY name').all();
    res.json({ success: true, data: newsrooms });
  } catch (error) {
    console.error('Get newsrooms error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja redakcija' });
  }
});

// People routes
app.get('/api/people', authenticateToken, (req, res) => {
  try {
    const { role, newsroom_id } = req.query;
    
    let query = 'SELECT * FROM people WHERE is_active = 1';
    const params = [];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    if (newsroom_id) {
      query += ' AND newsroom_id = ?';
      params.push(newsroom_id);
    }
    
    query += ' ORDER BY name';
    
    const people = db.prepare(query).all(...params);
    res.json({ success: true, data: people });
  } catch (error) {
    console.error('Get people error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja osoba' });
  }
});

app.post('/api/people', authenticateToken, (req, res) => {
  try {
    const { name, phone, email, position, newsroom_id } = req.body;
    
    // VIEWER, CAMERA, and CONTROL_ROOM roles cannot create people
    if (req.user.role === 'VIEWER' || req.user.role === 'CAMERA' || req.user.role === 'CONTROL_ROOM') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za dodavanje uposlenika' });
    }
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Ime je obavezno' });
    }
    
    // Default role for all people
    const role = 'VIEWER';
    
    // Auto-generate email if not provided
    const finalEmail = email || generateEmailFromName(name);
    
    // Format phone number to always start with +387
    const finalPhone = formatPhoneNumber(phone);
    
    // Check if user has permission to create people in this newsroom
    if (req.user.role !== 'ADMIN' && req.user.role !== 'PRODUCER') {
      // EDITOR and other roles can only create people in their own newsroom
      if (newsroom_id && newsroom_id !== req.user.newsroom_id) {
        return res.status(403).json({ success: false, message: 'Možete dodavati uposlenike samo u svojoj redakciji' });
      }
      // If no newsroom_id provided, use user's newsroom
      if (!newsroom_id) {
        newsroom_id = req.user.newsroom_id;
      }
    }
    
    const result = db.prepare(`
      INSERT INTO people (name, role, phone, email, position, newsroom_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, role, finalPhone, finalEmail, position, newsroom_id);

    res.json({ success: true, data: { id: result.lastInsertRowid, email: finalEmail, phone: finalPhone } });
  } catch (error) {
    console.error('Create people error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja uposlenika' });
  }
});

app.put('/api/people/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, position, newsroom_id } = req.body;
    
    // VIEWER, CAMERA, and CONTROL_ROOM roles cannot update people
    if (req.user.role === 'VIEWER' || req.user.role === 'CAMERA' || req.user.role === 'CONTROL_ROOM') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za ažuriranje uposlenika' });
    }
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Ime je obavezno' });
    }
    
    // Default role for all people
    const role = 'VIEWER';
    
    // Check if user has permission to update this person
    const person = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
    if (!person) {
      return res.status(404).json({ success: false, message: 'Uposlenik nije pronađen' });
    }
    
    if (req.user.role !== 'ADMIN' && req.user.role !== 'PRODUCER') {
      if (person.newsroom_id !== req.user.newsroom_id) {
        return res.status(403).json({ success: false, message: 'Možete ažurirati samo uposlenike iz svoje redakcije' });
      }
      // EDITOR and other roles can only update people in their own newsroom
      if (newsroom_id && newsroom_id !== req.user.newsroom_id) {
        return res.status(403).json({ success: false, message: 'Možete premestiti uposlenika samo u svoju redakciju' });
      }
    }
    
    // Auto-generate email if not provided
    const finalEmail = email || generateEmailFromName(name);
    
    // Format phone number to always start with +387
    const finalPhone = formatPhoneNumber(phone);
    
    const result = db.prepare(`
      UPDATE people 
      SET name = ?, role = ?, phone = ?, email = ?, position = ?, newsroom_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, role, finalPhone, finalEmail, position, newsroom_id, id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Uposlenik nije pronađen' });
    }

    res.json({ success: true, data: { id: parseInt(id), email: finalEmail, phone: finalPhone } });
  } catch (error) {
    console.error('Update people error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja uposlenika' });
  }
});

app.delete('/api/people/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    
    // VIEWER, CAMERA, and CONTROL_ROOM roles cannot delete people
    if (req.user.role === 'VIEWER' || req.user.role === 'CAMERA' || req.user.role === 'CONTROL_ROOM') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za brisanje uposlenika' });
    }
    
    console.log('=== DELETE PERSON REQUEST ===');
    console.log('Person ID:', id);
    console.log('User:', { id: req.user.id, username: req.user.username, role: req.user.role, newsroom_id: req.user.newsroom_id });
    
    // Check if user has permission to delete this person
    const person = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
    if (!person) {
      console.log('ERROR: Person not found');
      return res.status(404).json({ success: false, message: 'Uposlenik nije pronađen' });
    }
    
    console.log('Person:', { id: person.id, name: person.name, newsroom_id: person.newsroom_id });
    
    // ADMIN and PRODUCER can delete anyone
    // EDITOR can only delete people from their own newsroom
    if (req.user.role !== 'ADMIN' && req.user.role !== 'PRODUCER') {
      console.log('User is EDITOR, checking permissions...');
      
      // If EDITOR doesn't have a newsroom, they can't delete anyone
      if (!req.user.newsroom_id) {
        console.log('ERROR: User has no newsroom_id');
        return res.status(403).json({ success: false, message: 'Nemate dodijeljenu redakciju. Kontaktirajte administratora.' });
      }
      
      // If person doesn't have a newsroom, EDITOR can't delete them
      if (!person.newsroom_id) {
        console.log('ERROR: Person has no newsroom_id');
        return res.status(403).json({ success: false, message: 'Ovaj uposlenik nije dodijeljen nijednoj redakciji. Samo administrator može ga obrisati.' });
      }
      
      console.log('Comparing newsroom_ids:', { person: person.newsroom_id, user: req.user.newsroom_id, match: person.newsroom_id === req.user.newsroom_id });
      
      // EDITOR can only delete people from their own newsroom
      if (person.newsroom_id !== req.user.newsroom_id) {
        console.log('ERROR: Newsroom mismatch');
        return res.status(403).json({ success: false, message: 'Možete obrisati samo uposlenike iz svoje redakcije.' });
      }
      
      console.log('Permission check passed!');
    }
    
    console.log('Attempting to delete person...');
    
    // First, delete all references to this person in other tables
    try {
      // Delete from employee_schedules
      const empScheduleResult = db.prepare('DELETE FROM employee_schedules WHERE person_id = ?').run(id);
      console.log(`Deleted ${empScheduleResult.changes} employee_schedules`);
      
      // Delete from schedules
      const scheduleResult = db.prepare('DELETE FROM schedules WHERE person_id = ?').run(id);
      console.log(`Deleted ${scheduleResult.changes} schedules`);
      
      // Delete from leave_requests
      const leaveResult = db.prepare('DELETE FROM leave_requests WHERE person_id = ?').run(id);
      console.log(`Deleted ${leaveResult.changes} leave_requests`);
      
      // Update tasks to remove cameraman reference (set to NULL instead of deleting tasks)
      const taskResult = db.prepare('UPDATE tasks SET cameraman_id = NULL WHERE cameraman_id = ?').run(id);
      console.log(`Updated ${taskResult.changes} tasks`);
    } catch (refError) {
      console.error('Error deleting references:', refError);
      return res.status(500).json({ success: false, message: 'Greška prilikom brisanja povezanih podataka' });
    }
    
    // Now delete the person
    const result = db.prepare('DELETE FROM people WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      console.log('ERROR: Delete failed, no changes');
      return res.status(404).json({ success: false, message: 'Uposlenik nije pronađen' });
    }
    
    console.log('SUCCESS: Person deleted');
    res.json({ success: true });
  } catch (error) {
    console.error('Delete people error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja uposlenika' });
  }
});

// Users routes (admin only)
app.get('/api/users', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    if (user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Samo administrator može pristupiti korisnicima' });
    }
    
    const users = db.prepare(`
      SELECT u.*, n.name as newsroom_name 
      FROM users u 
      LEFT JOIN newsrooms n ON u.newsroom_id = n.id 
      ORDER BY u.name
    `).all();
    
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja korisnika' });
  }
});

app.post('/api/users', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    if (user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Samo administrator može kreirati korisnike' });
    }
    
    const { username, name, password, role, newsroom_id } = req.body;
    
    if (!username || !name || !password || !role) {
      return res.status(400).json({ success: false, message: 'Sva obavezna polja moraju biti popunjena' });
    }
    
    // Check if username already exists
    const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    // If username exists and user is ACTIVE, return error
    if (existingUser && existingUser.is_active === 1) {
      return res.status(400).json({ success: false, message: 'Korisničko ime već postoji' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    let result;
    
    // If username exists but user is DEACTIVATED, reactivate and update
    if (existingUser && existingUser.is_active === 0) {
      console.log('Found deactivated user with same username, reactivating and updating');
      
      // Users table only has: id, username, name, password, role, newsroom_id, is_active, created_at, updated_at
      db.prepare(`
        UPDATE users 
        SET name = ?, password = ?, role = ?, newsroom_id = ?, is_active = 1, 
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(name, hashedPassword, role, newsroom_id, existingUser.id);
      
      result = { lastInsertRowid: existingUser.id };
      console.log('User reactivated successfully with new data');
    }
    // If username doesn't exist, create new user
    else {
      console.log('Creating new user');
      
      // Users table only has: id, username, name, password, role, newsroom_id, is_active, created_at, updated_at
      const insertUser = db.prepare(`
        INSERT INTO users (username, name, password, role, newsroom_id) 
        VALUES (?, ?, ?, ?, ?)
      `);
      
      result = insertUser.run(username, name, hashedPassword, role, newsroom_id);
    }
    
    // Log to audit log
    logAudit(
      db,
      user.id,
      'CREATE: User created',
      'users',
      result.lastInsertRowid,
      null,
      { username, name, role, newsroom_id },
      `Kreiran novi korisnik: ${name} (${username}) - ${role}`,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({ 
      success: true, 
      message: 'Korisnik je uspješno kreiran',
      data: { id: result.lastInsertRowid }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja korisnika' });
  }
});

app.put('/api/users/:id', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    
    if (user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Samo administrator može ažurirati korisnike' });
    }
    
    const { username, name, password, role, newsroom_id, is_active } = req.body;
    
    // Get existing user
    const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'Korisnik nije pronađen' });
    }
    
    // Check if username is being changed and if new username already exists
    if (username && username !== existingUser.username) {
      const usernameTaken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
      if (usernameTaken) {
        return res.status(400).json({ success: false, message: 'Korisničko ime već postoji' });
      }
    }
    
    // Build update query dynamically
    // Users table only has: username, name, password, role, newsroom_id, is_active
    let updateFields = [];
    let updateValues = [];
    
    if (username) {
      updateFields.push('username = ?');
      updateValues.push(username);
    }
    if (name) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (password) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      updateFields.push('password = ?');
      updateValues.push(hashedPassword);
    }
    if (role) {
      updateFields.push('role = ?');
      updateValues.push(role);
    }
    if (newsroom_id !== undefined) {
      updateFields.push('newsroom_id = ?');
      updateValues.push(newsroom_id || null);
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active ? 1 : 0);
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(id);
    
    const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
    db.prepare(updateQuery).run(...updateValues);
    
    // Log to audit log
    logAudit(
      db,
      user.id,
      'UPDATE: User updated',
      'users',
      parseInt(id),
      existingUser,
      { username, name, role, newsroom_id, is_active },
      `Ažuriran korisnik: ${name || existingUser.name} (${username || existingUser.username})`,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({ success: true, message: 'Korisnik je uspješno ažuriran' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja korisnika' });
  }
});

app.delete('/api/users/:id', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    
    console.log('=== DELETE USER REQUEST ===');
    console.log('Admin user:', user.id, user.username, user.role);
    console.log('Deleting user ID:', id);
    
    if (user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Samo administrator može brisati korisnike' });
    }
    
    // Get existing user for audit log
    const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'Korisnik nije pronađen' });
    }
    
    console.log('User to delete:', existingUser);
    
    // Prevent deleting self
    if (parseInt(id) === user.id) {
      return res.status(400).json({ success: false, message: 'Ne možete obrisati sami sebe' });
    }
    
    // Check if user has any related records
    const tasksCreated = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE created_by = ?').get(id);
    const auditLogs = db.prepare('SELECT COUNT(*) as count FROM audit_log WHERE user_id = ?').get(id);
    
    console.log('Checking dependencies:', { tasksCreated: tasksCreated.count, auditLogs: auditLogs.count });
    
    // If user has created tasks or has audit logs, just deactivate
    if (tasksCreated.count > 0 || auditLogs.count > 0) {
      console.log('User has related records, deactivating instead of deleting');
      db.prepare('UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
      
      logAudit(
        db,
        user.id,
        'DELETE: User deactivated',
        'users',
        parseInt(id),
        existingUser,
        { is_active: false },
        `Deaktiviran korisnik (ima ${tasksCreated.count} zadataka): ${existingUser.name} (${existingUser.username})`,
        req.ip,
        req.get('user-agent')
      );
      
      console.log('User successfully deactivated');
      res.json({ success: true, message: `Korisnik je deaktiviran (ima ${tasksCreated.count} zadataka u sistemu)` });
    } 
    // If no related records, safe to delete completely
    else {
      console.log('User has no related records, safe to delete completely');
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      
      logAudit(
        db,
        user.id,
        'DELETE: User permanently deleted',
        'users',
        parseInt(id),
        existingUser,
        null,
        `Trajno obrisan korisnik: ${existingUser.name} (${existingUser.username}) - ${existingUser.role}`,
        req.ip,
        req.get('user-agent')
      );
      
      console.log('User successfully deleted');
      res.json({ success: true, message: 'Korisnik je uspješno trajno obrisan' });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja korisnika: ' + error.message });
  }
});

// Vehicles routes
app.get('/api/vehicles', authenticateToken, (req, res) => {
  try {
    const vehicles = db.prepare('SELECT * FROM vehicles WHERE is_active = 1 ORDER BY name').all();
    res.json({ success: true, data: vehicles });
  } catch (error) {
    console.error('Get vehicles error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja vozila' });
  }
});

// Create vehicle
app.post('/api/vehicles', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { name, type, license_plate } = req.body;

    // Validate required fields
    if (!name || !type || !license_plate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Naziv, tip i registarski broj su obavezni' 
      });
    }

    // Check if license plate already exists
    const existingVehicle = db.prepare('SELECT id FROM vehicles WHERE plate_number = ?').get(license_plate);
    if (existingVehicle) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vozilo s tim registarskim brojem već postoji' 
      });
    }

    const result = db.prepare(`
      INSERT INTO vehicles (name, type, plate_number, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(name, type, license_plate);

    const vehicleId = result.lastInsertRowid;

    // Log audit
    logAudit(
      db,
      user.id,
      'CREATE: Vehicle created',
      'vehicles',
      vehicleId,
      null,
      { name, type, license_plate },
      `Kreirano vozilo: ${name} (${license_plate})`,
      req.ip,
      req.get('user-agent')
    );

    res.json({ 
      success: true, 
      message: 'Vozilo je uspješno kreirano',
      data: { id: vehicleId }
    });
  } catch (error) {
    console.error('Create vehicle error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja vozila' });
  }
});

// Update vehicle
app.put('/api/vehicles/:id', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { name, type, license_plate, is_available } = req.body;

    // Get existing vehicle
    const existingVehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    if (!existingVehicle) {
      return res.status(404).json({ success: false, message: 'Vozilo nije pronađeno' });
    }

    // Check if license plate already exists for other vehicles
    if (license_plate && license_plate !== existingVehicle.license_plate) {
      const duplicateVehicle = db.prepare('SELECT id FROM vehicles WHERE plate_number = ? AND id != ?').get(license_plate, id);
      if (duplicateVehicle) {
        return res.status(400).json({ 
          success: false, 
          message: 'Vozilo s tim registarskim brojem već postoji' 
        });
      }
    }

    // Update vehicle
    db.prepare(`
      UPDATE vehicles 
      SET name = COALESCE(?, name),
          type = COALESCE(?, type),
          plate_number = COALESCE(?, plate_number),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, type, license_plate, id);

    // Log audit
    logAudit(
      db,
      user.id,
      'UPDATE: Vehicle updated',
      'vehicles',
      id,
      existingVehicle,
      { name, type, license_plate, is_available },
      `Ažurirano vozilo: ${name || existingVehicle.name}`,
      req.ip,
      req.get('user-agent')
    );

    res.json({ success: true, message: 'Vozilo je uspješno ažurirano' });
  } catch (error) {
    console.error('Update vehicle error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja vozila' });
  }
});

// Delete vehicle
app.delete('/api/vehicles/:id', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;

    // Get existing vehicle
    const existingVehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    if (!existingVehicle) {
      return res.status(404).json({ success: false, message: 'Vozilo nije pronađeno' });
    }

    // Check if vehicle is assigned to any tasks
    const assignedTasks = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE vehicle_id = ?').get(id);
    if (assignedTasks.count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vozilo se ne može obrisati jer je dodijeljeno zadacima' 
      });
    }

    // Soft delete - set is_active to 0
    db.prepare('UPDATE vehicles SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    // Log audit
    logAudit(
      db,
      user.id,
      'DELETE: Vehicle deleted',
      'vehicles',
      id,
      existingVehicle,
      null,
      `Obrisano vozilo: ${existingVehicle.name} (${existingVehicle.license_plate})`,
      req.ip,
      req.get('user-agent')
    );

    res.json({ success: true, message: 'Vozilo je uspješno obrisano' });
  } catch (error) {
    console.error('Delete vehicle error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja vozila' });
  }
});

// Equipment routes removed - not used in frontend

// Schedules routes (for cameraman schedules)
app.get('/api/schedules', authenticateToken, (req, res) => {
  try {
    const { cameraman_id } = req.query;
    
    let query = 'SELECT * FROM schedules WHERE 1=1';
    const params = [];

    if (cameraman_id) {
      query += ' AND cameraman_id = ?';
      params.push(cameraman_id);
    }
    
    query += ' ORDER BY day_of_week, time_start';

    const schedules = db.prepare(query).all(...params);
    res.json({ success: true, data: schedules });
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja rasporeda' });
  }
});

// Dashboard routes
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { date } = req.query;
    
    // Get current date or use provided date
    const currentDate = date || getCurrentDateInBH();
    
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    // Special filtering for JOURNALIST role - show only tasks where they are assigned as journalist
    if (user.role === 'JOURNALIST') {
      // Get person_id for this user - email-based matching (devleta.brkic)
      let person = null;
      
      // Strategy 1: Email contains username (primary)
      if (user.username) {
        person = db.prepare('SELECT id FROM people WHERE email LIKE ?').get(`%${user.username}%`);
      }
      
      // Strategy 2: Direct name match (fallback)
      if (!person && user.name) {
        person = db.prepare('SELECT id FROM people WHERE name = ?').get(user.name);
      }
      
      // Strategy 3: Name contains username
      if (!person && user.username) {
        const usernameParts = user.username.split('.');
        const firstName = usernameParts[0] ? usernameParts[0].charAt(0).toUpperCase() + usernameParts[0].slice(1) : '';
        const lastName = usernameParts[1] ? usernameParts[1].charAt(0).toUpperCase() + usernameParts[1].slice(1) : '';
        const searchPattern = `%${firstName}%${lastName}%`;
        person = db.prepare('SELECT id FROM people WHERE name LIKE ?').get(searchPattern);
      }
      
      if (person) {
        // Filter tasks where this person is in journalist_ids array
        query += ` AND journalist_ids LIKE ?`;
        params.push(`%${person.id}%`);
      } else {
        // If person not found, show no tasks
        query += ' AND 1=0';
      }
    }
    // Special filtering for CAMERA role - show only tasks where they are assigned
    else if (user.role === 'CAMERA') {
      // Get person_id for this user - try multiple matching strategies
      let person = null;
      
      // Strategy 1: Direct name match
      person = db.prepare('SELECT id FROM people WHERE name = ?').get(user.name);
      
      // Strategy 2: Email contains username
      if (!person) {
        person = db.prepare('SELECT id FROM people WHERE email LIKE ?').get(`%${user.username}%`);
      }
      
      // Strategy 3: Name contains username (for cases like "edin.suljendic" -> "Edin Suljendić")
      if (!person) {
        const usernameParts = user.username.split('.');
        const firstName = usernameParts[0] ? usernameParts[0].charAt(0).toUpperCase() + usernameParts[0].slice(1) : '';
        const lastName = usernameParts[1] ? usernameParts[1].charAt(0).toUpperCase() + usernameParts[1].slice(1) : '';
        const searchPattern = `%${firstName}%${lastName}%`;
        person = db.prepare('SELECT id FROM people WHERE name LIKE ?').get(searchPattern);
      }
      
      console.log(`=== CAMERA USER MAPPING DEBUG ===`);
      console.log(`User: ${user.username} (${user.name})`);
      console.log(`Found person:`, person);
      
      if (person) {
        // Filter tasks where this person is in cameraman_ids array
        // Use simple LIKE on the JSON string (works for both [67] and [64,67,68])
        query += ` AND cameraman_ids LIKE ?`;
        params.push(`%${person.id}%`);
        console.log(`Using cameraman filter: %${person.id}%`);
      } else {
        // If person not found, show no tasks
        query += ' AND 1=0';
        console.log(`No person found for user ${user.username}, showing no tasks`);
      }
    }
    // If user is not admin or producer or chief_camera or camera or viewer or journalist, filter by their newsroom
    // VIEWER, CAMERA, and JOURNALIST are handled above with person-based filtering
    else if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'CAMERMAN_EDITOR', 'VIEWER', 'CAMERA', 'JOURNALIST'].includes(user.role)) {
      if (user.newsroom_id) {
        query += ' AND newsroom_id = ?';
        params.push(user.newsroom_id);
      }
    }
    
    query += ' ORDER BY date ASC, time_start ASC, title ASC';
    
    const tasks = db.prepare(query).all(...params);
    
    // Calculate statistics
    const todayTasks = tasks.filter(task => task.date === currentDate).length;
    const plannedTasks = tasks.filter(task => task.status === 'PLANIRANO' && task.date === currentDate).length;
    // For EDITOR role, active tasks should include PLANIRANO tasks as they are actively being worked on
    let activeTasks;
    if (user.role === 'EDITOR') {
      activeTasks = tasks.filter(task => (task.status === 'PLANIRANO' || task.status === 'U_TOKU' || task.status === 'DODIJELJENO') && task.date === currentDate).length;
    } else {
      activeTasks = tasks.filter(task => (task.status === 'U_TOKU' || task.status === 'DODIJELJENO') && task.date === currentDate).length;
    }
    const completedTasks = tasks.filter(task => (task.status === 'SNIMLJENO' || task.status === 'ZAVRŠEN') && task.date === currentDate).length;
    const cancelledTasks = tasks.filter(task => task.status === 'OTKAZANO' && task.date === currentDate).length;
    const activeCameramen = new Set(tasks.filter(task => task.cameraman_id && task.date === currentDate).map(task => task.cameraman_id)).size;
    
    // CAMERMAN_EDITOR specific statistics
    let assignedTasks = 0;
    let myCompletedTasks = 0;
    let myCancelledTasks = 0;
    
    if (user.role === 'CAMERMAN_EDITOR') {
      // Tasks assigned by this CAMERMAN_EDITOR
      assignedTasks = tasks.filter(task => task.cameraman_assigned_by === user.id && task.date === currentDate).length;
      myCompletedTasks = tasks.filter(task => task.cameraman_assigned_by === user.id && task.status === 'SNIMLJENO' && task.date === currentDate).length;
      myCancelledTasks = tasks.filter(task => task.cameraman_assigned_by === user.id && task.status === 'OTKAZANO' && task.date === currentDate).length;
    }
    
    console.log('=== DASHBOARD STATS DEBUG ===');
    console.log('User:', user);
    console.log('Query:', query);
    console.log('Params:', params);
    console.log('Current date:', currentDate);
    console.log('Total tasks found:', tasks.length);
    console.log('Sample tasks:', tasks.slice(0, 2));
    console.log('Tasks for today:', todayTasks);
    console.log('Planned tasks:', plannedTasks);
    console.log('Active tasks (role-specific):', activeTasks);
    console.log('Completed tasks:', completedTasks);
    console.log('Cancelled tasks:', cancelledTasks);
    console.log('Active cameramen:', activeCameramen);
    
    // Debug: Show task statuses for today
    const todayTasksList = tasks.filter(task => task.date === currentDate);
    console.log('Today tasks statuses:', todayTasksList.map(task => ({ id: task.id, title: task.title, status: task.status })));
    
    const responseData = {
      todayTasks,
      plannedTasks,
      activeTasks,
      completedTasks,
      cancelledTasks,
      activeCameramen
    };
    
    // Add CAMERMAN_EDITOR specific statistics
    if (user.role === 'CAMERMAN_EDITOR') {
      responseData.assignedTasks = assignedTasks;
      responseData.myCompletedTasks = myCompletedTasks;
      responseData.myCancelledTasks = myCancelledTasks;
    }
    
    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja statistika' });
  }
});

app.get('/api/dashboard/today-tasks', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { date } = req.query;
    
    const currentDate = date || getCurrentDateInBH();
    
    let query = `
      SELECT t.*, n.name as newsroom_name 
      FROM tasks t 
      LEFT JOIN newsrooms n ON t.newsroom_id = n.id 
      WHERE t.date = ?
    `;
    const params = [currentDate];

    // Special filtering for JOURNALIST role - show only tasks where they are assigned as journalist
    if (user.role === 'JOURNALIST') {
      // Get person_id for this user - email-based matching (devleta.brkic)
      let person = null;
      
      // Strategy 1: Email contains username (primary)
      if (user.username) {
        person = db.prepare('SELECT id FROM people WHERE email LIKE ?').get(`%${user.username}%`);
      }
      
      // Strategy 2: Direct name match (fallback)
      if (!person && user.name) {
        person = db.prepare('SELECT id FROM people WHERE name = ?').get(user.name);
      }
      
      // Strategy 3: Name contains username
      if (!person && user.username) {
        const usernameParts = user.username.split('.');
        const firstName = usernameParts[0] ? usernameParts[0].charAt(0).toUpperCase() + usernameParts[0].slice(1) : '';
        const lastName = usernameParts[1] ? usernameParts[1].charAt(0).toUpperCase() + usernameParts[1].slice(1) : '';
        const searchPattern = `%${firstName}%${lastName}%`;
        person = db.prepare('SELECT id FROM people WHERE name LIKE ?').get(searchPattern);
      }
      
      if (person) {
        // Filter tasks where this person is in journalist_ids array
        query += ` AND t.journalist_ids LIKE ?`;
        params.push(`%${person.id}%`);
      } else {
        // If person not found, show no tasks
        query += ' AND 1=0';
      }
    }
    // Special filtering for CAMERA role - show only tasks where they are assigned as cameraman
    else if (user.role === 'CAMERA') {
      // Get person_id for this user (match by user ID to people table)
      const person = db.prepare('SELECT id FROM people WHERE name = ? OR email LIKE ?').get(user.name, `%${user.username}%`);
      if (person) {
        // Filter tasks where this person is in cameraman_ids array
        // Use simple LIKE on the JSON string (works for both [67] and [64,67,68])
        query += ` AND t.cameraman_ids LIKE ?`;
        params.push(`%${person.id}%`);
      } else {
        // If person not found, show no tasks
        query += ' AND 1=0';
      }
    }
    // If user is not admin or producer or chief_camera or camera or journalist, filter by their newsroom
    // VIEWER sees all tasks from their newsroom (or all tasks if no newsroom assigned)
    else if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'CAMERMAN_EDITOR'].includes(user.role)) {
      if (user.newsroom_id) {
        query += ' AND t.newsroom_id = ?';
        params.push(user.newsroom_id);
      }
    }
    
    const tasks = db.prepare(query).all(...params);
    
    // Parse JSON fields for all tasks
    const parsedTasks = tasks.map(parseTaskJsonFields);
    
    res.json({
      success: true,
      data: parsedTasks
    });
  } catch (error) {
    console.error('Get today tasks error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja današnjih zadataka' });
  }
});

app.get('/api/dashboard/upcoming-tasks', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const currentDate = getCurrentDateInBH();
    
    let query = 'SELECT * FROM tasks WHERE date > ? ORDER BY date ASC, time_start ASC, title ASC LIMIT 10';
    const params = [currentDate];

    // Special filtering for JOURNALIST role - show only tasks where they are assigned as journalist
    if (user.role === 'JOURNALIST') {
      // Get person_id for this user - email-based matching (devleta.brkic)
      let person = null;
      
      // Strategy 1: Email contains username (primary)
      if (user.username) {
        person = db.prepare('SELECT id FROM people WHERE email LIKE ?').get(`%${user.username}%`);
      }
      
      // Strategy 2: Direct name match (fallback)
      if (!person && user.name) {
        person = db.prepare('SELECT id FROM people WHERE name = ?').get(user.name);
      }
      
      // Strategy 3: Name contains username
      if (!person && user.username) {
        const usernameParts = user.username.split('.');
        const firstName = usernameParts[0] ? usernameParts[0].charAt(0).toUpperCase() + usernameParts[0].slice(1) : '';
        const lastName = usernameParts[1] ? usernameParts[1].charAt(0).toUpperCase() + usernameParts[1].slice(1) : '';
        const searchPattern = `%${firstName}%${lastName}%`;
        person = db.prepare('SELECT id FROM people WHERE name LIKE ?').get(searchPattern);
      }
      
      if (person) {
        query += ` AND journalist_ids LIKE ?`;
        params.push(`%${person.id}%`);
      } else {
        query += ' AND 1=0';
      }
    }
    // Special filtering for CAMERA role - show only tasks where they are assigned as cameraman
    else if (user.role === 'CAMERA') {
      const person = db.prepare('SELECT id FROM people WHERE name = ? OR email LIKE ?').get(user.name, `%${user.username}%`);
      if (person) {
        query += ` AND cameraman_ids LIKE ?`;
        params.push(`%${person.id}%`);
      } else {
        query += ' AND 1=0';
      }
    }
    // If user is not admin, filter by their newsroom
    // VIEWER sees all tasks from their newsroom (or all tasks if no newsroom assigned)
    // JOURNALIST and CAMERA are handled above with person-based filtering
    else if (user.role !== 'ADMIN' && user.role !== 'JOURNALIST' && user.role !== 'CAMERA') {
      if (user.newsroom_id) {
        query += ' AND newsroom_id = ?';
        params.push(user.newsroom_id);
      }
    }
    
    const tasks = db.prepare(query).all(...params);
    
    // Parse JSON fields for all tasks
    const parsedTasks = tasks.map(parseTaskJsonFields);
    
    res.json({
      success: true,
      data: parsedTasks
    });
  } catch (error) {
    console.error('Get upcoming tasks error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja nadolazećih zadataka' });
  }
});

// Statistics route
app.get('/api/statistics', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { dateFrom, dateTo, newsroom_id } = req.query;
    
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (dateFrom) {
      query += ' AND date >= ?';
      params.push(normalizeDateForQuery(dateFrom));
    }
    
    if (dateTo) {
      query += ' AND date <= ?';
      params.push(normalizeDateForQuery(dateTo));
    }
    
    // If user is not admin, filter by their newsroom
    if (user.role !== 'ADMIN') {
      if (user.newsroom_id) {
        query += ' AND newsroom_id = ?';
        params.push(user.newsroom_id);
      }
    } else if (newsroom_id) {
      query += ' AND newsroom_id = ?';
        params.push(newsroom_id);
    }
    
    query += ' ORDER BY date ASC, time_start ASC, title ASC';
    
    const tasks = db.prepare(query).all(...params);
    
    // Calculate statistics
    const totalTasks = tasks.length;
    const tasksByStatus = {};
    const tasksByNewsroom = {};
    const tasksByFlag = {};
    const tasksByCoverageType = {};
    const tasksByAttachmentType = {};
    
    tasks.forEach(task => {
      // By status
      tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
      
      // By newsroom
      const newsroom = db.prepare('SELECT name FROM newsrooms WHERE id = ?').get(task.newsroom_id);
      const newsroomName = newsroom ? newsroom.name : 'Nepoznato';
      tasksByNewsroom[newsroomName] = (tasksByNewsroom[newsroomName] || 0) + 1;
      
      // By flags
        if (task.flags) {
          try {
          const flags = JSON.parse(task.flags);
          flags.forEach(flag => {
            tasksByFlag[flag] = (tasksByFlag[flag] || 0) + 1;
          });
          } catch (e) {
          // Ignore invalid JSON
    }
  }
  
      // By coverage type
      if (task.coverage_type) {
        tasksByCoverageType[task.coverage_type] = (tasksByCoverageType[task.coverage_type] || 0) + 1;
      }
      
      // By attachment type
      if (task.attachment_type) {
        tasksByAttachmentType[task.attachment_type] = (tasksByAttachmentType[task.attachment_type] || 0) + 1;
      }
});

    // Convert tasksByNewsroom object to array format for frontend
    const tasksByNewsroomArray = Object.entries(tasksByNewsroom)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    
    // Convert tasksByNewsroom to detailed format
    const tasksByNewsroomDetailed = Object.entries(tasksByNewsroom).map(([name, count]) => {
      const flags = {
        'TEMA': 0,
        'UŽIVO': 0,
        'REŽIJA': 0,
        'VIBER/SKYPE': 0,
        'PACKAGE': 0,
        'SLUŽBENI PUT': 0,
        'EMISIJA': 0,
        'HITNO': 0
      };
      
      // Count flags for this newsroom
      tasks.forEach(task => {
        const newsroom = db.prepare('SELECT name FROM newsrooms WHERE id = ?').get(task.newsroom_id);
        const newsroomName = newsroom ? newsroom.name : 'Nepoznato';
        
        if (newsroomName === name && task.flags) {
          try {
            const taskFlags = JSON.parse(task.flags);
            taskFlags.forEach(flag => {
              if (flags[flag] !== undefined) {
                flags[flag]++;
              }
            });
          } catch (e) {
            // Ignore invalid JSON
          }
        }
      });
      
      return { name, total: count, flags };
    }).sort((a, b) => b.total - a.total);
      
    res.json({
      success: true,
      data: {
        totalTasks,
        tasksByStatus,
        tasksByNewsroom: tasksByNewsroomArray,
        tasksByNewsroomDetailed,
        tasksByFlag,
        tasksByCoverageType,
        tasksByAttachmentType
      }
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja statistika' });
  }
});

// Statistics by people route
app.get('/api/statistics/people', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { dateFrom, dateTo, newsroomId, employee_id } = req.query;

    console.log('=== STATISTICS/PEOPLE DEBUG ===');
    console.log('User:', { id: user.id, role: user.role, newsroom_id: user.newsroom_id });
    console.log('Query params:', { dateFrom, dateTo, newsroomId, employee_id });
    console.log('🔍 EDITOR filtering enabled:', user.role === 'EDITOR' && user.newsroom_id ? 'YES' : 'NO');

    // Simple query to get tasks
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (dateFrom) {
      query += ' AND date >= ?';
      params.push(normalizeDateForQuery(dateFrom));
    }
    
    if (dateTo) {
      query += ' AND date <= ?';
      params.push(normalizeDateForQuery(dateTo));
    }
    
    // If user is not admin, CHIEF_CAMERA, or CAMERMAN_EDITOR, filter by their newsroom
    if (user.role !== 'ADMIN' && user.role !== 'CHIEF_CAMERA' && user.role !== 'CAMERMAN_EDITOR') {
      if (user.newsroom_id) {
        query += ' AND newsroom_id = ?';
        params.push(user.newsroom_id);
      }
    } else if (newsroomId && user.role !== 'CHIEF_CAMERA' && user.role !== 'CAMERMAN_EDITOR') {
      query += ' AND newsroom_id = ?';
      params.push(newsroomId);
    }
    
    query += ' ORDER BY date ASC, time_start ASC, title ASC';
    
    console.log('Final query:', query);
    console.log('Params:', params);
    
    const tasks = db.prepare(query).all(...params);
    
    console.log('Tasks found:', tasks.length);
    console.log('Sample task:', tasks[0]);
    
    // Simple statistics calculation
    const totalTasks = tasks.length;
    const tasksByPeople = [];
    const tasksByFlags = [];
    const tasksByCoverageType = [];
    const tasksByAttachmentType = [];
    const flags = ['TEMA', 'UŽIVO', 'REŽIJA', 'VIBER/SKYPE', 'PACKAGE', 'SLUŽBENI PUT', 'EMISIJA', 'HITNO', 'RAZMJENA'];
    const coverageTypes = ['ENG', 'IFP', 'EFP', 'SNG', 'LIVE', 'STUDIO', 'OB', 'IP Live'];
    const attachmentTypes = ['PACKAGE', 'VO', 'VO/SOT', 'SOT', 'FEATURE', 'NATPKG'];
    
    // Initialize flags
    flags.forEach(flag => {
      tasksByFlags.push({ flag: flag, count: 0 });
    });
    
    // Initialize coverage types
    coverageTypes.forEach(type => {
      tasksByCoverageType.push({ type: type, count: 0 });
    });
    
    // Initialize attachment types
    attachmentTypes.forEach(type => {
      tasksByAttachmentType.push({ type: type, count: 0 });
    });
    
    let mostActivePerson = 'N/A';
    let maxTasks = 0;
    const peopleStats = {};
    
    tasks.forEach(task => {
      // If employee_id is specified, filter tasks by that employee
      if (employee_id) {
        let hasEmployee = false;
        
        // Check journalist_ids
        if (task.journalist_ids) {
          let journalistIds = [];
          if (typeof task.journalist_ids === 'string') {
            try {
              journalistIds = JSON.parse(task.journalist_ids);
            } catch (e) {
              // If parsing fails, try to extract manually
              const matches = task.journalist_ids.match(/\d+/g);
              if (matches) {
                journalistIds = matches.map(Number);
              }
            }
          } else if (Array.isArray(task.journalist_ids)) {
            journalistIds = task.journalist_ids;
          }
          
          if (journalistIds.includes(parseInt(employee_id))) {
            hasEmployee = true;
          }
        }
        
        // Check cameraman_ids
        if (!hasEmployee && task.cameraman_ids) {
          let cameramanIds = [];
          if (typeof task.cameraman_ids === 'string') {
            try {
              cameramanIds = JSON.parse(task.cameraman_ids);
            } catch (e) {
              // If parsing fails, try to extract manually
              const matches = task.cameraman_ids.match(/\d+/g);
              if (matches) {
                cameramanIds = matches.map(Number);
              }
            }
          } else if (Array.isArray(task.cameraman_ids)) {
            cameramanIds = task.cameraman_ids;
          }
          
          if (cameramanIds.includes(parseInt(employee_id))) {
            hasEmployee = true;
          }
        }
        
        // If employee is not in this task, skip it
        if (!hasEmployee) {
          return;
        }
      }
      
      // Parse flags from JSON string - handle different formats
      let taskFlags = [];
      if (task.flags) {
        if (typeof task.flags === 'string') {
          try {
            // Try direct JSON parse first
            taskFlags = JSON.parse(task.flags);
          } catch (e) {
            try {
              // If that fails, try parsing as escaped JSON string
              taskFlags = JSON.parse(JSON.parse(`"${task.flags}"`));
            } catch (e2) {
              // If both fail, try to extract values manually
              const matches = task.flags.match(/"([^"]+)"/g);
              if (matches) {
                taskFlags = matches.map(match => match.slice(1, -1));
              } else {
                taskFlags = [];
              }
            }
          }
        } else if (Array.isArray(task.flags)) {
          taskFlags = task.flags;
        }
      }
      
      // Count flags
      if (Array.isArray(taskFlags)) {
        taskFlags.forEach(flag => {
          const flagIndex = tasksByFlags.findIndex(f => f.flag === flag);
          if (flagIndex !== -1) {
            tasksByFlags[flagIndex].count++;
          }
        });
      }
      
      // Count coverage type
      if (task.coverage_type) {
        const coverageIndex = tasksByCoverageType.findIndex(c => c.type === task.coverage_type);
        if (coverageIndex !== -1) {
          tasksByCoverageType[coverageIndex].count++;
        }
      }
      
      // Count attachment type
      if (task.attachment_type) {
        const attachmentIndex = tasksByAttachmentType.findIndex(a => a.type === task.attachment_type);
        if (attachmentIndex !== -1) {
          tasksByAttachmentType[attachmentIndex].count++;
        }
      }
      
      // For EDITOR role, count both journalists and cameramen
      // For other roles, count only cameramen
      let personIds = [];
      
      if (user.role === 'EDITOR') {
        // For EDITOR, include both journalists and cameramen
        let journalistIds = [];
        let cameramanIds = [];
        
        // Parse journalist_ids
        if (task.journalist_ids) {
          if (typeof task.journalist_ids === 'string') {
            try {
              journalistIds = JSON.parse(task.journalist_ids);
            } catch (e) {
              const matches = task.journalist_ids.match(/\d+/g);
              if (matches) {
                journalistIds = matches.map(match => parseInt(match));
              }
            }
          } else if (Array.isArray(task.journalist_ids)) {
            journalistIds = task.journalist_ids;
          }
        }
        
        // Parse cameraman_ids
        if (task.cameraman_ids) {
          if (typeof task.cameraman_ids === 'string') {
            try {
              cameramanIds = JSON.parse(task.cameraman_ids);
            } catch (e) {
              const matches = task.cameraman_ids.match(/\d+/g);
              if (matches) {
                cameramanIds = matches.map(match => parseInt(match));
              }
            }
          } else if (Array.isArray(task.cameraman_ids)) {
            cameramanIds = task.cameraman_ids;
          }
        }
        
        // Combine all person IDs
        personIds = [...journalistIds, ...cameramanIds];
      } else {
        // For other roles, only count cameramen
        if (task.cameraman_ids) {
          if (typeof task.cameraman_ids === 'string') {
            try {
              personIds = JSON.parse(task.cameraman_ids);
            } catch (e) {
              const matches = task.cameraman_ids.match(/\d+/g);
              if (matches) {
                personIds = matches.map(match => parseInt(match));
              }
            }
          } else if (Array.isArray(task.cameraman_ids)) {
            personIds = task.cameraman_ids;
          }
        }
      }
      
      // Ensure personIds is an array
      if (!Array.isArray(personIds)) {
        personIds = [];
      }
      
      // If no people, count as unassigned
      if (personIds.length === 0) {
        personIds = [0]; // Use 0 to represent unassigned
      }
      
      personIds.forEach(personId => {
        let personName = 'Nije dodjeljen';
        if (personId !== 0) {
          // Skip invalid person IDs (like malformed JSON)
          if (typeof personId !== 'number' || isNaN(personId)) {
            console.log(`🚫 Skipping invalid person ID: ${personId} (type: ${typeof personId})`);
            return;
          }
          // For EDITOR role, filter people by their newsroom
          let personQuery = 'SELECT name FROM people WHERE id = ?';
          let personParams = [personId];
          
          if (user.role === 'EDITOR' && user.newsroom_id) {
            personQuery += ' AND newsroom_id = ?';
            personParams.push(user.newsroom_id);
            console.log(`🔍 EDITOR filtering person ${personId} by newsroom ${user.newsroom_id}`);
          }
          
          const person = db.prepare(personQuery).get(...personParams);
          
          if (user.role === 'EDITOR' && user.newsroom_id) {
            console.log(`🔍 Person ${personId}: ${person ? 'FOUND' : 'NOT FOUND'} - ${person ? person.name : 'NOT IN NEWSROOM'}`);
            
            // For EDITOR, skip people who are not in their newsroom
            if (!person) {
              console.log(`🚫 Skipping person ${personId} - not in newsroom ${user.newsroom_id}`);
              return; // Skip this person entirely
            }
          }
          
          personName = person ? person.name : `ID: ${personId}`;
        }
        
        if (!peopleStats[personName]) {
          peopleStats[personName] = {
            total: 0,
            completed: 0,
            cancelled: 0,
            flags: {
              TEMA: 0,
              UŽIVO: 0,
              REŽIJA: 0,
              "VIBER/SKYPE": 0,
              PACKAGE: 0,
              "SLUŽBENI PUT": 0,
              EMISIJA: 0,
              HITNO: 0,
              RAZMJENA: 0
            },
            coverageTypes: {
              ENG: 0,
              IFP: 0,
              EFP: 0,
              SNG: 0,
              LIVE: 0,
              STUDIO: 0,
              OB: 0,
              'IP Live': 0
            },
            attachmentTypes: {
              PACKAGE: 0,
              VO: 0,
              'VO/SOT': 0,
              SOT: 0,
              FEATURE: 0,
              NATPKG: 0
            }
          };
        }
        
        peopleStats[personName].total++;
        
        // Count completed and cancelled tasks
        if (task.status === 'SNIMLJENO') {
          peopleStats[personName].completed++;
        } else if (task.status === 'OTKAZANO') {
          peopleStats[personName].cancelled++;
        }
        
        // Count flags for this person
        if (Array.isArray(taskFlags)) {
          taskFlags.forEach(flag => {
            if (peopleStats[personName].flags.hasOwnProperty(flag)) {
              peopleStats[personName].flags[flag]++;
            }
          });
        }
        
        // Count coverage type for this person
        if (task.coverage_type && peopleStats[personName].coverageTypes.hasOwnProperty(task.coverage_type)) {
          peopleStats[personName].coverageTypes[task.coverage_type]++;
        }
        
        // Count attachment type for this person
        if (task.attachment_type && peopleStats[personName].attachmentTypes.hasOwnProperty(task.attachment_type)) {
          peopleStats[personName].attachmentTypes[task.attachment_type]++;
        }
        
        if (peopleStats[personName].total > maxTasks) {
          maxTasks = peopleStats[personName].total;
          mostActivePerson = personName;
        }
      });
    });
    
    // Convert to arrays for frontend
    const tasksByPeopleArray = Object.keys(peopleStats).map(name => ({
      name: name,
      count: peopleStats[name].total
    }));
    
    // For detailed statistics, we need to create a more detailed structure
    const tasksByPeopleDetailed = Object.keys(peopleStats).map(name => {
      const personStats = peopleStats[name];
      const successRate = personStats.total > 0 ? Math.round((personStats.completed / personStats.total) * 100) : 0;
        return {
        name: name,
        total: personStats.total,
        completed: personStats.completed,
        cancelled: personStats.cancelled,
        successRate: successRate,
        flags: personStats.flags
      };
    });

    console.log('=== RESPONSE DATA ===');
    console.log('totalTasks:', totalTasks);
    console.log('tasksByPeople:', tasksByPeopleArray);
    console.log('tasksByPeopleDetailed:', tasksByPeopleDetailed);
    console.log('tasksByFlags:', tasksByFlags);
    console.log('tasksByCoverageType:', tasksByCoverageType);
    console.log('tasksByAttachmentType:', tasksByAttachmentType);
    console.log('mostActivePerson:', mostActivePerson);
    console.log('peopleStats keys:', Object.keys(peopleStats));
    console.log('peopleStats:', peopleStats);

    // Calculate overall statistics
    const totalCompleted = tasks.filter(task => task.status === 'SNIMLJENO').length;
    const totalCancelled = tasks.filter(task => task.status === 'OTKAZANO').length;
    const averageSuccessRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;
    
    // Get total cameramen count - kamermani su u KAMERMANI redakciji (newsroom_id = 8)
    const totalCameramen = db.prepare('SELECT COUNT(*) as count FROM people WHERE newsroom_id = 8').get().count;

    res.json({ 
      success: true, 
      data: {
        totalTasks,
        tasksByPeople: tasksByPeopleArray,
        tasksByPeopleDetailed,
        tasksByFlags: tasksByFlags,
        tasksByCoverageType: tasksByCoverageType,
        tasksByAttachmentType: tasksByAttachmentType,
        mostActivePerson: mostActivePerson || 'N/A',
        overall: {
          totalCameramen,
          totalTasks,
          totalCompleted,
          totalCancelled,
          averageSuccessRate,
          mostActiveCameraman: {
            name: mostActivePerson || 'N/A',
            tasks: maxTasks
          }
        }
      }
    });
  } catch (error) {
    console.error('Get statistics by people error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja statistika po osobama' });
  }
});

// Statistics by cameraman route
app.get('/api/statistics/cameraman', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { dateFrom, dateTo } = req.query;
    
    let query = 'SELECT * FROM tasks WHERE cameraman_id IS NOT NULL';
    const params = [];

      if (dateFrom) {
      query += ' AND date >= ?';
        params.push(normalizeDateForQuery(dateFrom));
      }
    
      if (dateTo) {
      query += ' AND date <= ?';
        params.push(normalizeDateForQuery(dateTo));
    }
    
    // If user is not admin, filter by their newsroom
    if (user.role !== 'ADMIN') {
      if (user.newsroom_id) {
        query += ' AND newsroom_id = ?';
        params.push(user.newsroom_id);
      }
    }
    
    query += ' ORDER BY date ASC, time_start ASC, title ASC';
    
    const tasks = db.prepare(query).all(...params);
    
    // Calculate statistics by cameraman
    const cameramanStats = {};
    
    tasks.forEach(task => {
      const cameraman = db.prepare('SELECT name FROM people WHERE id = ?').get(task.cameraman_id);
      const cameramanName = cameraman ? cameraman.name : 'Nepoznat';
      
      if (!cameramanStats[cameramanName]) {
        cameramanStats[cameramanName] = {
          totalTasks: 0,
          completedTasks: 0,
          inProgressTasks: 0,
          completionRate: 0
        };
      }
      
      cameramanStats[cameramanName].totalTasks++;
      if (task.status === 'ZAVRŠEN') {
        cameramanStats[cameramanName].completedTasks++;
      } else if (task.status === 'U TOKU') {
        cameramanStats[cameramanName].inProgressTasks++;
      }
    });
    
    // Calculate completion rates
    Object.keys(cameramanStats).forEach(cameraman => {
      const stats = cameramanStats[cameraman];
      stats.completionRate = stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;
    });
    
    res.json({
      success: true,
      data: cameramanStats
    });
  } catch (error) {
    console.error('Get statistics by cameraman error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja statistika po kameramanima' });
  }
});

// Task presets routes
app.get('/api/task-presets', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    // For ADMIN and PRODUCER, show all presets
    // For other roles, show only presets from their newsroom
    let query = 'SELECT * FROM task_presets';
    let params = [];
    
    if (user.role === 'ADMIN' || user.role === 'PRODUCER') {
      query += ' ORDER BY name';
    } else if (user.newsroom_id) {
      query += ' WHERE newsroom_id = ? ORDER BY name';
      params.push(user.newsroom_id);
    } else {
      // If user has no newsroom_id, show no presets
      query += ' WHERE 1=0 ORDER BY name';
    }
    
    const presets = db.prepare(query).all(...params);
    res.json({ success: true, data: presets });
  } catch (error) {
    console.error('Get task presets error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja predložaka zadataka' });
  }
});

app.post('/api/task-presets', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { name, title, slugline, location, coverage_type, description, newsroom_id, journalist_ids, cameraman_ids, vehicle_id, flags } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Naziv je obavezan' });
    }
    
    // For non-ADMIN/PRODUCER users, automatically set newsroom_id to user's newsroom
    let finalNewsroomId = newsroom_id;
    if (user.role !== 'ADMIN' && user.role !== 'PRODUCER') {
      finalNewsroomId = user.newsroom_id;
    }
    
    const result = db.prepare(`
      INSERT INTO task_presets (name, title, slugline, location, coverage_type, attachment_type, description, newsroom_id, journalist_ids, cameraman_ids, vehicle_id, flags, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, 
      title || name, 
      slugline || '', 
      location || '', 
      coverage_type || 'ENG', 
      req.body.attachment_type || null,
      description || '', 
      finalNewsroomId, 
      journalist_ids ? JSON.stringify(journalist_ids) : '[]', 
      cameraman_ids ? JSON.stringify(cameraman_ids) : '[]', 
      vehicle_id || null, 
      flags ? JSON.stringify(flags) : '[]',
      user.id
    );
    
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('Create task preset error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja predloška zadatka' });
  }
});

app.put('/api/task-presets/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { name, title, slugline, location, coverage_type, attachment_type, description, newsroom_id, journalist_ids, cameraman_ids, vehicle_id, flags } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Naziv je obavezan' });
    }
    
    const result = db.prepare(`
      UPDATE task_presets 
      SET name = ?, title = ?, slugline = ?, location = ?, coverage_type = ?, attachment_type = ?, description = ?, newsroom_id = ?, journalist_ids = ?, cameraman_ids = ?, vehicle_id = ?, flags = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name, 
      title || name, 
      slugline || '', 
      location || '', 
      coverage_type || 'ENG', 
      attachment_type || null,
      description || '', 
      newsroom_id || null, 
      journalist_ids ? JSON.stringify(journalist_ids) : '[]', 
      cameraman_ids ? JSON.stringify(cameraman_ids) : '[]', 
      vehicle_id || null, 
      flags ? JSON.stringify(flags) : '[]',
      id
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Predložak zadatka nije pronađen' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update task preset error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja predloška zadatka' });
  }
});

app.delete('/api/task-presets/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    
    const result = db.prepare('DELETE FROM task_presets WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Predložak zadatka nije pronađen' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete task preset error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja predloška zadatka' });
  }
});

// Employee schedule routes
app.get('/api/employee-schedules', authenticateToken, (req, res) => {
  try {
    const { start, end } = req.query;
    const user = req.user;
    
    let query = `
      SELECT es.*, p.name as person_name, p.role as role, p.newsroom_id, n.name as newsroom_name 
      FROM employee_schedules es 
      LEFT JOIN people p ON es.person_id = p.id
      LEFT JOIN newsrooms n ON p.newsroom_id = n.id 
      WHERE 1=1
    `;
    const params = [];

  // Filter by newsroom based on user role
    if (user.role === 'PRODUCER') {
      // PRODUCER can see all schedules
    } else if (user.role === 'CHIEF_CAMERA' || user.role === 'CAMERMAN_EDITOR') {
      // CHIEF_CAMERA and CAMERMAN_EDITOR can only see KAMERMANI schedules
      query += ' AND p.newsroom_id = ?';
      params.push(8); // KAMERMANI newsroom ID
    } else {
      // Other roles can only see their own newsroom schedules
      if (user.newsroom_id) {
        query += ' AND p.newsroom_id = ?';
        params.push(user.newsroom_id);
      } else {
        return res.status(403).json({ success: false, message: 'Nemate pristup rasporedu. Kontaktirajte administratora da vam dodijeli redakciju.' });
      }
    }

    if (start) {
      query += ' AND es.date >= ?';
      params.push(start);
    }
    
    if (end) {
      query += ' AND es.date <= ?';
      params.push(end);
    }

    query += ' ORDER BY es.date, es.shift_start';

    console.log('=== GET EMPLOYEE SCHEDULES ===');
    console.log('Query:', query);
    console.log('Params:', params);
    console.log('User role:', user.role);
    console.log('Start date (from req.query):', start);
    console.log('End date (from req.query):', end);
    console.log('Start date type:', typeof start);
    console.log('End date type:', typeof end);
    
    const schedules = db.prepare(query).all(...params);
    console.log('Schedules found:', schedules.length);
    if (schedules.length > 0) {
      console.log('First schedule:', schedules[0]);
      console.log('Last schedule:', schedules[schedules.length - 1]);
      console.log('All schedules:', schedules);
    }
    
    res.json({ success: true, data: schedules });
  } catch (error) {
    console.error('Get employee schedules error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja rasporeda uposlenika' });
  }
});

app.post('/api/employee-schedules', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    // Only roles with schedule.manage permission can create schedules
    // ADMIN, PRODUCER, CHIEF_CAMERA, EDITOR have schedule.manage
    // JOURNALIST, VIEWER, CAMERA, DESK_EDITOR, CAMERMAN_EDITOR can only view
    if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'EDITOR'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za kreiranje rasporeda' });
    }
    
    const { person_id, date, shift_start, shift_end, shift_type, custom_shift_name, notes } = req.body;
    
    // Get person name for audit log
    const person = db.prepare('SELECT name FROM people WHERE id = ?').get(person_id);
    const personName = person ? person.name : `ID ${person_id}`;
    
    const result = db.prepare(`
      INSERT INTO employee_schedules (person_id, date, shift_start, shift_end, shift_type, custom_shift_name, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(person_id, date, shift_start, shift_end, shift_type, custom_shift_name, notes);
    
    // Log to audit log
    logAudit(
      db,
      user.id,
      'CREATE: Schedule created',
      'employee_schedules',
      result.lastInsertRowid,
      null,
      { person_id, date, shift_start, shift_end, shift_type, custom_shift_name, notes },
      `Kreiran raspored za ${personName} - ${date} (${shift_start}-${shift_end})`,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('Create employee schedule error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja rasporeda uposlenika' });
  }
});

app.put('/api/employee-schedules/:id', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    // Only roles with schedule.manage permission can update schedules
    if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'EDITOR'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za ažuriranje rasporeda' });
    }
    
    const { id } = req.params;
    const { person_id, date, shift_start, shift_end, shift_type, custom_shift_name, notes } = req.body;
    
    if (!person_id || !date || !shift_start || !shift_end || !shift_type) {
      return res.status(400).json({ success: false, message: 'Svi obavezni podaci moraju biti uneseni' });
    }
    
    const result = db.prepare(`
      UPDATE employee_schedules 
      SET person_id = ?, date = ?, shift_start = ?, shift_end = ?, shift_type = ?, custom_shift_name = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(person_id, date, shift_start, shift_end, shift_type, custom_shift_name, notes, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Raspored uposlenika nije pronađen' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update employee schedule error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja rasporeda uposlenika' });
  }
});

app.delete('/api/employee-schedules/:id', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    // Only roles with schedule.manage permission can delete schedules
    if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'EDITOR'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za brisanje rasporeda' });
    }
    
    const { id } = req.params;
    
    // Get schedule info before deletion for audit log
    const schedule = db.prepare('SELECT * FROM employee_schedules WHERE id = ?').get(id);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Raspored uposlenika nije pronađen' });
    }
    
    // Get person name for audit log
    const person = db.prepare('SELECT name FROM people WHERE id = ?').get(schedule.person_id);
    const personName = person ? person.name : `ID ${schedule.person_id}`;
    
    const result = db.prepare('DELETE FROM employee_schedules WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Raspored uposlenika nije pronađen' });
    }
    
    // Log to audit log
    logAudit(
      db,
      user.id,
      'DELETE: Schedule deleted',
      'employee_schedules',
      id,
      schedule,
      null,
      `Obrisan raspored za ${personName} - ${schedule.date} (${schedule.shift_start}-${schedule.shift_end})`,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete employee schedule error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja rasporeda uposlenika' });
  }
});

// Shift types routes
app.get('/api/shift-types', authenticateToken, (req, res) => {
  try {
    const shiftTypes = db.prepare('SELECT * FROM shift_types WHERE is_active = 1 ORDER BY name').all();
    res.json({ success: true, data: shiftTypes });
  } catch (error) {
    console.error('Get shift types error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja tipova smjena' });
  }
});

app.post('/api/shift-types', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    // Only roles with schedule.manage permission can create shift types
    if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'EDITOR'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za kreiranje tipa smjene' });
    }
    
    const { name, newsroom_id } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Naziv je obavezan' });
    }
    
    const result = db.prepare(`
      INSERT INTO shift_types (name, start_time, end_time, newsroom_id)
      VALUES (?, ?, ?, ?)
    `).run(name, null, null, newsroom_id || null);
    
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('Create shift type error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Greška prilikom kreiranja tipa smjene',
      error: error.message 
    });
  }
});

app.put('/api/shift-types/:id', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    // Only roles with schedule.manage permission can update shift types
    if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'EDITOR'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za ažuriranje tipa smjene' });
    }
    
    const { id } = req.params;
    const { name, newsroom_id } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Naziv je obavezan' });
    }
    
    const result = db.prepare(`
      UPDATE shift_types 
      SET name = ?, start_time = ?, end_time = ?, newsroom_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, null, null, newsroom_id || null, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Tip smjene nije pronađen' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update shift type error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja tipa smjene' });
  }
});

app.delete('/api/shift-types/:id', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    // Only roles with schedule.manage permission can delete shift types
    if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'EDITOR'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za brisanje tipa smjene' });
    }
    
    const { id } = req.params;
    
    const result = db.prepare('UPDATE shift_types SET is_active = 0 WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Tip smjene nije pronađen' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete shift type error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja tipa smjene' });
  }
});

// Schedule notes routes
app.get('/api/schedule/notes', authenticateToken, (req, res) => {
  try {
    const { start, end } = req.query;
    const user = req.user;
    
    let query = 'SELECT * FROM schedule_notes WHERE 1=1';
    const params = [];

    // Filter by user - each user sees only their own notes
    query += ' AND created_by = ?';
    params.push(user.id);

    if (start) {
      query += ' AND date >= ?';
      params.push(start);
    }
    
    if (end) {
      query += ' AND date <= ?';
      params.push(end);
    }
    
    query += ' ORDER BY date';
    
    const notes = db.prepare(query).all(...params);
    res.json({ success: true, data: notes });
  } catch (error) {
    console.error('Get schedule notes error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja napomena rasporeda' });
  }
});

app.post('/api/schedule/notes', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    // Only roles with schedule.manage permission can create schedule notes
    if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'EDITOR'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za kreiranje napomena rasporeda' });
    }
    
    const { date, note } = req.body;
    
    if (!date || !note) {
      return res.status(400).json({ success: false, message: 'Datum i napomena su obavezni' });
    }
    
    const result = db.prepare(`
      INSERT INTO schedule_notes (date, note, created_by)
        VALUES (?, ?, ?)
    `).run(date, note, user.id);
    
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('Create schedule note error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja napomene rasporeda' });
  }
});

app.put('/api/schedule/notes/:id', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    // Only roles with schedule.manage permission can update schedule notes
    if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'EDITOR'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za ažuriranje napomena rasporeda' });
    }
    
    const { id } = req.params;
    const { date, note } = req.body;
    
    if (!date || !note) {
      return res.status(400).json({ success: false, message: 'Datum i napomena su obavezni' });
    }
    
    const result = db.prepare(`
      UPDATE schedule_notes 
      SET date = ?, note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND created_by = ?
    `).run(date, note, id, user.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Napomena rasporeda nije pronađena' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update schedule note error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja napomene rasporeda' });
  }
});

app.delete('/api/schedule/notes/:id', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    // Only roles with schedule.manage permission can delete schedule notes
    if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'EDITOR'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za brisanje napomena rasporeda' });
    }
    
    const { id } = req.params;
    
    const result = db.prepare('DELETE FROM schedule_notes WHERE id = ? AND created_by = ?').run(id, user.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Napomena rasporeda nije pronađena' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete schedule note error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja napomene rasporeda' });
  }
});

// Roles endpoints
app.get('/api/roles', authenticateToken, (req, res) => {
  try {
    const roles = db.prepare('SELECT * FROM roles ORDER BY name').all();
    res.json({ success: true, data: roles });
              } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja uloga' });
  }
});

app.get('/api/roles/:roleName/permissions', authenticateToken, (req, res) => {
  try {
    const { roleName } = req.params;
    
    // Get role by name
    const role = db.prepare('SELECT * FROM roles WHERE name = ?').get(roleName);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Uloga nije pronađena' });
    }
    
    // Get permissions for this role
    const permissions = db.prepare(`
      SELECT p.name, p.description, p.category 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.category, p.name
    `).all(role.id);
    
    const permissionNames = permissions.map(p => p.name);
    
    res.json({ success: true, data: permissionNames });
  } catch (error) {
    console.error('Get role permissions error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja dozvola' });
  }
});

app.post('/api/roles', authenticateToken, (req, res) => {
  try {
    // Only ADMIN can create roles
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za kreiranje uloga' });
    }

    const { name, description, permissions } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Naziv uloge je obavezan' });
    }
    
    // Check if role already exists
    const existingRole = db.prepare('SELECT id FROM roles WHERE name = ?').get(name);
    if (existingRole) {
      return res.status(400).json({ success: false, message: 'Uloga sa ovim nazivom već postoji' });
    }
    
    // Insert role
    const result = db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run(name, description || '');
    const roleId = result.lastInsertRowid;
    
    // Insert role permissions
    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      const insertPermission = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
      permissions.forEach(permissionId => {
        insertPermission.run(roleId, permissionId);
      });
    }
    
    res.json({ success: true, data: { id: roleId, name, description } });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja uloge' });
  }
});

app.put('/api/roles/:id', authenticateToken, (req, res) => {
  try {
    console.log('=== UPDATE ROLE API CALLED ===');
    console.log('User:', req.user);
    console.log('Role ID:', req.params.id);
    console.log('Request body:', req.body);
    
    // Only ADMIN can update roles
    if (req.user.role !== 'ADMIN') {
      console.log('Access denied: User is not ADMIN');
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za ažuriranje uloga' });
    }

    const { id } = req.params;
    const { name, description, permissions } = req.body;
    
    console.log('Parsed data:', { id, name, description, permissions });
    
    if (!name) {
      console.log('Validation error: name is required');
      return res.status(400).json({ success: false, message: 'Naziv uloge je obavezan' });
    }
    
    // Check if role exists
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
    console.log('Existing role:', role);
    
    if (!role) {
      console.log('Role not found');
      return res.status(404).json({ success: false, message: 'Uloga nije pronađena' });
    }
    
    // Update role
    console.log('Updating role with:', { name, description, id });
    const updateResult = db.prepare('UPDATE roles SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, description || '', id);
    console.log('Update result:', updateResult);
    
    // Update role permissions
    if (permissions && Array.isArray(permissions)) {
      console.log('Updating permissions:', permissions);
      
      // Delete existing permissions
      const deleteResult = db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(id);
      console.log('Deleted existing permissions:', deleteResult.changes);
      
      // Insert new permissions
      if (permissions.length > 0) {
        const insertPermission = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
        permissions.forEach(permissionId => {
          console.log('Inserting permission:', { roleId: id, permissionId });
          insertPermission.run(id, permissionId);
        });
        console.log('All permissions inserted');
      }
    } else {
      console.log('No permissions to update or permissions is not an array');
    }
    
    console.log('Role updated successfully');
    res.json({ success: true, data: { id, name, description } });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja uloge' });
  }
});

app.delete('/api/roles/:id', authenticateToken, (req, res) => {
  try {
    // Only ADMIN can delete roles
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za brisanje uloga' });
    }

    const { id } = req.params;
    
    // Check if role exists
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Uloga nije pronađena' });
    }
    
    // Delete role permissions first
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(id);
    
    // Delete role
    db.prepare('DELETE FROM roles WHERE id = ?').run(id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja uloge' });
  }
});

// Permissions endpoints
app.get('/api/permissions', authenticateToken, (req, res) => {
  try {
    const permissions = db.prepare('SELECT * FROM permissions ORDER BY category, name').all();
    res.json({ success: true, data: permissions });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja dozvola' });
  }
});

app.post('/api/permissions', authenticateToken, (req, res) => {
  try {
    // Only ADMIN can create permissions
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za kreiranje dozvola' });
    }

    const { name, description, category } = req.body;
    
    if (!name || !description) {
      return res.status(400).json({ success: false, message: 'Naziv i opis dozvole su obavezni' });
    }
    
    // Check if permission already exists
    const existingPermission = db.prepare('SELECT id FROM permissions WHERE name = ?').get(name);
    if (existingPermission) {
      return res.status(400).json({ success: false, message: 'Dozvola sa ovim nazivom već postoji' });
    }
    
    // Insert permission
    const result = db.prepare('INSERT INTO permissions (name, description, category) VALUES (?, ?, ?)').run(name, description, category || 'General');
    
    res.json({ success: true, data: { id: result.lastInsertRowid, name, description, category } });
  } catch (error) {
    console.error('Create permission error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja dozvole' });
  }
});

app.put('/api/permissions/:id', authenticateToken, (req, res) => {
  try {
    // Only ADMIN can update permissions
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za ažuriranje dozvola' });
    }

    const { id } = req.params;
    const { name, description, category } = req.body;
    
    if (!name || !description) {
      return res.status(400).json({ success: false, message: 'Naziv i opis dozvole su obavezni' });
    }
    
    // Check if permission exists
    const permission = db.prepare('SELECT * FROM permissions WHERE id = ?').get(id);
    if (!permission) {
      return res.status(404).json({ success: false, message: 'Dozvola nije pronađena' });
    }
    
    // Update permission
    db.prepare('UPDATE permissions SET name = ?, description = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, description, category || 'General', id);
    
    res.json({ success: true, data: { id, name, description, category } });
  } catch (error) {
    console.error('Update permission error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja dozvole' });
  }
});

app.delete('/api/permissions/:id', authenticateToken, (req, res) => {
  try {
    // Only ADMIN can delete permissions
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za brisanje dozvola' });
    }

    const { id } = req.params;
    
    // Check if permission exists
    const permission = db.prepare('SELECT * FROM permissions WHERE id = ?').get(id);
    if (!permission) {
      return res.status(404).json({ success: false, message: 'Dozvola nije pronađena' });
    }
    
    // Delete role permissions first
    db.prepare('DELETE FROM role_permissions WHERE permission_id = ?').run(id);
    
    // Delete permission
    db.prepare('DELETE FROM permissions WHERE id = ?').run(id);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete permission error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja dozvole' });
  }
});

// ===== WALLBOARD ENDPOINTS =====
// Wallboard endpoint - public access for TV display
app.get('/api/wallboard/tasks', (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Datum je obavezan'
      });
    }

    console.log(`=== WALLBOARD TASKS REQUEST ===`);
    console.log(`Date: ${date}`);

    // Get tasks for the specified date with all related information
    const tasksQuery = `
      SELECT 
        t.*,
        n.name as newsroom_name,
        v.name as vehicle_name,
        e.name as equipment_name,
        CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END as is_completed
      FROM tasks t
      LEFT JOIN newsrooms n ON t.newsroom_id = n.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN equipment e ON t.equipment_id = e.id
      WHERE DATE(t.date) = DATE(?)
      ORDER BY 
        CASE WHEN t.time_start IS NOT NULL AND t.time_start != '' THEN 0 ELSE 1 END,
        t.time_start ASC,
        t.created_at ASC
    `;

    const tasks = db.prepare(tasksQuery).all(date);
    
    // Process tasks to format data properly
    const formattedTasks = tasks.map(task => {
      // Parse JSON fields
      let flags = [];
      if (task.flags) {
        try {
          flags = typeof task.flags === 'string' ? JSON.parse(task.flags) : task.flags;
        } catch (e) {
          flags = [];
        }
      }

      let journalistIds = [];
      let journalistNames = [];
      if (task.journalist_ids) {
        try {
          journalistIds = typeof task.journalist_ids === 'string' ? JSON.parse(task.journalist_ids) : task.journalist_ids;
          
          // Get journalist names from people table
          if (journalistIds && journalistIds.length > 0) {
            try {
              for (const id of journalistIds) {
                const journalist = db.prepare('SELECT name FROM people WHERE id = ?').get(id);
                if (journalist) {
                  journalistNames.push(journalist.name);
                }
              }
            } catch (journalistError) {
              console.error('Journalist names query error:', journalistError);
            }
          }
        } catch (e) {
          journalistIds = [];
          journalistNames = [];
        }
      }

      let cameramanIds = [];
      let cameramanNames = [];
      if (task.cameraman_ids) {
        try {
          cameramanIds = typeof task.cameraman_ids === 'string' ? JSON.parse(task.cameraman_ids) : task.cameraman_ids;
          
          // Get cameraman names from people table
          if (cameramanIds && cameramanIds.length > 0) {
            try {
              for (const id of cameramanIds) {
                const cameraman = db.prepare('SELECT name FROM people WHERE id = ?').get(id);
                if (cameraman) {
                  cameramanNames.push(cameraman.name);
                }
              }
            } catch (cameramanError) {
              console.error('Cameraman names query error:', cameramanError);
            }
          }
        } catch (e) {
          cameramanIds = [];
          cameramanNames = [];
        }
      }

      return {
        id: task.id,
        title: task.title,
        slugline: task.slugline || '',
        location: task.location || '',
        description: task.description || '',
        date: task.date,
        time_start: task.time_start || '',
        time_end: task.time_end || '',
        status: task.status || 'PLANNED',
        priority: task.priority || 'NORMAL',
        flags: flags,
        coverage_type: task.coverage_type || '',
        newsroom_id: task.newsroom_id,
        newsroom_name: task.newsroom_name || '',
        journalist_ids: journalistIds,
        journalist_names: journalistNames,
        cameraman_ids: cameramanIds,
        cameraman_name: cameramanNames.join(', '),
        vehicle_id: task.vehicle_id,
        vehicle_name: task.vehicle_name || '',
        equipment_id: task.equipment_id,
        equipment_name: task.equipment_name || '',
        confirmed_by_name: task.confirmed_by_name || null,
        is_completed: task.is_completed === 1,
        completed_at: task.status === 'COMPLETED' ? task.updated_at : null,
        created_at: task.created_at,
        updated_at: task.updated_at
      };
    });

    console.log(`Found ${formattedTasks.length} tasks for wallboard`);
    console.log(`=== END WALLBOARD TASKS ===`);

    res.json(formattedTasks);

  } catch (error) {
    console.error('Wallboard tasks error:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju zadataka za wallboard'
    });
  }
});

// Wallboard task status update endpoint (no auth required for automatic status changes)
app.put('/api/wallboard/tasks/:id/status', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { status, confirmed_by } = req.body;
    const user = req.user;
    
    console.log(`=== WALLBOARD TASK STATUS UPDATE ===`);
    console.log(`Task ID: ${id}, New Status: ${status}, User: ${user.name} (${user.role}), Confirmed by: ${confirmed_by || 'N/A'}`);

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status je obavezan'
      });
    }

    // Get task details before updating
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Zadatak nije pronađen'
      });
    }

    // Security: Always use authenticated user's name, ignore confirmed_by from request
    // This prevents abuse where someone could enter someone else's name
    const confirmedByName = user.name;

    // Update task status and confirmed_by_name
    const updateResult = db.prepare(`
      UPDATE tasks 
      SET status = ?, confirmed_by_name = ?, updated_at = ?
      WHERE id = ?
    `).run(status, confirmedByName, new Date().toISOString(), id);

    if (updateResult.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'Zadatak nije pronađen'
      });
    }

    // Send notifications when status changes to SNIMLJENO or OTKAZANO
    if (['SNIMLJENO', 'OTKAZANO'].includes(status)) {
      try {
        console.log(`=== NOTIFICATION TRIGGER (WALLBOARD) ===`);
        console.log(`Task ID: ${task.id}, Title: ${task.title}, Newsroom ID: ${task.newsroom_id}`);
        console.log(`New Status: ${status}, Confirmed by: ${confirmedByName}`);
        
        const confirmedByText = confirmedByName ? ` (potvrdio/la: ${confirmedByName})` : '';
        const notificationMessage = status === 'SNIMLJENO' 
          ? `🎥 Zadatak "${task.title}" je snimljen!${confirmedByText}`
          : `❌ Zadatak "${task.title}" je otkazan!${confirmedByText}`;
        
        const recipients = [];
        
        // 1. Send to the user who created the task
        if (task.created_by) {
          const taskCreator = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(task.created_by);
          if (taskCreator) {
            recipients.push(taskCreator);
          }
        }
        
        // 2. Send to PRODUCER (all of them)
        const producers = db.prepare(`
          SELECT id, name, role 
          FROM users 
          WHERE role = 'PRODUCER'
        `).all();
        recipients.push(...producers);

        console.log(`Found ${recipients.length} recipients for wallboard status update:`, recipients.map(r => ({ id: r.id, name: r.name, role: r.role })));

        // Create notifications for each recipient (avoid duplicates)
        const notifiedUserIds = new Set();
        recipients.forEach(recipient => {
          if (!notifiedUserIds.has(recipient.id)) {
            try {
              // Check if notification already exists for this task and user to prevent duplicates
              const existingNotification = db.prepare(`
                SELECT id FROM notifications 
                WHERE user_id = ? AND task_id = ? AND type = ? AND message = ? AND created_at > datetime('now', '-1 minute')
              `).get(recipient.id, task.id, 'task_status_update', notificationMessage);
              
              if (!existingNotification) {
                db.prepare(`
                  INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                  recipient.id,
                  status === 'SNIMLJENO' ? '✅ Zadatak završen' : '❌ Zadatak otkazan',
                  notificationMessage,
                  'task_status_update',
                  task.id,
                  new Date().toISOString(),
                  0
                );
                if (process.env.NODE_ENV === 'development') {
                  console.log(`✅ Created notification for user ${recipient.id} (${recipient.name}, ${recipient.role})`);
                }
              } else {
                if (process.env.NODE_ENV === 'development') {
                  console.log(`⚠️ Skipping duplicate notification for user ${recipient.id} (${recipient.name}, ${recipient.role})`);
                }
              }
              notifiedUserIds.add(recipient.id);
            } catch (insertError) {
              console.error(`Error inserting notification for user ${recipient.id}:`, insertError);
            }
          }
        });

        if (process.env.NODE_ENV === 'development') {
          console.log(`📢 Sent ${notifiedUserIds.size} notifications for task ${task.id} status: ${status}`);
        }
      } catch (notificationError) {
        console.error('Error creating notifications:', notificationError);
        // Don't fail the status update if notifications fail
      }
    }

    console.log(`✅ Task ${id} status updated to ${status}`);
    console.log(`=== END WALLBOARD TASK STATUS UPDATE ===`);

    res.json({
      success: true,
      message: 'Status zadatka je ažuriran'
    });

  } catch (error) {
    console.error('Wallboard task status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri ažuriranju statusa zadatka'
    });
  }
});

// Wallboard task completion endpoint
app.put('/api/wallboard/tasks/:id/complete', (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`=== WALLBOARD TASK COMPLETION ===`);
    console.log(`Task ID: ${id}`);

    // Update task completion
    const updateResult = db.prepare(`
      UPDATE tasks 
      SET updated_at = ?, status = 'COMPLETED'
      WHERE id = ?
    `).run(new Date().toISOString(), id);

    if (updateResult.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'Zadatak nije pronađen'
      });
    }

    console.log(`✅ Task ${id} marked as completed`);
    console.log(`=== END WALLBOARD TASK COMPLETION ===`);

    res.json({
      success: true,
      message: 'Zadatak je označen kao završen'
    });

  } catch (error) {
    console.error('Wallboard task completion error:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri označavanju zadatka kao završen'
    });
  }
});

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '../build')));

// Add missing API methods that frontend needs
app.get('/api/people/role/:role', authenticateToken, (req, res) => {
  try {
    const { role } = req.params;
    const people = db.prepare('SELECT * FROM people WHERE role = ? ORDER BY name').all(role);
    res.json({ success: true, data: people });
  } catch (error) {
    console.error('Get people by role error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja uposlenika po ulozi' });
  }
});

app.post('/api/tasks/:id/assign-camera', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { cameraman_id } = req.body;
    const user = req.user;
    
    // First, get the task details to check if it's urgent
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    
    if (!task) {
      return res.status(404).json({ success: false, message: 'Zadatak nije pronađen' });
    }
    
    const result = db.prepare('UPDATE tasks SET cameraman_id = ?, cameraman_assigned_by = ? WHERE id = ?').run(cameraman_id, user.id, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Zadatak nije pronađen' });
    }
    
    // Parse task flags to check if it's urgent
    let taskFlags = [];
    try {
      taskFlags = JSON.parse(task.flags || '[]');
    } catch (e) {
      console.error('Error parsing task flags:', e);
    }
    
    // Send notification if task is urgent (HITNO flag)
    if (taskFlags.includes('HITNO')) {
      console.log('=== URGENT TASK CAMERAMAN ASSIGNMENT NOTIFICATION ===');
      console.log(`Task ID: ${id}, Title: ${task.title}, Cameraman ID: ${cameraman_id}`);
      console.log(`Assigned by: ${user.id} (${user.role})`);
      console.log(`Timestamp: ${new Date().toISOString()}`);
      
      // Get cameraman details
      const cameraman = db.prepare('SELECT name FROM people WHERE id = ?').get(cameraman_id);
      const cameramanName = cameraman ? cameraman.name : `ID: ${cameraman_id}`;
      
      // Get task newsroom info
      const newsroom = db.prepare('SELECT name FROM newsrooms WHERE id = ?').get(task.newsroom_id);
      const newsroomName = newsroom ? newsroom.name : `Redakcija ID: ${task.newsroom_id}`;
      
      // Create notification for CHIEF_CAMERA and CAMERMAN_EDITOR
      const cameraManagers = db.prepare(`
        SELECT id, name, role 
        FROM users 
        WHERE role IN ('CHIEF_CAMERA', 'CAMERMAN_EDITOR')
      `).all();
      
      const notificationMessage = `🚨 HITNO: Kamerman ${cameramanName} je dodijeljen na zadatak "${task.title}" (${newsroomName})`;
      
      cameraManagers.forEach(manager => {
        try {
          // Check if notification already exists for this task and user
          const existingNotification = db.prepare(`
            SELECT id FROM notifications 
            WHERE user_id = ? AND task_id = ? AND type = 'urgent_camera_assigned'
          `).get(manager.id, id);
          
          if (!existingNotification) {
            db.prepare(`
              INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              manager.id,
              '🚨 Hitni zadatak - Kamerman dodijeljen',
              notificationMessage,
              'urgent_camera_assigned',
              id,
              new Date().toISOString(),
              0
            );
            
            console.log(`Notification created for ${manager.name} (${manager.role})`);
          } else {
            console.log(`Notification already exists for ${manager.name}`);
          }
        } catch (notificationError) {
          console.error(`Error creating notification for ${manager.name}:`, notificationError);
        }
      });
      
      console.log('=== END URGENT TASK NOTIFICATION ===');
    }
    
    // Send notification to the assigned cameraman (regardless of urgency)
    try {
      console.log('=== SENDING NOTIFICATION TO ASSIGNED CAMERAMAN ===');
      console.log(`Task ID: ${id}, Cameraman ID: ${cameraman_id}`);
      
      // Get cameraman details from people table
      const person = db.prepare('SELECT name, email FROM people WHERE id = ?').get(cameraman_id);
      if (person) {
        // Try to find user account for this cameraman using email-based mapping
        let cameramanUser = null;
        
        // Strategy 1: Use email from people table to find username
        if (person.email) {
          // Extract username from email (e.g., "edin.suljendic@rtvtk.ba" -> "edin.suljendic")
          const usernameFromEmail = person.email.split('@')[0];
          cameramanUser = db.prepare(`
            SELECT id, username, name FROM users 
            WHERE role = 'CAMERA' AND username = ?
          `).get(usernameFromEmail);
          console.log(`🔍 Email mapping: ${person.email} -> ${usernameFromEmail}`);
        }
        
        // Strategy 2: Exact name match (fallback)
        if (!cameramanUser) {
          cameramanUser = db.prepare(`
            SELECT id, username, name FROM users 
            WHERE role = 'CAMERA' AND name = ?
          `).get(person.name);
          console.log(`🔍 Name mapping: ${person.name}`);
        }
        
        // Strategy 3: Username-based matching (convert name to username format)
        if (!cameramanUser) {
          const usernameFromName = person.name.toLowerCase().replace(/\s+/g, '.');
          cameramanUser = db.prepare(`
            SELECT id, username, name FROM users 
            WHERE role = 'CAMERA' AND username = ?
          `).get(usernameFromName);
          console.log(`🔍 Username conversion: ${person.name} -> ${usernameFromName}`);
        }
        
        console.log(`🔍 Looking for user account for cameraman: ${person.name} (ID: ${cameraman_id})`);
        console.log(`🔍 Found user account:`, cameramanUser ? `${cameramanUser.name} (${cameramanUser.username})` : 'None');
        
        if (cameramanUser) {
          // Check if notification already exists for this task and cameraman
          const existingNotification = db.prepare(`
            SELECT id FROM notifications 
            WHERE user_id = ? AND task_id = ? AND type = 'cameraman_assigned'
          `).get(cameramanUser.id, id);
          
          if (!existingNotification) {
            db.prepare(`
              INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              cameramanUser.id,
              '📹 Novi zadatak dodijeljen',
              `Dodijeljeni ste na zadatak "${task.title}" (${task.date}, ${task.time_start || 'N/A'})`,
              'cameraman_assigned',
              id,
              new Date().toISOString(),
              0
            );
            console.log(`✅ Created notification for cameraman ${cameramanUser.name} (${cameramanUser.username})`);
          } else {
            console.log(`Notification already exists for cameraman ${cameramanUser.name}`);
          }
        } else {
          console.log(`❌ No user account found for cameraman ${person.name} (ID: ${cameraman_id})`);
        }
      } else {
        console.log(`❌ No person record found for cameraman ID: ${cameraman_id}`);
      }
      console.log('=== END CAMERAMAN NOTIFICATION ===');
    } catch (cameramanNotificationError) {
      console.error('Error sending notification to assigned cameraman:', cameramanNotificationError);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Assign camera error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dodjeljivanja kamere' });
  }
});

app.post('/api/tasks/:id/confirm-recorded', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    
    const result = db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('ZAVRŠEN', id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Zadatak nije pronađen' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Confirm recorded error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom potvrde snimanja' });
  }
});

app.put('/api/tasks/:id/status', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const user = req.user;

    console.log(`=== UPDATE TASK STATUS ENDPOINT CALLED ===`);
    console.log(`User: ${user.id} (${user.role}), Task ID: ${id}, New Status: ${status}`);

    // Check if user has permission to update task status
    if (!['ADMIN', 'PRODUCER', 'CHIEF_CAMERA', 'CAMERMAN_EDITOR', 'CAMERA'].includes(user.role)) {
      console.log(`Permission denied for role: ${user.role}`);
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za ažuriranje statusa zadatka' });
    }

    // Get task details before updating
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) {
      console.log(`Task not found: ${id}`);
      return res.status(404).json({ success: false, message: 'Zadatak nije pronađen' });
    }

    // For CAMERA role, check if user is assigned to this task
    if (user.role === 'CAMERA') {
      const person = db.prepare('SELECT id FROM people WHERE name = ? OR email LIKE ?').get(user.name, `%${user.username}%`);
      if (!person) {
        console.log(`CAMERA user ${user.name} not found in people table`);
        return res.status(403).json({ success: false, message: 'Niste dodijeljeni ovom zadatku' });
      }

      let cameramanIds = [];
      try {
        cameramanIds = task.cameraman_ids ? JSON.parse(task.cameraman_ids) : [];
      } catch (e) {
        cameramanIds = [];
      }

      if (!cameramanIds.includes(person.id)) {
        console.log(`CAMERA user ${user.name} (person.id: ${person.id}) not assigned to task ${id}. Cameraman IDs: ${JSON.stringify(cameramanIds)}`);
        return res.status(403).json({ success: false, message: 'Niste dodijeljeni ovom zadatku' });
      }
    }

    console.log(`Updating task ${id} from ${task.status} to ${status}`);
    const result = db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Zadatak nije pronađen' });
    }

    // Send notification when status changes to SNIMLJENO or OTKAZANO
    if (['SNIMLJENO', 'OTKAZANO'].includes(status)) {
      try {
        console.log(`=== NOTIFICATION TRIGGER ===`);
        console.log(`Task ID: ${task.id}, Title: ${task.title}, Newsroom ID: ${task.newsroom_id}`);
        console.log(`New Status: ${status}, Changed by: ${user.name} (${user.role})`);
        
        const notificationMessage = status === 'SNIMLJENO' 
          ? `🎥 Zadatak "${task.title}" je snimljen!`
          : `❌ Zadatak "${task.title}" je otkazan!`;
        
        const recipients = [];
        
        // 1. Send to EDITOR and DESK_EDITOR from the task's newsroom
        const newsroomEditors = db.prepare(`
          SELECT id, name, role 
          FROM users 
          WHERE newsroom_id = ? AND role IN ('EDITOR', 'DESK_EDITOR')
        `).all(task.newsroom_id);
        recipients.push(...newsroomEditors);
        
        // 2. Send to CHIEF_CAMERA (all of them)
        const chiefCameras = db.prepare(`
          SELECT id, name, role 
          FROM users 
          WHERE role = 'CHIEF_CAMERA'
        `).all();
        recipients.push(...chiefCameras);
        
        // 3. Send to CAMERMAN_EDITOR (all of them)
        const cameramanEditors = db.prepare(`
          SELECT id, name, role 
          FROM users 
          WHERE role = 'CAMERMAN_EDITOR'
        `).all();
        recipients.push(...cameramanEditors);
        
        // 4. Send to the user who created the task (if not already included)
        if (task.created_by) {
          const taskCreator = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(task.created_by);
          if (taskCreator && !recipients.some(r => r.id === taskCreator.id)) {
            recipients.push(taskCreator);
          }
        }

        console.log(`Found ${recipients.length} recipients for status update:`, recipients.map(r => ({ id: r.id, name: r.name, role: r.role })));

        // Create notifications for each recipient (avoid duplicates)
        const notifiedUserIds = new Set();
        recipients.forEach(recipient => {
          if (!notifiedUserIds.has(recipient.id) && recipient.id !== user.id) { // Don't notify the person who made the change
            try {
              // Check if notification already exists for this task and user to prevent duplicates
              const existingNotification = db.prepare(`
                SELECT id FROM notifications 
                WHERE user_id = ? AND task_id = ? AND type = ? AND message = ? AND created_at > datetime('now', '-1 minute')
              `).get(recipient.id, task.id, 'task_status_update', notificationMessage);
              
              if (!existingNotification) {
                db.prepare(`
                  INSERT INTO notifications (user_id, title, message, type, task_id, created_at, is_read)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                  recipient.id,
                  'Status zadatka ažuriran',
                  notificationMessage,
                  'task_status_update',
                  task.id,
                  new Date().toISOString(),
                  0
                );
                if (process.env.NODE_ENV === 'development') {
                  console.log(`✅ Created notification for user ${recipient.id} (${recipient.name}, ${recipient.role})`);
                }
              } else {
                if (process.env.NODE_ENV === 'development') {
                  console.log(`⚠️ Skipping duplicate notification for user ${recipient.id} (${recipient.name}, ${recipient.role})`);
                }
              }
              notifiedUserIds.add(recipient.id);
            } catch (insertError) {
              console.error(`Error inserting notification for user ${recipient.id}:`, insertError);
            }
          }
        });

        if (process.env.NODE_ENV === 'development') {
          console.log(`📢 Sent ${notifiedUserIds.size} notifications for task ${task.id} status: ${status}`);
        }
      } catch (notificationError) {
        console.error('Error creating notifications:', notificationError);
        // Don't fail the status update if notifications fail
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja statusa zadatka' });
  }
});

// Notifications routes
// Push subscription endpoints
// Get VAPID public key
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
app.post('/api/push/subscribe', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ success: false, message: 'Invalid subscription data' });
    }

    // Save or update subscription
    const existingSubscription = db.prepare(`
      SELECT id FROM push_subscriptions 
      WHERE user_id = ? AND endpoint = ?
    `).get(user.id, subscription.endpoint);

    if (existingSubscription) {
      // Update existing subscription
      db.prepare(`
        UPDATE push_subscriptions 
        SET p256dh = ?, auth = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND endpoint = ?
      `).run(
        subscription.keys.p256dh,
        subscription.keys.auth,
        user.id,
        subscription.endpoint
      );
    } else {
      // Insert new subscription
      db.prepare(`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
        VALUES (?, ?, ?, ?)
      `).run(
        user.id,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth
      );
    }

    res.json({ success: true, message: 'Push subscription saved successfully' });
  } catch (error) {
    console.error('Push subscription error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom čuvanja push subscription-a' });
  }
});

// Unsubscribe from push notifications
app.post('/api/push/unsubscribe', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ success: false, message: 'Endpoint is required' });
    }

    db.prepare(`
      DELETE FROM push_subscriptions 
      WHERE user_id = ? AND endpoint = ?
    `).run(user.id, endpoint);

    res.json({ success: true, message: 'Push subscription removed successfully' });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom uklanjanja push subscription-a' });
  }
});

// Helper function to send push notification
const sendPushNotification = async (userId, title, body, data = {}) => {
  try {
    // Get all subscriptions for this user
    const subscriptions = db.prepare(`
      SELECT endpoint, p256dh, auth 
      FROM push_subscriptions 
      WHERE user_id = ?
    `).all(userId);

    if (subscriptions.length === 0) {
      console.log(`No push subscriptions found for user ${userId}`);
      return;
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/rtvtk-logo.jpg',
      badge: '/rtvtk-logo.jpg',
      tag: 'rtvtk-notification',
      data: {
        url: data.url || '/',
        ...data
      }
    });

    // Send notification to all subscriptions
    const promises = subscriptions.map(subscription => {
      const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth
        }
      };

      return webpush.sendNotification(pushSubscription, payload)
        .catch(error => {
          console.error(`Error sending push notification to ${subscription.endpoint}:`, error);
          // If subscription is invalid, remove it
          if (error.statusCode === 410 || error.statusCode === 404) {
            db.prepare(`
              DELETE FROM push_subscriptions 
              WHERE user_id = ? AND endpoint = ?
            `).run(userId, subscription.endpoint);
          }
        });
    });

    await Promise.all(promises);
    console.log(`✅ Sent push notifications to ${subscriptions.length} device(s) for user ${userId}`);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};

app.get('/api/notifications', authenticateToken, (req, res) => {
  try {
    const user = req.user;
    
    // Delete notifications from previous days (keep only today's notifications)
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    db.prepare(`
      DELETE FROM notifications 
      WHERE user_id = ? AND created_at < ?
    `).run(user.id, todayStart);
    
    const notifications = db.prepare(`
      SELECT id, title, message, type, task_id, created_at, is_read
      FROM notifications 
      WHERE user_id = ? 
      ORDER BY created_at DESC
      LIMIT 50
    `).all(user.id);
    
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja notifikacija' });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const result = db.prepare(`
      UPDATE notifications 
      SET is_read = 1 
      WHERE id = ? AND user_id = ?
    `).run(id, user.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Notifikacija nije pronađena' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom označavanja notifikacije' });
  }
});

// Delete notification endpoint
app.delete('/api/notifications/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // Get notification before deleting for audit log
    const notification = db.prepare(`
      SELECT * FROM notifications 
      WHERE id = ? AND user_id = ?
    `).get(id, user.id);
    
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notifikacija nije pronađena' });
    }
    
    const result = db.prepare(`
      DELETE FROM notifications 
      WHERE id = ? AND user_id = ?
    `).run(id, user.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Notifikacija nije pronađena' });
    }
    
    // Log to audit
    logAudit(
      db,
      user.id,
      'DELETE: Notification deleted',
      'notifications',
      id,
      notification,
      null,
      `Obrisana notifikacija: "${notification.title}"`,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({ success: true, message: 'Notifikacija je uspješno obrisana' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja notifikacije' });
  }
});

// Backup routes
app.get('/api/backup', authenticateToken, (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Get backup directory path
    const backupDir = path.join(__dirname, 'backups');
    
    // Check if backup directory exists, if not create it
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Read all backup files
    const files = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.sqlite'))
      .map(file => {
        const filePath = path.join(backupDir, file);
        const stats = fs.statSync(filePath);
      return {
          filename: file,
          size: stats.size,
          created_at: stats.birthtime,
          modified_at: stats.mtime
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json({ success: true, data: files });
  } catch (error) {
    console.error('Get backup list error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja liste backup fajlova' });
  }
});

app.post('/api/backup', authenticateToken, (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Get backup directory path
    const backupDir = path.join(__dirname, 'backups');
    
    // Check if backup directory exists, if not create it
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Create backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFilename = `rtvtk_backup_${timestamp}.sqlite`;
    const backupPath = path.join(backupDir, backupFilename);
    
    // Get current database path
    const currentDbPath = path.join(__dirname, 'database.sqlite');
    
    // Copy current database to backup location
    fs.copyFileSync(currentDbPath, backupPath);
    
    // Get backup file info
    const stats = fs.statSync(backupPath);
    
    // Log to audit log
    logAudit(
      db,
      req.user.id,
      'CREATE: Database backup',
      'system',
      0, // Use 0 instead of null for record_id
      null,
      { backupFilename, backupSize: stats.size },
      `Kreiran backup baze podataka: ${backupFilename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({ 
      success: true, 
      message: 'Backup je uspješno kreiran',
      data: { 
        filename: backupFilename,
        size: stats.size,
        created_at: stats.birthtime
      }
    });
  } catch (error) {
    console.error('Create backup error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja backup-a' });
  }
});

app.delete('/api/backup/:filename', authenticateToken, (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const filename = req.params.filename;
    const backupDir = path.join(__dirname, 'backups');
    const backupPath = path.join(backupDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ success: false, message: 'Backup fajl nije pronađen' });
    }
    
    // Get file info before deletion for audit log
    const stats = fs.statSync(backupPath);
    
    // Delete backup file
    fs.unlinkSync(backupPath);
    
    // Log to audit log
    logAudit(
      db,
      req.user.id,
      'DELETE: Database backup',
      'system',
      0, // Use 0 instead of null for record_id
      { backupFilename: filename, backupSize: stats.size },
      null,
      `Obrisan backup baze podataka: ${filename}`,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({ 
      success: true, 
      message: 'Backup je uspješno obrisan'
    });
  } catch (error) {
    console.error('Delete backup error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja backup-a' });
  }
});

app.post('/api/backup/:filename/restore', authenticateToken, (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const filename = req.params.filename;
    const backupDir = path.join(__dirname, 'backups');
    const backupPath = path.join(backupDir, filename);
    
    // Check if backup file exists
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ success: false, message: 'Backup fajl nije pronađen' });
    }
    
    // Get current database path
    const currentDbPath = path.join(__dirname, 'database.sqlite');
    
    // Create backup of current database before restore
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const preRestoreBackup = path.join(backupDir, `pre_restore_${timestamp}.sqlite`);
    fs.copyFileSync(currentDbPath, preRestoreBackup);
    
    // Restore from backup
    fs.copyFileSync(backupPath, currentDbPath);
    
    // Log to audit log
    logAudit(
      db,
      req.user.id,
      'UPDATE: Database restore',
      'system',
      0, // Use 0 instead of null for record_id
      null,
      { restoredFrom: filename, preRestoreBackup: `pre_restore_${timestamp}.sqlite` },
      `Vraćena baza podataka iz backup-a: ${filename}`,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({ 
      success: true, 
      message: 'Baza podataka je uspješno vraćena iz backup-a'
    });
  } catch (error) {
    console.error('Restore backup error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom vraćanja iz backup-a' });
  }
});

// Daily automatic backup endpoint
app.post('/api/backup/daily', authenticateToken, (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Get backup directory path
    const backupDir = path.join(__dirname, 'backups');
    
    // Check if backup directory exists, if not create it
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Create daily backup filename with date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const backupFilename = `rtvtk_dnevni_${today}.sqlite`;
    const backupPath = path.join(backupDir, backupFilename);
    
    // Get current database path
    const currentDbPath = path.join(__dirname, 'database.sqlite');
    
    // Copy current database to backup location
    fs.copyFileSync(currentDbPath, backupPath);
    
    // Get backup file info
    const stats = fs.statSync(backupPath);
    
    // Get tasks count for today
    const todayTasks = db.prepare(`
      SELECT COUNT(*) as count 
      FROM tasks 
      WHERE DATE(date) = DATE(?)
    `).get(today);
    
    // Log to audit log
    logAudit(
      db,
      req.user.id,
      'CREATE: Daily backup',
      'system',
      0,
      null,
      { 
        backupFilename, 
        backupSize: stats.size,
        tasksToday: todayTasks.count
      },
      `Kreiran dnevni backup za ${today}: ${backupFilename} (${todayTasks.count} zadataka, ${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({ 
      success: true, 
      message: `Dnevni backup za ${today} je uspješno kreiran`,
      data: { 
        filename: backupFilename,
        size: stats.size,
        tasksCount: todayTasks.count,
        created_at: stats.birthtime
      }
    });
  } catch (error) {
    console.error('Create daily backup error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja dnevnog backup-a' });
  }
});

// Export tasks for specific date
app.get('/api/tasks/export/:date', authenticateToken, (req, res) => {
  try {
    const date = req.params.date;
    
    // Validate date format
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Nevažeći format datuma. Koristite YYYY-MM-DD format.' });
    }
    
    // Get all tasks for the specified date
    const tasks = db.prepare(`
      SELECT 
        t.*,
        n.name as newsroom_name,
        u.name as created_by_name
      FROM tasks t
      LEFT JOIN newsrooms n ON t.newsroom_id = n.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE DATE(t.date) = DATE(?)
      ORDER BY t.time_start, t.title
    `).all(date);
    
    // Helper function to escape CSV fields
    const escapeCsvField = (field) => {
      if (field === null || field === undefined) return '""';
      const str = String(field);
      // If field contains comma, quote, or newline, wrap in quotes and escape quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return `"${str}"`;
    };
    
    // Helper function to get journalist names
    const getJournalistNames = (journalistIds) => {
      if (!journalistIds) return '';
      try {
        const ids = typeof journalistIds === 'string' ? JSON.parse(journalistIds) : journalistIds;
        if (!Array.isArray(ids) || ids.length === 0) return '';
        // Filter out invalid IDs
        const validIds = ids.filter(id => id != null && !isNaN(id));
        if (validIds.length === 0) return '';
        const placeholders = validIds.map(() => '?').join(',');
        const journalists = db.prepare(`SELECT name FROM people WHERE id IN (${placeholders})`).all(...validIds);
        return journalists.map(j => j.name).join('; ');
      } catch (error) {
        console.error('Error parsing journalist IDs:', error);
        return '';
      }
    };
    
    // Helper function to get cameraman names
    const getCameramanNames = (cameramanIds) => {
      if (!cameramanIds) return '';
      try {
        const ids = typeof cameramanIds === 'string' ? JSON.parse(cameramanIds) : cameramanIds;
        if (!Array.isArray(ids) || ids.length === 0) return '';
        // Filter out invalid IDs
        const validIds = ids.filter(id => id != null && !isNaN(id));
        if (validIds.length === 0) return '';
        const placeholders = validIds.map(() => '?').join(',');
        const cameramen = db.prepare(`SELECT name FROM people WHERE id IN (${placeholders})`).all(...validIds);
        return cameramen.map(c => c.name).join('; ');
      } catch (error) {
        console.error('Error parsing cameraman IDs:', error);
        return '';
      }
    };
    
    // Helper function to format flags
    const formatFlags = (flags) => {
      if (!flags) return '';
      try {
        const flagArray = typeof flags === 'string' ? JSON.parse(flags) : flags;
        if (!Array.isArray(flagArray) || flagArray.length === 0) return '';
        return flagArray.join('; ');
      } catch (error) {
        console.error('Error parsing flags:', error);
        return '';
      }
    };
    
    // Create CSV content
    let csvContent = 'ID,Datum,Vrijeme Početka,Vrijeme Kraja,Naslov,Lokacija,Redakcija,Status,Tip Pokrivanja,Tip Priloga,Kreiran od,Novinari,Kamermani,Flagovi,Kreiran,Posljednje Ažuriranje\n';
    
    tasks.forEach(task => {
      const journalistNames = getJournalistNames(task.journalist_ids);
      const cameramanNames = getCameramanNames(task.cameraman_ids);
      const flags = formatFlags(task.flags);
      
      const row = [
        task.id || '',
        task.date || '',
        task.time_start || '',
        task.time_end || '',
        escapeCsvField(task.title || ''),
        escapeCsvField(task.location || ''),
        escapeCsvField(task.newsroom_name || ''),
        escapeCsvField(task.status || ''),
        escapeCsvField(task.coverage_type || ''),
        escapeCsvField(task.attachment_type || ''),
        escapeCsvField(task.created_by_name || ''),
        escapeCsvField(journalistNames),
        escapeCsvField(cameramanNames),
        escapeCsvField(flags),
        escapeCsvField(task.created_at || ''),
        escapeCsvField(task.updated_at || '')
      ].join(',');
      csvContent += row + '\n';
    });
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zadaci_${date}.csv"`);
    
    // Add BOM for proper UTF-8 encoding in Excel
    const csvWithBOM = '\uFEFF' + csvContent;
    
    res.send(csvWithBOM);
    
    // Log to audit log
    logAudit(
      db,
      req.user.id,
      'EXPORT: Tasks CSV',
      'tasks',
      0,
      null,
      { exportDate: date, tasksCount: tasks.length },
      `Izvezeni zadaci za ${date} u CSV format (${tasks.length} zadataka)`,
      req.ip,
      req.get('user-agent')
    );
    
  } catch (error) {
    console.error('Export tasks error:', error);
    console.error('Error stack:', error.stack);
    
    // Check if headers are already sent
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Greška prilikom izvoza zadataka',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
});

// PDF report endpoint
app.post('/api/reports/pdf', authenticateToken, async (req, res) => {
  try {
    const { date, exportPath } = req.body;
    const today = date || new Date().toISOString().split('T')[0];
    
    const pdfResult = await generateDailyPDFReport(today, exportPath);
    
    // Log to audit log
    logAudit(
      db,
      req.user.id,
      'CREATE: PDF report',
      'system',
      0,
      null,
      { 
        pdfFilename: pdfResult.filename, 
        pdfSize: pdfResult.size,
        date: today
      },
      `Kreiran PDF izvještaj za ${today}: ${pdfResult.filename}`,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({
      success: true,
      message: `PDF izvještaj za ${today} je uspješno kreiran`,
      data: {
        filename: pdfResult.filename,
        path: pdfResult.path,
        size: pdfResult.size
      }
    });
  } catch (error) {
    console.error('PDF report error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja PDF izvještaja' });
  }
});

// Download PDF report
app.get('/api/reports/pdf/download/:filename', authenticateToken, (req, res) => {
  try {
    const filename = req.params.filename;
    const backupDir = path.join(__dirname, 'backups');
    const filePath = path.join(backupDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'PDF izvještaj nije pronađen' });
    }
    
    res.download(filePath, filename);
  } catch (error) {
    console.error('PDF download error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom preuzimanja PDF izvještaja' });
  }
});

// Get PDF export settings
app.get('/api/settings/pdf-export-path', authenticateToken, (req, res) => {
  try {
    const setting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('pdf_export_path');
    res.json({
      success: true,
      data: {
        exportPath: setting ? setting.value : path.join(__dirname, 'backups')
      }
    });
  } catch (error) {
    console.error('Get PDF export path error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja postavki' });
  }
});

// Update PDF export settings
app.post('/api/settings/pdf-export-path', authenticateToken, (req, res) => {
  try {
    const { exportPath } = req.body;
    
    if (!exportPath) {
      return res.status(400).json({ success: false, message: 'Putanja za export je obavezna' });
    }
    
    // Check if path exists
    if (!fs.existsSync(exportPath)) {
      return res.status(400).json({ success: false, message: 'Putanja ne postoji' });
    }
    
    db.prepare('INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run('pdf_export_path', exportPath);
    
    // Log to audit log
    logAudit(
      db,
      req.user.id,
      'UPDATE: PDF export path',
      'system_settings',
      0,
      null,
      { exportPath },
      `Ažurirana lokacija za PDF izvještaje: ${exportPath}`,
      req.ip,
      req.get('user-agent')
    );
    
    res.json({
      success: true,
      message: 'Lokacija za PDF izvještaje je uspješno ažurirana',
      data: { exportPath }
    });
  } catch (error) {
    console.error('Update PDF export path error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja postavki' });
  }
});

// Get all backup settings
app.get('/api/settings/backup', authenticateToken, (req, res) => {
  try {
    const settings = db.prepare(`
      SELECT key, value 
      FROM system_settings 
      WHERE key IN ('pdf_export_path', 'backup_time', 'backup_enabled')
    `).all();
    
    const settingsObject = {};
    settings.forEach(setting => {
      settingsObject[setting.key] = setting.value;
    });
    
    res.json({
      success: true,
      data: {
        pdfExportPath: settingsObject.pdf_export_path || path.join(__dirname, 'backups'),
        backupTime: settingsObject.backup_time || '23:30',
        backupEnabled: settingsObject.backup_enabled === 'true'
      }
    });
  } catch (error) {
    console.error('Get backup settings error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja postavki' });
  }
});

// Update backup settings
app.post('/api/settings/backup', authenticateToken, (req, res) => {
  try {
    const { pdfExportPath, backupTime, backupEnabled } = req.body;
    
    // Validate backup time format (HH:MM)
    if (backupTime && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(backupTime)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nevažeće vrijeme. Format: HH:MM (npr. 23:30)' 
      });
    }
    
    // Validate path if provided
    if (pdfExportPath) {
      // Try to create directory if it doesn't exist
      if (!fs.existsSync(pdfExportPath)) {
        try {
          fs.mkdirSync(pdfExportPath, { recursive: true });
        } catch (error) {
          return res.status(400).json({ 
            success: false, 
            message: 'Ne mogu kreirati direktorijum. Provjeri putanju.' 
          });
        }
      }
      
      db.prepare('INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
        .run('pdf_export_path', pdfExportPath);
    }
    
    if (backupTime !== undefined) {
      db.prepare('INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
        .run('backup_time', backupTime);
    }
    
    if (backupEnabled !== undefined) {
      db.prepare('INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
        .run('backup_enabled', backupEnabled ? 'true' : 'false');
    }
    
    // Log to audit log
    logAudit(
      db,
      req.user.id,
      'UPDATE: Backup settings',
      'system_settings',
      0,
      null,
      { pdfExportPath, backupTime, backupEnabled },
      `Ažurirane postavke backup-a: lokacija=${pdfExportPath || 'nije promijenjena'}, vrijeme=${backupTime || 'nije promijenjena'}, omogućeno=${backupEnabled}`,
      req.ip,
      req.get('user-agent')
    );
    
    // Reinitialize backup schedule if time or enabled changed
    if (backupTime !== undefined || backupEnabled !== undefined) {
      // We need to reinitialize the schedule after response is sent
      setImmediate(() => {
        initializeBackupSchedule();
      });
    }
    
    res.json({
      success: true,
      message: 'Postavke backup-a su uspješno ažurirane. Backup schedule je ažuriran.',
      data: { pdfExportPath, backupTime, backupEnabled }
    });
  } catch (error) {
    console.error('Update backup settings error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom ažuriranja postavki' });
  }
});

// Test endpoint for PDF generation (without auth for testing)
app.post('/api/reports/pdf-test', async (req, res) => {
  try {
    const { date, exportPath } = req.body;
    const today = date || new Date().toISOString().split('T')[0];
    
    const pdfResult = await generateDailyPDFReport(today, exportPath);
    
    res.json({
      success: true,
      message: `PDF izvještaj za ${today} je uspješno kreiran`,
      data: {
        filename: pdfResult.filename,
        path: pdfResult.path,
        size: pdfResult.size
      }
    });
  } catch (error) {
    console.error('PDF test error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja PDF izvještaja' });
  }
});

// Test endpoint for CSV export (without auth for testing)
app.get('/api/tasks/export-test/:date', (req, res) => {
  try {
    const date = req.params.date;
    
    // Get all tasks for the specified date
    const tasks = db.prepare(`
      SELECT 
        t.*,
        n.name as newsroom_name,
        u.name as created_by_name,
        GROUP_CONCAT(p.name) as journalist_names,
        GROUP_CONCAT(c.name) as cameraman_names
      FROM tasks t
      LEFT JOIN newsrooms n ON t.newsroom_id = n.id
      LEFT JOIN users u ON t.created_by = u.id
      LEFT JOIN people p ON JSON_EXTRACT(t.journalist_ids, '$') LIKE '%' || p.id || '%'
      LEFT JOIN people c ON JSON_EXTRACT(t.cameraman_ids, '$') LIKE '%' || c.id || '%'
      WHERE DATE(t.date) = DATE(?)
      GROUP BY t.id
      ORDER BY t.time_start, t.title
    `).all(date);
    
    // Create CSV content
    let csvContent = 'ID,Datum,Vrijeme Početka,Vrijeme Kraja,Naslov,Lokacija,Redakcija,Status,Tip Pokrivanja,Tip Priloga,Kreiran od,Novinari,Kamermani,Flagovi,Kreiran,Posljednje Ažuriranje\n';
    
      tasks.forEach(task => {
      const flags = task.flags ? JSON.parse(task.flags).join('; ') : '';
      const row = [
        task.id,
        task.date,
        task.time_start || '',
        task.time_end || '',
        `"${task.title}"`,
        `"${task.location || ''}"`,
        `"${task.newsroom_name || ''}"`,
        task.status,
        task.coverage_type,
        `"${task.created_by_name || ''}"`,
        `"${task.journalist_names || ''}"`,
        `"${task.cameraman_names || ''}"`,
        `"${flags}"`,
        task.created_at,
        task.updated_at
      ].join(',');
      csvContent += row + '\n';
    });
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zadaci_${date}.csv"`);
    
    // Add BOM for proper UTF-8 encoding in Excel
    res.write('\uFEFF');
    res.end(csvContent);
    
  } catch (error) {
    console.error('Export test error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom izvoza zadataka' });
  }
});

// Test endpoint for backup (without auth for testing)
app.post('/api/backup/test-daily', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Get backup directory path
    const backupDir = path.join(__dirname, 'backups');
    
    // Check if backup directory exists, if not create it
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Create daily backup filename with date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const backupFilename = `rtvtk_test_${today}.sqlite`;
    const backupPath = path.join(backupDir, backupFilename);
    
    // Get current database path
    const currentDbPath = path.join(__dirname, 'database.sqlite');
    
    // Copy current database to backup location
    fs.copyFileSync(currentDbPath, backupPath);
    
    // Get backup file info
    const stats = fs.statSync(backupPath);
    
    // Get tasks count for today
    const todayTasks = db.prepare(`
      SELECT COUNT(*) as count 
      FROM tasks 
      WHERE DATE(date) = DATE(?)
    `).get(today);
    
    res.json({ 
      success: true, 
      message: `Test backup za ${today} je uspješno kreiran`,
      data: { 
        filename: backupFilename,
        size: stats.size,
        tasksCount: todayTasks.count,
        created_at: stats.birthtime
      }
    });
  } catch (error) {
    console.error('Create test backup error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom kreiranja test backup-a' });
  }
});

// Basic audit routes
app.get('/api/audit', authenticateToken, (req, res) => {
  try {
    const { dateFrom, dateTo, action, user } = req.query;
    
    let query = `
      SELECT 
        al.id,
        al.user_id,
        al.action,
        al.table_name,
        al.record_id,
        al.old_data,
        al.new_data,
        al.description,
        al.ip_address,
        al.user_agent,
        al.created_at,
        COALESCE(u.name, 'Nepoznat korisnik') as user_name,
        u.role as user_role
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (dateFrom) {
      query += ' AND DATE(al.created_at) >= DATE(?)';
      params.push(dateFrom);
    }
    
    if (dateTo) {
      query += ' AND DATE(al.created_at) <= DATE(?)';
      params.push(dateTo);
    }
    
    if (action) {
      query += ' AND al.action LIKE ?';
      params.push(`%${action}%`);
    }
    
    if (user) {
      query += ' AND u.name LIKE ?';
      params.push(`%${user}%`);
    }
    
    query += ' ORDER BY al.created_at DESC LIMIT 500';
    
    const auditLogs = db.prepare(query).all(...params);
    
    res.json({ success: true, data: auditLogs });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom dohvatanja audit log-a' });
  }
});

app.delete('/api/audit', authenticateToken, (req, res) => {
  try {
    const { dateFrom, dateTo, deleteAllBefore } = req.body;
    
    if (!dateFrom && !dateTo && !deleteAllBefore) {
      return res.status(400).json({ success: false, message: 'Morate specificirati datum ili opseg datuma' });
    }
    
    let query = 'DELETE FROM audit_log WHERE 1=1';
    const params = [];
    
    if (deleteAllBefore && dateFrom) {
      // Delete all records before (older than) the specified date
      query += ' AND DATE(created_at) < DATE(?)';
      params.push(dateFrom);
    } else if (dateFrom && dateTo) {
      // Delete records between dateFrom and dateTo
      query += ' AND DATE(created_at) >= DATE(?) AND DATE(created_at) <= DATE(?)';
      params.push(dateFrom, dateTo);
    } else if (dateFrom) {
      // Delete records from dateFrom onwards
      query += ' AND DATE(created_at) >= DATE(?)';
      params.push(dateFrom);
    } else if (dateTo) {
      // Delete records up to dateTo
      query += ' AND DATE(created_at) <= DATE(?)';
      params.push(dateTo);
    }
    
    const result = db.prepare(query).run(...params);
    
    res.json({
      success: true,
      message: `Uspješno obrisano ${result.changes} audit log zapisa` 
    });
  } catch (error) {
    console.error('Delete audit log error:', error);
    res.status(500).json({ success: false, message: 'Greška prilikom brisanja audit log-a' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  try {
    // Check database connection
    db.prepare('SELECT 1').get();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.server.env,
      database: 'connected',
      version: require('./package.json').version || '1.0.0'
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: config.server.env === 'development' ? error.message : 'Database connection failed'
    });
  }
});

// Global error handler (must be before catch-all route)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: config.server.env === 'development' ? err.stack : undefined
  });
});

// 404 handler for undefined API routes only
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint nije pronađen'
  });
});

// Catch-all handler: send back React's index.html file for any non-API routes
app.get('*', (req, res) => {
  // Only serve React app if build directory exists
  const buildPath = path.join(__dirname, '../build', 'index.html');
  if (fs.existsSync(buildPath)) {
    res.sendFile(buildPath);
  } else {
    res.status(404).json({
      success: false,
      message: 'Frontend build not found. Please run "npm run build" in the root directory.'
    });
  }
});

// Auto-backup functionality
const cron = require('node-cron');

// Function to generate daily PDF report
function generateDailyPDFReport(date, exportPath) {
  return new Promise((resolve, reject) => {
    try {
      const today = date || new Date().toISOString().split('T')[0];
      const pdfFilename = `rtvtk_izvjestaj_${today}.pdf`;
      const pdfPath = path.join(exportPath || path.join(__dirname, 'backups'), pdfFilename);
      
      // Create PDF document
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 50,
        bufferPages: true
      });
      
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);
      
      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('RTVTK - Dnevni Izvještaj', { align: 'center' });
      doc.fontSize(14).font('Helvetica').text(today, { align: 'center' });
      doc.moveDown(2);
      
      // Get all tasks for the date
      const tasks = db.prepare(`
        SELECT 
          t.*,
          n.name as newsroom_name,
          u.name as created_by_name
        FROM tasks t
        LEFT JOIN newsrooms n ON t.newsroom_id = n.id
        LEFT JOIN users u ON t.created_by = u.id
        WHERE DATE(t.date) = DATE(?)
        ORDER BY t.time_start, t.title
      `).all(today);
      
      // Get all schedules for the date
      const schedules = db.prepare(`
        SELECT 
          es.*,
          p.name as person_name,
          p.newsroom_id,
          n.name as newsroom_name
        FROM employee_schedules es
        JOIN people p ON es.person_id = p.id
        LEFT JOIN newsrooms n ON p.newsroom_id = n.id
        WHERE DATE(es.date) = DATE(?)
        ORDER BY n.name, p.name
      `).all(today);
      
      // Get cameramen schedules
      const cameramanSchedules = db.prepare(`
        SELECT 
          es.*,
          p.name as person_name
        FROM employee_schedules es
        JOIN people p ON es.person_id = p.id
        WHERE DATE(es.date) = DATE(?) AND p.newsroom_id = 8
        ORDER BY p.name
      `).all(today);
      
      // SECTION 1: ZADACI (TASKS)
      doc.fontSize(16).font('Helvetica-Bold').text('1. ZADACI', { underline: true });
      doc.moveDown(0.5);
      
      if (tasks.length === 0) {
        doc.fontSize(10).font('Helvetica').text('Nema zadataka za ovaj datum.');
      } else {
        doc.fontSize(10).font('Helvetica').text(`Ukupno zadataka: ${tasks.length}`);
        doc.moveDown(0.5);
        
        tasks.forEach((task, index) => {
          // Task header
          doc.fontSize(11).font('Helvetica-Bold').text(`${index + 1}. ${task.title}`, { continued: false });
          
          // Task details
          doc.fontSize(9).font('Helvetica');
          doc.text(`   Redakcija: ${task.newsroom_name || 'N/A'}`);
          doc.text(`   Vrijeme: ${task.time_start || 'N/A'} - ${task.time_end || 'N/A'}`);
          doc.text(`   Lokacija: ${task.location || 'N/A'}`);
          doc.text(`   Status: ${task.status}`);
          doc.text(`   Tip pokrivanja: ${task.coverage_type}`);
          if (task.attachment_type) {
            doc.text(`   Tip priloga: ${task.attachment_type}`);
          }
          
          // Get journalists
          if (task.journalist_ids) {
            const journalistIds = JSON.parse(task.journalist_ids);
            if (journalistIds.length > 0) {
              const journalists = db.prepare(`
                SELECT name FROM people WHERE id IN (${journalistIds.map(() => '?').join(',')})
              `).all(...journalistIds);
              doc.text(`   Novinari: ${journalists.map(j => j.name).join(', ')}`);
            }
          }
          
          // Get cameramen
          if (task.cameraman_ids) {
            const cameramanIds = JSON.parse(task.cameraman_ids);
            if (cameramanIds.length > 0) {
              const cameramen = db.prepare(`
                SELECT name FROM people WHERE id IN (${cameramanIds.map(() => '?').join(',')})
              `).all(...cameramanIds);
              doc.text(`   Kamermani: ${cameramen.map(c => c.name).join(', ')}`);
            }
          }
          
          // Flags
          if (task.flags) {
            const flags = JSON.parse(task.flags);
            if (flags.length > 0) {
              doc.text(`   Flagovi: ${flags.join(', ')}`);
            }
          }
          
          doc.text(`   Kreirao: ${task.created_by_name || 'N/A'}`);
          doc.moveDown(0.5);
          
          // Add page break if needed
          if (doc.y > 700) {
            doc.addPage();
          }
        });
      }
      
      doc.addPage();
      
      // SECTION 2: RASPOREDI (SCHEDULES)
      doc.fontSize(16).font('Helvetica-Bold').text('2. RASPOREDI NOVINARA', { underline: true });
      doc.moveDown(0.5);
      
      if (schedules.length === 0) {
        doc.fontSize(10).font('Helvetica').text('Nema rasporeda za ovaj datum.');
      } else {
        // Group schedules by newsroom
        const schedulesByNewsroom = {};
        schedules.forEach(schedule => {
          if (schedule.newsroom_id === 8) return; // Skip cameramen
          const newsroom = schedule.newsroom_name || 'Nepoznata redakcija';
          if (!schedulesByNewsroom[newsroom]) {
            schedulesByNewsroom[newsroom] = [];
          }
          schedulesByNewsroom[newsroom].push(schedule);
        });
        
        Object.keys(schedulesByNewsroom).sort().forEach(newsroom => {
          doc.fontSize(12).font('Helvetica-Bold').text(newsroom);
          doc.moveDown(0.3);
          
          schedulesByNewsroom[newsroom].forEach(schedule => {
            doc.fontSize(9).font('Helvetica');
            doc.text(`   • ${schedule.person_name}`);
            doc.text(`     Smjena: ${schedule.shift_start} - ${schedule.shift_end} (${schedule.shift_type})`);
            if (schedule.notes) {
              doc.text(`     Napomene: ${schedule.notes}`);
            }
            doc.moveDown(0.3);
          });
          
          doc.moveDown(0.5);
          
          // Add page break if needed
          if (doc.y > 700) {
            doc.addPage();
          }
        });
      }
      
      doc.addPage();
      
      // SECTION 3: RASPORED KAMERMANA (CAMERAMEN SCHEDULE)
      doc.fontSize(16).font('Helvetica-Bold').text('3. RASPORED KAMERMANA', { underline: true });
      doc.moveDown(0.5);
      
      if (cameramanSchedules.length === 0) {
        doc.fontSize(10).font('Helvetica').text('Nema rasporeda kamermana za ovaj datum.');
      } else {
        doc.fontSize(10).font('Helvetica').text(`Ukupno kamermana na rasporedu: ${cameramanSchedules.length}`);
        doc.moveDown(0.5);
        
        cameramanSchedules.forEach((schedule, index) => {
          doc.fontSize(10).font('Helvetica-Bold').text(`${index + 1}. ${schedule.person_name}`);
          doc.fontSize(9).font('Helvetica');
          doc.text(`   Smjena: ${schedule.shift_start} - ${schedule.shift_end}`);
          doc.text(`   Tip smjene: ${schedule.shift_type}`);
          if (schedule.custom_shift_name) {
            doc.text(`   Naziv: ${schedule.custom_shift_name}`);
          }
          if (schedule.notes) {
            doc.text(`   Napomene: ${schedule.notes}`);
          }
          doc.moveDown(0.5);
          
          // Add page break if needed
          if (doc.y > 700) {
            doc.addPage();
          }
        });
      }
      
      // Footer
      doc.fontSize(8).font('Helvetica').text(
        `Generisan: ${new Date().toLocaleString('bs-BA', { timeZone: 'Europe/Sarajevo' })}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );
      
      // Finalize PDF
      doc.end();
      
      stream.on('finish', () => {
        const stats = fs.statSync(pdfPath);
        console.log(`✅ PDF izvještaj kreiran: ${pdfFilename}`);
        console.log(`   📊 Zadataka: ${tasks.length}`);
        console.log(`   👥 Rasporeda: ${schedules.length}`);
        console.log(`   🎥 Kamermana: ${cameramanSchedules.length}`);
        console.log(`   💾 Veličina: ${(stats.size / 1024).toFixed(2)} KB`);
        resolve({ filename: pdfFilename, path: pdfPath, size: stats.size });
      });
      
      stream.on('error', (error) => {
        console.error('PDF generation error:', error);
        reject(error);
      });
      
    } catch (error) {
      console.error('PDF generation error:', error);
      reject(error);
    }
  });
}

// Function to create daily backup
function createDailyBackup() {
  try {
    const backupDir = path.join(__dirname, 'backups');
    
    // Check if backup directory exists, if not create it
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Create daily backup filename with date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const backupFilename = `rtvtk_dnevni_${today}.sqlite`;
    const backupPath = path.join(backupDir, backupFilename);
    
    // Check if backup already exists for today
    if (fs.existsSync(backupPath)) {
      console.log(`📅 Dnevni backup za ${today} već postoji: ${backupFilename}`);
      return;
    }
    
    // Get current database path
    const currentDbPath = path.join(__dirname, 'database.sqlite');
    
    // Copy current database to backup location
    fs.copyFileSync(currentDbPath, backupPath);
    
    // Get backup file info
    const stats = fs.statSync(backupPath);
    
    // Get tasks count for today
    const todayTasks = db.prepare(`
      SELECT COUNT(*) as count 
      FROM tasks 
      WHERE DATE(date) = DATE(?)
    `).get(today);
    
    console.log(`✅ Automatski dnevni backup kreiran: ${backupFilename}`);
    console.log(`   📊 Zadataka za ${today}: ${todayTasks.count}`);
    console.log(`   💾 Veličina: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Log to audit log (system action)
    logAudit(
      db,
      1, // System user ID (admin)
      'CREATE: Automatic daily backup',
      'system',
      0,
      null,
      { 
        backupFilename, 
        backupSize: stats.size,
        tasksToday: todayTasks.count
      },
      `Automatski kreiran dnevni backup za ${today}: ${backupFilename} (${todayTasks.count} zadataka, ${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
      '127.0.0.1',
      'system-cron'
    );
    
    // Generate PDF report
    // Get PDF export path from settings
    const pdfExportSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('pdf_export_path');
    const pdfExportPath = pdfExportSetting ? pdfExportSetting.value : backupDir;
    
    generateDailyPDFReport(today, pdfExportPath)
      .then(pdfResult => {
        // Log PDF creation to audit log
        logAudit(
          db,
          1, // System user ID (admin)
          'CREATE: Automatic daily PDF report',
          'system',
          0,
          null,
          { 
            pdfFilename: pdfResult.filename, 
            pdfSize: pdfResult.size,
            exportPath: pdfExportPath
          },
          `Automatski kreiran dnevni PDF izvještaj za ${today}: ${pdfResult.filename} (lokacija: ${pdfExportPath})`,
          '127.0.0.1',
          'system-cron'
        );
      })
      .catch(error => {
        console.error('❌ Greška prilikom kreiranja PDF izvještaja:', error);
      });
    
  } catch (error) {
    console.error('❌ Greška prilikom automatskog dnevnog backup-a:', error);
  }
}

// Initialize backup schedule
let dailyBackupTask = null;

function initializeBackupSchedule() {
  try {
    // Get backup settings from database
    const backupTimeSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('backup_time');
    const backupEnabledSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('backup_enabled');
    
    const backupTime = backupTimeSetting ? backupTimeSetting.value : '23:30';
    const backupEnabled = backupEnabledSetting ? backupEnabledSetting.value === 'true' : true;
    
    if (!backupEnabled) {
      console.log('⏸️  Automatski backup je onemogućen');
      return;
    }
    
    // Parse time (HH:MM)
    const [hours, minutes] = backupTime.split(':');
    const cronExpression = `${minutes} ${hours} * * *`;
    
    // Stop existing task if it exists
    if (dailyBackupTask) {
      dailyBackupTask.stop();
    }
    
    // Schedule daily backup
    dailyBackupTask = cron.schedule(cronExpression, () => {
      console.log(`🕐 Pokretanje automatskog dnevnog backup-a (${backupTime})...`);
      createDailyBackup();
    }, {
      scheduled: true,
      timezone: "Europe/Sarajevo"
    });
    
    console.log(`🔄 Automatski backup zakazan za: ${backupTime}`);
  } catch (error) {
    console.error('❌ Greška prilikom inicijalizacije backup schedule-a:', error);
  }
}

// Initialize backup schedule on server start
initializeBackupSchedule();

// Schedule weekly backup on Sundays at 23:45
cron.schedule('45 23 * * 0', () => {
  try {
    const backupDir = path.join(__dirname, 'backups');
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const today = new Date().toISOString().split('T')[0];
    const backupFilename = `rtvtk_nedeljni_${today}.sqlite`;
    const backupPath = path.join(backupDir, backupFilename);
    
    if (fs.existsSync(backupPath)) {
      console.log(`📅 Nedeljni backup za ${today} već postoji: ${backupFilename}`);
      return;
    }
    
    const currentDbPath = path.join(__dirname, 'database.sqlite');
    fs.copyFileSync(currentDbPath, backupPath);
    
    const stats = fs.statSync(backupPath);
    
    console.log(`✅ Automatski nedeljni backup kreiran: ${backupFilename}`);
    console.log(`   💾 Veličina: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Log to audit log
    logAudit(
      db,
      1,
      'CREATE: Automatic weekly backup',
      'system',
      0,
      null,
      { 
        backupFilename, 
        backupSize: stats.size
      },
      `Automatski kreiran nedeljni backup: ${backupFilename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
      '127.0.0.1',
      'system-cron'
    );
    
  } catch (error) {
    console.error('❌ Greška prilikom automatskog nedeljnog backup-a:', error);
  }
}, {
  scheduled: true,
  timezone: "Europe/Sarajevo"
});

// Schedule daily notification cleanup at 23:00
cron.schedule('0 23 * * *', () => {
  try {
    console.log('🧹 Pokretanje dnevnog čišćenja obavještenja (23:00)...');
    
    // Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
    
    // Delete all notifications from yesterday and earlier
    const result = db.prepare(`
      DELETE FROM notifications 
      WHERE created_at < ?
    `).run(yesterdayStart);
    
    console.log(`✅ Obrisano ${result.changes} starih obavještenja`);
    
    // Log to audit
    logAudit(
      db,
      1, // System user ID
      'DELETE: Daily notification cleanup',
      'notifications',
      0,
      null,
      { deletedCount: result.changes },
      `Automatsko brisanje obavještenja starijih od ${yesterdayStart}`,
      '127.0.0.1',
      'system-cron'
    );
    
  } catch (error) {
    console.error('❌ Greška prilikom čišćenja obavještenja:', error);
  }
}, {
  scheduled: true,
  timezone: "Europe/Sarajevo"
});

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // Don't leak error details in production
  const isDevelopment = config.server.env === 'development';
  
  res.status(err.status || 500).json({
    success: false,
    message: isDevelopment ? err.message : 'Interna greška servera',
    ...(isDevelopment && { stack: err.stack })
  });
});

// Create backup immediately on server start for today (if not exists)
setTimeout(() => {
  createDailyBackup();
}, 5000); // Wait 5 seconds after server start

app.listen(PORT, '0.0.0.0', () => {
  console.log(`RTVTK Planner server running on port ${PORT}`);
  console.log(`Server accessible at: http://localhost:${PORT} or http://<your-ip>:${PORT}`);
  console.log(`Database: ${dbPath}`);
  console.log(`Timezone: Bosna i Hercegovina (UTC+2, CEST) - same as Tuzla`);
  
  // Display backup settings
  const backupTimeSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('backup_time');
  const backupEnabledSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('backup_enabled');
  const pdfExportPathSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('pdf_export_path');
  
  const backupTime = backupTimeSetting ? backupTimeSetting.value : '23:30';
  const backupEnabled = backupEnabledSetting ? backupEnabledSetting.value === 'true' : true;
  const pdfExportPath = pdfExportPathSetting ? pdfExportPathSetting.value : path.join(__dirname, 'backups');
  
  if (backupEnabled) {
    console.log(`🔄 Automatski backup: svaki dan u ${backupTime}`);
  } else {
    console.log(`⏸️  Automatski backup: onemogućen`);
  }
  console.log(`📁 PDF izvještaji: ${pdfExportPath}`);
  console.log(`📅 Nedeljni backup: nedjelja u 23:45`);
});