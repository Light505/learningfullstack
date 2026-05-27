FROM php:8.3-apache-bookworm

# Install required PHP extensions
RUN docker-php-ext-install -j"$(nproc)" pdo_mysql \
    && a2enmod rewrite

WORKDIR /var/www/html

COPY --chown=www-data:www-data src/ ./

EXPOSE 80
