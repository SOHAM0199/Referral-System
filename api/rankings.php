<?php
// api/rankings.php - Rankings Leaderboard Endpoint

require_once __DIR__ . '/config.php';

$user = require_auth($pdo);
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET') {
    json_error('Method not allowed', 405);
}

$stmt = $pdo->query("
    SELECT
        u.id,
        u.name,
        COUNT(DISTINCT r.id) AS referrals_made,
        COUNT(DISTINCT t.id) AS thanks_received,
        COUNT(DISTINCT c.id) AS connections_made
    FROM users u
    LEFT JOIN referrals r ON r.referrer_id = u.id
    LEFT JOIN thanks t ON t.to_user_id = u.id
    LEFT JOIN connections c ON c.referrer_id = u.id
    GROUP BY u.id, u.name
    HAVING referrals_made > 0 OR connections_made > 0
    ORDER BY referrals_made DESC, thanks_received DESC, connections_made DESC
");

$rows = $stmt->fetchAll();

$rankings = array_map(function($row) {
    return [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'referrals_made' => (int)$row['referrals_made'],
        'thanks_received' => (int)$row['thanks_received'],
        'connections_made' => (int)$row['connections_made']
    ];
}, $rows);

json_response(['rankings' => $rankings]);
