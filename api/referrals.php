<?php
// api/referrals.php - Referrer submits referral write-up

require_once __DIR__ . '/config.php';

$user = require_auth($pdo);
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    json_error('Method not allowed', 405);
}

$connectionId = isset($_GET['connection_id']) ? (int)$_GET['connection_id'] : null;
$input = get_json_input();
if (!$connectionId && isset($input['connection_id'])) {
    $connectionId = (int)$input['connection_id'];
}

if (!$connectionId) {
    json_error('Connection ID is required.');
}

$stmt = $pdo->prepare("SELECT * FROM connections WHERE id = ?");
$stmt->execute([$connectionId]);
$connection = $stmt->fetch();

if (!$connection) {
    json_error('Connection not found.', 404);
}

if ((int)$connection['referrer_id'] !== (int)$user['id']) {
    json_error('Only the member who connected can submit this referral.', 403);
}

if ($connection['status'] === 'referred') {
    json_error("You've already submitted a referral for this connection.", 409);
}

$description = trim($input['description'] ?? '');
if (!$description) {
    json_error('Describe the referral you made.');
}

$reqStmt = $pdo->prepare("SELECT * FROM requests WHERE id = ?");
$reqStmt->execute([$connection['request_id']]);
$request = $reqStmt->fetch();

if (!$request) {
    json_error('The original request no longer exists.', 404);
}

$pdo->beginTransaction();
try {
    $insertStmt = $pdo->prepare("
        INSERT INTO referrals (connection_id, request_id, referrer_id, requester_id, description)
        VALUES (?, ?, ?, ?, ?)
    ");
    $insertStmt->execute([$connection['id'], $request['id'], $user['id'], $request['requester_id'], $description]);
    $referralId = (int)$pdo->lastInsertId();

    $upConn = $pdo->prepare("UPDATE connections SET status = 'referred' WHERE id = ?");
    $upConn->execute([$connection['id']]);

    $upReq = $pdo->prepare("UPDATE requests SET status = 'referred' WHERE id = ?");
    $upReq->execute([$request['id']]);

    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    json_error('Failed to submit referral: ' . $e->getMessage(), 500);
}

create_notification(
    $pdo,
    $request['requester_id'],
    'referred',
    "{$user['name']} sent your referral for \"{$request['title']}\". Take a look and send a thank-you when you're ready.",
    'referral',
    $referralId
);

$refFetch = $pdo->prepare("SELECT * FROM referrals WHERE id = ?");
$refFetch->execute([$referralId]);
$referral = $refFetch->fetch();

json_response(['referral' => $referral], 201);
