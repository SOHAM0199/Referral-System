<?php
// api/connections.php - Referrer connects to a request

require_once __DIR__ . '/config.php';

$user = require_auth($pdo);
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    json_error('Method not allowed', 405);
}

$requestId = isset($_GET['request_id']) ? (int)$_GET['request_id'] : null;
$input = get_json_input();
if (!$requestId && isset($input['request_id'])) {
    $requestId = (int)$input['request_id'];
}

if (!$requestId) {
    json_error('Request ID is required.');
}

$stmt = $pdo->prepare("SELECT * FROM requests WHERE id = ?");
$stmt->execute([$requestId]);
$request = $stmt->fetch();

if (!$request) {
    json_error('Request not found.', 404);
}

if ((int)$request['requester_id'] === (int)$user['id']) {
    json_error("You can't connect to your own request.");
}

if ($request['status'] === 'closed') {
    json_error('This request is closed.');
}

$note = trim($input['note'] ?? '');
if (!$note) {
    json_error('Please give your referral details here.');
}

$checkStmt = $pdo->prepare("SELECT * FROM connections WHERE request_id = ? AND referrer_id = ?");
$checkStmt->execute([$requestId, $user['id']]);
$existingConn = $checkStmt->fetch();

if ($existingConn) {
    // Check if referral was already submitted for this connection
    $refCheck = $pdo->prepare("SELECT id FROM referrals WHERE connection_id = ?");
    $refCheck->execute([$existingConn['id']]);
    if ($refCheck->fetch()) {
        json_error("You've already submitted a referral for this request.", 409);
    }
}

$pdo->beginTransaction();
try {
    if ($existingConn) {
        $connId = (int)$existingConn['id'];
        $upConn = $pdo->prepare("UPDATE connections SET note = ?, status = 'referred' WHERE id = ?");
        $upConn->execute([$note, $connId]);
    } else {
        $insertStmt = $pdo->prepare("
            INSERT INTO connections (request_id, referrer_id, note, status)
            VALUES (?, ?, ?, 'referred')
        ");
        $insertStmt->execute([$requestId, $user['id'], $note]);
        $connId = (int)$pdo->lastInsertId();
    }

    $refStmt = $pdo->prepare("
        INSERT INTO referrals (connection_id, request_id, referrer_id, requester_id, description)
        VALUES (?, ?, ?, ?, ?)
    ");
    $refStmt->execute([$connId, $requestId, $user['id'], $request['requester_id'], $note]);
    $referralId = (int)$pdo->lastInsertId();

    $upReq = $pdo->prepare("UPDATE requests SET status = 'referred' WHERE id = ?");
    $upReq->execute([$requestId]);

    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    json_error('Failed to process referral connection: ' . $e->getMessage(), 500);
}

create_notification(
    $pdo,
    $request['requester_id'],
    'referred',
    "{$user['name']} has referred you for \"{$request['title']}\". Take a look and send a thank-you when you're ready.",
    'referral',
    $referralId
);

$connFetch = $pdo->prepare("SELECT * FROM connections WHERE id = ?");
$connFetch->execute([$connId]);
$connection = $connFetch->fetch();

json_response(['connection' => $connection, 'referral_id' => $referralId], 201);
