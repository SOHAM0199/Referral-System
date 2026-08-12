<?php
// api/thanks.php - Send thank-you letter to referrer

require_once __DIR__ . '/config.php';

$user = require_auth($pdo);
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    json_error('Method not allowed', 405);
}

$referralId = isset($_GET['referral_id']) ? (int)$_GET['referral_id'] : null;
$input = get_json_input();
if (!$referralId && isset($input['referral_id'])) {
    $referralId = (int)$input['referral_id'];
}

if (!$referralId) {
    json_error('Referral ID is required.');
}

$stmt = $pdo->prepare("SELECT * FROM referrals WHERE id = ?");
$stmt->execute([$referralId]);
$referral = $stmt->fetch();

if (!$referral) {
    json_error('Referral not found.', 404);
}

if ((int)$referral['requester_id'] !== (int)$user['id']) {
    json_error('Only the person who received this referral can send the thank-you.', 403);
}

$checkStmt = $pdo->prepare("SELECT id FROM thanks WHERE referral_id = ?");
$checkStmt->execute([$referralId]);
if ($checkStmt->fetch()) {
    json_error("You've already sent a thank-you for this referral.", 409);
}

$reqStmt = $pdo->prepare("SELECT * FROM requests WHERE id = ?");
$reqStmt->execute([$referral['request_id']]);
$request = $reqStmt->fetch();

$refUserStmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
$refUserStmt->execute([$referral['referrer_id']]);
$referrer = $refUserStmt->fetch();

$personalNote = trim($input['personalNote'] ?? '');

$letter = generate_thank_you_letter(
    $user['name'],
    $referrer ? $referrer['name'] : 'Friend',
    $request ? $request['title'] : 'the role',
    $personalNote
);

$pdo->beginTransaction();
try {
    $insertStmt = $pdo->prepare("
        INSERT INTO thanks (referral_id, from_user_id, to_user_id, personal_note, letter)
        VALUES (?, ?, ?, ?, ?)
    ");
    $insertStmt->execute([
        $referral['id'],
        $user['id'],
        $referral['referrer_id'],
        $personalNote ?: null,
        $letter
    ]);
    $thanksId = (int)$pdo->lastInsertId();

    $upReq = $pdo->prepare("UPDATE requests SET status = 'thanked' WHERE id = ?");
    $upReq->execute([$referral['request_id']]);

    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    json_error('Failed to send thank-you: ' . $e->getMessage(), 500);
}

create_notification(
    $pdo,
    $referral['referrer_id'],
    'thanked',
    "{$user['name']} sent you a thank-you letter for referring them.",
    'thanks',
    $thanksId
);

$thanksFetch = $pdo->prepare("SELECT * FROM thanks WHERE id = ?");
$thanksFetch->execute([$thanksId]);
$thanks = $thanksFetch->fetch();

json_response(['thanks' => $thanks], 201);
