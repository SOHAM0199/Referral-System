<?php
// api/invites.php - Admin Invites and Member Management

require_once __DIR__ . '/config.php';

$user = require_admin($pdo);
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

if ($action === 'members') {
    if ($method === 'GET') {
        $stmt = $pdo->query("
            SELECT u.id, u.name, u.email, u.is_admin, u.created_at,
                   (SELECT COUNT(*) FROM requests r WHERE r.requester_id = u.id) AS request_count,
                   (SELECT COUNT(*) FROM referrals ref WHERE ref.referrer_id = u.id) AS referral_count
            FROM users u
            ORDER BY u.created_at DESC
        ");
        $members = array_map(function($m) {
            $m['id'] = (int)$m['id'];
            $m['is_admin'] = (bool)$m['is_admin'];
            $m['request_count'] = (int)$m['request_count'];
            $m['referral_count'] = (int)$m['referral_count'];
            return $m;
        }, $stmt->fetchAll());

        json_response(['members' => $members]);

    } elseif ($method === 'POST') {
        $input = get_json_input();
        $name = trim($input['name'] ?? '');
        $email = strtolower(trim($input['email'] ?? ''));
        $password = $input['password'] ?? '';

        if (!$name) json_error('Add member name.');
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Add a valid email.');
        if (!$password || strlen($password) < 6) json_error('Password needs at least 6 characters.');

        $checkStmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
        $checkStmt->execute([$email]);
        if ($checkStmt->fetch()) {
            json_error('An account with that email already exists.', 409);
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $insertStmt = $pdo->prepare("
            INSERT INTO users (name, email, password_hash, is_admin)
            VALUES (?, ?, ?, 0)
        ");
        $insertStmt->execute([$name, $email, $passwordHash]);
        $newId = (int)$pdo->lastInsertId();

        json_response([
            'member' => [
                'id' => $newId,
                'name' => $name,
                'email' => $email,
                'is_admin' => false
            ]
        ], 201);

    } elseif ($method === 'DELETE' || ($action === 'members' && $id && $method === 'POST' && ($_GET['_method'] ?? '') === 'DELETE')) {
        if (!$id) json_error('Invalid member ID.');
        if ($id === (int)$user['id']) json_error('You cannot delete your own admin account.');

        $checkStmt = $pdo->prepare("SELECT id FROM users WHERE id = ?");
        $checkStmt->execute([$id]);
        if (!$checkStmt->fetch()) json_error('Member not found.', 404);

        $pdo->beginTransaction();
        try {
            $pdo->prepare("DELETE FROM comments WHERE user_id = ?")->execute([$id]);
            $pdo->prepare("DELETE FROM thanks WHERE from_user_id = ? OR to_user_id = ?")->execute([$id, $id]);
            $pdo->prepare("DELETE FROM referrals WHERE referrer_id = ? OR requester_id = ?")->execute([$id, $id]);
            $pdo->prepare("DELETE FROM connections WHERE referrer_id = ? OR request_id IN (SELECT id FROM requests WHERE requester_id = ?)")->execute([$id, $id]);
            $pdo->prepare("DELETE FROM requests WHERE requester_id = ?")->execute([$id]);
            $pdo->prepare("DELETE FROM notifications WHERE user_id = ?")->execute([$id]);
            $pdo->prepare("UPDATE invites SET created_by = NULL WHERE created_by = ?")->execute([$id]);
            $pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$id]);
            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            json_error('Failed to delete member: ' . $e->getMessage(), 500);
        }

        json_response(['ok' => true]);
    }

} elseif ($action === 'toggle') {
    if (!$id) json_error('Invite ID is required.');

    $stmt = $pdo->prepare("SELECT * FROM invites WHERE id = ?");
    $stmt->execute([$id]);
    $invite = $stmt->fetch();

    if (!$invite) json_error('Invite not found.', 404);

    $newActive = $invite['is_active'] ? 0 : 1;
    $upStmt = $pdo->prepare("UPDATE invites SET is_active = ? WHERE id = ?");
    $upStmt->execute([$newActive, $id]);

    json_response(['ok' => true]);

} elseif ($method === 'POST') {
    $input = get_json_input();
    $label = trim($input['label'] ?? '');
    $maxUses = isset($input['maxUses']) ? (int)$input['maxUses'] : 0;
    if ($maxUses < 0) $maxUses = 0;

    $code = bin2hex(random_bytes(5)); // 10-char random code

    $insertStmt = $pdo->prepare("
        INSERT INTO invites (code, label, created_by, max_uses)
        VALUES (?, ?, ?, ?)
    ");
    $insertStmt->execute([$code, $label ?: null, $user['id'], $maxUses]);
    $newId = (int)$pdo->lastInsertId();

    $fetchStmt = $pdo->prepare("SELECT * FROM invites WHERE id = ?");
    $fetchStmt->execute([$newId]);
    $invite = $fetchStmt->fetch();

    $invite['id'] = (int)$invite['id'];
    $invite['is_active'] = (bool)$invite['is_active'];
    $invite['max_uses'] = (int)$invite['max_uses'];
    $invite['uses'] = (int)$invite['uses'];

    json_response(['invite' => $invite], 201);

} else {
    // Default GET: List all invite links
    $stmt = $pdo->query("
        SELECT i.*, u.name AS created_by_name
        FROM invites i
        LEFT JOIN users u ON u.id = i.created_by
        ORDER BY i.created_at DESC
    ");
    $invites = array_map(function($i) {
        $i['id'] = (int)$i['id'];
        $i['is_active'] = (bool)$i['is_active'];
        $i['max_uses'] = (int)$i['max_uses'];
        $i['uses'] = (int)$i['uses'];
        return $i;
    }, $stmt->fetchAll());

    json_response(['invites' => $invites]);
}
