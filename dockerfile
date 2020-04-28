FROM node:alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN apk add --no-cache --virtual deps \
    python \
    build-base \
    && npm install \
    && apk del deps

# Bundle app source
COPY . .

EXPOSE 3001

ENV DEPLOYMENT=production
CMD [ "npm", "start" ]

## To build: docker build -t students.thesophon.com .
## To run: docker run -p 3001:3001 students.thesophon.com