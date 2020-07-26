FROM node:12-slim
WORKDIR /src/app
EXPOSE 3000
CMD npm start
RUN apt update && apt install git -y
COPY package.json package-lock.json ./
RUN npm install
COPY . .
