require('dotenv').config()
const express = require('express');
const SERVER_PORT = process.env.SERVER_PORT;
const app = express();
const fs = require("fs")

const Photos = require('googlephotos');
const { google } = require('googleapis');
const glob = require("glob")
const path = require("path")
const slugify = require("slugify")

const PHOTOS_FOLDER = "./PHOTOS"

const YOUR_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const YOUR_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const YOUR_REDIRECT_URL = process.env.GOOGLE_REDIRECT_URL;

const oauth2Client = new google.auth.OAuth2(
  YOUR_CLIENT_ID,
  YOUR_CLIENT_SECRET,
  YOUR_REDIRECT_URL
);

google.options({ auth: oauth2Client });

let PHOTOS = undefined;
let TOKEN = undefined;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.listen(SERVER_PORT, () => {
  console.log(`Server is listening on : ${SERVER_PORT}`);
});

app.get('/', async (req, res) => {
  const scopes = [
    Photos.Scopes.READ_ONLY,
    Photos.Scopes.SHARING,
    Photos.Scopes.APPEND_ONLY,
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });

  oauth2Client.on('tokens', (tokens) => {
    console.log("INSIDE FUNC de google", tokens);
    if (tokens.refresh_token) {
      // store the refresh_token in my database!
      console.log(tokens.refresh_token);
    }
  });

  res.status(200).redirect(url);
});

app.get('/auth/google/callback/', async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  initTokens(tokens)
  res.status(200).send(tokens);
});

app.get("/albums/create/bulk", async (req, res) => {
  const items = await _findItems()
  const result = await _createAlbumAndPostPhotos(items)
  res.status(200).send(result)
})

const _createAlbumAndPostPhotos = async (items) => {
  const result = []
  for (const item of items) {
    const createdAlbum = await _createAlbum(item.folderName)
    console.log("!!!!!!!!!!!")
    console.log("!!!!!!!!!!!")
    console.log("ALBUM" + createdAlbum.id + "CREE");
    console.log("!!!!!!!!!!!")
    console.log("!!!!!!!!!!!")
    const uploadedItems = await _uploadPics(createdAlbum.id, item.items)
    result.push(uploadedItems)
  }
  console.log("!!!!!!!!!!!")
  console.log("!!!!!!!!!!!")
  console.log("ALBUM CREADTED AND PHOTOS UPLOADED")
  console.log("!!!!!!!!!!!")
  console.log("!!!!!!!!!!!")
  return result
}

const _createAlbum = async (title) => {
  const createdAlbum = await PHOTOS.albums.create(title);
  return createdAlbum;
};

const _uploadPics = async (albumId, files) => {
  const result = []
  for (const fileData of files) {
    const { file, directoryPath } = fileData
    const uploadedItem = await _uploadPic(albumId, file, directoryPath)
    result.push(uploadedItem)
  }
  console.log(result.length + "PHOTOS CREATED FOR ALBUM" + albumId);
  return result
}

const _uploadPic = async (albumId, file, directoryPath, retry = 0) => {
  try {
    console.log("CREATING PHOTO " + file.name + " FOR ALBUM" + albumId);
    const createdPhoto = await PHOTOS.mediaItems.upload(albumId, file.name, directoryPath, "")
    console.log("PHOTO " + file.name + " CREATED FOR ALBUM" + albumId);
    return createdPhoto
  } catch (err) {
    console.warn("RETRYING AFTER FAIL", err)
    if (err?.response?.status === 401) {
      await _refreshToken()
    }
    console.log("START DELAY")
    await _delay()
    console.log("END DELAY")
    const incRetry = retry + 1
    if (retry <= 10) {
      await _uploadPic(albumId, file, directoryPath, incRetry)
    }
    console.log("CHIEEEEEERRR");
  }
}

const _findItems = async () => {
  const folders = await fs.readdirSync(PHOTOS_FOLDER)
  const result = []
  if (!folders) {
    return result
  }
  for (const folderName of folders) {
    const regex = `${PHOTOS_FOLDER}/${folderName}/**/*(*.jpg|*.png|*.jpeg|*.JPEG|*.JPG|*.mp4|*.AVI|*.avi|*.mov|*.MOV|*.MP4)`
    console.log("LOOKING FOR ITEM IN " + folderName)
    const items = await new Promise((resolve) => {
      glob(regex, (err, files) => {
        const marshalledItems = _marshallItems(files)
        resolve(marshalledItems)
      })
    })
    console.log("FOUND " + items.length + " ITEM IN " + folderName)
    result.push({ folderName, items })
  }
  return result
}

const _marshallItems = (files = []) => {
  return files.map((file) => {
    const result = {
      file: { name: slugify(path.basename(file)) },
      directoryPath: file
    }
    return result
  })
}


const _delay = async (value = 3000) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, value)
  })
}

const _refreshToken = async () => {
  const tokens = await new Promise((resolve) => {
    oauth2Client.refreshAccessToken((err, credentials) => {
      resolve(credentials)
    })
  })
  initTokens(tokens)
}

const initTokens = (tokens) => {
  const { access_token, refresh_token } = tokens;
  oauth2Client.setCredentials({ refresh_token: refresh_token, forceRefreshOnFailure: true });
  TOKEN = access_token;
  PHOTOS = new Photos(TOKEN);
  console.log("NEW TOKEN" + TOKEN)
}