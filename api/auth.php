<?php
// api/auth.php - Authentication Endpoints

require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';

// Fallback: parse action from PATH_INFO if available (e.g. /api/auth.php/login)
if (!$action && isset($_SERVER['PATH_INFO'])) {
    $action = trim($_SERVER['PATH_INFO'], '/');
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($action) {
    case 'status':
        if ($method !== 'GET') json_error('Method not allowed', 405);
        $stmt = $pdo->query("SELECT COUNT(*) AS total FROM users");
        $count = (int)$stmt->fetchColumn();
        json_response(['hasAdmin' => $count > 0]);
        break;

    case 'me':
        if ($method !== 'GET') json_error('Method not allowed', 405);
        $user = get_current_user_data($pdo);
        json_response(['user' => $user]);
        break;

    case 'register':
        if ($method !== 'POST') json_error('Method not allowed', 405);
        $input = get_json_input();
        
        $name = trim($input['name'] ?? '');
        $email = strtolower(trim($input['email'] ?? ''));
        $password = $input['password'] ?? '';
        $inviteCode = trim($input['inviteCode'] ?? '');

        if (!$name || !$email || !$password) {
            json_error('Name, email, and password are required.');
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_error('Invalid email address.');
        }

        if (strlen($password) < 6) {
            json_error('Password must be at least 6 characters long.');
        }

        // Check if email already exists
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            json_error('An account with this email already exists.');
        }

        // Check total users to determine if first user (Admin bootstrap)
        $userCountStmt = $pdo->query("SELECT COUNT(*) FROM users");
        $userCount = (int)$userCountStmt->fetchColumn();
        $isFirstUser = ($userCount === 0);

        $inviteId = null;

        if (!$isFirstUser) {
            if (!$inviteCode) {
                json_error('An invite code is required to register.');
            }

            $inviteStmt = $pdo->prepare("SELECT * FROM invites WHERE code = ? AND is_active = 1");
            $inviteStmt->execute([$inviteCode]);
            $invite = $inviteStmt->fetch();

            if (!$invite) {
                json_error('Invalid or expired invite code.');
            }

            if ($invite['max_uses'] > 0 && $invite['uses'] >= $invite['max_uses']) {
                json_error('This invite link has reached its maximum uses.');
            }

            $inviteId = $invite['id'];
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $isAdmin = $isFirstUser ? 1 : 0;

        $pdo->beginTransaction();
        try {
            $insertStmt = $pdo->prepare("
                INSERT INTO users (name, email, password_hash, is_admin, invite_id)
                VALUES (?, ?, ?, ?, ?)
            ");
            $insertStmt->execute([$name, $email, $passwordHash, $isAdmin, $inviteId]);
            $userId = (int)$pdo->lastInsertId();

            if ($inviteId) {
                $updateInviteStmt = $pdo->prepare("UPDATE invites SET uses = uses + 1 WHERE id = ?");
                $updateInviteStmt->execute([$inviteId]);
            }

            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            json_error('Registration failed: ' . $e->getMessage(), 500);
        }

        $_SESSION['user_id'] = $userId;

        $newUser = get_current_user_data($pdo);
        json_response(['user' => $newUser], 201);
        break;

    case 'login':
        if ($method !== 'POST') json_error('Method not allowed', 405);
        $input = get_json_input();

        $email = strtolower(trim($input['email'] ?? ''));
        $password = $input['password'] ?? '';

        if (!$email || !$password) {
            json_error('Email and password are required.');
        }

        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            json_error('Invalid email or password.', 401);
        }

        $_SESSION['user_id'] = (int)$user['id'];

        $userData = get_current_user_data($pdo);
        json_response(['user' => $userData]);
        break;

    case 'logout':
        if ($method !== 'POST') json_error('Method not allowed', 405);
        unset($_SESSION['user_id']);
        session_destroy();
        json_response(['ok' => true]);
        break;

    default:
        json_error('Invalid auth endpoint or action.', 404);
        break;
}
