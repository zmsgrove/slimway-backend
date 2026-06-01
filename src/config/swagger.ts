import swaggerJsdoc from 'swagger-jsdoc'

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Slimway CRM REST API',
      version: '1.0.0',
      description: 'Публичный REST API для интеграций с Slimway CRM. Аутентификация через API-ключи.',
    },
    servers: [
      {
        url: process.env.BACKEND_URL ?? 'https://slimway-backend.onrender.com',
        description: 'Production',
      },
      {
        url: 'http://localhost:3000',
        description: 'Local development',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Supabase JWT токен (для CRM-пользователей)',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API-ключ вида sk_live_... (для внешних интеграций)',
        },
      },
    },
  },
  apis: ['./src/routes/api-keys.routes.ts'],
}

export const swaggerSpec = swaggerJsdoc(options)
