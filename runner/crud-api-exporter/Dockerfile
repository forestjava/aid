FROM node:22-alpine
WORKDIR /app

# Build context (set in docker-compose.yml) is the aid/ project root, so we COPY
# explicitly from the runner/crud-api-exporter subdir and place shared/grammar.ohm
# at /app/shared so the validator can resolve it next to the package in the image.
COPY runner/crud-api-exporter/package*.json ./
RUN npm install --omit=dev=false

COPY runner/crud-api-exporter/ ./
COPY shared/grammar.ohm ./shared/grammar.ohm

CMD ["npm", "start"]
