// Input validation middleware using express-validator
const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array()
    });
  }
  next();
};

// Validation rules for authentication
const validateLogin = [
  // Custom validation: either PIN or username/password must be provided
  body('pin').optional().isString().trim().notEmpty().withMessage('PIN je obavezan'),
  body('username').optional().isString().trim().isLength({ min: 1 }).withMessage('Korisničko ime je obavezno'),
  body('password').optional().isString().isLength({ min: 1 }).withMessage('Lozinka je obavezna'),
  // Custom check: at least PIN or (username AND password) must be provided
  (req, res, next) => {
    const { pin, username, password } = req.body;
    if (!pin && (!username || !password)) {
      return res.status(400).json({
        success: false,
        message: 'PIN ili korisničko ime i lozinka su obavezni'
      });
    }
    next();
  },
  handleValidationErrors
];

// Validation rules for tasks
const validateTaskCreate = [
  body('date').isString().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Datum mora biti u formatu YYYY-MM-DD'),
  body('title').isString().trim().isLength({ min: 1, max: 500 }).withMessage('Naslov je obavezan (max 500 karaktera)'),
  body('newsroom_id').isInt({ min: 1 }).withMessage('Redakcija je obavezna'),
  body('coverage_type').optional().isIn(['ENG', 'IFP', 'EFP', 'SNG', 'LIVE', 'STUDIO', 'OB', 'IP Live']).withMessage('Neispravan tip pokrivanja'),
  body('attachment_type').optional().isIn(['PACKAGE', 'VO', 'VO/SOT', 'SOT', 'FEATURE', 'NATPKG']).withMessage('Neispravan tip priloga'),
  body('status').optional().isIn(['DRAFT', 'PLANIRANO', 'DODIJELJENO', 'U_TOKU', 'SNIMLJENO', 'OTKAZANO', 'ARHIVIRANO', 'URADJENO']).withMessage('Neispravan status'),
  body('time_start').optional().isString().matches(/^\d{2}:\d{2}$/).withMessage('Vrijeme početka mora biti u formatu HH:MM'),
  body('time_end').optional().isString().matches(/^\d{2}:\d{2}$/).withMessage('Vrijeme završetka mora biti u formatu HH:MM'),
  body('journalist_ids').optional().isArray().withMessage('journalist_ids mora biti niz'),
  body('cameraman_ids').optional().isArray().withMessage('cameraman_ids mora biti niz'),
  body('flags').optional().isArray().withMessage('flags mora biti niz'),
  handleValidationErrors
];

const validateTaskUpdate = [
  param('id').isInt({ min: 1 }).withMessage('ID zadatka mora biti pozitivan broj'),
  body('date').optional().isString().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Datum mora biti u formatu YYYY-MM-DD'),
  body('title').optional().isString().trim().isLength({ min: 1, max: 500 }).withMessage('Naslov mora biti između 1 i 500 karaktera'),
  body('coverage_type').optional().isIn(['ENG', 'IFP', 'EFP', 'SNG', 'LIVE', 'STUDIO', 'OB', 'IP Live']).withMessage('Neispravan tip pokrivanja'),
  body('attachment_type').optional().isIn(['PACKAGE', 'VO', 'VO/SOT', 'SOT', 'FEATURE', 'NATPKG']).withMessage('Neispravan tip priloga'),
  body('status').optional().isIn(['DRAFT', 'PLANIRANO', 'DODIJELJENO', 'U_TOKU', 'SNIMLJENO', 'OTKAZANO', 'ARHIVIRANO', 'URADJENO']).withMessage('Neispravan status'),
  handleValidationErrors
];

// Validation rules for users
const validateUserCreate = [
  body('username').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Korisničko ime je obavezno (max 100 karaktera)'),
  body('name').isString().trim().isLength({ min: 1, max: 200 }).withMessage('Ime je obavezno (max 200 karaktera)'),
  body('password').isString().isLength({ min: 6 }).withMessage('Lozinka mora imati najmanje 6 karaktera'),
  body('role').isIn(['ADMIN', 'PRODUCER', 'EDITOR', 'DESK_EDITOR', 'CAMERMAN_EDITOR', 'CHIEF_CAMERA', 'CONTROL_ROOM', 'VIEWER', 'CAMERA']).withMessage('Neispravna uloga'),
  body('newsroom_id').optional().isInt({ min: 1 }).withMessage('newsroom_id mora biti pozitivan broj'),
  handleValidationErrors
];

