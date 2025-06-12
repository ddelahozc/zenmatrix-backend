require('dotenv').config(); // Cargar variables de entorno desde .env
const express = require('express');
const cors = require('cors'); // Para permitir peticiones desde el frontend de React
const { PrismaClient } = require('@prisma/client'); // Importar el cliente de Prisma

const app = express();
const prisma = new PrismaClient(); // Instanciar Prisma
const PORT = process.env.PORT || 5000; // Puerto donde correrá el servidor

// Middlewares: Son funciones que se ejecutan antes de que la solicitud llegue a las rutas
app.use(cors()); // Habilitar CORS para permitir que tu frontend de React se conecte
app.use(express.json()); // Habilitar el parseo de JSON en las peticiones (para que podamos recibir datos JSON)

// --- Rutas de la API ---

// Ruta de prueba inicial: Para verificar que el servidor está funcionando
app.get('/', (req, res) => {
    res.send('¡La API de ZenMatrix está funcionando! 🎉');
});

// --- Fin de Rutas de la API ---


// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor de ZenMatrix API corriendo en http://localhost:${PORT}`);
    console.log('✅ Conectado a la base de datos MySQL con Prisma.');
});

// Manejo de cierre de Prisma (opcional, pero buena práctica para cerrar la conexión a la DB)
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});