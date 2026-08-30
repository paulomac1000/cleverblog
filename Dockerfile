FROM node:24-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY .next/standalone ./
RUN rm -f .env .env.*
COPY .next/static ./.next/static
COPY media ./media

EXPOSE 3000

CMD ["node", "server.js"]