const validateUserUpdate = [
  param('id').isInt({ min: 1 }).withMessage('ID korisnika mora biti pozitivan broj'),
  body('username').optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage('Korisničko ime mora biti između 1 i 100 karaktera'),
  body('name').optional().isString().trim().isLength({ min: 1, max: 200 }).withMessage('Ime mora biti između 1 i 200 karaktera'),
  body('role').optional().isIn(['ADMIN', 'PRODUCER', 'EDITOR', 'DESK_EDITOR', 'CAMERMAN_EDITOR', 'CHIEF_CAMERA', 'CONTROL_ROOM', 'VIEWER', 'CAMERA']).withMessage('Neispravna uloga'),
  handleValidationErrors
];

// Validation rules for people
const validatePersonCreate = [
  body('name').isString().trim().isLength({ min: 1, max: 200 }).withMessage('Ime je obavezno (max 200 karaktera)'),
  body('role').isIn(['JOURNALIST', 'CAMERAMAN', 'EDITOR', 'PRODUCER']).withMessage('Neispravna uloga'),
  body('phone').optional().isString().trim().isLength({ max: 50 }).withMessage('Telefon mora biti maksimalno 50 karaktera'),
  body('email').optional().isEmail().withMessage('Email mora biti validan'),
  body('newsroom_id').optional().isInt({ min: 1 }).withMessage('newsroom_id mora biti pozitivan broj'),
  handleValidationErrors
];

const validatePersonUpdate = [
  param('id').isInt({ min: 1 }).withMessage('ID uposlenika mora biti pozitivan broj'),
  body('name').optional().isString().trim().isLength({ min: 1, max: 200 }).withMessage('Ime mora biti između 1 i 200 karaktera'),
  body('role').optional().isIn(['JOURNALIST', 'CAMERAMAN', 'EDITOR', 'PRODUCER']).withMessage('Neispravna uloga'),
  body('phone').optional().isString().trim().isLength({ max: 50 }).withMessage('Telefon mora biti maksimalno 50 karaktera'),
  body('email').optional().isEmail().withMessage('Email mora biti validan'),
  handleValidationErrors
];

// Validation rules for vehicles
const validateVehicleCreate = [
  body('name').isString().trim().isLength({ min: 1, max: 200 }).withMessage('Naziv vozila je obavezan (max 200 karaktera)'),
  body('type').optional().isString().trim().isLength({ max: 100 }).withMessage('Tip vozila mora biti maksimalno 100 karaktera'),
  body('license_plate').optional().isString().trim().isLength({ max: 20 }).withMessage('Registarski broj mora biti maksimalno 20 karaktera'),
  handleValidationErrors
];

const validateVehicleUpdate = [
  param('id').isInt({ min: 1 }).withMessage('ID vozila mora biti pozitivan broj'),
  body('name').optional().isString().trim().isLength({ min: 1, max: 200 }).withMessage('Naziv vozila mora biti između 1 i 200 karaktera'),
  body('type').optional().isString().trim().isLength({ max: 100 }).withMessage('Tip vozila mora biti maksimalno 100 karaktera'),
  body('license_plate').optional().isString().trim().isLength({ max: 20 }).withMessage('Registarski broj mora biti maksimalno 20 karaktera'),
  handleValidationErrors
];

// Validation rules for query parameters
const validateDateQuery = [
  query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Datum mora biti u formatu YYYY-MM-DD'),
  query('dateFrom').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Datum od mora biti u formatu YYYY-MM-DD'),
  query('dateTo').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Datum do mora biti u formatu YYYY-MM-DD'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateLogin,
  validateTaskCreate,
  validateTaskUpdate,
  validateUserCreate,
  validateUserUpdate,
  validatePersonCreate,
  validatePersonUpdate,
  validateVehicleCreate,
  validateVehicleUpdate,
  validateDateQuery
};

