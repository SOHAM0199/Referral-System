<?php
// api/requests.php - Requests API Endpoints

require_once __DIR__ . '/config.php';

$user = require_auth($pdo);
$method = $_SERVER['REQUEST_METHOD'];

$action = $_GET['action'] ?? '';
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;

// Helper: attach full thread details (connections, referral write-up, thanks, comments)
function attach_thread($pdo, $request) {
    if (!$request) return null;

    $reqId = (int)$request['id'];

    // Connections
    $connStmt = $pdo->prepare("
        SELECT c.*, u.name AS referrer_name
        FROM connections c
        JOIN users u ON u.id = c.referrer_id
        WHERE c.request_id = ?
        ORDER BY c.created_at ASC
    ");
    $connStmt->execute([$reqId]);
    $connections = $connStmt->fetchAll();

    // Referral write-up
    $refStmt = $pdo->prepare("
        SELECT r.*, ur.name AS referrer_name, uq.name AS requester_name
        FROM referrals r
        JOIN users ur ON ur.id = r.referrer_id
        JOIN users uq ON uq.id = r.requester_id
        WHERE r.request_id = ?
    ");
    $refStmt->execute([$reqId]);
    $referral = $refStmt->fetch() ?: null;

    // Thanks
    $thanks = null;
    if ($referral) {
        $thanksStmt = $pdo->prepare("SELECT * FROM thanks WHERE referral_id = ?");
        $thanksStmt->execute([(int)$referral['id']]);
        $thanks = $thanksStmt->fetch() ?: null;
    }

    // Comments
    $commStmt = $pdo->prepare("
        SELECT cm.*, u.name AS author_name
        FROM comments cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.request_id = ?
        ORDER BY cm.created_at ASC
    ");
    $commStmt->execute([$reqId]);
    $comments = $commStmt->fetchAll();

    $request['connections'] = $connections;
    $request['referral'] = $referral;
    $request['thanks'] = $thanks;
    $request['comments'] = $comments;

    return $request;
}

if ($action === 'mine') {
    if ($method !== 'GET') json_error('Method not allowed', 405);
    $stmt = $pdo->prepare("SELECT * FROM requests WHERE requester_id = ? ORDER BY created_at DESC");
    $stmt->execute([$user['id']]);
    $rows = $stmt->fetchAll();
    
    $requests = array_map(function($r) use ($pdo) {
        return attach_thread($pdo, $r);
    }, $rows);

    json_response(['requests' => $requests]);

} elseif ($action === 'referring') {
    if ($method !== 'GET') json_error('Method not allowed', 405);
    $stmt = $pdo->prepare("
        SELECT DISTINCT req.*, u.name AS requester_name
        FROM requests req
        JOIN connections c ON c.request_id = req.id
        JOIN users u ON u.id = req.requester_id
        WHERE c.referrer_id = ?
        ORDER BY req.created_at DESC
    ");
    $stmt->execute([$user['id']]);
    $rows = $stmt->fetchAll();

    $requests = array_map(function($r) use ($pdo) {
        $thread = attach_thread($pdo, $r);
        $thread['requester_name'] = $r['requester_name'];
        return $thread;
    }, $rows);

    json_response(['requests' => $requests]);

} elseif ($action === 'detail') {
    if ($method !== 'GET') json_error('Method not allowed', 405);
    if (!$id) json_error('Request ID is required.');

    $stmt = $pdo->prepare("
        SELECT req.*, u.name AS requester_name
        FROM requests req
        JOIN users u ON u.id = req.requester_id
        WHERE req.id = ?
    ");
    $stmt->execute([$id]);
    $request = $stmt->fetch();

    if (!$request) json_error('Request not found.', 404);

    $thread = attach_thread($pdo, $request);
    $thread['requester_name'] = $request['requester_name'];

    json_response(['request' => $thread]);

} elseif ($action === 'comment') {
    if ($method !== 'POST') json_error('Method not allowed', 405);
    if (!$id) json_error('Request ID is required.');

    $input = get_json_input();
    $content = trim($input['content'] ?? '');

    if (!$content) {
        json_error('Enter your reply or comment.');
    }

    $stmt = $pdo->prepare("SELECT * FROM requests WHERE id = ?");
    $stmt->execute([$id]);
    $request = $stmt->fetch();

    if (!$request) json_error('Request not found.', 404);

    $insertStmt = $pdo->prepare("INSERT INTO comments (request_id, user_id, content) VALUES (?, ?, ?)");
    $insertStmt->execute([$id, $user['id'], $content]);
    $commentId = (int)$pdo->lastInsertId();

    // Notify requester if comment is by another user
    if ((int)$request['requester_id'] !== (int)$user['id']) {
        create_notification(
            $pdo,
            $request['requester_id'],
            'commented',
            "{$user['name']} replied on your request \"{$request['title']}\"",
            'request',
            $id
        );
    }

    $commFetchStmt = $pdo->prepare("
        SELECT cm.*, u.name AS author_name
        FROM comments cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.id = ?
    ");
    $commFetchStmt->execute([$commentId]);
    $comment = $commFetchStmt->fetch();

    json_response(['comment' => $comment], 201);

} elseif ($action === 'delete' || ($method === 'DELETE' && $id)) {
    if (!$id) json_error('Request ID is required.');

    $stmt = $pdo->prepare("SELECT * FROM requests WHERE id = ?");
    $stmt->execute([$id]);
    $request = $stmt->fetch();

    if (!$request) json_error('Request not found.', 404);

    if ((int)$request['requester_id'] !== (int)$user['id'] && !$user['is_admin']) {
        json_error('You can only delete your own requests.', 403);
    }

    $delStmt = $pdo->prepare("DELETE FROM requests WHERE id = ?");
    $delStmt->execute([$id]);

    json_response(['ok' => true]);

} elseif ($method === 'POST') {
    // Create new request
    $input = get_json_input();
    $title = trim($input['title'] ?? '');
    $description = trim($input['description'] ?? '');

    if (!$title) json_error('Give the request a short title, e.g. the role and company.');
    if (!$description) json_error('Describe what referral you need.');

    $insertStmt = $pdo->prepare("INSERT INTO requests (requester_id, title, description) VALUES (?, ?, ?)");
    $insertStmt->execute([$user['id'], $title, $description]);
    $reqId = (int)$pdo->lastInsertId();

    $fetchStmt = $pdo->prepare("
        SELECT req.*, u.name AS requester_name
        FROM requests req
        JOIN users u ON u.id = req.requester_id
        WHERE req.id = ?
    ");
    $fetchStmt->execute([$reqId]);
    $newReq = $fetchStmt->fetch();

    $thread = attach_thread($pdo, $newReq);
    $thread['requester_name'] = $newReq['requester_name'];

    json_response(['request' => $thread], 201);

} else {
    // Default GET: Feed of all requests
    $stmt = $pdo->query("
        SELECT req.*, u.name AS requester_name,
            (SELECT COUNT(*) FROM connections c WHERE c.request_id = req.id) AS connection_count
        FROM requests req
        JOIN users u ON u.id = req.requester_id
        ORDER BY req.created_at DESC
    ");
    $rows = $stmt->fetchAll();

    $requests = array_map(function($r) use ($pdo) {
        $thread = attach_thread($pdo, $r);
        $thread['requester_name'] = $r['requester_name'];
        $thread['connection_count'] = (int)$r['connection_count'];
        return $thread;
    }, $rows);

    json_response(['requests' => $requests]);
}
