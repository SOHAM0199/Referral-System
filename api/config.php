<?php
// api/config.php - Central configuration & database connection

// Enable error reporting during development (disable or adjust in production)
error_reporting(E_ALL);
ini_set('display_errors', '0');

// Session configuration
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Database Engine: Set to 'sqlite' for zero-config file database, or 'mysql' for MySQL server
define('DB_ENGINE', 'sqlite'); 

// MySQL Credentials (Used only if DB_ENGINE is set to 'mysql')
define('DB_HOST', 'localhost');
define('DB_NAME', 'referral_portal');
define('DB_USER', 'root');
define('DB_PASS', '');

// Helper to get SQLite PDO
function get_sqlite_connection() {
    $dbDir = __DIR__;
    $dbFile = $dbDir . '/database.sqlite';
    if (!file_exists($dbFile) && !is_writable($dbDir)) {
        $dbDir = sys_get_temp_dir();
        $dbFile = $dbDir . '/referral_portal.sqlite';
    }
    $pdo = new PDO("sqlite:" . $dbFile, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec("PRAGMA foreign_keys = ON;");
    init_sqlite_db($pdo);
    return $pdo;
}

// Initialize PDO Database Connection
try {
    if (DB_ENGINE === 'sqlite') {
        $pdo = get_sqlite_connection();
    } else {
        $pdo = new PDO(
            "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    }
} catch (PDOException $e) {
    // Fallback to SQLite if MySQL connection fails
    try {
        $pdo = get_sqlite_connection();
    } catch (PDOException $e2) {
        header('Content-Type: application/json');
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed: ' . $e2->getMessage()]);
        exit;
    }
}

function init_sqlite_db($pdo) {
    $queries = [
        "CREATE TABLE IF NOT EXISTS invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            label TEXT DEFAULT NULL,
            created_by INTEGER DEFAULT NULL,
            max_uses INTEGER NOT NULL DEFAULT 0,
            uses INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
            invite_id INTEGER DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        "CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            requester_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        "CREATE TABLE IF NOT EXISTS connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            referrer_id INTEGER NOT NULL,
            note TEXT DEFAULT NULL,
            status TEXT NOT NULL DEFAULT 'connected',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (request_id, referrer_id)
        )",
        "CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            connection_id INTEGER NOT NULL UNIQUE,
            request_id INTEGER NOT NULL,
            referrer_id INTEGER NOT NULL,
            requester_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        "CREATE TABLE IF NOT EXISTS thanks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referral_id INTEGER NOT NULL UNIQUE,
            from_user_id INTEGER NOT NULL,
            to_user_id INTEGER NOT NULL,
            personal_note TEXT DEFAULT NULL,
            letter TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        "CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        "CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            related_type TEXT DEFAULT NULL,
            related_id INTEGER DEFAULT NULL,
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"
    ];
    foreach ($queries as $q) {
        $pdo->exec($q);
    }
}

// Helper: JSON Response
function json_response($data, $statusCode = 200) {
    header('Content-Type: application/json');
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

// Helper: JSON Error Response
function json_error($message, $statusCode = 400) {
    json_response(['error' => $message], $statusCode);
}

// Helper: Get JSON request body
function get_json_input() {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    return is_array($data) ? $data : [];
}

// Helper: Get current user ID from session
function get_current_user_id() {
    return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
}

// Helper: Get full current user record
function get_current_user_data($pdo) {
    $userId = get_current_user_id();
    if (!$userId) return null;

    $stmt = $pdo->prepare("SELECT id, name, email, is_admin, invite_id, created_at FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if ($user) {
        $user['is_admin'] = (bool)$user['is_admin'];
    }
    return $user ?: null;
}

// Helper: Require Authentication
function require_auth($pdo) {
    $user = get_current_user_data($pdo);
    if (!$user) {
        json_error('Unauthorized. Please log in.', 401);
    }
    return $user;
}

// Helper: Require Admin Privilege
function require_admin($pdo) {
    $user = require_auth($pdo);
    if (!$user['is_admin']) {
        json_error('Admin privileges required.', 403);
    }
    return $user;
}

// Helper: Insert Notification
function create_notification($pdo, $userId, $type, $message, $relatedType = null, $relatedId = null) {
    $stmt = $pdo->prepare("
        INSERT INTO notifications (user_id, type, message, related_type, related_id)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([$userId, $type, $message, $relatedType, $relatedId]);
}

// Helper: Generate Thank-You Letter
function generate_thank_you_letter($fromName, $toName, $requestTitle, $personalNote = '') {
    $date = date('F j, Y');
    $noteBlock = $personalNote ? "\n\nPersonal note from {$fromName}:\n\"{$personalNote}\"" : "";

    return "DEAR " . strtoupper($toName) . ",\n\n"
        . "I am writing to express my deepest gratitude for connecting and referring me for standard consideration for \"{$requestTitle}\".\n\n"
        . "Your support, endorsement, and willing assistance in navigating this process mean a tremendous amount. Referrals build communities, and your willingness to champion fellow members makes all the difference.\n\n"
        . "Thank you once again for your generosity, time, and encouragement.{$noteBlock}\n\n"
        . "WITH SINCERE APPRECIATION,\n"
        . strtoupper($fromName) . "\n"
        . "{$date}";
}
