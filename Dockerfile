FROM php:8.2-apache-bookworm-slim

# Install required PHP extensions
RUN apt-get update \
    && docker-php-ext-install pdo_mysql \
    && a2enmod rewrite \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /var/www/html

# Copy application code
COPY src/ /var/www/html/

# Set proper permissions (important for Apache)
RUN chown -R www-data:www-data /var/www/html

EXPOSE 80