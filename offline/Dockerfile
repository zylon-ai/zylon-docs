FROM node:24-alpine AS build
WORKDIR /source/offline
COPY offline/package.json offline/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY offline/*.mjs ./
COPY offline/assets ./assets
COPY offline/test ./test
WORKDIR /source
ARG AIRGAP_VERSION
# Explicit sources: local audit state, Git metadata and arbitrary root files never enter the build.
COPY docs.json zylon-code.mdx favicon.png feature-status.js feature-status.css ./
COPY .env.airgap ./
COPY en ./en
COPY es ./es
COPY zylon-code ./zylon-code
COPY snippets ./snippets
COPY images ./images
COPY files ./files
COPY logo ./logo
RUN npm --prefix offline test && npm --prefix offline run build

FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY --chown=101:101 offline/nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=101:101 /source/offline/dist /usr/share/nginx/html/docs
USER 101
EXPOSE 8080
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
