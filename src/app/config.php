<?php

function app_config(): array
{
    return [
        'debug' => getenv('APP_DEBUG') === 'true',
        'db' => [
            'host' => getenv('DB_HOST') ?: 'db',
            'port' => getenv('DB_PORT') ?: '3306',
            'name' => getenv('DB_NAME') ?: (getenv('MYSQL_DATABASE') ?: 'mydb'),
            'user' => getenv('DB_USER') ?: (getenv('MYSQL_USER') ?: 'user'),
            'pass' => getenv('DB_PASS') ?: (getenv('MYSQL_PASSWORD') ?: 'password'),
        ],
    ];
}
