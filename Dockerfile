FROM php:8.2-apache

# Install PDO MySQL extension
RUN docker-php-ext-install pdo_mysql

# Optional: enable mod_rewrite (for frameworks like Laravel)
RUN a2enmod rewrite

# Set working directory
WORKDIR /var/www/html