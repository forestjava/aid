FROM nginx:alpine

ARG CACHE_BUST=initial
ENV CACHE_BUST=$CACHE_BUST

COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
