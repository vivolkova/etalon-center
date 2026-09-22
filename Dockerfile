# Локальное окружение «Эталон»: PHP 8.2 + Apache (как на проде)
FROM php:8.2-apache

# Расширения для работы с MySQL + mod_rewrite (нужен для .htaccess)
RUN docker-php-ext-install pdo_mysql mysqli \
 && a2enmod rewrite headers \
 && sed -ri 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# Код монтируется томом из docker-compose (volume), поэтому COPY не нужен.
