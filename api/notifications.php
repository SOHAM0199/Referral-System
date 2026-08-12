<?php
// api/notifications.php - User notifications feed & read-all

require_once __DIR__ . '/config.php';

$user = require_auth($pdo);
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($action === 'read-all' || ($method === 'POST' && strpos($_SERVER['REQUEST_URI'], 'read-all') !== false)) {
    $stmt = $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?");
    $stmt->execute([$user['id']]);
    json_response(['ok' => true]);
}

if ($method !== 'GET') {
    json_error('Method not allowed', 405);
}

$stmt = $pdo->prepare("
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
");
$stmt->execute([$user['id']]);
$notifications = $stmt->fetchAll();

$notifications = array_map(function($n) {
    $n['id'] = (int)$n['id'];
    $n['user_id'] = (int)$n['user_id'];
    $n['related_id'] = $n['related_id'] ? (int)$n['related_id'] : null;
    $n['is_read'] = (int)$n['is_read'];
    return $n;
}, $notifications);

json_response(['notifications' => $notifications]);
