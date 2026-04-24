FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

ARG OCI_TITLE=ghcr.io/brainminds-dataportal/zaviewer
ARG OCI_DESCRIPTION="ZAViewer back-end"
ARG OCI_SOURCE=https://github.com/brainminds-dataportal/zaviewer
ARG OCI_VERSION=dev-be
ARG OCI_CREATED=1970-01-01T00:00:00Z
ARG OCI_REVISION=unknown

# download and install required dependencies
RUN apt-get update && \
apt-get install -y --no-install-recommends \
apache2 \
ca-certificates \
iipimage-server \
imagemagick \
libapache2-mod-fcgid \
memcached \
php \
php-cli \
php-mbstring \
php-sqlite3 \
php-xml && \
mkdir -p /var/www/iiproot && \
ln -s /var/www/html/data /var/www/iiproot/data && \
a2enmod alias fcgid headers && \
if [ -f /etc/apache2/conf-available/iipimage-server.conf ]; then a2disconf iipimage-server; fi && \
cat >/etc/apache2/conf-available/zaviewer-iipsrv.conf <<'EOF' && \
a2enconf zaviewer-iipsrv && \
rm -rf /var/lib/apt/lists/*
Alias /iipsrv /usr/lib/iipimage-server
<Directory /usr/lib/iipimage-server>
    Options +ExecCGI
    Require all granted
</Directory>
<Location /iipsrv/iipsrv.fcgi>
    SetHandler fcgid-script
    Options +ExecCGI
    FcgidInitialEnv CORS "*"
    FcgidInitialEnv FILESYSTEM_PREFIX "/var/www/iiproot"
</Location>
EOF


#copy admin scripts
COPY ./admin /var/www/html/admin

WORKDIR /var/www/html/admin

RUN mkdir data  && \
php ./init.php  && \
chown -R www-data:www-data data  && \
chmod 755 data  && \
echo -e '{\n\t"admin_path":"./admin/",\n\t"iipserver_path":"/iipsrv/iipsrv.fcgi?IIIF=/data/",\n\t"publish_path":"../data/"\n}' > /var/www/html/path.json


#start the apache webserver (including image server)
ENTRYPOINT ["apache2ctl", "-D", "FOREGROUND"]

LABEL org.opencontainers.image.title="${OCI_TITLE}" \
      org.opencontainers.image.description="${OCI_DESCRIPTION}" \
      org.opencontainers.image.source="${OCI_SOURCE}" \
      org.opencontainers.image.url="${OCI_SOURCE}" \
      org.opencontainers.image.version="${OCI_VERSION}" \
      org.opencontainers.image.created="${OCI_CREATED}" \
      org.opencontainers.image.revision="${OCI_REVISION}"

EXPOSE 80
