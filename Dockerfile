FROM php:apache-bookworm

# Install required PHP extensions
RUN docker-php-ext-install -j"$(nproc)" pdo_mysql \
    && a2enmod rewrite

WORKDIR /var/www/html

# Copy application code
COPY src/ /var/www/html/

# Set proper permissions (important for Apache)
RUN chown -R www-data:www-data /var/www/html

EXPOSE 80