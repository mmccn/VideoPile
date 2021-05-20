const express = require("express");
const app = express();
const fs = require("fs");
const { nanoid } = require("nanoid");
const enmap = require("enmap");
const db = new enmap({ name: "VideoPile DB" });
let indexedVideos = [];

app.listen(4242, () => {
  console.log("Listening!");
  indexVideos();
  setInterval(indexVideos, 1000 * 60 * 2);
});

app.use("/public", express.static("public"));

async function indexVideos() {
  if (!db.has("videos")) db.set("videos", []);
  const content = fs
    .readdirSync("./videos")
    .filter((vid) => vid.endsWith(".mp4"));
  indexedVideos = [];
  content.map((file) => {
    if (indexedVideos[0] && indexedVideos.some((video) => video == file))
      return;
    const title = (file.charAt(0).toUpperCase() + file.slice(1)).replace(
      /\.[^/.]+$/,
      ""
    );
    indexedVideos.push(file);
    let description = "No Description Provided.";
    if (fs.existsSync(`./videos/${title.toLowerCase()}.txt`)) {
      const fileData = fs.readFileSync(`./videos/${title.toLowerCase()}.txt`, {
        encoding: "utf-8",
        flag: "r",
      });
      description = fileData;
    }
    db.push("videos", {
      title,
      description,
      id: nanoid(8),
      fileName: file,
      ext: /(?:\.([^.]+))?$/.exec(file)[1],
    });
  });
}

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/static/index.html");
});

app.get("/videos", (req, res) => {
  res.json({
    videos: db.get("videos"),
  });
});

app.get("/search", (req, res) => {
  res.sendFile(__dirname + "/static/search.html");
});

app.get("/s", (req, res) => {
  const searchQuery = req.query.q;
  if (!searchQuery) {
    return res.redirect("/");
  }
  const results = db
    .get("videos")
    .filter((vid) =>
      vid.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  return res.json({
    videos: results,
  });
});

app.get("/watch", (req, res) => {
  res.sendFile(__dirname + "/static/video.html");
});

app.get("/w", (req, res) => {
  const id = req.query.v;
  const options = {};

  let start;
  let end;
  const videoArray = db.get("videos");
  if (!videoArray.some((vid) => vid.id == id)) {
    return res.json({
      msg: "No Video with that ID!",
    });
  }
  const video = videoArray.filter((video) => video.id == id)[0];
  const filePath = `${__dirname}/videos/${video.fileName}`;
  const range = req.headers.range;
  if (range) {
    const bytesPrefix = "bytes=";
    if (range.startsWith(bytesPrefix)) {
      const bytesRange = range.substring(bytesPrefix.length);
      const parts = bytesRange.split("-");
      if (parts.length === 2) {
        const rangeStart = parts[0] && parts[0].trim();
        if (rangeStart && rangeStart.length > 0) {
          options.start = start = parseInt(rangeStart);
        }
        const rangeEnd = parts[1] && parts[1].trim();
        if (rangeEnd && rangeEnd.length > 0) {
          options.end = end = parseInt(rangeEnd);
        }
      }
    }
  }
  res.setHeader("content-type", `video/${video.ext}`);

  fs.stat(filePath, (err, stat) => {
    if (err) {
      console.error(`File stat error for ${filePath}.`);
      console.error(err);
      res.sendStatus(500);
      return;
    }

    let contentLength = stat.size;

    if (req.method === "HEAD") {
      res.statusCode = 200;
      res.setHeader("accept-ranges", "bytes");
      res.setHeader("content-length", contentLength);
      res.end();
    } else {
      let retrievedLength;
      if (start !== undefined && end !== undefined) {
        retrievedLength = end + 1 - start;
      } else if (start !== undefined) {
        retrievedLength = contentLength - start;
      } else if (end !== undefined) {
        retrievedLength = end + 1;
      } else {
        retrievedLength = contentLength;
      }

      res.statusCode = start !== undefined || end !== undefined ? 206 : 200;

      res.setHeader("content-length", retrievedLength);

      if (range !== undefined) {
        res.setHeader(
          "content-range",
          `bytes ${start || 0}-${end || contentLength - 1}/${contentLength}`
        );
        res.setHeader("accept-ranges", "bytes");
      }

      const fileStream = fs.createReadStream(filePath, options);
      fileStream.on("error", (error) => {
        console.log(`Error reading file ${filePath}.`);
        console.log(error);
        res.sendStatus(500);
      });

      fileStream.pipe(res);
    }
  });
});
