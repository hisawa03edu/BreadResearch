<?php
// config.php にコピーして、XserverのMySQL情報とログインパスワードを設定してください。
return [
    'db' => [
        'host' => 'mysqlXXXX.xserver.jp',
        'name' => 'serverid_bread',
        'user' => 'serverid_breaduser',
        'pass' => 'CHANGE_ME',
        'charset' => 'utf8mb4',
    ],
    // password_hash('任意のパスワード', PASSWORD_DEFAULT) の結果を設定します。
    // 一時的に平文を使う場合は login_password_plain に設定できます。
    'login_password_hash' => '',
    'login_password_plain' => 'CHANGE_ME_NOW',
    'app_name' => 'パン断面 研究解析システム',
    'app_version' => '10.4.0',
    'python' => [
        // Xserver上で構築済みの仮想環境を指定します。
        'binary' => '/home/a-pages/python/venv/bin/python',
        'script' => __DIR__ . '/python/analyze.py',
        'timeout_seconds' => 180,
    ],
];
