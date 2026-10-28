FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
ARG API_URL=http://api:4010
ENV API_URL=$API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@vstmailer/web"]
