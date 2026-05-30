<?php

function abort_with_error(string $public_message, ?string $debug_message, bool $debug, int $status_code = 500): void
{
    http_response_code($status_code);
    header('Content-Type: text/plain; charset=UTF-8');

    if ($debug && $debug_message !== null) {
        echo $public_message . ' (' . $debug_message . ')';
        exit;
    }

    echo $public_message;
    exit;
}
