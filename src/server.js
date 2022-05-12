require('dotenv').config();

const Hapi = require('@hapi/hapi');
const Jwt = require('@hapi/jwt');
const Inert = require('@hapi/inert');
const path = require('path');

const ClientError = require('./exceptions/ClientError');

// Albums
const albums = require('./api/albums');
const AlbumsService = require('./services/postgres/AlbumsService');
const AlbumsValidator = require('./validators/albums');

// Songs
const songs = require('./api/songs');
const SongsService = require('./services/postgres/SongsService');
const SongsValidator = require('./validators/songs');

// Users
const users = require('./api/users');
const UsersService = require('./services/postgres/UsersService');
const UsersValidator = require('./validators/users');

// Authentications
const authentications = require('./api/authentications');
const AuthenticationsService = require('./services/postgres/AuthenticationsService');
const TokenManager = require('./tokenize/TokenManager');
const AuthenticationsValidator = require('./validators/authentications');

// Playlists
const playlists = require('./api/playlists');
const PlaylistsService = require('./services/postgres/PlaylistsService');
const PlaylistsValidator = require('./validators/playlists');

// Collaborations
const collaborations = require('./api/collaborations');
const CollaborationsService = require('./services/postgres/CollabortionsService');
const CollaborationsValidator = require('./validators/collaborations');

// Exports
const _exports = require('./api/exports');
const ProducerService = require('./services/rabbitmq/ProducerService');
const ExportsValidator = require('./validators/exports');

// Uploads
const uploads = require('./api/uploads');
const StorageService = require('./services/storage/StorageService');
const UploadsValidator = require('./validators/uploads');

// User Album Likes
const userAlbumLikes = require('./api/userAlbumLikes');
const UserAlbumLikesService = require('./services/postgres/UserAlbumLikesService');

const init = async () => {
  const albumsService = new AlbumsService();
  const songsService = new SongsService();
  const usersService = new UsersService();
  const authenticationsService = new AuthenticationsService();
  const collaborationsService = new CollaborationsService();
  const playlistsService = new PlaylistsService(collaborationsService);
  const storageService = new StorageService(path.resolve(__dirname, 'api/uploads/file/images'));
  const userAlbumLikesService = new UserAlbumLikesService();

  const server = Hapi.server({
    port: process.env.PORT,
    host: process.env.HOST,
    routes: {
      cors: {
        origin: ['*'],
      },
    },
  });

  await server.register([
    {
      plugin: Jwt,
    },
    {
      plugin: Inert,
    },
  ]);

  // JWT strategies
  server.auth.strategy('openmusic_jwt', 'jwt', {
    keys: process.env.ACCESS_TOKEN_KEY,
    verify: {
      aud: false,
      iss: false,
      sub: false,
      maxAgeSec: process.env.ACCESS_TOKEN_AGE,
    },
    validate: (artifacts) => ({
      isValid: true,
      credentials: {
        id: artifacts.decoded.payload.id,
      },
    }),
  });

  await server.register([
    {
      plugin: albums,
      options: {
        service: albumsService,
        validator: AlbumsValidator,
      },
    },
    {
      plugin: songs,
      options: {
        service: songsService,
        validator: SongsValidator,
      },
    },
    {
      plugin: users,
      options: {
        service: usersService,
        validator: UsersValidator,
      },
    },
    {
      plugin: authentications,
      options: {
        authenticationsService,
        usersService,
        tokenManager: TokenManager,
        validator: AuthenticationsValidator,
      },
    },
    {
      plugin: playlists,
      options: {
        playlistsService,
        songsService,
        validator: PlaylistsValidator,
      },
    },
    {
      plugin: collaborations,
      options: {
        collaborationsService,
        playlistsService,
        usersService,
        validator: CollaborationsValidator,
      },
    },
    {
      plugin: _exports,
      options: {
        producerService: ProducerService,
        playlistsService,
        validator: ExportsValidator,
      },
    },
    {
      plugin: uploads,
      options: {
        service: storageService,
        validator: UploadsValidator,
      },
    },
    {
      plugin: userAlbumLikes,
      options: {
        userAlbumLikesService,
        albumsService,
      },
    },
  ]);

  server.ext('onPreResponse', (request, h) => {
    // Get the context of response from request object
    const { response } = request;

    if (response instanceof ClientError) {
      // Create a new response from response toolkit for error handling needs
      const newResponse = h.response({
        status: 'fail',
        message: response.message,
      });
      newResponse.statusCode(response.statusCode);
      return newResponse;
    }

    // And if there's no ClientError proceed to the actual response
    return response.continue || response;
  });

  await server.start();
  console.log(`Server is running on ${server.info.uri}`);
};

init();
